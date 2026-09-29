'use strict';
// Sürekli açık pazar: oyuncular ve DM aynı anda bağlanır (SSE + JSON POST). Bağımlılık yok.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const E = require('./engine');

const PORT = +process.env.PORT || 3000;
if (process.env.NODE_ENV === 'production' && !process.env.DM_PIN) {
  console.error('DM_PIN ayarlanmadan üretimde başlamam. Render panelinde DM_PIN ortam değişkenini gir.');
  process.exit(1);
}
const DM_PIN = process.env.DM_PIN || '1234';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'data.json');
const DATA_DIR = path.dirname(DATA_FILE);
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || path.join(__dirname, 'media'));
// Medya sınırları (küçük tutulur: hem telefon hem küçük cihazlar için). Görseller istemcide yeniden boyutlandırılır.
const MEDIA_LIMITS = { item: 700 * 1024, thumb: 60 * 1024, portrait: 400 * 1024, minPx: 32, maxPx: 2048 };
fs.mkdirSync(DATA_DIR, { recursive: true });
const PUBLIC = path.join(__dirname, 'public');
const CHARS = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'chars.json'), 'utf8'));
const FIXED = process.env.DICE_FIXED ? process.env.DICE_FIXED.split(',').map(Number) : null; // yalnızca test
let fixedI = 0;
const d20 = () => (FIXED ? FIXED[fixedI++ % FIXED.length] : 1 + crypto.randomInt(20));
const id = () => crypto.randomBytes(5).toString('hex');
const token = () => crypto.randomBytes(16).toString('hex');

const PIN_MAX = 5, PIN_LOCK_MS = +process.env.PIN_LOCK_MS || 10 * 60 * 1000;
const pinFails = new Map(); // ip -> { n, until }
// DM şifresi: ilk kurulumda DM_PIN. DM değiştirince tuzlu scrypt hash'i data.json'da saklanır (düz metin yok).
// Unutulursa: sunucuyu bir kez DM_PASSWORD_RESET=1 ile başlat, DM_PIN yeniden geçerli olur.
const hashPass = (pw, salt) => crypto.scryptSync(String(pw ?? ''), salt, 32).toString('hex');
function checkDmPass(pw) {
  const p = S.settings.dmPass;
  if (!p) return String(pw ?? '') === DM_PIN;
  const a = Buffer.from(hashPass(pw, p.salt), 'hex'), b = Buffer.from(p.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function clientIp(req) {
  const ra = req.socket.remoteAddress || '', loop = /^(::1|127\.|::ffff:127\.)/.test(ra), xf = req.headers['x-forwarded-for'];
  return loop && xf ? String(xf).split(',')[0].trim() : ra; // tailscale serve ara sunucu olarak yerel adresten gelir
}

class HttpError extends Error { constructor(msg, code = 400) { super(msg); this.code = code; } }
const fail = (msg, code) => { throw new HttpError(msg, code); };

// ---------- medya ----------
// Dosya türü uzantıdan değil sihirli baytlardan anlaşılır. Yalnızca PNG ve JPEG kabul edilir.
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
function mediaFileOf(rel) { // '/media/items/abc.png?v=1' -> güvenli mutlak yol ya da null
  const clean = String(rel || '').split('?')[0];
  if (!clean.startsWith('/media/')) return null;
  const abs = path.resolve(MEDIA_DIR, clean.slice('/media/'.length));
  return abs.startsWith(MEDIA_DIR + path.sep) && MEDIA_MIME[path.extname(abs).slice(1)] ? abs : null;
}
function copyMedia(rel, nid, thumb) { // kopya kendi dosyasına sahip olur (biri silinince öbürü bozulmaz)
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
    if (Number.isFinite(cl) && cl > max) { req.resume(); return reject(new HttpError('Dosya çok büyük', 413)); }
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { req.destroy(); reject(new HttpError('Dosya çok büyük', 413)); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

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
S.offers ||= []; S.week ||= 1; S.ledger ||= []; S.affinity ||= {}; S.affinityWeek ||= {}; S.settings ||= {};
if (process.env.DM_PASSWORD_RESET === '1' && S.settings.dmPass) { delete S.settings.dmPass; console.log('DM şifresi sıfırlandı: DM_PIN yeniden geçerli.'); }
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

// Yakınlık: oyuncunun satıcıyla uzun vadeli ilişkisi (0-100). Anlık pazar sabrından (Rep) ayrıdır.
const AFF_DEFAULT = {
  enabled: true,
  start: 20, weeklyCap: 10,
  thresholds: [20, 40, 60, 80],   // Tanıdık, Müşteri, Dost, Sırdaş eşikleri
  dcMod: [0, 0, -1, -2, -3],      // seviye başına zar eşiği indirimi (oyuncuya gösterilmez)
  bonusRepFrom: 3,                // bu seviye ve üstü pazarlığa +1 sabırla başlar (5 = kapalı)
  gain: { buy: 2, offer: 5, deal: 1, gamble: -2, ret: -1, angered: -5 },
};
const LEVEL_NAMES = ['Yabancı', 'Tanıdık', 'Müşteri', 'Dost', 'Sırdaş'];
// Etkin ayar: DM'in kaydettiği değerler varsayılanların üstüne biner.
function affCfg() {
  const o = (S.settings && S.settings.affinity) || {};
  const c = { ...AFF_DEFAULT, ...o, gain: { ...AFF_DEFAULT.gain, ...(o.gain || {}) } };
  c.levels = LEVEL_NAMES.map((n, i) => [n, i === 0 ? 0 : c.thresholds[i - 1]]);
  return c;
}
const AFF = new Proxy({}, { get: (_, k) => affCfg()[k] });
const affKey = (pid, mid) => `${pid}:${mid}`;
const affOf = (pid, mid) => S.affinity[affKey(pid, mid)] ?? AFF.start;
const affLevel = (v) => AFF.levels.reduce((idx, [, t], i) => (v >= t ? i : idx), 0);
function affView(pid, mid) {
  const v = affOf(pid, mid), lv = affLevel(v), next = AFF.levels[lv + 1];
  return { value: v, level: lv, name: AFF.levels[lv][0], from: AFF.levels[lv][1], next: next ? next[1] : null, nextName: next ? next[0] : null };
}
function affChange(p, mid, delta, why) {
  let d = delta;
  if (!d || !AFF.enabled) return;
  const k = affKey(p.id, mid), cur = affOf(p.id, mid);
  if (d > 0) {
    const w = (S.affinityWeek[k] = S.affinityWeek[k] && S.affinityWeek[k].week === S.week ? S.affinityWeek[k] : { week: S.week, gained: 0 });
    d = Math.min(d, Math.max(0, AFF.weeklyCap - w.gained));
    w.gained += d;
  }
  const next = Math.max(0, Math.min(100, cur + d));
  if (next === cur) return;
  S.affinity[k] = next;
  const m = S.merchants.find((x) => x.id === mid);
  log(`${p.name} ↔ ${m ? m.name : '?'}: yakınlık ${next > cur ? '+' : ''}${next - cur} (${why})`, p.id);
}

// Alışveriş defteri: altın hareketlerinin tek kaydı (amount oyuncu açısından, - harcama, + gelir).
function book(kind, p, { merchantId = null, name = '', amount, list = null }) {
  S.ledger.push({ id: id(), t: Date.now(), day: S.day, week: S.week, kind, playerId: p.id, merchantId, name, amount: E.round(amount), list });
  if (S.ledger.length > 1000) S.ledger.shift();
}

// ---------- yardımcılar ----------
const merchantOf = (mid) => S.merchants.find((m) => m.id === mid) || fail('Satıcı yok', 404);
const itemOf = (iid) => S.items.find((i) => i.id === iid) || fail('Eşya yok', 404);
const playerOf = (pid) => S.players.find((p) => p.id === pid) || fail('Oyuncu yok', 404);
const charOf = (cid) => CHARS.find((c) => c.id === cid);
const nkey = (pid, iid) => `${pid}:${iid}`;
function assertUnlocked(p, item) {
  if (!AFF.enabled) return;
  if ((item.minAffinity || 0) > affOf(p.id, item.merchantId)) fail('Bu eşya için yakınlığın yetmiyor.');
}
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
  return (S.negs[k] ||= E.newNegotiation(item, merchant.type, AFF.enabled && affLevel(affOf(p.id, merchant.id)) >= AFF.bonusRepFrom ? 1 : 0));
}

function grant(p, item, paid, damaged, kind) {
  if (p.gold < paid) fail('Altının yetmiyor.');
  if (item.stock !== null && item.stock <= 0) fail('Tükendi.');
  p.gold = E.round(p.gold - paid);
  p.inventory.push({ id: id(), itemId: item.id, name: item.name, paid, damaged, magical: item.magical });
  if (item.stock !== null) item.stock -= 1;
  delete S.negs[nkey(p.id, item.id)];
  book(kind, p, { merchantId: item.merchantId, name: item.name, amount: -paid, list: item.price });
  affChange(p, item.merchantId, kind === 'gamble' ? AFF.gain.gamble : AFF.gain.buy, kind === 'gamble' ? 'hard gamble' : 'alışveriş');
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
    negs[i.id] = { status: n.status, price: n.price, lastY: n.lastY, rep: n.rep, maxRep: n.maxRep, mood: E.moodOf(n, m.type), line: n.line, history: n.history.slice(-3).map(({ y, approach, rolls, roll, bonus, total, outcome }) => ({ y, approach, rolls, roll, bonus, total, outcome })) };
  }
  return {
    role: 'player', day: S.day, week: S.week, dmOnline: dmOnline(),
    bids: S.offers.filter((o) => o.playerId === p.id).map(offerView),
    ledger: S.ledger.filter((e) => e.playerId === p.id).slice(-40),
    me: { id: p.id, name: p.name, charId: p.charId, gold: p.gold, advantage: p.advantage,
      inventory: p.inventory.map((x) => { const it = x.itemId && S.items.find((i) => i.id === x.itemId); return { ...x, image: it ? it.image || null : null, thumb: it ? it.thumb || null : null }; }) },
    merchants: S.merchants.map((m) => ({
      id: m.id, name: m.name, emoji: m.emoji, portrait: m.portrait || null, banned: isBanned(p.id, m.id),
      revealed: S.revealed[bkey(p.id, m.id)] ? E.TYPES[m.type].name : null,
      insightTried: S.insightTries[`${bkey(p.id, m.id)}:${S.day}`] || null,
      affinity: AFF.enabled ? affView(p.id, m.id) : null,
      items: S.items.filter((i) => i.merchantId === m.id).map((i) => AFF.enabled && (i.minAffinity || 0) > affOf(p.id, m.id)
        ? { id: i.id, locked: true, need: i.minAffinity, needName: AFF.levels[affLevel(i.minAffinity)][0] }
        : { id: i.id, name: i.name, price: i.price, magical: i.magical, stock: i.stock, minAffinity: i.minAffinity || 0, image: i.image || null, thumb: i.thumb || null, desc: i.desc || '', type: i.type || null, rarity: i.rarity || 'none' }),
    })),
    negs,
  };
}
function dmView() {
  return {
    role: 'dm', day: S.day, week: S.week, bids: S.offers.map(offerView), ledger: S.ledger.slice(-150),
    affinity: S.players.flatMap((p) => S.merchants.map((m) => ({ playerId: p.id, merchantId: m.id, ...affView(p.id, m.id) }))),
    settings: { affinity: (({ levels, ...r }) => r)(affCfg()), defaults: AFF_DEFAULT, levelNames: LEVEL_NAMES },
    chars: CHARS.map((c) => c.id),
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
    assertUnlocked(p, item);
    if (isBanned(p.id, m.id)) fail('Satıcı bugün pazarlık yapmıyor.');
    const approach = String(b.approach);
    if (!E.APPROACHES.includes(approach)) fail('Yaklaşım seç.');
    const neg = getNeg(p, item, m);
    const n = p.advantage ? 2 : 1;
    const rolls = Array.from({ length: n }, d20);
    const dcMod = AFF.enabled ? AFF.dcMod[affLevel(affOf(p.id, m.id))] : 0;
    const e = E.haggle(neg, { X: item.price, type: m.type, Y: num(b.y, 0.01), approach, bonus: ch.bonus[approach], rolls, dcMod });
    if (e.roll !== null) p.advantage = false;
    if (neg.status === 'angered') S.bans[bkey(p.id, m.id)] = S.day;
    if (e.outcome === 'angered') affChange(p, m.id, AFF.gain.angered, 'satıcı sinirlendi');
    else if (e.outcome === 'ret') affChange(p, m.id, AFF.gain.ret, 'hakaret gibi teklif');
    else if (e.outcome === 'crit' || e.outcome === 'success') affChange(p, m.id, AFF.gain.deal, 'anlaşma');
    neg.line = pick(LINES[e.outcome]);
    log(`${p.name} → ${m.name}: ${item.name} ${gp(e.y)} teklif · ${e.outcome}${e.roll !== null ? ` (${e.roll}+${e.bonus})` : ''} · ${gp(e.price)}`, p.id);
  },
  accept(p, b) {
    const item = itemOf(b.itemId), m = merchantOf(item.merchantId);
    assertUnlocked(p, item);
    const n = S.negs[nkey(p.id, item.id)];
    const paid = n ? n.price : item.price;
    grant(p, item, paid, false, 'buy');
    log(`${p.name} satın aldı: ${item.name} · ${gp(paid)} (${m.name})`, p.id);
  },
  gamble(p, b) {
    const item = itemOf(b.itemId), m = merchantOf(item.merchantId);
    assertUnlocked(p, item);
    if (item.magical) fail('Büyülü eşyada Hard Gamble yok.');
    const paid = E.round(item.price * E.GAMBLE_RATIO);
    grant(p, item, paid, true, 'gamble');
    log(`${p.name} HARD GAMBLE: ${item.name} · ${gp(paid)} (${m.name}) · kusurlu`, p.id);
  },
  bid(p, b) {
    const m = merchantOf(b.merchantId);
    const item = b.itemId ? itemOf(b.itemId) : null;
    if (item && item.merchantId !== m.id) fail('Eşya bu satıcıda yok.');
    if (item) assertUnlocked(p, item);
    const price = num(b.price, 0.01);
    if (item) checkBid(item, price);
    if (S.offers.filter((o) => o.playerId === p.id && OPEN.includes(o.status)).length >= 10) fail('En fazla 10 açık teklif.');
    const o = { id: id(), playerId: p.id, merchantId: m.id, itemId: item ? item.id : null, itemName: item ? item.name : text(b.itemName), price, note: noteOf(b.note), from: 'player', by: 'player', status: 'new', week: S.week, t: Date.now(), history: [] };
    hist(o, 'player', 'teklif', price, o.note);
    S.offers.push(o);
    log(`${p.name} → ${m.name}: ${o.itemName} için ${gp(price)} teklif`, p.id);
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
    log(`${p.name}: ${o.itemName} teklifi → ${o.status}`, p.id);
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
    Object.assign(m, { name: text(b.name), emoji: String(b.emoji ?? m.emoji ?? '').trim().slice(0, 8), type: b.type });
  },
  item(b) {
    merchantOf(b.merchantId);
    const enumOf = (v, list, def, ad) => { const x = v === undefined || v === null || v === '' ? def : String(v); if (x !== def && !list.includes(x)) fail(`${ad} geçersiz`); return x; };
    const data = {
      merchantId: b.merchantId, name: text(b.name), price: num(b.price, 0.01), magical: !!b.magical,
      stock: b.stock === null || b.stock === '' || b.stock === undefined ? null : Math.max(0, Math.floor(+b.stock)),
      minAffinity: Math.max(0, Math.min(100, Math.floor(+b.minAffinity || 0))),
      desc: String(b.desc ?? '').trim().slice(0, 200),
      type: enumOf(b.type, ITEM_TYPES, null, 'Tür'),
      rarity: enumOf(b.rarity, RARITIES, 'none', 'Nadirlik'),
    };
    const it = b.id ? itemOf(b.id) : S.items[S.items.push({ id: id() }) - 1];
    Object.assign(it, data);
    for (const k of Object.keys(S.negs)) if (k.endsWith(`:${it.id}`)) delete S.negs[k];
    return { id: it.id };
  },
  itemvariant(b) { // kopyala ve değiştir: eşyayı görselleriyle birlikte çoğaltır
    const src = itemOf(b.id), nid = id();
    const copy = { ...src, id: nid, name: text(b.name || `${src.name} (kopya)`) };
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
    else fail('Bilinmeyen tür');
  },
  player(b) {
    const p = playerOf(b.id);
    if (b.gold !== undefined) {
      const g = num(b.gold), d = E.round(g - p.gold);
      if (d) book('dm', p, { name: 'DM altın ayarı', amount: d });
      p.gold = g;
    }
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
    log(`${merchantOf(it.merchantId).name} → ${p.name}: ${it.name} için ${gp(price)} teklif`, p.id);
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
      book('offer', p, { merchantId: o.merchantId, name: o.itemName, amount: -o.price, list: it ? it.price : null });
      affChange(p, o.merchantId, AFF.gain.offer, 'teklif teslimi');
      o.status = 'settled'; hist(o, 'dm', 'teslim edildi', o.price);
      done.push(o);
    }
    S.week += 1;
    D.newday();
    log(`Haftalık Pazar: ${done.length} teslimat, yeni hafta ${S.week}`);
  },
  mediaclear(b) {
    if (b.kind === 'item') { const i = itemOf(b.id); unlinkMedia(i.image); unlinkMedia(i.thumb); i.image = i.thumb = null; }
    else if (b.kind === 'portrait') { const m = merchantOf(b.id); unlinkMedia(m.portrait); m.portrait = null; }
    else fail('Tür geçersiz');
  },
  affsettings(b) {
    if (b.reset) { delete S.settings.affinity; log('DM: yakınlık ayarları varsayılana döndü'); return; }
    const cur = affCfg();
    const int = (v, min, max, ad) => { const n = Math.round(+v); if (!Number.isFinite(n) || n < min || n > max) fail(`${ad}: ${min} ile ${max} arasında olmalı`); return n; };
    const arr = (v, len, min, max, ad) => { if (!Array.isArray(v) || v.length !== len) fail(`${ad}: ${len} değer olmalı`); return v.map((x) => int(x, min, max, ad)); };
    const thresholds = b.thresholds === undefined ? cur.thresholds : arr(b.thresholds, 4, 1, 99, 'Seviye eşikleri');
    for (let i = 1; i < 4; i++) if (thresholds[i] <= thresholds[i - 1]) fail('Seviye eşikleri artan olmalı');
    const gain = { ...cur.gain };
    for (const k of Object.keys(AFF_DEFAULT.gain)) if (b.gain && b.gain[k] !== undefined) gain[k] = int(b.gain[k], -20, 20, `Kazanç (${k})`);
    S.settings.affinity = {
      enabled: b.enabled === undefined ? cur.enabled : !!b.enabled,
      start: b.start === undefined ? cur.start : int(b.start, 0, 100, 'Başlangıç'),
      weeklyCap: b.weeklyCap === undefined ? cur.weeklyCap : int(b.weeklyCap, 0, 100, 'Haftalık tavan'),
      thresholds,
      dcMod: b.dcMod === undefined ? cur.dcMod : arr(b.dcMod, 5, -5, 0, 'Zar eşiği indirimi'),
      bonusRepFrom: b.bonusRepFrom === undefined ? cur.bonusRepFrom : int(b.bonusRepFrom, 0, 5, 'Sabır bonusu seviyesi'),
      gain,
    };
    log(`DM: yakınlık ayarlarını güncelledi (${S.settings.affinity.enabled ? 'açık' : 'kapalı'})`);
  },
  affinity(b) {
    const p = playerOf(b.playerId); merchantOf(b.merchantId);
    const cur = affOf(p.id, b.merchantId);
    const v = b.value !== undefined ? +b.value : cur + (+b.delta || 0);
    if (!Number.isFinite(v)) fail('Geçersiz sayı');
    S.affinity[affKey(p.id, b.merchantId)] = Math.max(0, Math.min(100, Math.round(v)));
    log(`DM: ${p.name} yakınlığı ${S.affinity[affKey(p.id, b.merchantId)]} yaptı (${merchantOf(b.merchantId).name})`, p.id);
  },
  password(b, a) {
    if (!checkDmPass(b.current)) fail('Mevcut şifre yanlış', 403);
    const next = String(b.next ?? '');
    if (next.length < 6 || next.length > 64) fail('Yeni şifre 6–64 karakter olmalı');
    const salt = crypto.randomBytes(16).toString('hex');
    S.settings.dmPass = { salt, hash: hashPass(next, salt) };
    S.dm = [a.tok]; // bu oturum dışındaki DM oturumları kapanır
    for (const c of clients) if (c.role === 'dm' && c.tok !== a.tok) { try { c.res.end(); } catch {} clients.delete(c); }
    log('DM şifresi değiştirildi');
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
  if (S.dm.includes(tok)) return { role: 'dm', tok };
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
    const c = { res, role: a.role, pid: a.p && a.p.id, tok: a.tok };
    clients.add(c);
    req.on('close', () => { clients.delete(c); broadcast(); });
    push(c);
    return broadcast();
  }
  if (req.method === 'GET' && name === 'chars') return send(res, 200, CHARS);
  if (req.method === 'GET' && (name === 'address' || name === 'ledger.csv')) {
    const a = auth(req.headers['x-token']);
    if (!a || a.role !== 'dm') return send(res, 403, { error: 'Yalnızca DM' });
    if (name === 'address') {
      try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'address.json'), 'utf8'))); } catch { return send(res, 200, { url: null }); }
    }
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = S.ledger.map((e) => {
      const p = S.players.find((x) => x.id === e.playerId), m = S.merchants.find((x) => x.id === e.merchantId);
      return [new Date(e.t).toISOString(), e.week, e.day, e.kind, p ? p.name : e.playerId, m ? m.name : '', e.name, e.amount, e.list ?? ''].map(q).join(',');
    });
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="defter.csv"' });
    return res.end('\ufeff' + ['zaman,hafta,gun,tur,oyuncu,satici,esya,tutar,etiket', ...rows].join('\n'));
  }
  if (req.method === 'POST' && name === 'media') {
    const a = auth(req.headers['x-token']);
    if (!a || a.role !== 'dm') { req.resume(); return send(res, 403, { error: 'Yalnızca DM' }); }
    try {
      const kind = url.searchParams.get('kind'), variant = url.searchParams.get('variant') === 'thumb' ? 'thumb' : 'main';
      if (kind !== 'item' && kind !== 'portrait') fail('Tür geçersiz');
      const ent = kind === 'item' ? itemOf(url.searchParams.get('id')) : merchantOf(url.searchParams.get('id'));
      const cap = kind === 'portrait' ? MEDIA_LIMITS.portrait : variant === 'thumb' ? MEDIA_LIMITS.thumb : MEDIA_LIMITS.item;
      const buf = await readRaw(req, cap);
      if (!buf.length) fail('Boş dosya');
      const info = sniffImage(buf) || fail('Yalnızca PNG veya JPEG kabul edilir.');
      if (info.w < MEDIA_LIMITS.minPx || info.h < MEDIA_LIMITS.minPx || info.w > MEDIA_LIMITS.maxPx || info.h > MEDIA_LIMITS.maxPx) fail(`Görsel ${MEDIA_LIMITS.minPx}–${MEDIA_LIMITS.maxPx} px olmalı.`);
      const sub = kind === 'item' ? 'items' : 'portraits', dir = path.join(MEDIA_DIR, sub);
      fs.mkdirSync(dir, { recursive: true });
      const base = `${ent.id}${variant === 'thumb' ? '.t' : ''}`;
      for (const e of ['png', 'jpg']) { try { fs.unlinkSync(path.join(dir, `${base}.${e}`)); } catch {} }
      fs.writeFileSync(path.join(dir, `${base}.${info.ext}`), buf);
      const rel = `/media/${sub}/${base}.${info.ext}?v=${Date.now().toString(36)}`; // ?v= önbellek tazeler
      if (kind === 'item') { if (variant === 'thumb') ent.thumb = rel; else ent.image = rel; } else ent.portrait = rel;
      broadcast();
      return send(res, 200, { url: rel, w: info.w, h: info.h, bytes: buf.length });
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.code, { error: e.message });
      console.error(e); return send(res, 500, { error: 'Sunucu hatası' });
    }
  }
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
      const ip = clientIp(req), f = pinFails.get(ip);
      if (f && f.until > Date.now()) fail('Çok fazla deneme. Bir süre bekle.', 429);
      if (!checkDmPass(b.pin)) {
        const n = (f ? f.n : 0) + 1; // kilit süresi dolunca kayıt n=0 ile kalır
        pinFails.set(ip, n >= PIN_MAX ? { n: 0, until: Date.now() + PIN_LOCK_MS } : { n, until: 0 });
        fail('Yanlış PIN', 403);
      }
      pinFails.delete(ip);
      const t = token(); S.dm.push(t); if (S.dm.length > 10) S.dm.shift(); save();
      return send(res, 200, { token: t, role: 'dm' });
    }
    const a = auth(req.headers['x-token']) || fail('Giriş gerekli', 401);
    let out;
    if (name.startsWith('dm/')) {
      if (a.role !== 'dm') fail('Yalnızca DM', 403);
      out = (D[name.slice(3)] || fail('Yok', 404))(b, a);
    } else {
      if (a.role !== 'player') fail('Yalnızca oyuncu', 403);
      (P[name] || fail('Yok', 404))(a.p, b);
    }
    broadcast();
    return send(res, 200, { ok: true, ...(out || {}) });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    if (/^(Teklif|Bu pazarlık|Bilinmeyen)/.test(e.message)) return send(res, 400, { error: e.message });
    console.error(e); return send(res, 500, { error: 'Sunucu hatası' });
  }
}

function serveMedia(req, res, url) {
  const f = mediaFileOf(url.pathname);
  if (!f) { res.writeHead(404); return res.end('Yok'); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Yok'); }
    res.writeHead(200, { 'content-type': MEDIA_MIME[path.extname(f).slice(1)], 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
    res.end(data);
  });
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
  if (url.pathname.startsWith('/media/')) return serveMedia(req, res, url);
  serveStatic(req, res, url);
});
setInterval(() => { for (const c of clients) c.res.write(': ♥\n\n'); }, 25000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Pazar açık: http://localhost:${PORT}` + (process.env.NODE_ENV === 'production' ? '' : `  (DM PIN: ${DM_PIN})`)));
}
module.exports = { server };
