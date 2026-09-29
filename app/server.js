'use strict';
// Sürekli açık pazar: oyuncular ve DM aynı anda bağlanır (SSE + JSON POST). Bağımlılık yok.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const E = require('./engine');

const PORT = +process.env.PORT || 3000;
const DM_PIN = process.env.DM_PIN || '1234';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PUBLIC = path.join(__dirname, 'public');
const CHARS = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'chars.json'), 'utf8'));
const FIXED = process.env.DICE_FIXED ? process.env.DICE_FIXED.split(',').map(Number) : null; // yalnızca test
let fixedI = 0;
const d20 = () => (FIXED ? FIXED[fixedI++ % FIXED.length] : 1 + crypto.randomInt(20));
const id = () => crypto.randomBytes(5).toString('hex');
const token = () => crypto.randomBytes(16).toString('hex');

class HttpError extends Error { constructor(msg, code = 400) { super(msg); this.code = code; } }
const fail = (msg, code) => { throw new HttpError(msg, code); };

// ---------- durum ----------
function seed() {
  const m = [
    { id: 'm1', name: 'Bora', emoji: '🧓', type: 'comert' },
    { id: 'm2', name: 'Marla', emoji: '👩‍🔧', type: 'notr' },
    { id: 'm3', name: 'Grom', emoji: '🐗', type: 'acgozlu' },
  ];
  const it = (mid, name, price, magical = false, stock = null) => ({ id: id(), merchantId: mid, name, price, magical, stock });
  return {
    day: 1, week: 1, offers: [], merchants: m,
    items: [
      it('m1', 'İyileştirme İksiri', 50), it('m1', 'İp (15 m)', 1), it('m1', 'Çadır', 2),
      it('m2', 'Uzun Kılıç', 15), it('m2', 'Zincir Zırh', 75), it('m2', 'Hırsız Aletleri', 25),
      it('m3', 'Uçuş İksiri', 250, true, 2), it('m3', '+1 Kalkan', 400, true, 1), it('m3', 'Ejder Pulu', 120),
    ],
    players: [], negs: {}, bans: {}, revealed: {}, insightTries: {}, dm: [], log: [],
  };
}
let S;
try { S = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { S = seed(); }
S.offers ||= []; S.week ||= 1;
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

// ---------- yardımcılar ----------
const merchantOf = (mid) => S.merchants.find((m) => m.id === mid) || fail('Satıcı yok', 404);
const itemOf = (iid) => S.items.find((i) => i.id === iid) || fail('Eşya yok', 404);
const playerOf = (pid) => S.players.find((p) => p.id === pid) || fail('Oyuncu yok', 404);
const charOf = (cid) => CHARS.find((c) => c.id === cid);
const nkey = (pid, iid) => `${pid}:${iid}`;
const bkey = (pid, mid) => `${pid}:${mid}`;
const isBanned = (pid, mid) => S.bans[bkey(pid, mid)] === S.day;
const num = (v, min = 0) => { const n = Math.round(+v * 100) / 100; if (!Number.isFinite(n) || n < min) fail('Geçersiz sayı'); return n; };
const text = (v, max = 40) => { const s = String(v ?? '').trim().slice(0, max); if (!s) fail('Boş olamaz'); return s; };

const LINES = {
  ret: ['Dalga mı geçiyorsun?', 'Bu bir hakaret!', 'Git buradan bu teklifle.'],
  crit: ['Tamam tamam, sen kazandın.', 'Al şunu, canım sıkılmasın.', 'Bu sefer olsun.'],
  success: ['Ortada buluşalım.', 'Sana özel. Bir daha yok.', 'Hmm... peki.'],
  fail: ['Olmaz. Bu son sözüm.', 'Geri adım yok.', 'Daha iyisini bulamazsın.'],
  angered: ['Yeter! Fiyat arttı.', 'Pazarlık bitti. Al ya da git.', 'Sabrımı taşırdın!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function getNeg(p, item, merchant) {
  const k = nkey(p.id, item.id);
  return (S.negs[k] ||= E.newNegotiation(item, merchant.type));
}

function grant(p, item, paid, damaged) {
  if (p.gold < paid) fail('Altının yetmiyor.');
  if (item.stock !== null && item.stock <= 0) fail('Tükendi.');
  p.gold = E.round(p.gold - paid);
  p.inventory.push({ id: id(), itemId: item.id, name: item.name, paid, damaged, magical: item.magical });
  if (item.stock !== null) item.stock -= 1;
  delete S.negs[nkey(p.id, item.id)];
}

// ---------- teklifler (CRM) ----------
const OPEN = ['new', 'counter', 'accepted'];
const hist = (o, who, act, price, note) => o.history.push({ t: Date.now(), who, act, price, note: note || '' });
const noteOf = (v) => String(v ?? '').trim().slice(0, 80);
function checkBid(item, price) {
  if (price >= item.price) fail('Etiketten düşük teklif ver.');
  if (price < item.price * E.MIN_RATIO) fail('En az etiket fiyatının %25\'i olmalı.');
}
const offerOf = (oid) => S.offers.find((o) => o.id === oid) || fail('Teklif yok', 404);
const offerView = (o) => { const it = o.itemId && S.items.find((i) => i.id === o.itemId); return { ...o, listPrice: it ? it.price : null }; };

// ---------- görünümler ----------
function playerView(p) {
  const negs = {};
  for (const i of S.items) {
    const n = S.negs[nkey(p.id, i.id)];
    if (!n) continue;
    const m = merchantOf(i.merchantId);
    negs[i.id] = { status: n.status, price: n.price, lastY: n.lastY, mood: E.moodOf(n, m.type), line: n.line, history: n.history.slice(-3).map(({ y, approach, rolls, roll, bonus, total, outcome }) => ({ y, approach, rolls, roll, bonus, total, outcome })) };
  }
  return {
    role: 'player', day: S.day, week: S.week, dmOnline: dmOnline(),
    bids: S.offers.filter((o) => o.playerId === p.id).map(offerView),
    me: { id: p.id, name: p.name, charId: p.charId, gold: p.gold, advantage: p.advantage, inventory: p.inventory },
    merchants: S.merchants.map((m) => ({
      id: m.id, name: m.name, emoji: m.emoji, banned: isBanned(p.id, m.id),
      revealed: S.revealed[bkey(p.id, m.id)] ? E.TYPES[m.type].name : null,
      insightTried: S.insightTries[`${bkey(p.id, m.id)}:${S.day}`] || null,
      items: S.items.filter((i) => i.merchantId === m.id).map(({ id, name, price, magical, stock }) => ({ id, name, price, magical, stock })),
    })),
    negs,
  };
}
function dmView() {
  return {
    role: 'dm', day: S.day, week: S.week, bids: S.offers.map(offerView), chars: CHARS.map((c) => c.id),
    merchants: S.merchants, items: S.items, log: S.log.slice(-40),
    players: S.players.map((p) => ({ id: p.id, name: p.name, charId: p.charId, gold: p.gold, advantage: p.advantage, inventory: p.inventory })),
    negs: Object.entries(S.negs).map(([k, n]) => {
      const [pid, iid] = k.split(':');
      const it = S.items.find((i) => i.id === iid);
      return { playerId: pid, itemId: iid, rep: n.rep, maxRep: n.maxRep, status: n.status, price: n.price, line: n.line, last: n.history[n.history.length - 1] || null, item: it && it.name };
    }),
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

// ---------- oyuncu işlemleri ----------
const P = {
  offer(p, b) {
    const item = itemOf(b.itemId), m = merchantOf(item.merchantId), ch = charOf(p.charId);
    if (item.stock !== null && item.stock <= 0) fail('Tükendi.');
    if (isBanned(p.id, m.id)) fail('Satıcı bugün pazarlık yapmıyor.');
    const approach = String(b.approach);
    if (!E.APPROACHES.includes(approach)) fail('Yaklaşım seç.');
    const neg = getNeg(p, item, m);
    const n = p.advantage ? 2 : 1;
    const rolls = Array.from({ length: n }, d20);
    const e = E.haggle(neg, { X: item.price, type: m.type, Y: num(b.y, 0.01), approach, bonus: ch.bonus[approach], rolls });
    if (e.roll !== null) p.advantage = false;
    if (neg.status === 'angered') S.bans[bkey(p.id, m.id)] = S.day;
    neg.line = pick(LINES[e.outcome]);
    log(`${p.name} → ${m.name}: ${item.name} ${gp(e.y)} teklif · ${e.outcome}${e.roll !== null ? ` (${e.roll}+${e.bonus})` : ''} · ${gp(e.price)}`, p.id);
  },
  accept(p, b) {
    const item = itemOf(b.itemId), m = merchantOf(item.merchantId);
    const n = S.negs[nkey(p.id, item.id)];
    const paid = n ? n.price : item.price;
    grant(p, item, paid, false);
    log(`${p.name} satın aldı: ${item.name} · ${gp(paid)} (${m.name})`, p.id);
  },
  gamble(p, b) {
    const item = itemOf(b.itemId), m = merchantOf(item.merchantId);
    if (item.magical) fail('Büyülü eşyada Hard Gamble yok.');
    const paid = E.round(item.price * E.GAMBLE_RATIO);
    grant(p, item, paid, true);
    log(`${p.name} HARD GAMBLE: ${item.name} · ${gp(paid)} (${m.name}) · kusurlu`, p.id);
  },
  bid(p, b) {
    const m = merchantOf(b.merchantId);
    const item = b.itemId ? itemOf(b.itemId) : null;
    if (item && item.merchantId !== m.id) fail('Eşya bu satıcıda yok.');
    const price = num(b.price, 0.01);
    if (item) checkBid(item, price);
    if (S.offers.filter((o) => o.playerId === p.id && OPEN.includes(o.status)).length >= 10) fail('En fazla 10 açık teklif.');
    const o = { id: id(), playerId: p.id, merchantId: m.id, itemId: item ? item.id : null, itemName: item ? item.name : text(b.itemName), price, note: noteOf(b.note), from: 'player', by: 'player', status: 'new', week: S.week, t: Date.now(), history: [] };
    hist(o, 'player', 'teklif', price, o.note);
    S.offers.push(o);
    log(`📨 ${p.name} → ${m.name}: ${o.itemName} için ${gp(price)} teklif`, p.id);
  },
  bidreply(p, b) {
    const o = offerOf(b.id);
    if (o.playerId !== p.id) fail('Bu senin teklifin değil', 403);
    const it = o.itemId && S.items.find((i) => i.id === o.itemId);
    if (b.action === 'accept') {
      if (o.status !== 'counter') fail('Kabul edilecek karşı teklif yok.');
      o.status = 'accepted'; hist(o, 'player', 'kabul', o.price);
    } else if (b.action === 'counter') {
      if (o.status !== 'counter') fail('Karşı teklif yok.');
      const price = num(b.price, 0.01);
      if (it) checkBid(it, price);
      o.price = price; o.by = 'player'; o.status = 'new'; hist(o, 'player', 'teklif', price, noteOf(b.note));
    } else if (b.action === 'withdraw') {
      if (!OPEN.includes(o.status)) fail('Bu teklif kapalı.');
      o.status = 'withdrawn'; hist(o, 'player', 'geri çekti', o.price);
    } else fail('Bilinmeyen işlem');
    log(`📨 ${p.name}: ${o.itemName} teklifi → ${o.status}`, p.id);
  },
  insight(p, b) {
    const m = merchantOf(b.merchantId), key = bkey(p.id, m.id);
    if (S.revealed[key]) return;
    const tk = `${key}:${S.day}`;
    if (S.insightTries[tk]) fail('Bugün zaten denedin.');
    const roll = d20(), total = roll + charOf(p.charId).bonus.insight;
    const ok = total >= 15;
    S.insightTries[tk] = ok ? 'ok' : 'fail';
    if (ok) S.revealed[key] = true;
    log(`${p.name} ${m.name}'i sezmeye çalıştı: ${ok ? 'başardı' : 'başaramadı'}`, p.id);
  },
};

// ---------- DM işlemleri ----------
const D = {
  merchant(b) {
    if (!E.TYPES[b.type]) fail('Tip seç.');
    const m = b.id ? merchantOf(b.id) : S.merchants[S.merchants.push({ id: id() }) - 1];
    Object.assign(m, { name: text(b.name), emoji: text(b.emoji || '🧑', 8), type: b.type });
  },
  item(b) {
    merchantOf(b.merchantId);
    const it = b.id ? itemOf(b.id) : S.items[S.items.push({ id: id() }) - 1];
    Object.assign(it, { merchantId: b.merchantId, name: text(b.name), price: num(b.price, 0.01), magical: !!b.magical, stock: b.stock === null || b.stock === '' || b.stock === undefined ? null : Math.max(0, Math.floor(+b.stock)) });
    for (const k of Object.keys(S.negs)) if (k.endsWith(`:${it.id}`)) delete S.negs[k];
  },
  delete(b) {
    if (b.kind === 'merchant') { S.merchants = S.merchants.filter((m) => m.id !== b.id); S.items = S.items.filter((i) => i.merchantId !== b.id); }
    else if (b.kind === 'item') S.items = S.items.filter((i) => i.id !== b.id);
    else if (b.kind === 'player') { S.players = S.players.filter((p) => p.id !== b.id); }
    else fail('Bilinmeyen tür');
  },
  player(b) {
    const p = playerOf(b.id);
    if (b.gold !== undefined) p.gold = num(b.gold);
    if (b.advantage !== undefined) p.advantage = !!b.advantage;
  },
  bidreply(b) {
    const o = offerOf(b.id), it = o.itemId && S.items.find((i) => i.id === o.itemId), note = noteOf(b.note);
    if (!OPEN.includes(o.status)) fail('Bu teklif kapalı.');
    if (b.action === 'accept') {
      if (o.status === 'accepted') fail('Zaten kabul edildi.');
      o.status = 'accepted'; hist(o, 'dm', 'kabul', o.price, note);
    } else if (b.action === 'counter') {
      const price = num(b.price, 0.01);
      if (it) checkBid(it, price);
      o.price = price; o.by = 'dm'; o.status = 'counter'; hist(o, 'dm', 'karşı teklif', price, note);
    } else if (b.action === 'reject') {
      o.status = 'rejected'; hist(o, 'dm', 'reddetti', o.price, note);
    } else fail('Bilinmeyen işlem');
    o.dmNote = note || o.dmNote || '';
  },
  bidsend(b) {
    const p = playerOf(b.playerId), it = itemOf(b.itemId), price = num(b.price, 0.01);
    checkBid(it, price);
    const o = { id: id(), playerId: p.id, merchantId: it.merchantId, itemId: it.id, itemName: it.name, price, note: noteOf(b.note), from: 'dm', by: 'dm', status: 'counter', week: S.week, t: Date.now(), history: [] };
    hist(o, 'dm', 'teklif gönderdi', price, o.note);
    S.offers.push(o);
    log(`📨 ${merchantOf(it.merchantId).name} → ${p.name}: ${it.name} için ${gp(price)} teklif`, p.id);
  },
  weekly() {
    const done = [];
    for (const o of S.offers.filter((x) => x.status === 'accepted').sort((a, b) => a.t - b.t)) {
      const p = S.players.find((x) => x.id === o.playerId), it = o.itemId && S.items.find((i) => i.id === o.itemId);
      let why = null;
      if (!p) why = 'Oyuncu yok';
      else if (o.itemId && !it) why = 'Eşya kalmadı';
      else if (it && it.stock !== null && it.stock <= 0) why = 'Tükendi';
      else if (p.gold < o.price) why = 'Altın yetmedi';
      if (why) { o.status = 'failed'; o.reason = why; hist(o, 'dm', 'teslim olmadı', o.price, why); continue; }
      p.gold = E.round(p.gold - o.price);
      p.inventory.push({ id: id(), itemId: o.itemId, name: o.itemName, paid: o.price, damaged: false, magical: it ? it.magical : false });
      if (it && it.stock !== null) it.stock -= 1;
      o.status = 'settled'; hist(o, 'dm', 'teslim edildi', o.price);
      done.push(o);
    }
    S.week += 1;
    D.newday();
    log(`🎪 Haftalık Pazar: ${done.length} teslimat, yeni hafta ${S.week}`);
  },
  newday() { S.day += 1; S.negs = {}; S.bans = {}; log(`Yeni gün: ${S.day}`); },
  line(b) {
    const n = S.negs[nkey(b.playerId, b.itemId)] || fail('Aktif pazarlık yok', 404);
    n.line = text(b.text, 80);
  },
  setprice(b) {
    const n = S.negs[nkey(b.playerId, b.itemId)] || fail('Aktif pazarlık yok', 404);
    n.price = num(b.price, 0.01); n.status = 'deal';
    log(`DM fiyatı ${gp(n.price)} olarak sabitledi`, b.playerId);
  },
};

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function auth(tok) {
  if (!tok) return null;
  if (S.dm.includes(tok)) return { role: 'dm' };
  const p = S.players.find((x) => x.token === tok);
  return p ? { role: 'player', p } : null;
}
function readBody(req) {
  return new Promise((res, rej) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 1e5) { req.destroy(); rej(new HttpError('Çok büyük', 413)); } });
    req.on('end', () => { try { res(d ? JSON.parse(d) : {}); } catch { rej(new HttpError('Geçersiz JSON')); } });
  });
}
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }

async function api(req, res, url) {
  const name = url.pathname.slice(5);
  if (req.method === 'GET' && name === 'events') {
    const a = auth(url.searchParams.get('token'));
    if (!a) return send(res, 401, { error: 'Giriş gerekli' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const c = { res, role: a.role, pid: a.p && a.p.id };
    clients.add(c);
    req.on('close', () => { clients.delete(c); broadcast(); });
    push(c);
    return broadcast();
  }
  if (req.method === 'GET' && name === 'chars') return send(res, 200, CHARS);
  if (req.method !== 'POST') return send(res, 404, { error: 'Yok' });
  const b = await readBody(req);
  try {
    if (name === 'join') {
      const nm = text(b.name, 16), ch = charOf(b.charId) || fail('Karakter seç.');
      let p = S.players.find((x) => x.name.toLowerCase() === nm.toLowerCase());
      if (!p) { p = { id: id(), token: token(), name: nm, charId: ch.id, gold: ch.gold, advantage: false, inventory: [] }; S.players.push(p); log(`${nm} pazara girdi (${ch.name})`, p.id); }
      broadcast();
      return send(res, 200, { token: p.token, role: 'player' });
    }
    if (name === 'dm/login') {
      if (String(b.pin) !== DM_PIN) fail('Yanlış PIN', 403);
      const t = token(); S.dm.push(t); if (S.dm.length > 10) S.dm.shift(); save();
      return send(res, 200, { token: t, role: 'dm' });
    }
    const a = auth(req.headers['x-token']) || fail('Giriş gerekli', 401);
    if (name.startsWith('dm/')) {
      if (a.role !== 'dm') fail('Yalnızca DM', 403);
      (D[name.slice(3)] || fail('Yok', 404))(b);
    } else {
      if (a.role !== 'player') fail('Yalnızca oyuncu', 403);
      (P[name] || fail('Yok', 404))(a.p, b);
    }
    broadcast();
    return send(res, 200, { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    if (/^(Teklif|Bu pazarlık|Bilinmeyen)/.test(e.message)) return send(res, 400, { error: e.message });
    console.error(e); return send(res, 500, { error: 'Sunucu hatası' });
  }
}

function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Yok'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch((e) => send(res, e.code || 500, { error: e.message }));
  serveStatic(req, res, url);
});
setInterval(() => { for (const c of clients) c.res.write(': ♥\n\n'); }, 25000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Pazar açık: http://localhost:${PORT}  (DM PIN: ${DM_PIN})`));
}
module.exports = { server };
