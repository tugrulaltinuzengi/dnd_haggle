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
// Builds a valid, small PNG (w×h, single color).
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
  ali = (await call('join', { name: 'Ali', charId: 'bard' })).body.token;    // 80 gp
  veli = (await call('join', { name: 'Veli', charId: 'rogue' })).body.token; // 60 gp
  items = (await snap(dm)).items;
});
test.after(() => server.close());

const item = (n) => items.find((i) => i.name === n);

test('wrong PIN and unauthorized access', async () => {
  assert.equal((await call('dm/login', { pin: '0' })).status, 403);
  assert.equal((await call('dm/newday', {}, ali)).status, 403);
  assert.equal((await call('bid', {}, dm)).status, 403);
});

test('offer → DM counter → player accepts → settled at once', async () => {
  const it = item('Longsword'); // 15 gp
  assert.equal((await call('bid', { merchantId: it.merchantId, itemId: it.id, price: 15 }, ali)).status, 400); // not below the list price
  assert.equal((await call('bid', { merchantId: it.merchantId, itemId: it.id, price: 9, note: 'I will buy on the weekend' }, ali)).status, 200);
  const b1 = (await snap(dm)).bids[0];
  assert.equal(b1.status, 'new');
  assert.equal((await call('dm/bidreply', { id: b1.id, action: 'counter', price: 12, note: 'My final word' }, dm)).status, 200);
  assert.equal((await snap(ali)).bids[0].status, 'counter');
  assert.equal((await call('dm/bidreply', { id: b1.id, action: 'accept' }, dm)).status, 400); // the player has to answer the counter
  assert.equal((await call('bidreply', { id: b1.id, action: 'accept' }, veli)).status, 403); // someone else's offer
  assert.equal((await call('bidreply', { id: b1.id, action: 'accept' }, ali)).status, 200);
  const a = await snap(ali);
  assert.equal(a.me.gold, 68); // delivered immediately
  assert.equal(a.me.inventory[0].name, 'Longsword');
  assert.equal(a.me.inventory[0].paid, 12);
  assert.equal(a.bids[0].status, 'settled');
  assert.equal((await call('bidreply', { id: b1.id, action: 'withdraw' }, ali)).status, 400); // closed
});

test('the DM accepts a player offer at once; too little gold or no stock keeps it open', async () => {
  const it = item('+1 Shield'); // 400 gp, stock 1
  const vpid = (await snap(dm)).players.find((p) => p.name === 'Veli').id;
  await call('bid', { merchantId: it.merchantId, itemId: it.id, price: 300 }, veli);
  const vb = (await snap(dm)).bids.find((b) => b.price === 300);
  const poor = await call('dm/bidreply', { id: vb.id, action: 'accept' }, dm);
  assert.deepEqual([poor.status, poor.body.error], [400, 'Not enough gold.']);
  assert.equal((await snap(dm)).bids.find((b) => b.id === vb.id).status, 'new'); // still open
  await call('dm/player', { id: vpid, gold: 500 }, dm);
  assert.equal((await call('dm/bidreply', { id: vb.id, action: 'accept' }, dm)).status, 200);
  const v = await snap(veli);
  assert.equal(v.me.gold, 200);
  assert.equal(v.me.inventory.at(-1).name, '+1 Shield');
  assert.equal(v.merchants.find((m) => m.id === it.merchantId).items.find((i) => i.id === it.id).stock, 0);
  // someone else's offer on the sold-out item cannot be accepted, but can be rejected
  await call('bid', { merchantId: it.merchantId, itemId: it.id, price: 350 }, ali);
  const ab = (await snap(dm)).bids.find((b) => b.price === 350);
  assert.equal((await call('dm/bidreply', { id: ab.id, action: 'accept' }, dm)).body.error, 'Sold out.');
  assert.equal((await call('dm/bidreply', { id: ab.id, action: 'reject', note: 'Sold, sorry' }, dm)).status, 200);
  assert.equal((await snap(ali)).bids.find((b) => b.id === ab.id).status, 'rejected');
});

test('the DM sends an offer, the player counters and withdraws', async () => {
  const it = item('Chain Mail'); // 75 gp
  const pid = (await snap(dm)).players.find((p) => p.name === 'Veli').id;
  assert.equal((await call('dm/bidsend', { playerId: pid, itemId: it.id, price: 50, note: 'Just for you' }, dm)).status, 200);
  const b = (await snap(veli)).bids.find((x) => x.from === 'dm');
  assert.equal(b.status, 'counter');
  assert.equal((await call('bidreply', { id: b.id, action: 'counter', price: 40 }, veli)).status, 200);
  assert.equal((await snap(dm)).bids.find((x) => x.id === b.id).status, 'new');
  assert.equal((await call('bidreply', { id: b.id, action: 'withdraw' }, veli)).status, 200);
  assert.equal((await call('dm/bidreply', { id: b.id, action: 'accept' }, dm)).status, 400); // closed
});

test('custom request (an item not in the catalog)', async () => {
  const m = (await snap(dm)).merchants[0];
  assert.equal((await call('bid', { merchantId: m.id, itemName: 'Dragon Egg', price: 5000 }, ali)).status, 200);
  assert.equal((await call('bid', { merchantId: m.id, itemName: '  ', price: 5 }, ali)).status, 400);
});

test('ledger: purchases, accepted offers and DM gold adjustments are recorded', async () => {
  const dmView = await snap(dm);
  assert.ok(dmView.ledger.some((e) => e.kind === 'offer' && e.amount === -12 && e.name === 'Longsword'), 'the accepted offer is in the ledger');

  const it = item('Tent'); // 2 gp
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
  // a player sees only their own records
  assert.ok((await snap(veli)).ledger.every((e) => e.playerId !== pid));
});

test('no dice anywhere: removed actions answer 404 and views carry no haggle state', async () => {
  for (const name of ['offer', 'insight']) assert.equal((await call(name, {}, ali)).status, 404);
  for (const name of ['dm/line', 'dm/setprice', 'dm/dice', 'dm/affinity', 'dm/affsettings']) assert.equal((await call(name, {}, dm)).status, 404);
  const raw = JSON.stringify(await snap(ali)) + JSON.stringify(await snap(dm));
  assert.ok(!/"negs"|"affinity"|"advantage"|"rep"|generous|greedy|minAffinity/.test(raw));
});

test('hidden items do not exist for players until the DM shows them', async () => {
  const r = await call('dm/item', { merchantId: 'm1', name: 'Secret Map', price: 30, hidden: true }, dm);
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(await snap(ali)).includes('Secret Map'));
  assert.equal((await call('accept', { itemId: r.body.id }, ali)).status, 404);
  assert.equal((await call('bid', { merchantId: 'm1', itemId: r.body.id, price: 20 }, ali)).status, 404);
  assert.equal((await snap(dm)).items.find((i) => i.id === r.body.id).hidden, true);
  await call('dm/item', { id: r.body.id, merchantId: 'm1', name: 'Secret Map', price: 30, hidden: false }, dm);
  const shown = (await snap(ali)).merchants.find((m) => m.id === 'm1').items.find((i) => i.id === r.body.id);
  assert.equal(shown.name, 'Secret Map');
});

test('the DM closes a merchant to one player until the next day', async () => {
  const pid = (await snap(dm)).players.find((p) => p.name === 'Veli').id;
  const it = item("Thieves' Tools"); // m2, 25 gp
  assert.equal((await call('dm/close', { playerId: pid, merchantId: 'm2', closed: true }, dm)).status, 200);
  const v = await snap(veli);
  assert.equal(v.merchants.find((m) => m.id === 'm2').closed, true);
  assert.equal((await snap(ali)).merchants.find((m) => m.id === 'm2').closed, false);
  assert.equal((await call('bid', { merchantId: 'm2', itemId: it.id, price: 10 }, veli)).body.error, 'The merchant is not trading with you today.');
  assert.equal((await call('accept', { itemId: it.id }, veli)).body.error, 'The merchant is not trading with you today.');
  assert.deepEqual((await snap(dm)).closed, [{ playerId: pid, merchantId: 'm2' }]);
  await call('dm/newday', {}, dm);
  assert.equal((await snap(veli)).merchants.find((m) => m.id === 'm2').closed, false);
  assert.deepEqual((await snap(dm)).closed, []);
  // reopening by hand works too
  await call('dm/close', { playerId: pid, merchantId: 'm2', closed: true }, dm);
  await call('dm/close', { playerId: pid, merchantId: 'm2', closed: false }, dm);
  assert.equal((await snap(veli)).merchants.find((m) => m.id === 'm2').closed, false);
});

test('ledger CSV and invite address are DM only', async () => {
  const csv = await get('ledger.csv', dm);
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes('time,week,day,kind,player,merchant,item,amount,list'));
  assert.ok(csv.text.includes('Tent'));
  assert.equal((await get('ledger.csv', ali)).status, 403);
  const addr = await get('address', dm);
  assert.equal(addr.status, 200);
  assert.equal(JSON.parse(addr.text).url, null);
  assert.equal((await get('address', ali)).status, 403);
});

test('PIN rate limit: locks after repeated wrong tries and unlocks when the time is up', async () => {
  let last;
  for (let i = 0; i < 8; i++) { last = await call('dm/login', { pin: 'wrong' }); if (last.status === 429) break; }
  assert.equal(last.status, 429);
  assert.equal((await call('dm/login', { pin: '9999' })).status, 429); // even the correct PIN is refused while locked
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await call('dm/login', { pin: '9999' })).status, 200);
});

test('media: the DM uploads an item image, the server verifies and serves it', async () => {
  const it = item('Longsword');
  const png = makePng(64, 64);
  const r = await upload(`kind=item&id=${it.id}`, png, dm);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^\/media\/items\/[0-9a-f]+\.png\?v=/);
  const f = await getRaw(r.body.url);
  assert.equal(f.status, 200);
  assert.equal(f.type, 'image/png');
  assert.equal(f.sec, 'nosniff');
  assert.ok(f.buf.equals(png));
  // the thumbnail is a separate field
  const t = await upload(`kind=item&id=${it.id}&variant=thumb`, makePng(32, 32), dm);
  assert.equal(t.status, 200);
  const view = await snap(ali);
  const shown = view.merchants.find((m) => m.id === it.merchantId).items.find((x) => x.id === it.id);
  assert.equal(shown.image, r.body.url);
  assert.equal(shown.thumb, t.body.url);
});

test('media: permission, kind, size and limit checks', async () => {
  const it = item('Chain Mail');
  const png = makePng(64, 64);
  assert.equal((await upload(`kind=item&id=${it.id}`, png, ali)).status, 403);   // player
  assert.equal((await upload(`kind=item&id=${it.id}`, png, '')).status, 403);    // not logged in
  assert.equal((await upload(`kind=item&id=${it.id}`, Buffer.from('this is not an image, plain text ......'), dm)).status, 400);
  assert.equal((await upload(`kind=item&id=${it.id}`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), dm, 'image/svg+xml')).status, 400); // no SVG
  assert.equal((await upload(`kind=item&id=${it.id}`, makePng(16, 16), dm)).status, 400);   // too small
  assert.equal((await upload(`kind=item&id=${it.id}`, makePng(3000, 2), dm)).status, 400);  // too large
  const big = Buffer.concat([png.subarray(0, 24), Buffer.alloc(800 * 1024)]);
  assert.equal((await upload(`kind=item&id=${it.id}`, big, dm)).status, 413);                // over 700 KB
  assert.equal((await upload('kind=item&id=yok', png, dm)).status, 404);
  assert.equal((await upload(`kind=silah&id=${it.id}`, png, dm)).status, 400);
});

test('media: JPEG is accepted, a merchant portrait uploads', async () => {
  // minimal JPEG header with a SOF0 marker (64×64)
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x40, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
  const r = await upload('kind=portrait&id=m2', jpg, dm, 'image/jpeg');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^\/media\/portraits\/m2\.jpg\?v=/);
  const f = await getRaw(r.body.url);
  assert.equal(f.type, 'image/jpeg');
  assert.equal((await snap(ali)).merchants.find((m) => m.id === 'm2').portrait, r.body.url);
  // re-uploading clears the old extension
  const r2 = await upload('kind=portrait&id=m2', makePng(64, 64), dm);
  assert.match(r2.body.url, /m2\.png/);
  assert.equal((await getRaw(r.body.url.replace('?v', '?x'))).status, 404); // the jpg file was deleted
});

test('media: path traversal attempts are blocked', async () => {
  for (const p of ['/media/../server.js', '/media/..%2fserver.js', '/media/%2e%2e/server.js', '/media/items/../../package.json', '/media/items/yok.png', '/media/items/x.txt']) {
    const f = await getRaw(p);
    assert.ok([403, 404].includes(f.status), `${p} -> ${f.status}`);
    assert.ok(!f.buf.toString().includes('require('), p);
  }
});

test('media: clearing and deleting also remove the file', async () => {
  const it = item('Longsword');
  const cur = (await snap(dm)).items.find((x) => x.id === it.id);
  assert.ok(cur.image);
  assert.equal((await call('dm/mediaclear', { kind: 'item', id: it.id }, dm)).status, 200);
  assert.equal((await getRaw(cur.image)).status, 404);
  assert.equal((await getRaw(cur.thumb)).status, 404);
  const after = (await snap(dm)).items.find((x) => x.id === it.id);
  assert.equal(after.image, null);
  // deleting an item deletes its file too
  const up = await upload(`kind=item&id=${item('Tent').id}`, makePng(64, 64), dm);
  assert.equal(up.status, 200);
  await call('dm/delete', { kind: 'item', id: item('Tent').id }, dm);
  assert.equal((await getRaw(up.body.url)).status, 404);
});

test('item fields: description, type and rarity are validated, an invalid request leaves no half item', async () => {
  const count = () => snap(dm).then((v) => v.items.length);
  const n0 = await count();
  const r = await call('dm/item', { merchantId: 'm2', name: 'Frost Brand', price: 200, desc: 'A cold blade.', type: 'weapon', rarity: 'rare', magical: true }, dm);
  assert.equal(r.status, 200);
  assert.match(r.body.id, /^[0-9a-f]+$/);
  const shown = (await snap(ali)).merchants.find((m) => m.id === 'm2').items.find((i) => i.id === r.body.id);
  assert.deepEqual([shown.desc, shown.type, shown.rarity, shown.magical], ['A cold blade.', 'weapon', 'rare', true]);
  assert.equal(await count(), n0 + 1);
  assert.equal((await call('dm/item', { merchantId: 'm2', name: 'Bad', price: 5, type: 'weapon-x' }, dm)).status, 400);
  assert.equal((await call('dm/item', { merchantId: 'm2', name: 'Bad', price: 5, rarity: 'legendary-x' }, dm)).status, 400);
  assert.equal((await call('dm/item', { merchantId: 'm2', name: '  ', price: 5 }, dm)).status, 400);
  assert.equal(await count(), n0 + 1, 'invalid requests must not leave a half item');
  // editing keeps/updates the fields
  await call('dm/item', { id: r.body.id, merchantId: 'm2', name: 'Frost Brand', price: 250, desc: '', type: '', rarity: 'none' }, dm);
  const e = (await snap(ali)).merchants.find((m) => m.id === 'm2').items.find((i) => i.id === r.body.id);
  assert.deepEqual([e.price, e.desc, e.type, e.rarity], [250, '', null, 'none']);
});

test('an item variant is copied with its images and is independent', async () => {
  const src = (await snap(dm)).items.find((i) => i.name === 'Frost Brand');
  const up = await upload(`kind=item&id=${src.id}`, makePng(64, 64), dm);
  assert.equal(up.status, 200);
  const v = await call('dm/itemvariant', { id: src.id, name: 'Frost Brand (new)' }, dm);
  assert.equal(v.status, 200);
  const items = (await snap(dm)).items;
  const orig = items.find((i) => i.id === src.id), copy = items.find((i) => i.id === v.body.id);
  assert.equal(copy.name, 'Frost Brand (new)');
  assert.equal(copy.rarity, orig.rarity);
  assert.equal(copy.price, orig.price);
  assert.equal(copy.magical, orig.magical);
  assert.notEqual(copy.image.split('?')[0], orig.image.split('?')[0]);
  assert.equal((await getRaw(copy.image)).status, 200);
  await call('dm/delete', { kind: 'item', id: src.id }, dm);
  assert.equal((await getRaw(orig.image)).status, 404);
  assert.equal((await getRaw(copy.image)).status, 200, 'the copy must survive when the original is deleted');
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
        waitFor: (k, ms = 2500) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error(`timeout (${n}/${k})`)), ms); const chk = () => { if (n >= k) { clearTimeout(t); ok(); } else waiters.push(chk); }; chk(); }),
        close: () => req.destroy(),
      });
    });
    req.on('error', () => {});
  });
}

test('capacity: 7 players + the DM connected at once, one change reaches all of them quickly', async () => {
  const toks = [ali, veli];
  for (let i = 0; i < 5; i++) toks.push((await call('join', { name: `Kap${i}`, charId: 'druid' })).body.token);
  const streams = await Promise.all([...toks, dm].map(openStream));
  await Promise.all(streams.map((st) => st.waitFor(1)));           // first view
  const before = streams.map((st) => st.count());
  const t0 = Date.now();
  await call('dm/newday', {}, dm);
  await Promise.all(streams.map((st, i) => st.waitFor(before[i] + 1)));
  const ms = Date.now() - t0;
  streams.forEach((st) => st.close());
  assert.ok(ms < 1500, `the update took ${ms} ms`);
  assert.equal(streams.length, 8);
});

test('the table holds at most 8 players; known players can still come back', async () => {
  assert.equal((await call('join', { name: 'Kap5', charId: 'druid' })).status, 200); // 8th
  const full = await call('join', { name: 'Kap6', charId: 'druid' });
  assert.deepEqual([full.status, full.body.error], [400, 'The table is full (at most 8 players).']);
  assert.equal((await call('join', { name: 'ali', charId: 'bard' })).body.token, ali);
});
