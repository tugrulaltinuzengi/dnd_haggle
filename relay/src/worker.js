// Cloudflare Worker entry: one Durable Object ("Hub") holds the ESP32's WebSocket and relays public HTTP through it.
import { Relay } from './hub-core.js';

const safeEq = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

export class Hub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // The ESP sends "ping" every 20 s; Cloudflare answers "pong" without waking this object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.relay = new Relay({
      isOnline: () => !!this.esp(),
      send: (text) => { const ws = this.esp(); if (!ws) return false; try { ws.send(text); return true; } catch { return false; } },
    });
  }

  esp() { return this.ctx.getWebSockets('esp')[0]; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/_esp') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a websocket', { status: 426 });
      if (!safeEq(url.searchParams.get('key') || '', this.env.RELAY_KEY || '')) return new Response('Forbidden', { status: 403 });
      for (const w of this.ctx.getWebSockets('esp')) { try { w.close(1000, 'replaced'); } catch {} }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], ['esp']);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return this.relay.handlePublic(request, request.headers.get('cf-connecting-ip') || '');
  }

  webSocketMessage(ws, msg) { if (typeof msg === 'string') this.relay.onEspMessage(msg); }
  webSocketClose() { if (!this.esp()) this.relay.onEspClose(); }
  webSocketError() { if (!this.esp()) this.relay.onEspClose(); }
}

export default {
  async fetch(request, env) {
    return env.HUB.get(env.HUB.idFromName('table')).fetch(request);
  },
};
