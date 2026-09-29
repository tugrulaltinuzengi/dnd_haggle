'use strict';
// HTTP parity suite: must pass against the Node server AND against the ESP firmware (BASE=http://192.168.4.1).
// Everything goes over HTTP; the reference engine is only used to compute expected outcomes.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../engine');
const CHARS = require('../../public/chars.json');
const { start, client, fakePng, keys, sleep, LOCK_MS } = require('./_helpers');

let W, c;
test.before(async () => { W = await start(); c = client(W.base); });
test.after(async () => { await W.stop(); });

const bonusOf = (charId, a) => CHARS.find((x) => x.id === charId).bonus[a];
const merchantOf = (v, name) => v.merchants.find((m) => m.name === name);
const itemOf = (v, name) => v.merchants.flatMap((m) => m.items).find((i) => i.name === name);
const T = { timeout: 60000 };

test('static: index and script are served with the right content types', T, async () => {
  const r = await c.get('/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(await r.text(), /<html/i);
  const js = await c.get('/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  const ch = await c.get('/api/chars');
  assert.equal(ch.status, 200);
  assert.deepEqual(await ch.json(), CHARS);
});

test('join: validation, idempotent by name, token works', T, async () => {
  await c.reset();
  assert.deepEqual((await c.call('join', { name: '', charId: 'ozan' })).body, { error: 'Boş olamaz' });
  assert.equal((await c.call('join', { name: 'Ali', charId: 'yok' })).status, 400);
  assert.deepEqual((await c.call('join', { name: 'Ali', charId: 'yok' })).body, { error: 'Karakter seç.' });
  const a = await c.call('join', { name: 'Ali', charId: 'barbar' });
  assert.equal(a.status, 200);
  assert.equal(a.body.role, 'player');
  assert.match(a.body.token, /^[0-9a-f]{16,}$/);
  const again = await c.call('join', { name: 'ALI', charId: 'ozan' }); // same player, case-insensitive
  assert.equal(again.body.token, a.body.token);
  const v = await c.view(a.body.token);
  assert.equal(v.me.name, 'Ali');
  assert.equal(v.me.charId, 'barbar');
  assert.equal(v.me.gold, 100);
});

test('auth: 401 / 403 / 404 messages', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  assert.deepEqual((await c.call('offer', {})).body, { error: 'Giriş gerekli' });
  assert.equal((await c.call('offer', {}, 'nope')).status, 401);
  assert.deepEqual((await c.call('dm/newday', {}, p)).body, { error: 'Yalnızca DM' });
  assert.equal((await c.call('dm/newday', {}, p)).status, 403);
  assert.deepEqual((await c.call('offer', {}, dmT)).body, { error: 'Yalnızca oyuncu' });
  assert.equal((await c.call('offer', {}, dmT)).status, 403);
  assert.deepEqual((await c.call('nonexistent', {}, p)).body, { error: 'Yok' });
  assert.equal((await c.call('nonexistent', {}, p)).status, 404);
  assert.equal((await c.call('dm/nonexistent', {}, dmT)).status, 404);
  const g = await fetch(`${W.base}/api/join`);
  assert.equal(g.status, 404);
});

test('request body: invalid JSON -> 400, oversize -> 413 (or reset)', T, async () => {
  const r = await fetch(`${W.base}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'Geçersiz JSON' });
  try {
    const big = await fetch(`${W.base}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(150000) }) });
    assert.equal(big.status, 413);
  } catch (e) {
    assert.ok(e, 'connection dropped on oversize body is acceptable');
  }
  assert.equal((await fetch(`${W.base}/api/chars`)).status, 200); // server still alive
});

test('snapshots: exact key sets for player and DM views', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'ozan');
  const pv = await c.view(p);
  assert.deepEqual(keys(pv), ['bids', 'day', 'dmOnline', 'ledger', 'me', 'merchants', 'negs', 'role', 'week']);
  assert.deepEqual(keys(pv.me), ['advantage', 'charId', 'gold', 'id', 'inventory', 'name']);
  assert.equal(pv.role, 'player');
  assert.equal(pv.day, 1); assert.equal(pv.week, 1);
  assert.equal(pv.merchants.length, 3);
  assert.deepEqual(keys(pv.merchants[0]), ['affinity', 'banned', 'emoji', 'id', 'insightTried', 'items', 'name', 'portrait', 'revealed']);
  assert.deepEqual(keys(pv.merchants[0].affinity), ['from', 'level', 'name', 'next', 'nextName', 'value']);
  assert.deepEqual(pv.merchants[0].affinity, { value: 20, level: 1, name: 'Tanıdık', from: 20, next: 40, nextName: 'Müşteri' });
  assert.deepEqual(keys(pv.merchants[0].items[0]), ['desc', 'id', 'image', 'magical', 'minAffinity', 'name', 'price', 'rarity', 'stock', 'thumb', 'type']);
  assert.deepEqual(pv.merchants.map((m) => m.name), ['Bora', 'Marla', 'Grom']);
  assert.deepEqual(pv.merchants.map((m) => m.items.length), [3, 3, 3]);
  assert.equal(itemOf(pv, 'Uçuş İksiri').stock, 2);
  assert.equal(itemOf(pv, 'İyileştirme İksiri').stock, null);
  assert.equal(pv.dmOnline, false);
  assert.equal(JSON.stringify(pv).includes('token'), false);

  const dv = await c.view(dmT);
  assert.deepEqual(keys(dv), ['affinity', 'bids', 'chars', 'day', 'items', 'ledger', 'log', 'merchants', 'negs', 'players', 'role', 'settings', 'week']);
  assert.equal(dv.role, 'dm');
  assert.deepEqual(dv.chars, CHARS.map((x) => x.id));
  assert.deepEqual(keys(dv.settings), ['affinity', 'defaults', 'levelNames']);
  assert.deepEqual(keys(dv.settings.affinity), ['bonusRepFrom', 'dcMod', 'enabled', 'gain', 'start', 'thresholds', 'weeklyCap']);
  assert.deepEqual(dv.settings.levelNames, ['Yabancı', 'Tanıdık', 'Müşteri', 'Dost', 'Sırdaş']);
  assert.equal(dv.players.length, 1);
  assert.deepEqual(keys(dv.players[0]), ['advantage', 'charId', 'gold', 'id', 'inventory', 'name']);
  assert.equal(dv.affinity.length, 3);
  assert.equal(dv.items.length, 9);
  assert.equal(JSON.stringify(dv).includes('dmPass'), false);
  assert.equal(JSON.stringify(dv).includes('token'), false);
});

test('SSE: bad token 401, dmOnline flips, a second event follows an action', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  const bad = await c.sse('nope');
  assert.equal(bad.status, 401);
  assert.deepEqual(bad.body, { error: 'Giriş gerekli' });
  const ps = await c.sse(p);
  const first = await ps.next();
  assert.equal(first.dmOnline, false);
  const ds = await c.sse(dmT);
  await ds.next();
  let seen = null;
  for (let i = 0; i < 5 && !(seen && seen.dmOnline); i++) seen = await ps.next();
  assert.equal(seen.dmOnline, true);
  await c.call('dm/newday', {}, dmT);
  let upd = null;
  for (let i = 0; i < 5; i++) { upd = await ps.next(); if (upd.day === 2) break; }
  assert.equal(upd.day, 2);
  ps.close(); ds.close();
});

test('offer: crit on a natural 20, then accept buys at the deal price', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'ozan');
  await c.dice(dmT, [20]);
  const v0 = await c.view(p);
  const item = itemOf(v0, 'İyileştirme İksiri');
  const ref = E.haggle(E.newNegotiation({ price: 50 }, 'comert'), { X: 50, type: 'comert', Y: 25, approach: 'persuasion', bonus: bonusOf('ozan', 'persuasion'), rolls: [20] });
  assert.equal(ref.outcome, 'crit');
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 25, approach: 'persuasion' }, p)).body, { ok: true });
  const v = await c.view(p);
  const n = v.negs[item.id];
  assert.deepEqual(keys(n), ['history', 'lastY', 'line', 'maxRep', 'mood', 'price', 'rep', 'status']);
  assert.equal(n.status, 'deal'); assert.equal(n.price, ref.price); assert.equal(n.lastY, 25); assert.equal(n.rep, 4); assert.equal(n.maxRep, 4);
  assert.equal(n.mood, '😊');
  assert.equal(typeof n.line, 'string'); assert.ok(n.line.length > 0);
  assert.deepEqual(n.history, [{ y: 25, approach: 'persuasion', rolls: [20], roll: 20, bonus: 6, total: 26, outcome: 'crit' }]);
  assert.equal(merchantOf(v, 'Bora').affinity.value, 21); // +1 for the deal

  assert.deepEqual((await c.call('accept', { itemId: item.id }, p)).body, { ok: true });
  const after = await c.view(p);
  assert.equal(after.me.gold, 55); // 80 - 25
  assert.equal(after.me.inventory.length, 1);
  assert.deepEqual(keys(after.me.inventory[0]), ['damaged', 'id', 'image', 'itemId', 'magical', 'name', 'paid', 'thumb']);
  assert.equal(after.me.inventory[0].paid, 25); assert.equal(after.me.inventory[0].damaged, false);
  assert.equal(after.negs[item.id], undefined);
  assert.equal(after.ledger.length, 1);
  assert.equal(after.ledger[0].kind, 'buy'); assert.equal(after.ledger[0].amount, -25); assert.equal(after.ledger[0].list, 50);
  assert.equal(merchantOf(after, 'Bora').affinity.value, 23); // +2 for the purchase
});

test('offer: failures and anger match the reference engine, then the merchant refuses for the day', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'ozan');
  const v0 = await c.view(p);
  const item = itemOf(v0, 'Ejder Pulu'); // Grom, acgozlu, 120 gp
  const neg = E.newNegotiation({ price: 120 }, 'acgozlu');
  const bonus = bonusOf('ozan', 'persuasion');
  await c.dice(dmT, [1]);
  const e1 = E.haggle(neg, { X: 120, type: 'acgozlu', Y: 60, approach: 'persuasion', bonus, rolls: [1] });
  assert.equal(e1.outcome, 'fail');
  assert.equal((await c.call('offer', { itemId: item.id, y: 60, approach: 'persuasion' }, p)).status, 200);
  let n = (await c.view(p)).negs[item.id];
  assert.equal(n.status, 'open'); assert.equal(n.price, e1.price); assert.equal(n.rep, neg.rep); assert.equal(n.outcome, undefined);
  assert.equal(n.history[0].outcome, 'fail');

  const e2 = E.haggle(neg, { X: 120, type: 'acgozlu', Y: 50, approach: 'persuasion', bonus, rolls: [1] });
  assert.equal(e2.outcome, 'angered');
  assert.equal((await c.call('offer', { itemId: item.id, y: 50, approach: 'persuasion' }, p)).status, 200);
  const v = await c.view(p);
  n = v.negs[item.id];
  assert.equal(n.status, 'angered'); assert.equal(n.price, e2.price); assert.equal(n.mood, '😡');
  assert.equal(merchantOf(v, 'Grom').banned, true);
  assert.equal(merchantOf(v, 'Grom').affinity.value, 15); // -5 for the anger
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 40, approach: 'persuasion' }, p)).body, { error: 'Satıcı bugün pazarlık yapmıyor.' });
  await c.call('dm/newday', {}, dmT);
  const v2 = await c.view(p);
  assert.equal(merchantOf(v2, 'Grom').banned, false);
  assert.equal(v2.negs[item.id], undefined);
});

test('offer: input validation messages', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'ozan');
  const item = itemOf(await c.view(p), 'İyileştirme İksiri');
  assert.deepEqual((await c.call('offer', { itemId: 'zzz', y: 5, approach: 'persuasion' }, p)).body, { error: 'Eşya yok' });
  assert.equal((await c.call('offer', { itemId: 'zzz', y: 5, approach: 'persuasion' }, p)).status, 404);
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 5, approach: 'flirt' }, p)).body, { error: 'Yaklaşım seç.' });
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 50, approach: 'persuasion' }, p)).body, { error: 'Teklif etiket fiyatının altında olmalı.' });
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 'abc', approach: 'persuasion' }, p)).body, { error: 'Geçersiz sayı' });
  await c.dice(dmT, [20]);
  assert.equal((await c.call('offer', { itemId: item.id, y: 20, approach: 'persuasion' }, p)).status, 200); // deal made
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 19, approach: 'persuasion' }, p)).body, { error: 'Bu pazarlık bitti.' });
  const poor = await c.join('Fakir', 'hirsiz'); // 60 gp
  const sword = itemOf(await c.view(poor), '+1 Kalkan'); // 400 gp
  assert.deepEqual((await c.call('accept', { itemId: sword.id }, poor)).body, { error: 'Altının yetmiyor.' });
});

test('advantage: two dice are rolled and the higher counts, then advantage is spent', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'ozan');
  const pl = (await c.view(dmT)).players[0];
  assert.equal((await c.call('dm/player', { id: pl.id, advantage: true }, dmT)).status, 200);
  assert.equal((await c.view(p)).me.advantage, true);
  await c.dice(dmT, [3, 17]);
  const item = itemOf(await c.view(p), 'Uzun Kılıç'); // Marla notr dc15, 15 gp
  const ref = E.haggle(E.newNegotiation({ price: 15 }, 'notr'), { X: 15, type: 'notr', Y: 10, approach: 'persuasion', bonus: 6, rolls: [3, 17] });
  await c.call('offer', { itemId: item.id, y: 10, approach: 'persuasion' }, p);
  const v = await c.view(p);
  assert.deepEqual(v.negs[item.id].history[0].rolls, [3, 17]);
  assert.equal(v.negs[item.id].history[0].roll, 17);
  assert.equal(v.negs[item.id].history[0].outcome, ref.outcome);
  assert.equal(v.me.advantage, false);
});

test('gamble: half price, damaged item, magical items refused', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'ozan');
  const v0 = await c.view(p);
  const sword = itemOf(v0, 'Uzun Kılıç');
  assert.deepEqual((await c.call('gamble', { itemId: itemOf(v0, 'Uçuş İksiri').id }, p)).body, { error: 'Büyülü eşyada Hard Gamble yok.' });
  assert.equal((await c.call('gamble', { itemId: sword.id }, p)).status, 200);
  const v = await c.view(p);
  assert.equal(v.me.gold, 72.5);
  assert.equal(v.me.inventory[0].damaged, true); assert.equal(v.me.inventory[0].paid, 7.5);
  assert.equal(v.ledger[0].kind, 'gamble');
  assert.equal(merchantOf(v, 'Marla').affinity.value, 18); // gamble -2
  const dv = await c.view(dmT);
  assert.ok(dv.log.some((l) => l.text.includes('HARD GAMBLE')));
});

test('stock: last unit sells once, then "Tükendi."', T, async () => {
  const dmT = await c.reset();
  const rich = await c.join('Zengin', 'buyucu'); // 200 gp
  const rich2 = await c.join('Zengin2', 'buyucu');
  const v = await c.view(rich);
  const fly = itemOf(v, 'Uçuş İksiri'); // 250, stock 2, magical
  await c.call('dm/player', { id: v.me.id, gold: 900 }, dmT);
  assert.equal((await c.call('accept', { itemId: fly.id }, rich)).status, 200);
  assert.equal(itemOf(await c.view(rich), 'Uçuş İksiri').stock, 1);
  await c.call('dm/player', { id: (await c.view(rich2)).me.id, gold: 900 }, dmT);
  assert.equal((await c.call('accept', { itemId: fly.id }, rich2)).status, 200);
  assert.deepEqual((await c.call('accept', { itemId: fly.id }, rich2)).body, { error: 'Tükendi.' });
});

test('insight: success reveals the type, one try per day', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'druid'); // insight +5
  const v0 = await c.view(p);
  const grom = merchantOf(v0, 'Grom');
  await c.dice(dmT, [1]);
  assert.equal((await c.call('insight', { merchantId: grom.id }, p)).status, 200);
  let v = await c.view(p);
  assert.equal(merchantOf(v, 'Grom').revealed, null); assert.equal(merchantOf(v, 'Grom').insightTried, 'fail');
  assert.deepEqual((await c.call('insight', { merchantId: grom.id }, p)).body, { error: 'Bugün zaten denedin.' });
  await c.call('dm/newday', {}, dmT);
  await c.dice(dmT, [15]);
  assert.equal((await c.call('insight', { merchantId: grom.id }, p)).status, 200);
  v = await c.view(p);
  assert.equal(merchantOf(v, 'Grom').revealed, 'Açgözlü');
  assert.equal((await c.call('insight', { merchantId: grom.id }, p)).status, 200); // no-op once revealed
});

test('bids: player bid -> DM counter -> player accept -> weekly delivery', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'ozan');
  const v0 = await c.view(p);
  const item = itemOf(v0, 'Zincir Zırh'); // 75 gp at Marla
  const marla = merchantOf(v0, 'Marla');
  assert.deepEqual((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 75 }, p)).body, { error: 'Etiketten düşük teklif ver.' });
  assert.deepEqual((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 10 }, p)).body, { error: 'En az etiket fiyatının %25\'i olmalı.' });
  assert.equal((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 50, note: 'peşin' }, p)).status, 200);
  let dv = await c.view(dmT);
  assert.equal(dv.bids.length, 1);
  const bid = dv.bids[0];
  assert.equal(bid.status, 'new'); assert.equal(bid.price, 50); assert.equal(bid.listPrice, 75); assert.equal(bid.itemName, 'Zincir Zırh'); assert.equal(bid.note, 'peşin');
  assert.deepEqual(bid.history.map((h) => h.act), ['teklif']);

  assert.equal((await c.call('dm/bidreply', { id: bid.id, action: 'counter', price: 60, note: 'son' }, dmT)).status, 200);
  assert.deepEqual((await c.call('dm/bidreply', { id: bid.id, action: 'zzz' }, dmT)).body, { error: 'Bilinmeyen işlem' });
  let pv = await c.view(p);
  assert.equal(pv.bids[0].status, 'counter'); assert.equal(pv.bids[0].price, 60); assert.equal(pv.bids[0].by, 'dm');
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'accept' }, p)).status, 200);
  assert.equal((await c.view(dmT)).bids[0].status, 'accepted');

  assert.equal((await c.call('dm/weekly', {}, dmT)).status, 200);
  pv = await c.view(p);
  assert.equal(pv.week, 2); assert.equal(pv.day, 2);
  assert.equal(pv.me.gold, 20); // 80 - 60
  assert.equal(pv.me.inventory[0].name, 'Zincir Zırh'); assert.equal(pv.me.inventory[0].paid, 60);
  assert.equal(pv.bids[0].status, 'settled');
  assert.equal(pv.ledger[0].kind, 'offer');
  assert.equal(merchantOf(pv, 'Marla').affinity.value, 25); // +5 for the delivery
});

test('bids: DM-initiated offer, player can withdraw or counter; ownership enforced', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'ozan');
  const q = await c.join('Veli', 'barbar');
  const pv = await c.view(p);
  const item = itemOf(pv, 'Çadır');
  const pid = pv.me.id;
  assert.equal((await c.call('dm/bidsend', { playerId: pid, itemId: item.id, price: 1.5 }, dmT)).status, 200);
  const bid = (await c.view(p)).bids[0];
  assert.equal(bid.from, 'dm'); assert.equal(bid.status, 'counter');
  assert.deepEqual((await c.call('bidreply', { id: bid.id, action: 'accept' }, q)).body, { error: 'Bu senin teklifin değil' });
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'accept' }, q)).status, 403);
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'counter', price: 1.25 }, p)).status, 200);
  assert.equal((await c.view(dmT)).bids[0].status, 'new');
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'withdraw' }, p)).status, 200);
  assert.equal((await c.view(p)).bids[0].status, 'withdrawn');
  assert.deepEqual((await c.call('bidreply', { id: bid.id, action: 'withdraw' }, p)).body, { error: 'Bu teklif kapalı.' });
});

test('DM: merchants and items CRUD, variants, validation', T, async () => {
  const dmT = await c.reset();
  assert.deepEqual((await c.call('dm/merchant', { name: 'Yeni', type: 'zzz' }, dmT)).body, { error: 'Tip seç.' });
  assert.deepEqual((await c.call('dm/merchant', { name: '', type: 'notr' }, dmT)).body, { error: 'Boş olamaz' });
  assert.equal((await c.call('dm/merchant', { name: 'Kara', emoji: '🦊', type: 'notr' }, dmT)).status, 200);
  let dv = await c.view(dmT);
  assert.equal(dv.merchants.length, 4);
  const kara = dv.merchants[3];
  assert.equal(kara.name, 'Kara'); assert.equal(kara.emoji, '🦊'); assert.equal(kara.type, 'notr');
  const added = await c.call('dm/item', { merchantId: kara.id, name: 'Kılıç', price: 10.5, magical: false, stock: 3, desc: 'keskin', type: 'weapon', rarity: 'rare', minAffinity: 30 }, dmT);
  assert.equal(added.status, 200); assert.match(added.body.id, /^[0-9a-f]{10}$/);
  assert.deepEqual((await c.call('dm/item', { merchantId: kara.id, name: 'X', price: 1, type: 'gizem' }, dmT)).body, { error: 'Tür geçersiz' });
  assert.deepEqual((await c.call('dm/item', { merchantId: kara.id, name: 'X', price: 1, rarity: 'gizem' }, dmT)).body, { error: 'Nadirlik geçersiz' });
  assert.deepEqual((await c.call('dm/item', { merchantId: kara.id, name: 'X', price: 0 }, dmT)).body, { error: 'Geçersiz sayı' });
  assert.equal((await c.call('dm/item', { merchantId: 'yok', name: 'X', price: 1 }, dmT)).status, 404);
  dv = await c.view(dmT);
  const it = dv.items.find((i) => i.id === added.body.id);
  assert.deepEqual({ ...it, id: undefined }, { id: undefined, merchantId: kara.id, name: 'Kılıç', price: 10.5, magical: false, stock: 3, minAffinity: 30, desc: 'keskin', type: 'weapon', rarity: 'rare' });

  const variant = await c.call('dm/itemvariant', { id: it.id, name: 'Kılıç +1' }, dmT);
  assert.equal(variant.status, 200);
  dv = await c.view(dmT);
  const copy = dv.items.find((i) => i.id === variant.body.id);
  assert.equal(copy.name, 'Kılıç +1'); assert.equal(copy.price, 10.5); assert.equal(copy.merchantId, kara.id);

  // locked item shows only a teaser to players whose affinity is below the requirement
  const p = await c.join('Ali');
  const locked = (await c.view(p)).merchants[3].items.find((i) => i.id === it.id);
  assert.deepEqual(locked, { id: it.id, locked: true, need: 30, needName: 'Tanıdık' });
  assert.deepEqual((await c.call('accept', { itemId: it.id }, p)).body, { error: 'Bu eşya için yakınlığın yetmiyor.' });

  assert.equal((await c.call('dm/delete', { kind: 'item', id: copy.id }, dmT)).status, 200);
  assert.deepEqual((await c.call('dm/delete', { kind: 'zzz', id: 'x' }, dmT)).body, { error: 'Bilinmeyen tür' });
  assert.equal((await c.call('dm/delete', { kind: 'merchant', id: kara.id }, dmT)).status, 200);
  dv = await c.view(dmT);
  assert.equal(dv.merchants.length, 3); assert.equal(dv.items.length, 9);
});

test('DM: player gold/advantage, ledger entry, delete player, line and setprice', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'ozan');
  const pl = (await c.view(dmT)).players[0];
  assert.equal((await c.call('dm/player', { id: pl.id, gold: 120.5 }, dmT)).status, 200);
  let pv = await c.view(p);
  assert.equal(pv.me.gold, 120.5);
  assert.equal(pv.ledger[0].kind, 'dm'); assert.equal(pv.ledger[0].amount, 40.5); assert.equal(pv.ledger[0].name, 'DM altın ayarı');
  assert.equal((await c.call('dm/player', { id: 'yok', gold: 1 }, dmT)).status, 404);
  assert.deepEqual((await c.call('dm/player', { id: pl.id, gold: -5 }, dmT)).body, { error: 'Geçersiz sayı' });

  const item = itemOf(pv, 'Çadır');
  assert.deepEqual((await c.call('dm/line', { playerId: pl.id, itemId: item.id, text: 'Merhaba' }, dmT)).body, { error: 'Aktif pazarlık yok' });
  assert.deepEqual((await c.call('dm/setprice', { playerId: pl.id, itemId: item.id, price: 1 }, dmT)).body, { error: 'Aktif pazarlık yok' });
  await c.dice(dmT, [1]);
  await c.call('offer', { itemId: item.id, y: 1.5, approach: 'persuasion' }, p); // Çadır 2 gp
  assert.equal((await c.call('dm/line', { playerId: pl.id, itemId: item.id, text: 'Hmm, peki.' }, dmT)).status, 200);
  assert.equal((await c.call('dm/setprice', { playerId: pl.id, itemId: item.id, price: 1.75 }, dmT)).status, 200);
  pv = await c.view(p);
  assert.equal(pv.negs[item.id].line, 'Hmm, peki.'); assert.equal(pv.negs[item.id].price, 1.75); assert.equal(pv.negs[item.id].status, 'deal');
  const dv = await c.view(dmT);
  assert.equal(dv.negs.length, 1);
  assert.deepEqual(keys(dv.negs[0]), ['item', 'itemId', 'last', 'line', 'playerId', 'price', 'rep', 'maxRep', 'status'].sort());

  assert.equal((await c.call('dm/delete', { kind: 'player', id: pl.id }, dmT)).status, 200);
  assert.equal((await c.view(dmT)).players.length, 0);
  assert.equal((await c.call('offer', {}, p)).status, 401); // deleted player's token is dead
});

test('affinity: DM settings validation, save, reset; manual set', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  const dv0 = await c.view(dmT);
  const pid = dv0.players[0].id, mid = dv0.merchants[0].id;
  assert.deepEqual((await c.call('dm/affsettings', { start: 500 }, dmT)).body, { error: 'Başlangıç: 0 ile 100 arasında olmalı' });
  assert.deepEqual((await c.call('dm/affsettings', { thresholds: [10, 20] }, dmT)).body, { error: 'Seviye eşikleri: 4 değer olmalı' });
  assert.deepEqual((await c.call('dm/affsettings', { thresholds: [10, 10, 30, 40] }, dmT)).body, { error: 'Seviye eşikleri artan olmalı' });
  assert.equal((await c.call('dm/affsettings', { start: 30, weeklyCap: 4, gain: { buy: 3 } }, dmT)).status, 200);
  let dv = await c.view(dmT);
  assert.equal(dv.settings.affinity.start, 30); assert.equal(dv.settings.affinity.weeklyCap, 4); assert.equal(dv.settings.affinity.gain.buy, 3); assert.equal(dv.settings.affinity.gain.offer, 5);
  assert.equal((await c.view(p)).merchants[0].affinity.value, 30);
  assert.equal((await c.call('dm/affinity', { playerId: pid, merchantId: mid, value: 85 }, dmT)).status, 200);
  const a = (await c.view(p)).merchants[0].affinity;
  assert.deepEqual(a, { value: 85, level: 4, name: 'Sırdaş', from: 80, next: null, nextName: null });
  assert.equal((await c.call('dm/affinity', { playerId: pid, merchantId: mid, delta: -100 }, dmT)).status, 200);
  assert.equal((await c.view(p)).merchants[0].affinity.value, 0);
  assert.equal((await c.call('dm/affsettings', { reset: true }, dmT)).status, 200);
  dv = await c.view(dmT);
  assert.equal(dv.settings.affinity.start, 20);
  assert.equal((await c.call('dm/affsettings', { enabled: false }, dmT)).status, 200);
  assert.equal((await c.view(p)).merchants[0].affinity, null);
});

test('DM password: change, old PIN dies, other DM sessions die, no plaintext in views', T, async () => {
  const a = await c.reset();
  const b = await c.dm();
  const ali = await c.join('Ali');
  assert.equal((await c.call('dm/password', { current: '9999', next: 'ejderha42' }, ali)).status, 403);
  assert.deepEqual((await c.call('dm/password', { current: 'yanlis', next: 'ejderha42' }, a)).body, { error: 'Mevcut şifre yanlış' });
  assert.deepEqual((await c.call('dm/password', { current: '9999', next: 'kısa' }, a)).body, { error: 'Yeni şifre 6–64 karakter olmalı' });
  assert.equal((await c.call('dm/password', { current: '9999', next: 'x'.repeat(65) }, a)).status, 400);
  assert.equal((await c.call('dm/password', { current: '9999', next: 'ejderha42' }, a)).status, 200);
  assert.equal((await c.call('dm/newday', {}, a)).status, 200);
  assert.equal((await c.call('dm/newday', {}, b)).status, 401);
  assert.deepEqual((await c.call('dm/login', { pin: '9999' })).body, { error: 'Yanlış PIN' });
  const d = await c.call('dm/login', { pin: 'ejderha42' });
  assert.equal(d.status, 200); assert.equal(d.body.role, 'dm');
  assert.equal((await c.call('dm/password', { current: 'ejderha42', next: 'yeni şifre 7' }, d.body.token)).status, 200);
  const e = await c.call('dm/login', { pin: 'yeni şifre 7' });
  assert.equal(e.status, 200);
  const s = await c.sse(e.body.token);
  const text = JSON.stringify(await s.next());
  s.close();
  assert.equal(text.includes('dmPass'), false); assert.equal(text.includes('"hash"'), false); assert.equal(text.includes('salt'), false);
  await c.call('dm/reset', {}, e.body.token); // put the default PIN back for later tests / reruns
  assert.equal((await c.call('dm/login', { pin: '9999' })).status, 200);
});

test('DM login: wrong PIN, lockout after 5 failures, unlock after the lock time', T, async () => {
  await c.reset();
  for (let i = 0; i < 5; i++) assert.deepEqual((await c.call('dm/login', { pin: 'x' + i })).body, { error: 'Yanlış PIN' });
  const locked = await c.call('dm/login', { pin: '9999' });
  assert.equal(locked.status, 429);
  assert.deepEqual(locked.body, { error: 'Çok fazla deneme. Bir süre bekle.' });
  await sleep(LOCK_MS + 500);
  assert.equal((await c.call('dm/login', { pin: '9999' })).status, 200);
});

test('newday and weekly clear negotiations and bans', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  const item = itemOf(await c.view(p), 'Çadır');
  await c.dice(dmT, [1]);
  await c.call('offer', { itemId: item.id, y: 1.5, approach: 'persuasion' }, p);
  assert.ok((await c.view(p)).negs[item.id]);
  await c.call('dm/newday', {}, dmT);
  const v = await c.view(p);
  assert.equal(v.day, 2); assert.equal(v.negs[item.id], undefined);
  const dv = await c.view(dmT);
  assert.ok(dv.log.some((l) => l.text === 'Yeni gün: 2'));
});

test('ledger CSV: DM only, BOM, header, quoted rows', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  assert.equal((await c.get('/api/ledger.csv', p)).status, 403);
  assert.deepEqual(await (await c.get('/api/ledger.csv')).json(), { error: 'Yalnızca DM' });
  const item = itemOf(await c.view(p), 'Çadır');
  await c.call('accept', { itemId: item.id }, p);
  const r = await c.get('/api/ledger.csv', dmT);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /defter\.csv/);
  const raw = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // UTF-8 BOM
  const lines = raw.subarray(3).toString('utf8').split('\n');
  assert.equal(lines[0], 'zaman,hafta,gun,tur,oyuncu,satici,esya,tutar,etiket');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^"\d{4}-\d\d-\d\dT[\d:.]+Z","1","1","buy","Ali","Bora","Çadır","-2","2"$/);
});

test('address: DM only, returns an object with a url key', T, async () => {
  const dmT = await c.reset();
  assert.equal((await c.get('/api/address', await c.join('Ali'))).status, 403);
  const r = await c.get('/api/address', dmT);
  assert.equal(r.status, 200);
  assert.ok('url' in (await r.json()));
});

test('media: upload validation, storage, serving, clearing, DM only', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  const dv = await c.view(dmT);
  const item = dv.items[0], merchant = dv.merchants[0];
  const up = (q, body, tok = dmT) => fetch(`${W.base}/api/media?${q}`, { method: 'POST', headers: { 'x-token': tok, 'content-type': 'application/octet-stream' }, body });
  assert.equal((await up(`kind=item&id=${item.id}`, fakePng(64, 64), p)).status, 403);
  assert.deepEqual(await (await up('kind=zzz&id=x', fakePng(64, 64))).json(), { error: 'Tür geçersiz' });
  assert.equal((await up('kind=item&id=yok', fakePng(64, 64))).status, 404);
  assert.deepEqual(await (await up(`kind=item&id=${item.id}`, Buffer.alloc(0))).json(), { error: 'Boş dosya' });
  assert.deepEqual(await (await up(`kind=item&id=${item.id}`, Buffer.from('not an image at all, just text'))).json(), { error: 'Yalnızca PNG veya JPEG kabul edilir.' });
  assert.deepEqual(await (await up(`kind=item&id=${item.id}`, fakePng(16, 16))).json(), { error: 'Görsel 32–2048 px olmalı.' });

  const ok = await up(`kind=item&id=${item.id}`, fakePng(64, 48, 2000));
  assert.equal(ok.status, 200);
  const info = await ok.json();
  assert.deepEqual([info.w, info.h, info.bytes], [64, 48, 2000]);
  assert.match(info.url, new RegExp(`^/media/items/${item.id}\\.png\\?v=[0-9a-z]+$`));
  const served = await fetch(W.base + info.url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal((await served.arrayBuffer()).byteLength, 2000);
  assert.equal((await c.view(p)).merchants[0].items[0].image, info.url);

  const th = await (await up(`kind=item&id=${item.id}&variant=thumb`, fakePng(32, 32, 900))).json();
  assert.match(th.url, new RegExp(`^/media/items/${item.id}\\.t\\.png`));
  const pr = await (await up(`kind=portrait&id=${merchant.id}`, fakePng(100, 100, 3000))).json();
  assert.match(pr.url, new RegExp(`^/media/portraits/${merchant.id}\\.png`));
  assert.equal((await c.view(p)).merchants[0].portrait, pr.url);

  for (const [q, size] of [[`kind=item&id=${item.id}&variant=thumb`, 70 * 1024], [`kind=portrait&id=${merchant.id}`, 500 * 1024], [`kind=item&id=${item.id}`, 800 * 1024]]) {
    try {
      const r = await up(q, fakePng(64, 64, size));
      assert.equal(r.status, 413); assert.deepEqual(await r.json(), { error: 'Dosya çok büyük' });
    } catch (e) { assert.ok(!(e instanceof assert.AssertionError), 'oversize upload must be rejected with 413 or a dropped connection'); }
  }

  assert.equal((await c.call('dm/mediaclear', { kind: 'item', id: item.id }, dmT)).status, 200);
  assert.equal((await c.call('dm/mediaclear', { kind: 'portrait', id: merchant.id }, dmT)).status, 200);
  assert.deepEqual((await c.call('dm/mediaclear', { kind: 'zzz', id: 'x' }, dmT)).body, { error: 'Tür geçersiz' });
  const v = await c.view(p);
  assert.equal(v.merchants[0].items[0].image, null); assert.equal(v.merchants[0].portrait, null);
  assert.equal((await fetch(W.base + info.url)).status, 404);
});

test('media path traversal and unknown files are refused', T, async () => {
  for (const u of ['/media/../data.json', '/media/items/none.png', '/media/items/x.txt']) {
    const r = await fetch(W.base + u);
    assert.ok([400, 403, 404].includes(r.status), `${u} -> ${r.status}`);
  }
});
