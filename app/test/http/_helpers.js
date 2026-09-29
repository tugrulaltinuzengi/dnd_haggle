'use strict';
// Black-box helpers: talk to pazar over HTTP only. BASE=http://host:port targets a running server (the ESP);
// otherwise a fresh Node server is spawned with the dev hooks (dm/reset, dm/dice) enabled.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const DM_PIN = process.env.DM_PIN || '9999';
const LOCK_MS = +process.env.PIN_LOCK_MS || 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

async function start() {
  if (process.env.BASE) return { base: process.env.BASE.replace(/\/$/, ''), stop: async () => {}, spawned: false };
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pazar-http-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), DM_PIN, DEV_RESET: '1', PIN_LOCK_MS: String(LOCK_MS),
      DATA_FILE: path.join(dir, 'data.json'), MEDIA_DIR: path.join(dir, 'media'), DICE_FIXED: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => {
    child.stdout.on('data', (d) => { if (String(d).includes('Pazar açık')) res(); });
    child.on('exit', (c) => rej(new Error('server exited ' + c)));
    setTimeout(() => rej(new Error('server did not start')), 8000);
  });
  return { base: `http://127.0.0.1:${port}`, spawned: true, stop: async () => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function client(base) {
  const call = async (name, body, tok) => {
    const r = await fetch(`${base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': tok || '' }, body: JSON.stringify(body ?? {}) });
    let json = null; try { json = await r.json(); } catch {}
    return { status: r.status, body: json };
  };
  const get = async (p, tok) => fetch(`${base}${p}`, { headers: { 'x-token': tok || '' } });

  // Reads server-sent events. next() resolves with the next parsed data event.
  const sse = async (tok) => {
    const ctl = new AbortController();
    const r = await fetch(`${base}/api/events?token=${encodeURIComponent(tok)}`, { signal: ctl.signal });
    if (r.status !== 200) { const body = await r.json().catch(() => null); ctl.abort(); return { status: r.status, body }; }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = ''; const queue = [];
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            if (chunk.startsWith('data:')) queue.push(JSON.parse(chunk.slice(5).trim()));
          }
        }
      } catch {}
    })();
    const next = async (ms = 5000) => {
      const t0 = Date.now();
      while (!queue.length) { if (Date.now() - t0 > ms) throw new Error('SSE timeout'); await sleep(20); }
      return queue.shift();
    };
    // Latest snapshot after things settle (drops older queued events).
    const latest = async (settle = 400) => { await sleep(settle); let last = null; while (queue.length) last = queue.shift(); return last || (await next()); };
    return { status: 200, next, latest, close: () => ctl.abort() };
  };

  const dm = async () => (await call('dm/login', { pin: DM_PIN })).body.token;
  // Fresh world; returns the DM token that survives the reset.
  const reset = async () => {
    const t = await dm();
    const r = await call('dm/reset', {}, t);
    if (r.status !== 200) throw new Error(`dm/reset failed: ${r.status} ${JSON.stringify(r.body)}`);
    return t;
  };
  const join = async (name, charId = 'ozan') => (await call('join', { name, charId })).body.token;
  const dice = (tok, seq) => call('dm/dice', { seq }, tok);
  const view = async (tok) => { const s = await sse(tok); const v = await s.latest(300); s.close(); return v; };
  return { call, get, sse, dm, reset, join, dice, view };
}

// Minimal PNG header (signature + IHDR) padded to n bytes; enough for the server's sniffing.
function fakePng(w, h, n = 100) {
  const b = Buffer.alloc(Math.max(n, 33));
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}

const keys = (o) => Object.keys(o).sort();
module.exports = { start, client, fakePng, keys, sleep, DM_PIN, LOCK_MS };
