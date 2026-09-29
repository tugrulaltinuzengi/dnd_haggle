// Relay core: multiplexes public HTTP requests over the single WebSocket the ESP32 holds open.
// Pure (no Cloudflare APIs) so it can be tested in Node with a fake ESP. See docs/superpowers/specs/2026-09-30-remote-access-design.md.
//
// Frames are JSON text. Worker -> ESP:  req {id,method,path,headers,len} | body {id,data} | bend {id} | abort {id}
//                        ESP -> Worker: open {id,status,headers} | chunk {id,data} | end {id} | err {id,message}
// `data` is base64. Every response is streamed (open, chunk*, end) so the ESP never buffers a whole body.

const FWD_REQ_HEADERS = ['x-token', 'x-now', 'content-type'];
const FWD_RES_HEADERS = ['content-type', 'cache-control', 'content-disposition', 'content-length', 'etag', 'x-content-type-options'];
const BODY_CHUNK = 2048;
const MAX_BODY = 140000;

const enc = new TextEncoder();
const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export class Relay {
  // send(text) -> boolean (false when the ESP is not connected); isOnline() -> boolean
  constructor({ send, isOnline, timeoutMs = 15000, maxInflight = 6, maxSse = 3, rate = { windowMs: 10000, max: 80 }, now = Date.now }) {
    Object.assign(this, { send, isOnline, timeoutMs, maxInflight, maxSse, rate, now });
    this.pending = new Map();
    this.seq = 0;
    this.hits = new Map(); // ip -> { start, n }
  }

  inflight() { let sse = 0; for (const p of this.pending.values()) if (p.sse) sse++; return { total: this.pending.size, sse }; }

  limited(ip) {
    const t = this.now(), h = this.hits.get(ip);
    if (!h || t - h.start > this.rate.windowMs) { this.hits.set(ip, { start: t, n: 1 }); if (this.hits.size > 500) for (const [k, v] of this.hits) if (t - v.start > this.rate.windowMs) this.hits.delete(k); return false; }
    return ++h.n > this.rate.max;
  }

  async handlePublic(request, ip = '') {
    const url = new URL(request.url);
    if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Method not allowed' });
    if (url.pathname === '/_esp') return json(404, { error: 'Not found' });
    if (!this.isOnline()) return json(503, { error: 'The table is offline' });
    if (this.limited(ip)) return json(429, { error: 'Too many requests. Wait a moment.' });

    const sse = url.pathname === '/api/events';
    const load = this.inflight();
    if (load.total >= this.maxInflight || (sse && load.sse >= this.maxSse)) return json(503, { error: 'Busy, try again' });

    let body = null;
    if (request.method === 'POST') {
      const cl = +request.headers.get('content-length');
      if (Number.isFinite(cl) && cl > MAX_BODY) return json(413, { error: 'Too large' });
      body = new Uint8Array(await request.arrayBuffer());
      if (body.length > MAX_BODY) return json(413, { error: 'Too large' });
    }

    const id = String(++this.seq);
    const headers = {};
    for (const k of FWD_REQ_HEADERS) { const v = request.headers.get(k); if (v) headers[k] = v; }
    if (ip) headers['x-client-ip'] = ip;
    const entry = { sse, opened: false, ctl: null, resolve: null, timer: null };
    const result = new Promise((resolve) => { entry.resolve = resolve; });
    this.pending.set(id, entry);

    const ok = this.send(JSON.stringify({ t: 'req', id, method: request.method, path: url.pathname + url.search, headers, len: body ? body.length : 0 }))
      && (!body || this.sendBody(id, body));
    if (!ok) { this.pending.delete(id); return json(503, { error: 'The table is offline' }); }

    entry.timer = setTimeout(() => {
      if (!entry.opened) { this.pending.delete(id); this.send(JSON.stringify({ t: 'abort', id })); entry.resolve(json(504, { error: 'The table did not answer' })); }
    }, this.timeoutMs);
    request.signal?.addEventListener('abort', () => this.drop(id, true));
    return result;
  }

  sendBody(id, body) {
    for (let i = 0; i < body.length; i += BODY_CHUNK) if (!this.send(JSON.stringify({ t: 'body', id, data: toB64(body.subarray(i, i + BODY_CHUNK)) }))) return false;
    return this.send(JSON.stringify({ t: 'bend', id }));
  }

  drop(id, tellEsp) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    if (tellEsp) this.send(JSON.stringify({ t: 'abort', id }));
    try { p.ctl && p.ctl.close(); } catch {}
  }

  onEspMessage(text) {
    let f; try { f = JSON.parse(text); } catch { return; }
    const p = this.pending.get(String(f.id));
    if (!p) return;
    if (f.t === 'open' && !p.opened) {
      p.opened = true; clearTimeout(p.timer);
      const headers = new Headers({ 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
      for (const k of FWD_RES_HEADERS) if (f.headers && f.headers[k]) headers.set(k, String(f.headers[k]));
      if (p.sse) { headers.set('cache-control', 'no-cache'); headers.set('x-accel-buffering', 'no'); }
      const stream = new ReadableStream({ start: (c) => { p.ctl = c; }, cancel: () => this.drop(String(f.id), true) });
      p.resolve(new Response(stream, { status: f.status || 200, headers }));
    } else if (f.t === 'chunk' && p.opened && f.data) {
      try { p.ctl.enqueue(fromB64(f.data)); } catch { this.drop(String(f.id), true); }
    } else if (f.t === 'end') {
      this.pending.delete(String(f.id)); clearTimeout(p.timer);
      try { p.ctl && p.ctl.close(); } catch {}
    } else if (f.t === 'err') {
      this.pending.delete(String(f.id)); clearTimeout(p.timer);
      if (!p.opened) p.resolve(json(502, { error: String(f.message || 'The table had a problem') }));
      else { try { p.ctl.error(new Error('esp error')); } catch {} }
    }
  }

  onEspClose() {
    for (const [id, p] of [...this.pending]) {
      this.pending.delete(id); clearTimeout(p.timer);
      if (!p.opened) p.resolve(json(503, { error: 'The table is offline' }));
      else { try { p.ctl.error(new Error('esp offline')); } catch {} }
    }
  }
}

export const _test = { toB64, fromB64, enc };
