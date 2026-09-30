'use strict';
// A save written before 0.14.0 (dice engine, affinity) loads cleanly: removed state is dropped, accepted offers reopen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('an old save is migrated on load', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pazar-migrate-'));
  const old = {
    day: 3, week: 2, dm: [], log: [], ledger: [], settings: { affinity: { enabled: true } },
    merchants: [{ id: 'm1', name: 'Bora', emoji: '🧓', type: 'generous' }],
    items: [{ id: 'i1', merchantId: 'm1', name: 'Tent', price: 2, magical: false, stock: null, minAffinity: 40 }],
    players: [{ id: 'p1', token: 'tok1', name: 'Ali', charId: 'bard', gold: 80, advantage: true, inventory: [] }],
    offers: [{ id: 'o1', playerId: 'p1', merchantId: 'm1', itemId: 'i1', itemName: 'Tent', price: 1, status: 'accepted', history: [] }],
    negs: { 'p1:i1': { rep: 2 } }, bans: {}, revealed: { 'p1:m1': true }, insightTries: {}, affinity: { 'p1:m1': 50 }, affinityWeek: {},
  };
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(old));
  const port = 30000 + (process.pid % 20000);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), DM_PIN: '5555', DATA_FILE: path.join(dir, 'data.json'), MEDIA_DIR: path.join(dir, 'media') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await new Promise((res, rej) => { child.stdout.on('data', (d) => { if (String(d).includes('Pazar running')) res(); }); setTimeout(() => rej(new Error('no start')), 8000); });
    const base = `http://127.0.0.1:${port}`;
    const dm = (await (await fetch(`${base}/api/dm/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '5555' }) })).json()).token;
    const r = await fetch(`${base}/api/events?token=${dm}`);
    const reader = r.body.getReader();
    let buf = '';
    while (!buf.includes('\n\n')) buf += new TextDecoder().decode((await reader.read()).value);
    reader.cancel();
    const v = JSON.parse(buf.split('\n\n')[0].replace(/^data: /, ''));
    assert.deepEqual(v.merchants, [{ id: 'm1', name: 'Bora', emoji: '🧓' }]);
    assert.equal(v.items[0].minAffinity, undefined);
    assert.equal(v.items[0].hidden, false);
    assert.equal(v.players[0].advantage, undefined);
    assert.equal(v.bids[0].status, 'new');
    const raw = JSON.stringify(v);
    assert.ok(!/negs|revealed|insightTries|affinity/.test(raw), raw);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
