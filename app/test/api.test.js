'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
process.env.DATA_FILE = path.join(os.tmpdir(), `pazar-api-${process.pid}.json`);
process.env.DM_PIN = '9999';
const { server } = require('../server');

let base, dm, ali, veli, items;
const call = async (name, body, tok) => {
  const r = await fetch(`${base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': tok || '' }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json() };
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
  assert.ok(!/"dc"|"type"|"u":/.test(raw));
});
