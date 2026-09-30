import test from 'node:test';
import assert from 'node:assert/strict';
import { Relay, _test } from '../src/hub-core.js';

const { toB64, fromB64 } = _test;

// A fake ESP32: receives frames from the relay and answers the way esp/src/relay.cpp will.
function makeRig(handler, opts = {}) {
  let online = true;
  const frames = [];
  const bodies = new Map();
  const relay = new Relay({
    isOnline: () => online,
    timeoutMs: 200,
    ...opts,
    send: (text) => {
      if (!online) return false;
      const f = JSON.parse(text);
      frames.push(f);
      if (f.t === 'req') { bodies.set(f.id, []); if (!f.len) queueMicrotask(() => handler(f, Buffer.alloc(0), reply(f.id))); }
      else if (f.t === 'body') bodies.get(f.id).push(Buffer.from(fromB64(f.data)));
      else if (f.t === 'bend') { const req = frames.find((x) => x.t === 'req' && x.id === f.id); queueMicrotask(() => handler(req, Buffer.concat(bodies.get(f.id)), reply(f.id))); }
      return true;
    },
  });
  const reply = (id) => ({
    open: (status = 200, headers = { 'content-type': 'application/json' }) => relay.onEspMessage(JSON.stringify({ t: 'open', id, status, headers })),
    chunk: (s) => relay.onEspMessage(JSON.stringify({ t: 'chunk', id, data: toB64(Buffer.from(s)) })),
    end: () => relay.onEspMessage(JSON.stringify({ t: 'end', id })),
    err: (message) => relay.onEspMessage(JSON.stringify({ t: 'err', id, message })),
  });
  return { relay, frames, setOnline: (v) => { online = v; } };
}
const req = (path, init = {}) => new Request('https://relay.test' + path, init);
const ping = (f, body, r) => { r.open(); r.chunk('{"ok":true,'); r.chunk('"version":"0.13.0"}'); r.end(); };

test('GET is relayed and the streamed chunks are joined', async () => {
  const { relay, frames } = makeRig(ping);
  const res = await relay.handlePublic(req('/api/ping', { headers: { 'x-token': 't1', cookie: 'secret=1', authorization: 'Bearer x' } }), '1.2.3.4');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, version: '0.13.0' });
  const head = frames[0];
  assert.equal(head.t, 'req'); assert.equal(head.path, '/api/ping'); assert.equal(head.method, 'GET');
  assert.deepEqual(head.headers, { 'x-token': 't1', 'x-client-ip': '1.2.3.4' }); // cookie and authorization are stripped
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('POST body is chunked to the ESP and reassembled byte for byte', async () => {
  const payload = Buffer.alloc(5000); for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
  let got;
  const { relay, frames } = makeRig((f, body, r) => { got = body; r.open(200); r.chunk('ok'); r.end(); });
  const res = await relay.handlePublic(req('/api/media?kind=item&id=x', { method: 'POST', body: payload, headers: { 'content-type': 'image/png' } }), 'ip');
  assert.equal(await res.text(), 'ok');
  assert.ok(got.equals(payload));
  assert.equal(frames.filter((f) => f.t === 'body').length, 5); // 1024 x 4 + 904
  assert.equal(frames[0].len, 5000);
});

test('oversize POST is refused before anything reaches the ESP', async () => {
  const { relay, frames } = makeRig(ping);
  const res = await relay.handlePublic(req('/api/x', { method: 'POST', body: Buffer.alloc(150000) }), 'ip');
  assert.equal(res.status, 413);
  assert.equal(frames.length, 0);
});

test('offline ESP gives a clear 503', async () => {
  const { relay, setOnline } = makeRig(ping);
  setOnline(false);
  const res = await relay.handlePublic(req('/api/ping'), 'ip');
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'The table is offline' });
});

test('an ESP that never answers times out with 504 and is told to abort', async () => {
  const { relay, frames } = makeRig(() => {});
  const res = await relay.handlePublic(req('/api/ping'), 'ip');
  assert.equal(res.status, 504);
  assert.ok(frames.some((f) => f.t === 'abort'));
});

test('SSE: events stream through, and a client that leaves aborts the ESP side', async () => {
  let r0;
  const { relay, frames } = makeRig((f, b, r) => { r0 = r; r.open(200, { 'content-type': 'text/event-stream' }); r.chunk('data: {"a":1}\n\n'); });
  const res = await relay.handlePublic(req('/api/events?token=abc'), 'ip');
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const reader = res.body.getReader(), dec = new TextDecoder();
  assert.equal(dec.decode((await reader.read()).value), 'data: {"a":1}\n\n');
  r0.chunk('data: {"a":2}\n\n');
  assert.equal(dec.decode((await reader.read()).value), 'data: {"a":2}\n\n');
  await reader.cancel();
  assert.ok(frames.some((f) => f.t === 'abort'));
  assert.equal(relay.pending.size, 0);
});

test('SSE capacity: past the limit the oldest stream is ended to make room, ordinary requests still pass', async () => {
  const { relay } = makeRig((f, b, r) => { if (f.path.startsWith('/api/events')) { r.open(200, { 'content-type': 'text/event-stream' }); r.chunk(':\n\n'); } else ping(f, b, r); });
  relay.maxSse = 3;
  const streams = [];
  for (let i = 0; i < 3; i++) { const r = await relay.handlePublic(req('/api/events?token=t' + i), 'ip' + i); assert.equal(r.status, 200); streams.push(r); }
  const fourth = await relay.handlePublic(req('/api/events?token=t3'), 'ip3');
  assert.equal(fourth.status, 200);
  assert.equal(relay.inflight().sse, 3);
  const first = await streams[0].body.getReader().read();   // the oldest was closed after its first chunk
  assert.ok(first.value || first.done);
  assert.equal((await relay.handlePublic(req('/api/ping'), 'ip9')).status, 200);
});

test('when the ESP drops, open streams error and waiting requests get 503', async () => {
  let r0;
  const { relay } = makeRig((f, b, r) => { if (f.path === '/api/events') { r0 = r; r.open(200, { 'content-type': 'text/event-stream' }); } });
  const sse = await relay.handlePublic(req('/api/events'), 'a');
  const waiting = relay.handlePublic(req('/api/slow'), 'b');
  await new Promise((r) => setTimeout(r, 20));
  relay.onEspClose();
  assert.equal((await waiting).status, 503);
  await assert.rejects(async () => { const rd = sse.body.getReader(); for (;;) { const { done } = await rd.read(); if (done) break; } });
  assert.ok(r0);
});

test('per-IP rate limit answers 429 and other IPs are unaffected', async () => {
  const { relay } = makeRig(ping, { rate: { windowMs: 10000, max: 3 } });
  for (let i = 0; i < 3; i++) assert.equal((await relay.handlePublic(req('/api/ping'), 'greedy')).status, 200);
  assert.equal((await relay.handlePublic(req('/api/ping'), 'greedy')).status, 429);
  assert.equal((await relay.handlePublic(req('/api/ping'), 'polite')).status, 200);
});

test('an ESP-side error becomes a 502, /_esp is never relayed, other methods are refused', async () => {
  const { relay } = makeRig((f, b, r) => r.err('loopback failed'));
  const res = await relay.handlePublic(req('/api/ping'), 'ip');
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'loopback failed' });
  assert.equal((await relay.handlePublic(req('/_esp'), 'ip')).status, 404);
  assert.equal((await relay.handlePublic(req('/api/ping', { method: 'DELETE' }), 'ip')).status, 405);
});
