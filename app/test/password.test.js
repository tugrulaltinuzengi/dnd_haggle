'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_FILE = path.join(os.tmpdir(), `pazar-pass-${process.pid}.json`);
process.env.DM_PIN = '9999';
process.env.PIN_LOCK_MS = '300';
process.env.MEDIA_DIR = path.join(os.tmpdir(), `pazar-pass-media-${process.pid}`);
const { server } = require('../server');

let base;
const call = async (name, body, tok) => {
  const r = await fetch(`${base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': tok || '' }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json() };
};
const login = async (pin) => call('dm/login', { pin });

test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
test.after(() => server.close());

test('DM şifresi: değiştirilir, eski PIN geçmez, diğer DM oturumları düşer, hash saklanır', async () => {
  const a = (await login('9999')).body.token;
  const b = (await login('9999')).body.token;
  const ali = (await call('join', { name: 'Ali', charId: 'ozan' })).body.token;

  assert.equal((await call('dm/password', { current: '9999', next: 'ejderha42' }, ali)).status, 403); // oyuncu olamaz
  assert.equal((await call('dm/password', { current: 'yanlis', next: 'ejderha42' }, a)).status, 403);
  assert.equal((await call('dm/password', { current: '9999', next: 'kısa' }, a)).status, 400); // en az 6
  assert.equal((await call('dm/password', { current: '9999', next: 'x'.repeat(65) }, a)).status, 400); // en fazla 64
  assert.equal((await call('dm/password', { current: '9999', next: 'ejderha42' }, a)).status, 200);

  assert.equal((await call('dm/newday', {}, a)).status, 200);      // değiştiren oturum açık kalır
  assert.equal((await call('dm/newday', {}, b)).status, 401);      // diğer DM oturumu düştü
  assert.equal((await login('9999')).status, 403);                 // eski PIN artık geçmez
  const c = await login('ejderha42');
  assert.equal(c.status, 200);
  assert.equal(c.body.role, 'dm');

  await new Promise((r) => setTimeout(r, 400)); // kayıt (debounce 200 ms)
  const raw = fs.readFileSync(process.env.DATA_FILE, 'utf8');
  assert.equal(raw.includes('ejderha42'), false);                  // düz metin saklanmaz
  const saved = JSON.parse(raw).settings.dmPass;
  assert.match(saved.salt, /^[0-9a-f]{32}$/);
  assert.match(saved.hash, /^[0-9a-f]{64}$/);

  assert.equal((await call('dm/password', { current: 'ejderha42', next: 'yeni şifre 7' }, c.body.token)).status, 200);
  assert.equal((await login('yeni şifre 7')).status, 200);          // boşluk ve Türkçe harf serbest
});

test('şifre hash’i DM görünümüne sızmaz', async () => {
  const tok = (await login('yeni şifre 7')).body.token;
  const ctl = new AbortController();
  const r = await fetch(`${base}/api/events?token=${tok}`, { signal: ctl.signal });
  const { value } = await r.body.getReader().read();
  ctl.abort();
  const text = new TextDecoder().decode(value);
  assert.equal(text.includes('dmPass'), false);
  assert.equal(text.includes('"hash"'), false);
});
