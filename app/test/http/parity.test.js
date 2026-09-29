'use strict';
// HTTP parity suite: must pass against the Node server AND against the ESP firmware (BASE=http://192.168.4.1).
// Everything goes over HTTP; the reference engine is only used to compute expected outcomes.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../engine');
const CHARS = require('../../public/chars.json');
const { start, client, fakePng, keys, sleep, LOCK_MS, DM_PIN } = require('./_helpers');

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
  assert.deepEqual((await c.call('join', { name: '', charId: 'bard' })).body, { error: 'Cannot be empty' });
  assert.equal((await c.call('join', { name: 'Ali', charId: 'none' })).status, 400);
  assert.deepEqual((await c.call('join', { name: 'Ali', charId: 'none' })).body, { error: 'Choose a character.' });
  const a = await c.call('join', { name: 'Ali', charId: 'barbarian' });
  assert.equal(a.status, 200);
  assert.equal(a.body.role, 'player');
  assert.match(a.body.token, /^[0-9a-f]{16,}$/);
  const again = await c.call('join', { name: 'ALI', charId: 'bard' }); // same player, case-insensitive
  assert.equal(again.body.token, a.body.token);
  const v = await c.view(a.body.token);
  assert.equal(v.me.name, 'Ali');
  assert.equal(v.me.charId, 'barbarian');
  assert.equal(v.me.gold, 100);
});

test('auth: 401 / 403 / 404 messages', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  assert.deepEqual((await c.call('offer', {})).body, { error: 'Login required' });
  assert.equal((await c.call('offer', {}, 'nope')).status, 401);
  assert.deepEqual((await c.call('dm/newday', {}, p)).body, { error: 'DM only' });
  assert.equal((await c.call('dm/newday', {}, p)).status, 403);
  assert.deepEqual((await c.call('offer', {}, dmT)).body, { error: 'Player only' });
  assert.equal((await c.call('offer', {}, dmT)).status, 403);
  assert.deepEqual((await c.call('nonexistent', {}, p)).body, { error: 'Not found' });
  assert.equal((await c.call('nonexistent', {}, p)).status, 404);
  assert.equal((await c.call('dm/nonexistent', {}, dmT)).status, 404);
  const g = await fetch(`${W.base}/api/join`);
  assert.equal(g.status, 404);
});

test('request body: invalid JSON -> 400, oversize -> 413 (or reset)', T, async () => {
  const r = await fetch(`${W.base}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'Invalid JSON' });
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
  const p = await c.join('Ali', 'bard');
  const pv = await c.view(p);
  assert.deepEqual(keys(pv), ['bids', 'day', 'dmOnline', 'ledger', 'me', 'merchants', 'negs', 'role', 'week']);
  assert.deepEqual(keys(pv.me), ['advantage', 'charId', 'gold', 'id', 'inventory', 'name']);
  assert.equal(pv.role, 'player');
  assert.equal(pv.day, 1); assert.equal(pv.week, 1);
  assert.equal(pv.merchants.length, 3);
  assert.deepEqual(keys(pv.merchants[0]), ['affinity', 'banned', 'emoji', 'id', 'insightTried', 'items', 'name', 'portrait', 'revealed']);
  assert.deepEqual(keys(pv.merchants[0].affinity), ['from', 'level', 'name', 'next', 'nextName', 'value']);
  assert.deepEqual(pv.merchants[0].affinity, { value: 20, level: 1, name: 'Acquaintance', from: 20, next: 40, nextName: 'Customer' });
  assert.deepEqual(keys(pv.merchants[0].items[0]), ['desc', 'id', 'image', 'magical', 'minAffinity', 'name', 'price', 'rarity', 'stock', 'thumb', 'type']);
  assert.deepEqual(pv.merchants.map((m) => m.name), ['Bora', 'Marla', 'Grom']);
  assert.deepEqual(pv.merchants.map((m) => m.items.length), [3, 3, 3]);
  assert.equal(itemOf(pv, 'Potion of Flying').stock, 2);
  assert.equal(itemOf(pv, 'Potion of Healing').stock, null);
  assert.equal(pv.dmOnline, false);
  assert.equal(JSON.stringify(pv).includes('token'), false);

  const dv = await c.view(dmT);
  assert.deepEqual(keys(dv), ['affinity', 'bids', 'chars', 'day', 'items', 'ledger', 'log', 'merchants', 'negs', 'players', 'role', 'settings', 'week']);
  assert.equal(dv.role, 'dm');
  assert.deepEqual(dv.chars, CHARS.map((x) => x.id));
  assert.deepEqual(keys(dv.settings), ['affinity', 'defaults', 'levelNames']);
  assert.deepEqual(keys(dv.settings.affinity), ['bonusRepFrom', 'dcMod', 'enabled', 'gain', 'start', 'thresholds', 'weeklyCap']);
  assert.deepEqual(dv.settings.levelNames, ['Stranger', 'Acquaintance', 'Customer', 'Friend', 'Confidant']);
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
  assert.deepEqual(bad.body, { error: 'Login required' });
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
  const p = await c.join('Ali', 'bard');
  await c.dice(dmT, [20]);
  const v0 = await c.view(p);
  const item = itemOf(v0, 'Potion of Healing');
  const ref = E.haggle(E.newNegotiation({ price: 50 }, 'generous'), { X: 50, type: 'generous', Y: 25, approach: 'persuasion', bonus: bonusOf('bard', 'persuasion'), rolls: [20] });
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
  assert.deepEqual(keys(after.me.inventory[0]), ['id', 'image', 'itemId', 'magical', 'name', 'paid', 'thumb']);
  assert.equal(after.me.inventory[0].paid, 25);
  assert.equal(after.negs[item.id], undefined);
  assert.equal(after.ledger.length, 1);
  assert.equal(after.ledger[0].kind, 'buy'); assert.equal(after.ledger[0].amount, -25); assert.equal(after.ledger[0].list, 50);
  assert.equal(merchantOf(after, 'Bora').affinity.value, 23); // +2 for the purchase
});

test('offer: failures and anger match the reference engine, then the merchant refuses for the day', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const v0 = await c.view(p);
  const item = itemOf(v0, 'Dragon Scale'); // Grom, greedy, 120 gp
  const neg = E.newNegotiation({ price: 120 }, 'greedy');
  const bonus = bonusOf('bard', 'persuasion');
  await c.dice(dmT, [1]);
  const e1 = E.haggle(neg, { X: 120, type: 'greedy', Y: 60, approach: 'persuasion', bonus, rolls: [1] });
  assert.equal(e1.outcome, 'fail');
  assert.equal((await c.call('offer', { itemId: item.id, y: 60, approach: 'persuasion' }, p)).status, 200);
  let n = (await c.view(p)).negs[item.id];
  assert.equal(n.status, 'open'); assert.equal(n.price, e1.price); assert.equal(n.rep, neg.rep); assert.equal(n.outcome, undefined);
  assert.equal(n.history[0].outcome, 'fail');

  const e2 = E.haggle(neg, { X: 120, type: 'greedy', Y: 50, approach: 'persuasion', bonus, rolls: [1] });
  assert.equal(e2.outcome, 'angered');
  assert.equal((await c.call('offer', { itemId: item.id, y: 50, approach: 'persuasion' }, p)).status, 200);
  const v = await c.view(p);
  n = v.negs[item.id];
  assert.equal(n.status, 'angered'); assert.equal(n.price, e2.price); assert.equal(n.mood, '😡');
  assert.equal(merchantOf(v, 'Grom').banned, true);
  assert.equal(merchantOf(v, 'Grom').affinity.value, 15); // -5 for the anger
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 40, approach: 'persuasion' }, p)).body, { error: 'The merchant is not haggling today.' });
  await c.call('dm/newday', {}, dmT);
  const v2 = await c.view(p);
  assert.equal(merchantOf(v2, 'Grom').banned, false);
  assert.equal(v2.negs[item.id], undefined);
});

test('offer: input validation messages', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const item = itemOf(await c.view(p), 'Potion of Healing');
  assert.deepEqual((await c.call('offer', { itemId: 'zzz', y: 5, approach: 'persuasion' }, p)).body, { error: 'No such item' });
  assert.equal((await c.call('offer', { itemId: 'zzz', y: 5, approach: 'persuasion' }, p)).status, 404);
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 5, approach: 'flirt' }, p)).body, { error: 'Choose an approach.' });
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 50, approach: 'persuasion' }, p)).body, { error: 'Offer must be below the list price.' });
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 'abc', approach: 'persuasion' }, p)).body, { error: 'Invalid number' });
  await c.dice(dmT, [20]);
  assert.equal((await c.call('offer', { itemId: item.id, y: 20, approach: 'persuasion' }, p)).status, 200); // deal made
  assert.deepEqual((await c.call('offer', { itemId: item.id, y: 19, approach: 'persuasion' }, p)).body, { error: 'This negotiation is over.' });
  const poor = await c.join('Poor', 'rogue'); // 60 gp
  const sword = itemOf(await c.view(poor), '+1 Shield'); // 400 gp
  assert.deepEqual((await c.call('accept', { itemId: sword.id }, poor)).body, { error: 'Not enough gold.' });
});

test('advantage: two dice are rolled and the higher counts, then advantage is spent', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const pl = (await c.view(dmT)).players[0];
  assert.equal((await c.call('dm/player', { id: pl.id, advantage: true }, dmT)).status, 200);
  assert.equal((await c.view(p)).me.advantage, true);
  await c.dice(dmT, [3, 17]);
  const item = itemOf(await c.view(p), 'Longsword'); // Marla neutral dc15, 15 gp
  const ref = E.haggle(E.newNegotiation({ price: 15 }, 'neutral'), { X: 15, type: 'neutral', Y: 10, approach: 'persuasion', bonus: 6, rolls: [3, 17] });
  await c.call('offer', { itemId: item.id, y: 10, approach: 'persuasion' }, p);
  const v = await c.view(p);
  assert.deepEqual(v.negs[item.id].history[0].rolls, [3, 17]);
  assert.equal(v.negs[item.id].history[0].roll, 17);
  assert.equal(v.negs[item.id].history[0].outcome, ref.outcome);
  assert.equal(v.me.advantage, false);
});

test('hard gamble is gone: the action no longer exists and items carry no damaged flag', T, async () => {
  await c.reset();
  const p = await c.join('Ali', 'bard');
  const v0 = await c.view(p);
  const sword = itemOf(v0, 'Longsword');
  assert.deepEqual((await c.call('gamble', { itemId: sword.id }, p)).body, { error: 'Not found' });
  assert.equal((await c.view(p)).me.inventory.length, 0);
  assert.equal(JSON.stringify(v0).includes('damaged'), false);
});

test('stock: last unit sells once, then "Sold out."', T, async () => {
  const dmT = await c.reset();
  const rich = await c.join('Rich', 'wizard'); // 200 gp
  const rich2 = await c.join('Rich2', 'wizard');
  const v = await c.view(rich);
  const fly = itemOf(v, 'Potion of Flying'); // 250, stock 2, magical
  await c.call('dm/player', { id: v.me.id, gold: 900 }, dmT);
  assert.equal((await c.call('accept', { itemId: fly.id }, rich)).status, 200);
  assert.equal(itemOf(await c.view(rich), 'Potion of Flying').stock, 1);
  await c.call('dm/player', { id: (await c.view(rich2)).me.id, gold: 900 }, dmT);
  assert.equal((await c.call('accept', { itemId: fly.id }, rich2)).status, 200);
  assert.deepEqual((await c.call('accept', { itemId: fly.id }, rich2)).body, { error: 'Sold out.' });
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
  assert.deepEqual((await c.call('insight', { merchantId: grom.id }, p)).body, { error: 'You already tried today.' });
  await c.call('dm/newday', {}, dmT);
  await c.dice(dmT, [15]);
  assert.equal((await c.call('insight', { merchantId: grom.id }, p)).status, 200);
  v = await c.view(p);
  assert.equal(merchantOf(v, 'Grom').revealed, 'Greedy');
  assert.equal((await c.call('insight', { merchantId: grom.id }, p)).status, 200); // no-op once revealed
});

test('bids: player bid -> DM counter -> player accept -> weekly delivery', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const v0 = await c.view(p);
  const item = itemOf(v0, 'Chain Mail'); // 75 gp at Marla
  const marla = merchantOf(v0, 'Marla');
  assert.deepEqual((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 75 }, p)).body, { error: 'Offer below the list price.' });
  assert.deepEqual((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 10 }, p)).body, { error: 'Must be at least 25% of the list price.' });
  assert.equal((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 50, note: 'cash' }, p)).status, 200);
  let dv = await c.view(dmT);
  assert.equal(dv.bids.length, 1);
  const bid = dv.bids[0];
  assert.equal(bid.status, 'new'); assert.equal(bid.price, 50); assert.equal(bid.listPrice, 75); assert.equal(bid.itemName, 'Chain Mail'); assert.equal(bid.note, 'cash');
  assert.deepEqual(bid.history.map((h) => h.act), ['offer']);

  assert.equal((await c.call('dm/bidreply', { id: bid.id, action: 'counter', price: 60, note: 'son' }, dmT)).status, 200);
  assert.deepEqual((await c.call('dm/bidreply', { id: bid.id, action: 'zzz' }, dmT)).body, { error: 'Unknown action' });
  let pv = await c.view(p);
  assert.equal(pv.bids[0].status, 'counter'); assert.equal(pv.bids[0].price, 60); assert.equal(pv.bids[0].by, 'dm');
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'accept' }, p)).status, 200);
  assert.equal((await c.view(dmT)).bids[0].status, 'accepted');

  assert.equal((await c.call('dm/weekly', {}, dmT)).status, 200);
  pv = await c.view(p);
  assert.equal(pv.week, 2); assert.equal(pv.day, 2);
  assert.equal(pv.me.gold, 20); // 80 - 60
  assert.equal(pv.me.inventory[0].name, 'Chain Mail'); assert.equal(pv.me.inventory[0].paid, 60);
  assert.equal(pv.bids[0].status, 'settled');
  assert.equal(pv.ledger[0].kind, 'offer');
  assert.equal(merchantOf(pv, 'Marla').affinity.value, 25); // +5 for the delivery
});

test('bids: DM-initiated offer, player can withdraw or counter; ownership enforced', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const q = await c.join('Veli', 'barbarian');
  const pv = await c.view(p);
  const item = itemOf(pv, 'Tent');
  const pid = pv.me.id;
  assert.equal((await c.call('dm/bidsend', { playerId: pid, itemId: item.id, price: 1.5 }, dmT)).status, 200);
  const bid = (await c.view(p)).bids[0];
  assert.equal(bid.from, 'dm'); assert.equal(bid.status, 'counter');
  assert.deepEqual((await c.call('bidreply', { id: bid.id, action: 'accept' }, q)).body, { error: 'This is not your offer' });
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'accept' }, q)).status, 403);
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'counter', price: 1.25 }, p)).status, 200);
  assert.equal((await c.view(dmT)).bids[0].status, 'new');
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'withdraw' }, p)).status, 200);
  assert.equal((await c.view(p)).bids[0].status, 'withdrawn');
  assert.deepEqual((await c.call('bidreply', { id: bid.id, action: 'withdraw' }, p)).body, { error: 'This offer is closed.' });
});

test('DM: merchants and items CRUD, variants, validation', T, async () => {
  const dmT = await c.reset();
  assert.deepEqual((await c.call('dm/merchant', { name: 'New', type: 'zzz' }, dmT)).body, { error: 'Choose a type.' });
  assert.deepEqual((await c.call('dm/merchant', { name: '', type: 'neutral' }, dmT)).body, { error: 'Cannot be empty' });
  assert.equal((await c.call('dm/merchant', { name: 'Kara', emoji: '🦊', type: 'neutral' }, dmT)).status, 200);
  let dv = await c.view(dmT);
  assert.equal(dv.merchants.length, 4);
  const kara = dv.merchants[3];
  assert.equal(kara.name, 'Kara'); assert.equal(kara.emoji, '🦊'); assert.equal(kara.type, 'neutral');
  const added = await c.call('dm/item', { merchantId: kara.id, name: 'Sword', price: 10.5, magical: false, stock: 3, desc: 'sharp', type: 'weapon', rarity: 'rare', minAffinity: 30 }, dmT);
  assert.equal(added.status, 200); assert.match(added.body.id, /^[0-9a-f]{10}$/);
  assert.deepEqual((await c.call('dm/item', { merchantId: kara.id, name: 'X', price: 1, type: 'mystery' }, dmT)).body, { error: 'Type is invalid' });
  assert.deepEqual((await c.call('dm/item', { merchantId: kara.id, name: 'X', price: 1, rarity: 'mystery' }, dmT)).body, { error: 'Rarity is invalid' });
  assert.deepEqual((await c.call('dm/item', { merchantId: kara.id, name: 'X', price: 0 }, dmT)).body, { error: 'Invalid number' });
  assert.equal((await c.call('dm/item', { merchantId: 'yok', name: 'X', price: 1 }, dmT)).status, 404);
  dv = await c.view(dmT);
  const it = dv.items.find((i) => i.id === added.body.id);
  assert.deepEqual({ ...it, id: undefined }, { id: undefined, merchantId: kara.id, name: 'Sword', price: 10.5, magical: false, stock: 3, minAffinity: 30, desc: 'sharp', type: 'weapon', rarity: 'rare' });

  const variant = await c.call('dm/itemvariant', { id: it.id, name: 'Sword +1' }, dmT);
  assert.equal(variant.status, 200);
  dv = await c.view(dmT);
  const copy = dv.items.find((i) => i.id === variant.body.id);
  assert.equal(copy.name, 'Sword +1'); assert.equal(copy.price, 10.5); assert.equal(copy.merchantId, kara.id);

  // locked item shows only a teaser to players whose affinity is below the requirement
  const p = await c.join('Ali');
  const locked = (await c.view(p)).merchants[3].items.find((i) => i.id === it.id);
  assert.deepEqual(locked, { id: it.id, locked: true, need: 30, needName: 'Acquaintance' });
  assert.deepEqual((await c.call('accept', { itemId: it.id }, p)).body, { error: 'Not enough affinity for this item.' });

  assert.equal((await c.call('dm/delete', { kind: 'item', id: copy.id }, dmT)).status, 200);
  assert.deepEqual((await c.call('dm/delete', { kind: 'zzz', id: 'x' }, dmT)).body, { error: 'Unknown kind' });
  assert.equal((await c.call('dm/delete', { kind: 'merchant', id: kara.id }, dmT)).status, 200);
  dv = await c.view(dmT);
  assert.equal(dv.merchants.length, 3); assert.equal(dv.items.length, 9);
});

test('DM: player gold/advantage, ledger entry, delete player, line and setprice', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const pl = (await c.view(dmT)).players[0];
  assert.equal((await c.call('dm/player', { id: pl.id, gold: 120.5 }, dmT)).status, 200);
  let pv = await c.view(p);
  assert.equal(pv.me.gold, 120.5);
  assert.equal(pv.ledger[0].kind, 'dm'); assert.equal(pv.ledger[0].amount, 40.5); assert.equal(pv.ledger[0].name, 'DM gold adjustment');
  assert.equal((await c.call('dm/player', { id: 'yok', gold: 1 }, dmT)).status, 404);
  assert.deepEqual((await c.call('dm/player', { id: pl.id, gold: -5 }, dmT)).body, { error: 'Invalid number' });

  const item = itemOf(pv, 'Tent');
  assert.deepEqual((await c.call('dm/line', { playerId: pl.id, itemId: item.id, text: 'Hello' }, dmT)).body, { error: 'No active negotiation' });
  assert.deepEqual((await c.call('dm/setprice', { playerId: pl.id, itemId: item.id, price: 1 }, dmT)).body, { error: 'No active negotiation' });
  await c.dice(dmT, [1]);
  await c.call('offer', { itemId: item.id, y: 1.5, approach: 'persuasion' }, p); // Tent 2 gp
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
  assert.deepEqual((await c.call('dm/affsettings', { start: 500 }, dmT)).body, { error: 'Start: must be between 0 and 100' });
  assert.deepEqual((await c.call('dm/affsettings', { thresholds: [10, 20] }, dmT)).body, { error: 'Level thresholds: must have 4 values' });
  assert.deepEqual((await c.call('dm/affsettings', { thresholds: [10, 10, 30, 40] }, dmT)).body, { error: 'Level thresholds must be increasing' });
  assert.equal((await c.call('dm/affsettings', { start: 30, weeklyCap: 4, gain: { buy: 3 } }, dmT)).status, 200);
  let dv = await c.view(dmT);
  assert.equal(dv.settings.affinity.start, 30); assert.equal(dv.settings.affinity.weeklyCap, 4); assert.equal(dv.settings.affinity.gain.buy, 3); assert.equal(dv.settings.affinity.gain.offer, 5);
  assert.equal((await c.view(p)).merchants[0].affinity.value, 30);
  assert.equal((await c.call('dm/affinity', { playerId: pid, merchantId: mid, value: 85 }, dmT)).status, 200);
  const a = (await c.view(p)).merchants[0].affinity;
  assert.deepEqual(a, { value: 85, level: 4, name: 'Confidant', from: 80, next: null, nextName: null });
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
  assert.equal((await c.call('dm/password', { current: DM_PIN, next: 'ejderha42' }, ali)).status, 403);
  assert.deepEqual((await c.call('dm/password', { current: 'wrong', next: 'ejderha42' }, a)).body, { error: 'Current password is wrong' });
  assert.deepEqual((await c.call('dm/password', { current: DM_PIN, next: 'short' }, a)).body, { error: 'New password must be 6–64 characters' });
  assert.equal((await c.call('dm/password', { current: DM_PIN, next: 'x'.repeat(65) }, a)).status, 400);
  assert.equal((await c.call('dm/password', { current: DM_PIN, next: 'ejderha42' }, a)).status, 200);
  assert.equal((await c.call('dm/newday', {}, a)).status, 200);
  assert.equal((await c.call('dm/newday', {}, b)).status, 401);
  assert.deepEqual((await c.call('dm/login', { pin: DM_PIN })).body, { error: 'Wrong PIN' });
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
  assert.equal((await c.call('dm/login', { pin: DM_PIN })).status, 200);
});

test('DM login: wrong PIN, lockout after 5 failures, unlock after the lock time', T, async () => {
  await c.reset();
  for (let i = 0; i < 5; i++) assert.deepEqual((await c.call('dm/login', { pin: 'x' + i })).body, { error: 'Wrong PIN' });
  const locked = await c.call('dm/login', { pin: DM_PIN });
  assert.equal(locked.status, 429);
  assert.deepEqual(locked.body, { error: 'Too many attempts. Wait a while.' });
  await sleep(LOCK_MS + 500);
  assert.equal((await c.call('dm/login', { pin: DM_PIN })).status, 200);
});

test('newday and weekly clear negotiations and bans', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  const item = itemOf(await c.view(p), 'Tent');
  await c.dice(dmT, [1]);
  await c.call('offer', { itemId: item.id, y: 1.5, approach: 'persuasion' }, p);
  assert.ok((await c.view(p)).negs[item.id]);
  await c.call('dm/newday', {}, dmT);
  const v = await c.view(p);
  assert.equal(v.day, 2); assert.equal(v.negs[item.id], undefined);
  const dv = await c.view(dmT);
  assert.ok(dv.log.some((l) => l.text === 'New day: 2'));
});

test('ledger CSV: DM only, BOM, header, quoted rows', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  assert.equal((await c.get('/api/ledger.csv', p)).status, 403);
  assert.deepEqual(await (await c.get('/api/ledger.csv')).json(), { error: 'DM only' });
  const item = itemOf(await c.view(p), 'Tent');
  await c.call('accept', { itemId: item.id }, p);
  const r = await c.get('/api/ledger.csv', dmT);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /ledger\.csv/);
  const raw = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // UTF-8 BOM
  const lines = raw.subarray(3).toString('utf8').split('\n');
  assert.equal(lines[0], 'time,week,day,kind,player,merchant,item,amount,list');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^"\d{4}-\d\d-\d\dT[\d:.]+Z","1","1","buy","Ali","Bora","Tent","-2","2"$/);
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
  assert.deepEqual(await (await up('kind=zzz&id=x', fakePng(64, 64))).json(), { error: 'Invalid kind' });
  assert.equal((await up('kind=item&id=yok', fakePng(64, 64))).status, 404);
  assert.deepEqual(await (await up(`kind=item&id=${item.id}`, Buffer.alloc(0))).json(), { error: 'Empty file' });
  assert.deepEqual(await (await up(`kind=item&id=${item.id}`, Buffer.from('not an image at all, just text'))).json(), { error: 'Only PNG or JPEG is accepted.' });
  assert.deepEqual(await (await up(`kind=item&id=${item.id}`, fakePng(16, 16))).json(), { error: 'Image must be 32–2048 px.' });

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
      assert.equal(r.status, 413); assert.deepEqual(await r.json(), { error: 'File too large' });
    } catch (e) { assert.ok(!(e instanceof assert.AssertionError), 'oversize upload must be rejected with 413 or a dropped connection'); }
  }

  assert.equal((await c.call('dm/mediaclear', { kind: 'item', id: item.id }, dmT)).status, 200);
  assert.equal((await c.call('dm/mediaclear', { kind: 'portrait', id: merchant.id }, dmT)).status, 200);
  assert.deepEqual((await c.call('dm/mediaclear', { kind: 'zzz', id: 'x' }, dmT)).body, { error: 'Invalid kind' });
  const v = await c.view(p);
  assert.equal(v.merchants[0].items[0].image, null); assert.equal(v.merchants[0].portrait, null);
  assert.equal((await fetch(W.base + info.url)).status, 404);
});

test('media path traversal and unknown files are refused', T, async () => {
  for (const u of ['/media/../data.json', '/media/items/none.png', '/media/items/x.txt']) {
    const r = await fetch(W.base + u);
    const text = await r.text();
    // The ESP answers unknown pages with the app itself (captive portal), so 200 is fine as long as it is the app page and nothing private leaks.
    const ok = [400, 403, 404].includes(r.status) || (r.status === 200 && text.includes('<title>Pazar</title>'));
    assert.ok(ok, `${u} -> ${r.status}`);
    assert.ok(!text.includes('"players"') && !text.includes('dmPass'), `${u} leaked state`);
  }
});
