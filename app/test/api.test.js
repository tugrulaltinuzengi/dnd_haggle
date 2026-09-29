'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const http = require('http');
const path = require('path');
process.env.DATA_FILE = path.join(os.tmpdir(), `pazar-api-${process.pid}.json`);
process.env.DM_PIN = '9999';
process.env.PIN_LOCK_MS = '300';
process.env.MEDIA_DIR = path.join(os.tmpdir(), `pazar-media-${process.pid}`);
const { server } = require('../server');

let base, dm, ali, veli, items;
const call = async (name, body, tok) => {
  const r = await fetch(`${base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': tok || '' }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json() };
};
// Geçerli, küçük bir PNG üretir (w×h, tek renk).
function makePng(w, h) {
  const zlib = require('zlib');
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), cr = Buffer.alloc(4); len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x40);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const upload = async (qs, body, tok, type = 'image/png') => {
  const r = await fetch(`${base}/api/media?${qs}`, { method: 'POST', headers: { 'x-token': tok || '', 'content-type': type }, body });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const getRaw = async (rel) => { const r = await fetch(`${base}${rel}`); return { status: r.status, type: r.headers.get('content-type'), sec: r.headers.get('x-content-type-options'), buf: Buffer.from(await r.arrayBuffer()) }; };
const get = async (name, tok) => {
  const r = await fetch(`${base}/api/${name}`, { headers: { 'x-token': tok || '' } });
  return { status: r.status, text: await r.text() };
};
const snap = async (tok) => {
  const ctl = new AbortController();
  const r = await fetch(`${base}/api/events?token=${tok}`, { signal: ctl.signal });
  const reader = r.body.getReader();
  const { value } = await reader.read();
  ctl.abort();
  const first = new TextDecoder().decode(value).split('\n\n')[0];
  return JSON.parse(first.replace(/^data: /, ''));
};

test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  dm = (await call('dm/login', { pin: '9999' })).body.token;
  ali = (await call('join', { name: 'Ali', charId: 'ozan' })).body.token;    // 80 gp
  veli = (await call('join', { name: 'Veli', charId: 'hirsiz' })).body.token; // 60 gp
  items = (await snap(dm)).items;
});
test.after(() => server.close());

const item = (n) => items.find((i) => i.name === n);

test('yanlış PIN ve yetkisiz erişim', async () => {
  assert.equal((await call('dm/login', { pin: '0' })).status, 403);
  assert.equal((await call('dm/newday', {}, ali)).status, 403);
  assert.equal((await call('bid', {}, dm)).status, 403);
});

test('teklif → karşı teklif → kabul → haftalık teslim', async () => {
  const it = item('Uzun Kılıç'); // 15 gp
  assert.equal((await call('bid', { merchantId: it.merchantId, itemId: it.id, price: 3 }, ali)).status, 400); // < %25
  assert.equal((await call('bid', { merchantId: it.merchantId, itemId: it.id, price: 15 }, ali)).status, 400); // ≥ X
  assert.equal((await call('bid', { merchantId: it.merchantId, itemId: it.id, price: 9, note: 'Hafta sonu alırım' }, ali)).status, 200);
  const b1 = (await snap(dm)).bids[0];
  assert.equal(b1.status, 'new');
  assert.equal((await call('dm/bidreply', { id: b1.id, action: 'counter', price: 12, note: 'Son sözüm' }, dm)).status, 200);
  assert.equal((await snap(ali)).bids[0].status, 'counter');
  assert.equal((await call('bidreply', { id: b1.id, action: 'accept' }, veli)).status, 403); // başkasının teklifi
  assert.equal((await call('bidreply', { id: b1.id, action: 'accept' }, ali)).status, 200);
  assert.equal((await snap(ali)).me.gold, 80); // henüz teslim yok
  await call('dm/weekly', {}, dm);
  const a = await snap(ali);
  assert.equal(a.me.gold, 68);
  assert.equal(a.me.inventory[0].name, 'Uzun Kılıç');
  assert.equal(a.bids[0].status, 'settled');
  assert.equal(a.week, 2);
});

test('altın yetmezse teslim olmaz, açık teklifler haftaya kalır', async () => {
  const it = item('+1 Kalkan'); // 400 gp, büyülü
  await call('bid', { merchantId: it.merchantId, itemId: it.id, price: 300 }, veli);
  const open = (await call('bid', { merchantId: it.merchantId, itemId: it.id, price: 350 }, ali));
  assert.equal(open.status, 200);
  const bids = (await snap(dm)).bids;
  const vb = bids.find((b) => b.price === 300), ab = bids.find((b) => b.price === 350);
  await call('dm/bidreply', { id: vb.id, action: 'accept' }, dm);
  await call('dm/weekly', {}, dm);
  const after = (await snap(dm)).bids;
  const v = after.find((b) => b.id === vb.id), a = after.find((b) => b.id === ab.id);
  assert.equal(v.status, 'failed');
  assert.equal(v.reason, 'Altın yetmedi');
  assert.equal(a.status, 'new'); // cevaplanmamış teklif duruyor
});

test('DM oyuncuya teklif gönderir, oyuncu karşı teklif verir, geri çeker', async () => {
  const it = item('Zincir Zırh'); // 75 gp
  const pid = (await snap(dm)).players.find((p) => p.name === 'Veli').id;
  assert.equal((await call('dm/bidsend', { playerId: pid, itemId: it.id, price: 50, note: 'Sana özel' }, dm)).status, 200);
  const b = (await snap(veli)).bids.find((x) => x.from === 'dm');
  assert.equal(b.status, 'counter');
  assert.equal((await call('bidreply', { id: b.id, action: 'counter', price: 40 }, veli)).status, 200);
  assert.equal((await snap(dm)).bids.find((x) => x.id === b.id).status, 'new');
  assert.equal((await call('bidreply', { id: b.id, action: 'withdraw' }, veli)).status, 200);
  assert.equal((await call('dm/bidreply', { id: b.id, action: 'accept' }, dm)).status, 400); // kapalı
});

test('özel istek (katalogda olmayan eşya)', async () => {
  const m = (await snap(dm)).merchants[0];
  assert.equal((await call('bid', { merchantId: m.id, itemName: 'Ejderha Yumurtası', price: 5000 }, ali)).status, 200);
  assert.equal((await call('bid', { merchantId: m.id, itemName: '  ', price: 5 }, ali)).status, 400);
});

test('defter: alım, teklif teslimi ve DM altın ayarı kaydedilir', async () => {
  const dmView = await snap(dm);
  assert.ok(dmView.ledger.some((e) => e.kind === 'offer' && e.amount === -12 && e.name === 'Uzun Kılıç'), 'teklif teslimi defterde');

  const it = item('Çadır'); // 2 gp
  assert.equal((await call('accept', { itemId: it.id }, ali)).status, 200);
  const a = await snap(ali);
  const buy = a.ledger.find((e) => e.kind === 'buy');
  assert.equal(buy.amount, -2);
  assert.equal(buy.list, 2);
  assert.equal(a.me.gold, 66); // 68 - 2

  const pid = (await snap(dm)).players.find((p) => p.name === 'Ali').id;
  await call('dm/player', { id: pid, gold: 100 }, dm);
  const adj = (await snap(ali)).ledger.find((e) => e.kind === 'dm');
  assert.equal(adj.amount, 34); // 66 -> 100
  // oyuncu yalnızca kendi kayıtlarını görür
  assert.ok((await snap(veli)).ledger.every((e) => e.playerId !== pid));
});

test('oyuncuya sabır bilgisi gider (rep, maxRep), DC ve tip gitmez', async () => {
  const it = item('Ejder Pulu'); // Grom, açgözlü
  const r = await call('offer', { itemId: it.id, y: 60, approach: 'persuasion' }, veli);
  assert.equal(r.status, 200);
  const n = (await snap(veli)).negs[it.id];
  assert.equal(typeof n.rep, 'number');
  assert.ok(n.maxRep >= 2);
  const raw = JSON.stringify(await snap(veli));
  assert.ok(!/"dc"|"u":|comert|notr|acgozlu/.test(raw), 'DC ve satıcı tipi (u) oyuncuya gitmemeli');
});

const aff = async (tok, mid) => (await snap(tok)).merchants.find((m) => m.id === mid).affinity;

test('yakınlık: alışveriş artırır, haftalık kazanç tavanı 10', async () => {
  const cadir = item('Çadır'); // m1, 2 gp, sınırsız stok
  assert.equal((await aff(veli, 'm1')).value, 20);
  await call('accept', { itemId: cadir.id }, veli);
  const a1 = await aff(veli, 'm1');
  assert.equal(a1.value, 22);
  assert.equal(a1.name, 'Tanıdık');
  for (let i = 0; i < 5; i++) await call('accept', { itemId: cadir.id }, veli);
  assert.equal((await aff(veli, 'm1')).value, 30); // 20 + tavan 10
});

test('yakınlık: DM ayarlar, seviye adı ve sonraki eşik döner', async () => {
  const pid = (await snap(dm)).players.find((p) => p.name === 'Veli').id;
  assert.equal((await call('dm/affinity', { playerId: pid, merchantId: 'm1', value: 65 }, dm)).status, 200);
  const a = await aff(veli, 'm1');
  assert.deepEqual([a.value, a.name, a.next, a.nextName], [65, 'Dost', 80, 'Sırdaş']);
  assert.equal((await call('dm/affinity', { playerId: pid, merchantId: 'm1', delta: 500 }, dm)).status, 200);
  assert.equal((await aff(veli, 'm1')).value, 100); // sınır
  await call('dm/affinity', { playerId: pid, merchantId: 'm1', value: 65 }, dm);
});

test('Dost seviyesinde pazarlık +1 sabırla başlar', async () => {
  const ip = item('İp (15 m)'); // m1 cömert Rep 4
  await call('offer', { itemId: ip.id, y: 0.6, approach: 'persuasion' }, veli);
  const n = (await snap(veli)).negs[ip.id];
  assert.equal(n.maxRep, 5);
});

test('kilitli eşya: yakınlık yetmeyince ad ve fiyat gitmez, işlem reddedilir', async () => {
  const pid = (await snap(dm)).players.find((p) => p.name === 'Veli').id;
  await call('dm/item', { merchantId: 'm1', name: 'Sırdaş Kılıcı', price: 30, minAffinity: 80 }, dm);
  const locked = (await snap(dm)).items.find((i) => i.name === 'Sırdaş Kılıcı');
  const view = await snap(veli); // Veli yakınlığı 65
  const entry = view.merchants.find((m) => m.id === 'm1').items.find((i) => i.id === locked.id);
  assert.equal(entry.locked, true);
  assert.equal(entry.needName, 'Sırdaş');
  assert.ok(!JSON.stringify(view).includes('Sırdaş Kılıcı'));
  assert.equal((await call('offer', { itemId: locked.id, y: 20, approach: 'persuasion' }, veli)).status, 400);
  assert.equal((await call('accept', { itemId: locked.id }, veli)).status, 400);
  assert.equal((await call('bid', { merchantId: 'm1', itemId: locked.id, price: 20 }, veli)).status, 400);
  await call('dm/affinity', { playerId: pid, merchantId: 'm1', value: 85 }, dm);
  const open = (await snap(veli)).merchants.find((m) => m.id === 'm1').items.find((i) => i.id === locked.id);
  assert.equal(open.name, 'Sırdaş Kılıcı');
  assert.equal((await call('offer', { itemId: locked.id, y: 20, approach: 'persuasion' }, veli)).status, 200);
});

test('sinirlenme yakınlığı düşürür', async () => {
  const pid = (await snap(dm)).players.find((p) => p.name === 'Ali').id;
  await call('dm/affinity', { playerId: pid, merchantId: 'm3', value: 50 }, dm);
  const it = item('Ejder Pulu'); // m3 açgözlü Rep 2, X=120
  // 25'ten düşük teklifler hakaret: Rep 2 -> 1 -> 0 (sinirlenme), her biri yakınlık düşürür
  await call('offer', { itemId: it.id, y: 1, approach: 'persuasion' }, ali);
  await call('offer', { itemId: it.id, y: 1, approach: 'persuasion' }, ali);
  assert.equal((await aff(ali, 'm3')).value, 50 - 1 - 5); // hakaret -1, sinirlenme -5 (hakaret sinirlendirdiğinde ikisi yerine sinirlenme sayılır)
});

test('defter CSV ve davet adresi yalnızca DM için', async () => {
  const csv = await get('ledger.csv', dm);
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes('zaman,hafta,gun,tur,oyuncu,satici,esya,tutar,etiket'));
  assert.ok(csv.text.includes('Çadır'));
  assert.equal((await get('ledger.csv', ali)).status, 403);
  const addr = await get('address', dm);
  assert.equal(addr.status, 200);
  assert.equal(JSON.parse(addr.text).url, null);
  assert.equal((await get('address', ali)).status, 403);
});

test('PIN hız sınırı: art arda yanlış denemede kilitlenir, süre dolunca açılır', async () => {
  let last;
  for (let i = 0; i < 8; i++) { last = await call('dm/login', { pin: 'yanlis' }); if (last.status === 429) break; }
  assert.equal(last.status, 429);
  assert.equal((await call('dm/login', { pin: '9999' })).status, 429); // doğru PIN de kilitliyken reddedilir
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await call('dm/login', { pin: '9999' })).status, 200);
});

test('medya: DM eşya görseli yükler, sunucu doğrular ve sunar', async () => {
  const it = item('Uzun Kılıç');
  const png = makePng(64, 64);
  const r = await upload(`kind=item&id=${it.id}`, png, dm);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^\/media\/items\/[0-9a-f]+\.png\?v=/);
  const f = await getRaw(r.body.url);
  assert.equal(f.status, 200);
  assert.equal(f.type, 'image/png');
  assert.equal(f.sec, 'nosniff');
  assert.ok(f.buf.equals(png));
  // küçük resim ayrı alan
  const t = await upload(`kind=item&id=${it.id}&variant=thumb`, makePng(32, 32), dm);
  assert.equal(t.status, 200);
  const view = await snap(ali);
  const shown = view.merchants.find((m) => m.id === it.merchantId).items.find((x) => x.id === it.id);
  assert.equal(shown.image, r.body.url);
  assert.equal(shown.thumb, t.body.url);
});

test('medya: yetki, tür, boyut ve sınır denetimleri', async () => {
  const it = item('Zincir Zırh');
  const png = makePng(64, 64);
  assert.equal((await upload(`kind=item&id=${it.id}`, png, ali)).status, 403);   // oyuncu
  assert.equal((await upload(`kind=item&id=${it.id}`, png, '')).status, 403);    // giriş yok
  assert.equal((await upload(`kind=item&id=${it.id}`, Buffer.from('bu bir resim degil, düz metin ......'), dm)).status, 400);
  assert.equal((await upload(`kind=item&id=${it.id}`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), dm, 'image/svg+xml')).status, 400); // SVG yok
  assert.equal((await upload(`kind=item&id=${it.id}`, makePng(16, 16), dm)).status, 400);   // çok küçük
  assert.equal((await upload(`kind=item&id=${it.id}`, makePng(3000, 2), dm)).status, 400);  // çok büyük
  const big = Buffer.concat([png.subarray(0, 24), Buffer.alloc(800 * 1024)]);
  assert.equal((await upload(`kind=item&id=${it.id}`, big, dm)).status, 413);                // 700 KB üstü
  assert.equal((await upload('kind=item&id=yok', png, dm)).status, 404);
  assert.equal((await upload(`kind=silah&id=${it.id}`, png, dm)).status, 400);
});

test('medya: JPEG kabul edilir, satıcı portresi yüklenir', async () => {
  // SOF0 işaretli minimal JPEG üstbilgisi (64×64)
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x40, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
  const r = await upload('kind=portrait&id=m2', jpg, dm, 'image/jpeg');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^\/media\/portraits\/m2\.jpg\?v=/);
  const f = await getRaw(r.body.url);
  assert.equal(f.type, 'image/jpeg');
  assert.equal((await snap(ali)).merchants.find((m) => m.id === 'm2').portrait, r.body.url);
  // yeniden yükleme eski uzantıyı temizler
  const r2 = await upload('kind=portrait&id=m2', makePng(64, 64), dm);
  assert.match(r2.body.url, /m2\.png/);
  assert.equal((await getRaw(r.body.url.replace('?v', '?x'))).status, 404); // jpg dosyası silindi
});

test('medya: yol atlatma denemeleri engellenir', async () => {
  for (const p of ['/media/../server.js', '/media/..%2fserver.js', '/media/%2e%2e/server.js', '/media/items/../../package.json', '/media/items/yok.png', '/media/items/x.txt']) {
    const f = await getRaw(p);
    assert.ok([403, 404].includes(f.status), `${p} -> ${f.status}`);
    assert.ok(!f.buf.toString().includes('require('), p);
  }
});

test('medya: temizleme ve silme dosyayı da kaldırır', async () => {
  const it = item('Uzun Kılıç');
  const cur = (await snap(dm)).items.find((x) => x.id === it.id);
  assert.ok(cur.image);
  assert.equal((await call('dm/mediaclear', { kind: 'item', id: it.id }, dm)).status, 200);
  assert.equal((await getRaw(cur.image)).status, 404);
  assert.equal((await getRaw(cur.thumb)).status, 404);
  const after = (await snap(dm)).items.find((x) => x.id === it.id);
  assert.equal(after.image, null);
  // eşya silinince dosyası da gider
  const up = await upload(`kind=item&id=${item('Çadır').id}`, makePng(64, 64), dm);
  assert.equal(up.status, 200);
  await call('dm/delete', { kind: 'item', id: item('Çadır').id }, dm);
  assert.equal((await getRaw(up.body.url)).status, 404);
});

test('yakınlık ayarları DM\'e ait: kaydet, doğrula, geçersizi reddet, sıfırla', async () => {
  assert.equal((await call('dm/affsettings', { start: 30 }, ali)).status, 403);
  assert.equal((await call('dm/affsettings', { start: 30, gain: { buy: 5 } }, dm)).status, 200);
  let cfg = (await snap(dm)).settings;
  assert.equal(cfg.affinity.start, 30);
  assert.equal(cfg.affinity.gain.buy, 5);
  assert.equal(cfg.affinity.gain.offer, 5);          // dokunulmayan değer korunur
  assert.equal(cfg.defaults.start, 20);
  // yeni oyuncu yeni başlangıçla girer ve yeni kazançla yükselir
  const yeni = (await call('join', { name: 'Yeni1', charId: 'ozan' })).body.token;
  assert.equal((await aff(yeni, 'm1')).value, 30);
  await call('accept', { itemId: item('İp (15 m)').id }, yeni);
  assert.equal((await aff(yeni, 'm1')).value, 35);   // 30 + buy 5
  // geçersiz değerler kaydedilmez
  for (const bad of [{ thresholds: [40, 20, 60, 80] }, { thresholds: [10, 20, 30] }, { gain: { buy: 99 } }, { dcMod: [0, 0, 1, -2, -3] }, { start: 500 }, { bonusRepFrom: 9 }]) {
    assert.equal((await call('dm/affsettings', bad, dm)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await snap(dm)).settings.affinity.start, 30);
  // eşikler seviyeyi belirler
  await call('dm/affsettings', { thresholds: [10, 30, 50, 70] }, dm);
  const pid = (await snap(dm)).players.find((p) => p.name === 'Yeni1').id;
  await call('dm/affinity', { playerId: pid, merchantId: 'm1', value: 55 }, dm);
  assert.equal((await aff(yeni, 'm1')).name, 'Dost');   // 50 eşiği geçildi
  // sıfırla
  await call('dm/affsettings', { reset: true }, dm);
  cfg = (await snap(dm)).settings;
  assert.deepEqual(cfg.affinity, cfg.defaults);
  assert.equal((await aff(yeni, 'm1')).name, 'Müşteri'); // 55 varsayılan eşiklerde (40-59)
});

test('yakınlık kapatılınca etkiler ve kilitler devre dışı kalır', async () => {
  const yeni = (await call('join', { name: 'Yeni1', charId: 'ozan' })).body.token; // aynı oyuncuya bağlanır
  const kilitli = (await snap(dm)).items.find((i) => i.name === 'Sırdaş Kılıcı'); // 80 gerekir
  const before = (await aff(yeni, 'm1')).value;
  await call('dm/affsettings', { enabled: false }, dm);
  const view = await snap(yeni);
  assert.equal(view.merchants.find((m) => m.id === 'm1').affinity, null);          // çubuk gizlenir
  const it = view.merchants.find((m) => m.id === 'm1').items.find((i) => i.id === kilitli.id);
  assert.equal(it.locked, undefined);                                              // kilit yok sayılır
  assert.equal(it.name, 'Sırdaş Kılıcı');
  assert.equal((await call('accept', { itemId: kilitli.id }, yeni)).status, 200);
  await call('dm/affsettings', { enabled: true }, dm);
  assert.equal((await aff(yeni, 'm1')).value, before);                             // kapalıyken kazanç/kayıp yok
  await call('dm/affsettings', { reset: true }, dm);
});

test('eşya alanları: açıklama, tür, nadirlik doğrulanır, geçersizde yarım eşya kalmaz', async () => {
  const count = () => snap(dm).then((v) => v.items.length);
  const n0 = await count();
  const r = await call('dm/item', { merchantId: 'm2', name: 'Don Kılıcı', price: 200, desc: 'Soğuk bir kılıç.', type: 'weapon', rarity: 'rare', magical: true }, dm);
  assert.equal(r.status, 200);
  assert.match(r.body.id, /^[0-9a-f]+$/);
  const shown = (await snap(ali)).merchants.find((m) => m.id === 'm2').items.find((i) => i.id === r.body.id);
  assert.deepEqual([shown.desc, shown.type, shown.rarity, shown.magical], ['Soğuk bir kılıç.', 'weapon', 'rare', true]);
  assert.equal(await count(), n0 + 1);
  assert.equal((await call('dm/item', { merchantId: 'm2', name: 'Kötü', price: 5, type: 'silah' }, dm)).status, 400);
  assert.equal((await call('dm/item', { merchantId: 'm2', name: 'Kötü', price: 5, rarity: 'efsane' }, dm)).status, 400);
  assert.equal((await call('dm/item', { merchantId: 'm2', name: '  ', price: 5 }, dm)).status, 400);
  assert.equal(await count(), n0 + 1, 'geçersiz istekler yarım eşya bırakmamalı');
  // düzenleme alanları korur/günceller
  await call('dm/item', { id: r.body.id, merchantId: 'm2', name: 'Don Kılıcı', price: 250, desc: '', type: '', rarity: 'none' }, dm);
  const e = (await snap(ali)).merchants.find((m) => m.id === 'm2').items.find((i) => i.id === r.body.id);
  assert.deepEqual([e.price, e.desc, e.type, e.rarity], [250, '', null, 'none']);
});

test('eşya varyantı görselleriyle kopyalanır ve bağımsızdır', async () => {
  const src = (await snap(dm)).items.find((i) => i.name === 'Don Kılıcı');
  const up = await upload(`kind=item&id=${src.id}`, makePng(64, 64), dm);
  assert.equal(up.status, 200);
  const v = await call('dm/itemvariant', { id: src.id, name: 'Don Kılıcı (yeni)' }, dm);
  assert.equal(v.status, 200);
  const items = (await snap(dm)).items;
  const orig = items.find((i) => i.id === src.id), copy = items.find((i) => i.id === v.body.id);
  assert.equal(copy.name, 'Don Kılıcı (yeni)');
  assert.equal(copy.rarity, orig.rarity);
  assert.equal(copy.price, orig.price);
  assert.equal(copy.magical, orig.magical);
  assert.notEqual(copy.image.split('?')[0], orig.image.split('?')[0]);
  assert.equal((await getRaw(copy.image)).status, 200);
  await call('dm/delete', { kind: 'item', id: src.id }, dm);
  assert.equal((await getRaw(orig.image)).status, 404);
  assert.equal((await getRaw(copy.image)).status, 200, 'kopya asıl silinince bozulmamalı');
});

function openStream(tok) {
  return new Promise((resolve) => {
    const req = http.get(`${base}/api/events?token=${tok}`, (res) => {
      let buf = '', n = 0; const waiters = [];
      res.on('data', (d) => {
        buf += d; let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { const m = buf.slice(0, i); buf = buf.slice(i + 2); if (m.startsWith('data: ')) n++; }
        waiters.splice(0).forEach((w) => w());
      });
      resolve({
        count: () => n,
        waitFor: (k, ms = 2500) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error(`zaman aşımı (${n}/${k})`)), ms); const chk = () => { if (n >= k) { clearTimeout(t); ok(); } else waiters.push(chk); }; chk(); }),
        close: () => req.destroy(),
      });
    });
    req.on('error', () => {});
  });
}

test('kapasite: 7 oyuncu + DM aynı anda bağlı, bir değişiklik hepsine kısa sürede ulaşır', async () => {
  const toks = [ali, veli];
  for (let i = 0; i < 5; i++) toks.push((await call('join', { name: `Kap${i}`, charId: 'druid' })).body.token);
  const streams = await Promise.all([...toks, dm].map(openStream));
  await Promise.all(streams.map((st) => st.waitFor(1)));           // ilk görünüm
  const before = streams.map((st) => st.count());
  const t0 = Date.now();
  await call('dm/newday', {}, dm);
  await Promise.all(streams.map((st, i) => st.waitFor(before[i] + 1)));
  const ms = Date.now() - t0;
  streams.forEach((st) => st.close());
  assert.ok(ms < 1500, `güncelleme ${ms} ms sürdü`);
  assert.equal(streams.length, 8);
});
