'use strict';
// Always-on market: players and the DM connect at the same time (SSE + JSON POST). No dependencies.
// Haggling happens at the table, in person: the player types an offer, the DM (playing the merchant) accepts, counters or rejects.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
if (process.env.NODE_ENV === 'production' && !process.env.DM_PIN) {
  console.error('Refusing to start in production without DM_PIN. Set the DM_PIN environment variable.');
  process.exit(1);
}
const DM_PIN = process.env.DM_PIN || '1234';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'data.json');
const DATA_DIR = path.dirname(DATA_FILE);
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || path.join(__dirname, 'media'));
// Media limits (kept small for phones and small devices). Images are resized in the client.
const MEDIA_LIMITS = { item: 700 * 1024, thumb: 60 * 1024, portrait: 400 * 1024, minPx: 32, maxPx: 2048 };
fs.mkdirSync(DATA_DIR, { recursive: true });
const PUBLIC = path.join(__dirname, 'public');
const CHARS = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'chars.json'), 'utf8'));
const DEV_RESET = process.env.DEV_RESET === '1'; // tests only: the dm/reset endpoint
const MAX_PLAYERS = 8;
const round = (v) => Math.round(v * 100) / 100;
const id =() => crypto.randomBytes(5).toString('hex');
const token = () => crypto.randomBytes(16).toString('hex');

const PIN_MAX = 5, PIN_LOCK_MS = +process.env.PIN_LOCK_MS || 10 * 60 * 1000;
const pinFails = new Map(); // ip -> { n, until }
// DM password: DM_PIN on first setup. Once the DM changes it, a salted scrypt hash is stored in data.json (no plaintext).
// If forgotten: start the server once with DM_PASSWORD_RESET=1 and DM_PIN is valid again.
const hashPass = (pw, salt) => crypto.scryptSync(String(pw ?? ''), salt, 32).toString('hex');
function checkDmPass(pw) {
  const p = S.settings.dmPass;
  if (!p) return String(pw ?? '') === DM_PIN;
  const a = Buffer.from(hashPass(pw, p.salt), 'hex'), b = Buffer.from(p.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function clientIp(req) {
  const ra = req.socket.remoteAddress || '', loop = /^(::1|127\.|::ffff:127\.)/.test(ra), xf = req.headers['x-forwarded-for'];
  return loop && xf ? String(xf).split(',')[0].trim() : ra; // a reverse proxy (tailscale serve, tunnel) arrives from a local address
}

class HttpError extends Error { constructor(msg, code = 400) { super(msg); this.code = code; } }
const fail = (msg, code) => { throw new HttpError(msg, code); };

// ---------- media ----------
// The file type comes from magic bytes, not the extension. Only PNG and JPEG are accepted.
function sniffImage(buf) {
  if (buf.length >= 24 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buf.toString('latin1', 12, 16) === 'IHDR') {
    return { ext: 'png', mime: 'image/png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { ext: 'jpg', mime: 'image/jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}
const MEDIA_MIME = { png: 'image/png', jpg: 'image/jpeg' };
const ITEM_TYPES = ['weapon', 'armor', 'potion', 'scroll', 'gem', 'gear', 'other'];
const RARITIES = ['none', 'common', 'uncommon', 'rare', 'veryrare', 'legendary', 'artifact'];
function mediaFileOf(rel) { // '/media/items/abc.png?v=1' -> safe absolute path or null
  const clean = String(rel || '').split('?')[0];
  if (!clean.startsWith('/media/')) return null;
  const abs = path.resolve(MEDIA_DIR, clean.slice('/media/'.length));
  return abs.startsWith(MEDIA_DIR + path.sep) && MEDIA_MIME[path.extname(abs).slice(1)] ? abs : null;
}
function copyMedia(rel, nid, thumb) { // a copy owns its own file (deleting one does not break the other)
  const f = mediaFileOf(rel);
  if (!f) return null;
  const name = `${nid}${thumb ? '.t' : ''}${path.extname(f)}`;
  fs.copyFileSync(f, path.join(path.dirname(f), name));
  return `/media/${path.basename(path.dirname(f))}/${name}?v=${Date.now().toString(36)}`;
}
function unlinkMedia(rel) { const f = mediaFileOf(rel); if (f) { try { fs.unlinkSync(f); } catch {} } }
function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    const cl = +req.headers['content-length'];
    if (Number.isFinite(cl) && cl > max) { req.resume(); return reject(new HttpError('File too large', 413)); }
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { req.destroy(); reject(new HttpError('File too large', 413)); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ---------- state ----------
function seed() {
  const m = [
    { id: 'm1', name: 'Bora', emoji: '🧓' },
    { id: 'm2', name: 'Marla', emoji: '👩‍🔧' },
    { id: 'm3', name: 'Grom', emoji: '🐗' },
  ];
  const it = (mid, name, price, magical = false, stock = null) => ({ id: id(), merchantId: mid, name, price, magical, stock, hidden: false });
  return {
    day: 1, week: 1, offers: [], merchants: m,
    items: [
      it('m1', 'Potion of Healing', 50), it('m1', 'Hempen Rope (50 ft)', 1), it('m1', 'Tent', 2),
      it('m2', 'Longsword', 15), it('m2', 'Chain Mail', 75), it('m2', "Thieves' Tools", 25),
      it('m3', 'Potion of Flying', 250, true, 2), it('m3', '+1 Shield', 400, true, 1), it('m3', 'Dragon Scale', 120),
    ],
    players: [], bans: {}, dm: [], log: [],
  };
}
// Older saves carried the dice engine and affinity; drop what no longer exists. Accepted-but-undelivered offers become new again.
function migrate(s) {
  for (const k of ['negs', 'revealed', 'insightTries', 'affinity', 'affinityWeek']) delete s[k];
  if (s.settings) delete s.settings.affinity;
  for (const m of s.merchants || []) delete m.type;
  for (const i of s.items || []) { delete i.minAffinity; i.hidden = !!i.hidden; }
  for (const p of s.players || []) delete p.advantage;
  for (const o of s.offers || []) if (o.status === 'accepted') o.status = 'new';
  return s;
}
let S;
try { S = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { S = seed(); }
S.offers ||= []; S.week ||= 1; S.ledger ||= []; S.bans ||= {}; S.settings ||= {};
migrate(S);
if (process.env.DM_PASSWORD_RESET === '1' && S.settings.dmPass) { delete S.settings.dmPass; console.log('DM password reset: DM_PIN is valid again.'); }
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(S), () => {}), 200);
}
const gp = (n) => `${(+n).toFixed(2).replace(/\.?0+$/, '')} gp`;
function log(text, playerId = null) {
  S.log.push({ t: Date.now(), text, playerId });
  if (S.log.length > 80) S.log.shift();
}

// Ledger: the single record of gold movements (amount from the player's side, - spent, + income).
function book(kind, p, { merchantId = null, name = '', amount, list = null }) {
  S.ledger.push({ id: id(), t: Date.now(), day: S.day, week: S.week, kind, playerId: p.id, merchantId, name, amount: round(amount), list });
  if (S.ledger.length > 1000) S.ledger.shift();
}

// ---------- helpers ----------
const merchantOf = (mid) => S.merchants.find((m) => m.id === mid) || fail('No such merchant', 404);
const itemOf = (iid) => S.items.find((i) => i.id === iid) || fail('No such item', 404);
const shownItemOf = (iid) => { const i = itemOf(iid); if (i.hidden) fail('No such item', 404); return i; }; // hidden items do not exist for players
const playerOf = (pid) => S.players.find((p) => p.id === pid) || fail('No such player', 404);
const charOf = (cid) => CHARS.find((c) => c.id === cid);
const bkey = (pid, mid) => `${pid}:${mid}`;
const isClosed = (pid, mid) => S.bans[bkey(pid, mid)] === S.day; // the DM closed this merchant to this player for today
const assertOpen = (p, mid) => { if (isClosed(p.id, mid)) fail('The merchant is not trading with you today.'); };
const num = (v, min = 0) => { const n = Math.round(+v * 100) / 100; if (!Number.isFinite(n) || n < min) fail('Invalid number'); return n; };
const text = (v, max = 40) => { const s = String(v ?? '').trim().slice(0, max); if (!s) fail('Cannot be empty'); return s; };

// Moves gold and the item: used by list-price purchases and by accepted offers.
function deliver(p, { item, name, price, magical, kind, merchantId }) {
  if (item && item.stock !== null && item.stock <= 0) fail('Sold out.');
  if (p.gold < price) fail('Not enough gold.');
  p.gold = round(p.gold - price);
  p.inventory.push({ id: id(), itemId: item ? item.id : null, name, paid: price, magical: !!magical });
  if (item && item.stock !== null) item.stock -= 1;
  book(kind, p, { merchantId, name, amount: -price, list: item ? item.price : null });
}

// ---------- offers ----------
// Life of an offer: new (the player is waiting for the DM) <-> counter (the DM answered, the player is waiting);
// either side accepting settles it at once. Closed states: settled, rejected, withdrawn.
const OPEN = ['new', 'counter'];
const hist = (o, who, act, price, note) => o.history.push({ t: Date.now(), who, act, price, note: note || '' });
const noteOf = (v) => String(v ?? '').trim().slice(0, 80);
function checkBid(item, price) {
  if (price >= item.price) fail('Offer must be below the list price.');
}
const offerOf = (oid) => S.offers.find((o) => o.id === oid) || fail('No such offer', 404);
const offerView = (o) => { const it = o.itemId && S.items.find((i) => i.id === o.itemId); return { ...o, listPrice: it ? it.price : null }; };
function settle(o, who) {
  const p = playerOf(o.playerId);
  const it = o.itemId ? S.items.find((i) => i.id === o.itemId) : null;
  if (o.itemId && !it) fail('Item is gone');
  deliver(p, { item: it, name: o.itemName, price: o.price, magical: it ? it.magical : false, kind: 'offer', merchantId: o.merchantId });
  o.status = 'settled';
  hist(o, who, 'accept', o.price);
  log(`${p.name} bought ${o.itemName} for ${gp(o.price)} (${merchantOf(o.merchantId).name}, agreed offer)`, p.id);
}

// ---------- views ----------
const invView = (p) => p.inventory.map((x) => { const it = x.itemId && S.items.find((i) => i.id === x.itemId); return { ...x, image: it ? it.image || null : null, thumb: it ? it.thumb || null : null }; });
function playerView(p) {
  return {
    role: 'player', day: S.day, week: S.week, dmOnline: dmOnline(),
    bids: S.offers.filter((o) => o.playerId === p.id).map(offerView),
    ledger: S.ledger.filter((e) => e.playerId === p.id).slice(-40),
    me: { id: p.id, name: p.name, charId: p.charId, gold: p.gold, inventory: invView(p) },
    merchants: S.merchants.map((m) => ({
      id: m.id, name: m.name, emoji: m.emoji, portrait: m.portrait || null, closed: isClosed(p.id, m.id),
      items: S.items.filter((i) => i.merchantId === m.id && !i.hidden)
        .map((i) => ({ id: i.id, name: i.name, price: i.price, magical: i.magical, stock: i.stock, image: i.image || null, thumb: i.thumb || null, desc: i.desc || '', type: i.type || null, rarity: i.rarity || 'none' })),
    })),
  };
}
function dmView() {
  return {
    role: 'dm', day: S.day, week: S.week, bids: S.offers.map(offerView), ledger: S.ledger.slice(-150),
    chars: CHARS.map((c) => c.id),
    merchants: S.merchants, items: S.items, log: S.log.slice(-40),
    players: S.players.map((p) => ({ id: p.id, name: p.name, charId: p.charId, gold: p.gold, inventory: p.inventory })),
    closed: Object.entries(S.bans).filter(([, d]) => d === S.day).map(([k]) => { const [playerId, merchantId] = k.split(':'); return { playerId, merchantId }; }),
  };
}

// ---------- SSE ----------
const clients = new Set();
const dmOnline = () => [...clients].some((c) => c.role === 'dm');
function push(c) { c.res.write(`data: ${JSON.stringify(c.role === 'dm' ? dmView() : playerView(playerOf(c.pid)))}\n\n`); }
function broadcast() {
  save();
  for (const c of clients) { try { push(c); } catch { clients.delete(c); } }
}

// ---------- player actions ----------
const P = {
  accept(p, b) { // buy at the list price, no haggling
    const item = shownItemOf(b.itemId), m = merchantOf(item.merchantId);
    assertOpen(p, m.id);
    deliver(p, { item, name: item.name, price: item.price, magical: item.magical, kind: 'buy', merchantId: m.id });
    log(`${p.name} bought: ${item.name} · ${gp(item.price)} (${m.name})`, p.id);
  },
  bid(p, b) {
    const m = merchantOf(b.merchantId);
    const item = b.itemId ? shownItemOf(b.itemId) : null;
    if (item && item.merchantId !== m.id) fail('That item is not sold by this merchant.');
    assertOpen(p, m.id);
    const price = num(b.price, 0.01);
    if (item) checkBid(item, price);
    if (S.offers.filter((o) => o.playerId === p.id && OPEN.includes(o.status)).length >= 10) fail('At most 10 open offers.');
    const o = { id: id(), playerId: p.id, merchantId: m.id, itemId: item ? item.id : null, itemName: item ? item.name : text(b.itemName), price, note: noteOf(b.note), from: 'player', by: 'player', status: 'new', week: S.week, t: Date.now(), history: [] };
    hist(o, 'player', 'offer', price, o.note);
    S.offers.push(o);
    log(`${p.name} → ${m.name}: offer ${gp(price)} for ${o.itemName}`, p.id);
  },
  bidreply(p, b) {
    const o = offerOf(b.id);
    if (o.playerId !== p.id) fail('This is not your offer', 403);
    if (!OPEN.includes(o.status)) fail('This offer is closed.');
    if (b.action === 'accept') {
      if (o.status !== 'counter') fail('There is no counter-offer to accept.');
      settle(o, 'player');
    } else if (b.action === 'counter') {
      if (o.status !== 'counter') fail('There is no counter-offer.');
      const price = num(b.price, 0.01);
      const it = o.itemId && S.items.find((i) => i.id === o.itemId);
      if (it) checkBid(it, price);
      o.price = price; o.by = 'player'; o.status = 'new'; hist(o, 'player', 'offer', price, noteOf(b.note));
      log(`${p.name}: counter-offer ${gp(price)} for ${o.itemName}`, p.id);
    } else if (b.action === 'withdraw') {
      o.status = 'withdrawn'; hist(o, 'player', 'withdraw', o.price);
      log(`${p.name}: withdrew the offer for ${o.itemName}`, p.id);
    } else fail('Unknown action');
  },
};

// ---------- DM actions ----------
const D = {
  merchant(b) {
    const name = text(b.name); // validate first: an invalid request must not leave an empty merchant
    const m = b.id ? merchantOf(b.id) : S.merchants[S.merchants.push({ id: id() }) - 1];
    Object.assign(m, { name, emoji: String(b.emoji ?? m.emoji ?? '').trim().slice(0, 8) });
  },
  item(b) {
    merchantOf(b.merchantId);
    const enumOf = (v, list, def, ad) => { const x = v === undefined || v === null || v === '' ? def : String(v); if (x !== def && !list.includes(x)) fail(`${ad} is invalid`); return x; };
    const data = {
      merchantId: b.merchantId, name: text(b.name), price: num(b.price, 0.01), magical: !!b.magical,
      stock: b.stock === null || b.stock === '' || b.stock === undefined ? null : Math.max(0, Math.floor(+b.stock)),
      desc: String(b.desc ?? '').trim().slice(0, 200),
      type: enumOf(b.type, ITEM_TYPES, null, 'Type'),
      rarity: enumOf(b.rarity, RARITIES, 'none', 'Rarity'),
      hidden: !!b.hidden,
    };
    const it = b.id ? itemOf(b.id) : S.items[S.items.push({ id: id() }) - 1];
    Object.assign(it, data);
    return { id: it.id };
  },
  itemvariant(b) { // copy and modify: duplicates the item with its images
    const src = itemOf(b.id), nid = id();
    const copy = { ...src, id: nid, name: text(b.name || `${src.name} (copy)`) };
    copy.image = copyMedia(src.image, nid, false);
    copy.thumb = copyMedia(src.thumb, nid, true);
    S.items.push(copy);
    return { id: nid };
  },
  delete(b) {
    if (b.kind === 'merchant') {
      const m = S.merchants.find((x) => x.id === b.id); if (m) unlinkMedia(m.portrait);
      for (const i of S.items.filter((x) => x.merchantId === b.id)) { unlinkMedia(i.image); unlinkMedia(i.thumb); }
      S.merchants = S.merchants.filter((x) => x.id !== b.id); S.items = S.items.filter((i) => i.merchantId !== b.id);
    } else if (b.kind === 'item') {
      const i = S.items.find((x) => x.id === b.id); if (i) { unlinkMedia(i.image); unlinkMedia(i.thumb); }
      S.items = S.items.filter((x) => x.id !== b.id);
    }
    else if (b.kind === 'player') { S.players = S.players.filter((p) => p.id !== b.id); }
    else fail('Unknown kind');
  },
  player(b) {
    const p = playerOf(b.id);
    if (b.gold !== undefined) {
      const g = num(b.gold), d = round(g - p.gold);
      if (d) book('dm', p, { name: 'DM gold adjustment', amount: d });
      p.gold = g;
    }
  },
  close(b) { // closes (or reopens) one merchant to one player until the next day
    const p = playerOf(b.playerId), m = merchantOf(b.merchantId), k = bkey(p.id, m.id);
    if (b.closed) S.bans[k] = S.day; else delete S.bans[k];
    log(`DM: ${m.name} is ${b.closed ? 'closed' : 'open again'} to ${p.name} today`, p.id);
  },
  bidreply(b) {
    const o = offerOf(b.id), it = o.itemId && S.items.find((i) => i.id === o.itemId), note = noteOf(b.note);
    if (!OPEN.includes(o.status)) fail('This offer is closed.');
    if (note) o.dmNote = note;
    if (b.action === 'accept') {
      if (o.status !== 'new') fail('Waiting for the player to answer.');
      settle(o, 'dm');
    } else if (b.action === 'counter') {
      const price = num(b.price, 0.01);
      o.price = price; o.by = 'dm'; o.status = 'counter'; hist(o, 'dm', 'counter', price, note);
      if (it) log(`${merchantOf(o.merchantId).name}: counter-offer ${gp(price)} for ${o.itemName}`, o.playerId);
    } else if (b.action === 'reject') {
      o.status = 'rejected'; hist(o, 'dm', 'reject', o.price, note);
    } else fail('Unknown action');
  },
  bidsend(b) {
    const p = playerOf(b.playerId), it = itemOf(b.itemId), price = num(b.price, 0.01);
    const o = { id: id(), playerId: p.id, merchantId: it.merchantId, itemId: it.id, itemName: it.name, price, note: noteOf(b.note), from: 'dm', by: 'dm', status: 'counter', week: S.week, t: Date.now(), history: [] };
    hist(o, 'dm', 'send', price, o.note);
    S.offers.push(o);
    log(`${merchantOf(it.merchantId).name} → ${p.name}: offer ${gp(price)} for ${it.name}`, p.id);
  },
  weekly() {
    S.week += 1;
    D.newday();
    log(`New week: ${S.week}`);
  },
  mediaclear(b) {
    if (b.kind === 'item') { const i = itemOf(b.id); unlinkMedia(i.image); unlinkMedia(i.thumb); i.image = i.thumb = null; }
    else if (b.kind === 'portrait') { const m = merchantOf(b.id); unlinkMedia(m.portrait); m.portrait = null; }
    else fail('Invalid kind');
  },
  password(b, a) {
    if (!checkDmPass(b.current)) fail('Current password is wrong', 403);
    const next = String(b.next ?? '');
    if (next.length < 6 || next.length > 64) fail('New password must be 6–64 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    S.settings.dmPass = { salt, hash: hashPass(next, salt) };
    S.dm = [a.tok]; // DM sessions other than this one are closed
    for (const c of clients) if (c.role === 'dm' && c.tok !== a.tok) { try { c.res.end(); } catch {} clients.delete(c); }
    log('DM password changed');
  },
  reset(b, a) { // tests only (DEV_RESET=1): resets the world, the calling DM session stays
    if (!DEV_RESET) fail('Not found', 404);
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, seed(), { ledger: [], settings: {} });
    S.dm = [a.tok]; pinFails.clear();
  },
  newday() { S.day += 1; S.bans = {}; log(`New day: ${S.day}`); },
};

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function auth(tok) {
  if (!tok) return null;
  if (S.dm.includes(tok)) return { role: 'dm', tok };
  const p = S.players.find((x) => x.token === tok);
  return p ? { role: 'player', p } : null;
}
function readBody(req) {
  return new Promise((res, rej) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 1e5) { req.destroy(); rej(new HttpError('Too large', 413)); } });
    req.on('end', () => { try { res(d ? JSON.parse(d) : {}); } catch { rej(new HttpError('Invalid JSON')); } });
  });
}
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }

async function api(req, res, url) {
  const name = url.pathname.slice(5);
  if (req.method === 'GET' && name === 'events') {
    const a = auth(url.searchParams.get('token'));
    if (!a) return send(res, 401, { error: 'Login required' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const c = { res, role: a.role, pid: a.p && a.p.id, tok: a.tok };
    clients.add(c);
    req.on('close', () => { clients.delete(c); broadcast(); });
    push(c);
    return broadcast();
  }
  if (req.method === 'GET' && name === 'chars') return send(res, 200, CHARS);
  if (req.method === 'GET' && name === 'limits') return send(res, 200, { item: MEDIA_LIMITS.item, thumb: MEDIA_LIMITS.thumb, portrait: MEDIA_LIMITS.portrait });
  if (req.method === 'GET' && (name === 'address' || name === 'ledger.csv')) {
    const a = auth(req.headers['x-token']);
    if (!a || a.role !== 'dm') return send(res, 403, { error: 'DM only' });
    if (name === 'address') {
      try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'address.json'), 'utf8'))); } catch { return send(res, 200, { url: null }); }
    }
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = S.ledger.map((e) => {
      const p = S.players.find((x) => x.id === e.playerId), m = S.merchants.find((x) => x.id === e.merchantId);
      return [new Date(e.t).toISOString(), e.week, e.day, e.kind, p ? p.name : e.playerId, m ? m.name : '', e.name, e.amount, e.list ?? ''].map(q).join(',');
    });
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="ledger.csv"' });
    return res.end('\ufeff' + ['time,week,day,kind,player,merchant,item,amount,list', ...rows].join('\n'));
  }
  if (req.method === 'POST' && name === 'media') {
    const a = auth(req.headers['x-token']);
    if (!a || a.role !== 'dm') { req.resume(); return send(res, 403, { error: 'DM only' }); }
    try {
      const kind = url.searchParams.get('kind'), variant = url.searchParams.get('variant') === 'thumb' ? 'thumb' : 'main';
      if (kind !== 'item' && kind !== 'portrait') fail('Invalid kind');
      const ent = kind === 'item' ? itemOf(url.searchParams.get('id')) : merchantOf(url.searchParams.get('id'));
      const cap = kind === 'portrait' ? MEDIA_LIMITS.portrait : variant === 'thumb' ? MEDIA_LIMITS.thumb : MEDIA_LIMITS.item;
      const buf = await readRaw(req, cap);
      if (!buf.length) fail('Empty file');
      const info = sniffImage(buf) || fail('Only PNG or JPEG is accepted.');
      if (info.w < MEDIA_LIMITS.minPx || info.h < MEDIA_LIMITS.minPx || info.w > MEDIA_LIMITS.maxPx || info.h > MEDIA_LIMITS.maxPx) fail(`Image must be ${MEDIA_LIMITS.minPx}–${MEDIA_LIMITS.maxPx} px.`);
      const sub = kind === 'item' ? 'items' : 'portraits', dir = path.join(MEDIA_DIR, sub);
      fs.mkdirSync(dir, { recursive: true });
      const base = `${ent.id}${variant === 'thumb' ? '.t' : ''}`;
      for (const e of ['png', 'jpg']) { try { fs.unlinkSync(path.join(dir, `${base}.${e}`)); } catch {} }
      fs.writeFileSync(path.join(dir, `${base}.${info.ext}`), buf);
      const rel = `/media/${sub}/${base}.${info.ext}?v=${Date.now().toString(36)}`; // ?v= refreshes the cache
      if (kind === 'item') { if (variant === 'thumb') ent.thumb = rel; else ent.image = rel; } else ent.portrait = rel;
      broadcast();
      return send(res, 200, { url: rel, w: info.w, h: info.h, bytes: buf.length });
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.code, { error: e.message });
      console.error(e); return send(res, 500, { error: 'Server error' });
    }
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'Not found' });
  const b = await readBody(req);
  try {
    if (name === 'join') {
      const nm = text(b.name, 16), ch = charOf(b.charId) || fail('Choose a character.');
      let p = S.players.find((x) => x.name.toLowerCase() === nm.toLowerCase());
      if (!p) {
        if (S.players.length >= MAX_PLAYERS) fail(`The table is full (at most ${MAX_PLAYERS} players).`);
        p = { id: id(), token: token(), name: nm, charId: ch.id, gold: ch.gold, inventory: [] }; S.players.push(p); log(`${nm} entered the market (${ch.name})`, p.id);
      }
      broadcast();
      return send(res, 200, { token: p.token, role: 'player' });
    }
    if (name === 'dm/login') {
      const ip = clientIp(req), f = pinFails.get(ip);
      if (f && f.until > Date.now()) fail('Too many attempts. Wait a while.', 429);
      if (!checkDmPass(b.pin)) {
        const n = (f ? f.n : 0) + 1; // after the lock expires the record stays with n=0
        pinFails.set(ip, n >= PIN_MAX ? { n: 0, until: Date.now() + PIN_LOCK_MS } : { n, until: 0 });
        fail('Wrong PIN', 403);
      }
      pinFails.delete(ip);
      const t = token(); S.dm.push(t); if (S.dm.length > 10) S.dm.shift(); save();
      return send(res, 200, { token: t, role: 'dm' });
    }
    const a = auth(req.headers['x-token']) || fail('Login required', 401);
    let out;
    if (name.startsWith('dm/')) {
      if (a.role !== 'dm') fail('DM only', 403);
      out = (D[name.slice(3)] || fail('Not found', 404))(b, a);
    } else {
      if (a.role !== 'player') fail('Player only', 403);
      (P[name] || fail('Not found', 404))(a.p, b);
    }
    broadcast();
    return send(res, 200, { ok: true, ...(out || {}) });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error(e); return send(res, 500, { error: 'Server error' });
  }
}

function serveMedia(req, res, url) {
  const f = mediaFileOf(url.pathname);
  if (!f) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MEDIA_MIME[path.extname(f).slice(1)], 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
    res.end(data);
  });
}

function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch((e) => send(res, e.code || 500, { error: e.message }));
  if (url.pathname.startsWith('/media/')) return serveMedia(req, res, url);
  serveStatic(req, res, url);
});
setInterval(() => { for (const c of clients) c.res.write(': ♥\n\n'); }, 25000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Pazar running: http://localhost:${PORT}` + (process.env.NODE_ENV === 'production' ? '' : `  (DM PIN: ${DM_PIN})`)));
}
module.exports = { server };
