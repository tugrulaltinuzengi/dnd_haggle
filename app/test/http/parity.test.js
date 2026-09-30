'use strict';
// HTTP parity suite: must pass against the Node server AND against the ESP firmware (BASE=http://192.168.4.1).
// Everything goes over HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const CHARS = require('../../public/chars.json');
const { start, client, fakePng, keys, sleep, LOCK_MS, DM_PIN } = require('./_helpers');

let W, c;
test.before(async () => { W = await start(); c = client(W.base); });
test.after(async () => { await W.stop(); });

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
  assert.deepEqual((await c.call('bid', {})).body, { error: 'Login required' });
  assert.equal((await c.call('bid', {}, 'nope')).status, 401);
  assert.deepEqual((await c.call('dm/newday', {}, p)).body, { error: 'DM only' });
  assert.equal((await c.call('dm/newday', {}, p)).status, 403);
  assert.deepEqual((await c.call('bid', {}, dmT)).body, { error: 'Player only' });
  assert.equal((await c.call('bid', {}, dmT)).status, 403);
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
  assert.deepEqual(keys(pv), ['bids', 'day', 'dmOnline', 'ledger', 'me', 'merchants', 'role', 'week']);
  assert.deepEqual(keys(pv.me), ['charId', 'gold', 'id', 'inventory', 'name']);
  assert.equal(pv.role, 'player');
  assert.equal(pv.day, 1); assert.equal(pv.week, 1);
  assert.equal(pv.merchants.length, 3);
  assert.deepEqual(keys(pv.merchants[0]), ['closed', 'emoji', 'id', 'items', 'name', 'portrait']);
  assert.equal(pv.merchants[0].closed, false);
  assert.deepEqual(keys(pv.merchants[0].items[0]), ['desc', 'id', 'image', 'magical', 'name', 'price', 'rarity', 'stock', 'thumb', 'type']);
  assert.deepEqual(pv.merchants.map((m) => m.name), ['Bora', 'Marla', 'Grom']);
  assert.deepEqual(pv.merchants.map((m) => m.items.length), [3, 3, 3]);
  assert.equal(itemOf(pv, 'Potion of Flying').stock, 2);
  assert.equal(itemOf(pv, 'Potion of Healing').stock, null);
  assert.equal(pv.dmOnline, false);
  assert.equal(JSON.stringify(pv).includes('token'), false);

  const dv = await c.view(dmT);
  assert.deepEqual(keys(dv), ['bids', 'chars', 'closed', 'day', 'items', 'ledger', 'log', 'merchants', 'players', 'role', 'week']);
  assert.equal(dv.role, 'dm');
  assert.deepEqual(dv.chars, CHARS.map((x) => x.id));
  assert.equal(dv.players.length, 1);
  assert.deepEqual(keys(dv.players[0]), ['charId', 'gold', 'id', 'inventory', 'name']);
  assert.deepEqual(dv.closed, []);
  assert.deepEqual(keys(dv.merchants[0]), ['emoji', 'id', 'name']);
  assert.deepEqual(keys(dv.items[0]), ['hidden', 'id', 'magical', 'merchantId', 'name', 'price', 'stock']);
  assert.equal(dv.items.length, 9);
  assert.equal(JSON.stringify(dv).includes('dmPass'), false);
  assert.equal(JSON.stringify(dv).includes('token'), false);
});

test('SSE: bad token 401, dmOnline flips, a second event follows an action', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali');
  // Over the Cloudflare relay a closed stream lingers for up to ~40 s (streams are renewed every 30 s and the DM gets a short grace); wait for a DM stream left by the previous test to clear.
  for (let i = 0; i < 40 && (await c.view(p)).dmOnline; i++) await new Promise((r) => setTimeout(r, 1000));
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

test('no dice: the old haggle actions are gone and items carry no damaged flag', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const v0 = await c.view(p);
  const sword = itemOf(v0, 'Longsword');
  for (const a of ['offer', 'insight', 'gamble']) assert.deepEqual((await c.call(a, { itemId: sword.id }, p)).body, { error: 'Not found' });
  for (const a of ['dm/line', 'dm/setprice', 'dm/dice', 'dm/affinity', 'dm/affsettings']) assert.equal((await c.call(a, {}, dmT)).status, 404);
  assert.equal((await c.view(p)).me.inventory.length, 0);
  assert.equal(JSON.stringify(v0).includes('damaged'), false);
});

test('buy at the list price: gold, inventory, ledger; not enough gold', T, async () => {
  await c.reset();
  const p = await c.join('Ali', 'bard'); // 80 gp
  const item = itemOf(await c.view(p), 'Potion of Healing'); // 50 gp
  assert.deepEqual((await c.call('accept', { itemId: item.id }, p)).body, { ok: true });
  const after = await c.view(p);
  assert.equal(after.me.gold, 30);
  assert.equal(after.me.inventory.length, 1);
  assert.deepEqual(keys(after.me.inventory[0]), ['id', 'image', 'itemId', 'magical', 'name', 'paid', 'thumb']);
  assert.equal(after.me.inventory[0].paid, 50);
  assert.equal(after.ledger.length, 1);
  assert.equal(after.ledger[0].kind, 'buy'); assert.equal(after.ledger[0].amount, -50); assert.equal(after.ledger[0].list, 50);
  assert.deepEqual((await c.call('accept', { itemId: item.id }, p)).body, { error: 'Not enough gold.' });
  assert.deepEqual((await c.call('accept', { itemId: 'zzz' }, p)).body, { error: 'No such item' });
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

test('offers: player bid -> DM counter -> player accept settles at once', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const v0 = await c.view(p);
  const item = itemOf(v0, 'Chain Mail'); // 75 gp at Marla
  const marla = merchantOf(v0, 'Marla');
  assert.deepEqual((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 75 }, p)).body, { error: 'Offer must be below the list price.' });
  assert.deepEqual((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 'abc' }, p)).body, { error: 'Invalid number' });
  assert.equal((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 10 }, p)).status, 200); // any price below the list is allowed
  assert.equal((await c.call('bid', { merchantId: marla.id, itemId: item.id, price: 50, note: 'cash' }, p)).status, 200);
  let dv = await c.view(dmT);
  assert.equal(dv.bids.length, 2);
  const bid = dv.bids[1];
  assert.equal(bid.status, 'new'); assert.equal(bid.price, 50); assert.equal(bid.listPrice, 75); assert.equal(bid.itemName, 'Chain Mail'); assert.equal(bid.note, 'cash');
  assert.deepEqual(bid.history.map((h) => h.act), ['offer']);

  assert.equal((await c.call('dm/bidreply', { id: bid.id, action: 'counter', price: 60, note: 'final' }, dmT)).status, 200);
  assert.deepEqual((await c.call('dm/bidreply', { id: bid.id, action: 'zzz' }, dmT)).body, { error: 'Unknown action' });
  assert.deepEqual((await c.call('dm/bidreply', { id: bid.id, action: 'accept' }, dmT)).body, { error: 'Waiting for the player to answer.' });
  let pv = await c.view(p);
  const mine = pv.bids.find((b) => b.id === bid.id);
  assert.equal(mine.status, 'counter'); assert.equal(mine.price, 60); assert.equal(mine.by, 'dm'); assert.equal(mine.dmNote, 'final');
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'accept' }, p)).status, 200);

  pv = await c.view(p);
  assert.equal(pv.week, 1); assert.equal(pv.day, 1);
  assert.equal(pv.me.gold, 20); // 80 - 60, no waiting for the weekly market
  assert.equal(pv.me.inventory[0].name, 'Chain Mail'); assert.equal(pv.me.inventory[0].paid, 60);
  assert.equal(pv.bids.find((b) => b.id === bid.id).status, 'settled');
  assert.deepEqual(pv.bids.find((b) => b.id === bid.id).history.map((h) => h.act), ['offer', 'counter', 'accept']);
  assert.equal(pv.ledger[0].kind, 'offer'); assert.equal(pv.ledger[0].amount, -60); assert.equal(pv.ledger[0].list, 75);
  assert.deepEqual((await c.call('bidreply', { id: bid.id, action: 'withdraw' }, p)).body, { error: 'This offer is closed.' });
});

test('offers: the DM accepts at once; not enough gold keeps the offer open; reject closes it', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'rogue'); // 60 gp
  const v0 = await c.view(p);
  const shield = itemOf(v0, '+1 Shield'); // 400 gp, stock 1
  const grom = merchantOf(v0, 'Grom');
  await c.call('bid', { merchantId: grom.id, itemId: shield.id, price: 300 }, p);
  const bid = (await c.view(dmT)).bids[0];
  assert.deepEqual((await c.call('dm/bidreply', { id: bid.id, action: 'accept' }, dmT)).body, { error: 'Not enough gold.' });
  assert.equal((await c.view(dmT)).bids[0].status, 'new');
  await c.call('dm/player', { id: v0.me.id, gold: 350 }, dmT);
  assert.deepEqual((await c.call('dm/bidreply', { id: bid.id, action: 'accept' }, dmT)).body, { ok: true });
  const pv = await c.view(p);
  assert.equal(pv.me.gold, 50);
  assert.equal(itemOf(pv, '+1 Shield').stock, 0);
  assert.equal(pv.bids[0].status, 'settled');
  const q = await c.join('Veli', 'wizard');
  await c.call('bid', { merchantId: grom.id, itemId: shield.id, price: 100 }, q);
  const b2 = (await c.view(dmT)).bids[1];
  assert.deepEqual((await c.call('dm/bidreply', { id: b2.id, action: 'accept' }, dmT)).body, { error: 'Sold out.' });
  assert.equal((await c.call('dm/bidreply', { id: b2.id, action: 'reject', note: 'Gone' }, dmT)).status, 200);
  assert.equal((await c.view(q)).bids[0].status, 'rejected');
});

test('offers: DM-initiated offer, player can withdraw or counter; ownership enforced', T, async () => {
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
  assert.deepEqual((await c.call('bidreply', { id: bid.id, action: 'accept' }, p)).body, { error: 'There is no counter-offer to accept.' });
  assert.equal((await c.call('bidreply', { id: bid.id, action: 'withdraw' }, p)).status, 200);
  assert.equal((await c.view(p)).bids[0].status, 'withdrawn');
  assert.deepEqual((await c.call('bidreply', { id: bid.id, action: 'withdraw' }, p)).body, { error: 'This offer is closed.' });
});

test('offers: a custom request for an item not in the catalog is delivered by name', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const bora = merchantOf(await c.view(p), 'Bora');
  assert.deepEqual((await c.call('bid', { merchantId: bora.id, itemName: '  ', price: 5 }, p)).body, { error: 'Cannot be empty' });
  assert.equal((await c.call('bid', { merchantId: bora.id, itemName: 'Dragon Egg', price: 70 }, p)).status, 200);
  const bid = (await c.view(dmT)).bids[0];
  assert.equal(bid.listPrice, null);
  assert.equal((await c.call('dm/bidreply', { id: bid.id, action: 'accept' }, dmT)).status, 200);
  const pv = await c.view(p);
  assert.equal(pv.me.gold, 10);
  assert.deepEqual([pv.me.inventory[0].name, pv.me.inventory[0].itemId, pv.me.inventory[0].paid], ['Dragon Egg', null, 70]);
});

test('hidden items: invisible to players, cannot be bought or bid on, the DM still sees them', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const bora = merchantOf(await c.view(dmT), 'Bora');
  const r = await c.call('dm/item', { merchantId: bora.id, name: 'Secret Map', price: 30, hidden: true }, dmT);
  assert.equal(r.status, 200);
  assert.equal(JSON.stringify(await c.view(p)).includes('Secret Map'), false);
  assert.deepEqual((await c.call('accept', { itemId: r.body.id }, p)).body, { error: 'No such item' });
  assert.deepEqual((await c.call('bid', { merchantId: bora.id, itemId: r.body.id, price: 5 }, p)).body, { error: 'No such item' });
  assert.equal((await c.view(dmT)).items.find((i) => i.id === r.body.id).hidden, true);
  await c.call('dm/item', { id: r.body.id, merchantId: bora.id, name: 'Secret Map', price: 30, hidden: false }, dmT);
  assert.equal(itemOf(await c.view(p), 'Secret Map').price, 30);
});

test('close: the DM closes a merchant to one player for the day; newday reopens', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const q = await c.join('Veli', 'bard');
  const pv = await c.view(p);
  const grom = merchantOf(pv, 'Grom'), scale = itemOf(pv, 'Dragon Scale');
  assert.equal((await c.call('dm/close', { playerId: pv.me.id, merchantId: grom.id, closed: true }, dmT)).status, 200);
  assert.equal((await c.call('dm/close', { playerId: 'zzz', merchantId: grom.id, closed: true }, dmT)).status, 404);
  assert.equal(merchantOf(await c.view(p), 'Grom').closed, true);
  assert.equal(merchantOf(await c.view(q), 'Grom').closed, false);
  assert.deepEqual((await c.view(dmT)).closed, [{ playerId: pv.me.id, merchantId: grom.id }]);
  const msg = { error: 'The merchant is not trading with you today.' };
  assert.deepEqual((await c.call('bid', { merchantId: grom.id, itemId: scale.id, price: 60 }, p)).body, msg);
  assert.deepEqual((await c.call('accept', { itemId: scale.id }, p)).body, msg);
  assert.equal((await c.call('bid', { merchantId: grom.id, itemId: scale.id, price: 60 }, q)).status, 200);
  await c.call('dm/newday', {}, dmT);
  const v = await c.view(p);
  assert.equal(v.day, 2); assert.equal(merchantOf(v, 'Grom').closed, false);
  assert.deepEqual((await c.view(dmT)).closed, []);
  await c.call('dm/close', { playerId: pv.me.id, merchantId: grom.id, closed: true }, dmT);
  await c.call('dm/close', { playerId: pv.me.id, merchantId: grom.id, closed: false }, dmT);
  assert.equal(merchantOf(await c.view(p), 'Grom').closed, false);
  assert.ok((await c.view(dmT)).log.some((l) => l.text === 'New day: 2'));
  await c.call('dm/weekly', {}, dmT);
  const w = await c.view(p);
  assert.deepEqual([w.week, w.day], [2, 3]);
});

test('players: at most 8 at the table, a known name still rejoins', T, async () => {
  await c.reset();
  const first = await c.join('P1');
  for (let i = 2; i <= 8; i++) assert.ok(await c.join('P' + i));
  assert.deepEqual((await c.call('join', { name: 'P9', charId: 'bard' })).body, { error: 'The table is full (at most 8 players).' });
  assert.equal((await c.call('join', { name: 'p1', charId: 'bard' })).body.token, first);
});

test('DM: merchants and items CRUD, variants, validation', T, async () => {
  const dmT = await c.reset();
  assert.deepEqual((await c.call('dm/merchant', { name: '' }, dmT)).body, { error: 'Cannot be empty' });
  assert.equal((await c.call('dm/merchant', { name: 'Kara', emoji: '🦊' }, dmT)).status, 200);
  let dv = await c.view(dmT);
  assert.equal(dv.merchants.length, 4);
  const kara = dv.merchants[3];
  assert.deepEqual(keys(kara), ['emoji', 'id', 'name']);
  assert.equal(kara.name, 'Kara'); assert.equal(kara.emoji, '🦊');
  const added = await c.call('dm/item', { merchantId: kara.id, name: 'Sword', price: 10.5, magical: false, stock: 3, desc: 'sharp', type: 'weapon', rarity: 'rare' }, dmT);
  assert.equal(added.status, 200); assert.match(added.body.id, /^[0-9a-f]{10}$/);
  assert.deepEqual((await c.call('dm/item', { merchantId: kara.id, name: 'X', price: 1, type: 'mystery' }, dmT)).body, { error: 'Type is invalid' });
  assert.deepEqual((await c.call('dm/item', { merchantId: kara.id, name: 'X', price: 1, rarity: 'mystery' }, dmT)).body, { error: 'Rarity is invalid' });
  assert.deepEqual((await c.call('dm/item', { merchantId: kara.id, name: 'X', price: 0 }, dmT)).body, { error: 'Invalid number' });
  assert.equal((await c.call('dm/item', { merchantId: 'yok', name: 'X', price: 1 }, dmT)).status, 404);
  dv = await c.view(dmT);
  const it = dv.items.find((i) => i.id === added.body.id);
  assert.deepEqual({ ...it, id: undefined }, { id: undefined, merchantId: kara.id, name: 'Sword', price: 10.5, magical: false, stock: 3, desc: 'sharp', type: 'weapon', rarity: 'rare', hidden: false });

  const variant = await c.call('dm/itemvariant', { id: it.id, name: 'Sword +1' }, dmT);
  assert.equal(variant.status, 200);
  dv = await c.view(dmT);
  const copy = dv.items.find((i) => i.id === variant.body.id);
  assert.equal(copy.name, 'Sword +1'); assert.equal(copy.price, 10.5); assert.equal(copy.merchantId, kara.id);

  assert.equal((await c.call('dm/delete', { kind: 'item', id: copy.id }, dmT)).status, 200);
  assert.deepEqual((await c.call('dm/delete', { kind: 'zzz', id: 'x' }, dmT)).body, { error: 'Unknown kind' });
  assert.equal((await c.call('dm/delete', { kind: 'merchant', id: kara.id }, dmT)).status, 200);
  dv = await c.view(dmT);
  assert.equal(dv.merchants.length, 3); assert.equal(dv.items.length, 9);
});

test('DM: player gold, ledger entry, delete player', T, async () => {
  const dmT = await c.reset();
  const p = await c.join('Ali', 'bard');
  const pl = (await c.view(dmT)).players[0];
  assert.equal((await c.call('dm/player', { id: pl.id, gold: 120.5 }, dmT)).status, 200);
  const pv = await c.view(p);
  assert.equal(pv.me.gold, 120.5);
  assert.equal(pv.ledger[0].kind, 'dm'); assert.equal(pv.ledger[0].amount, 40.5); assert.equal(pv.ledger[0].name, 'DM gold adjustment');
  assert.equal((await c.call('dm/player', { id: 'yok', gold: 1 }, dmT)).status, 404);
  assert.deepEqual((await c.call('dm/player', { id: pl.id, gold: -5 }, dmT)).body, { error: 'Invalid number' });
  assert.equal((await c.call('dm/delete', { kind: 'player', id: pl.id }, dmT)).status, 200);
  assert.equal((await c.view(dmT)).players.length, 0);
  assert.equal((await c.call('bid', {}, p)).status, 401); // deleted player's token is dead
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
