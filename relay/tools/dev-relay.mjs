// Local stand-in for the Cloudflare Worker: same Relay core, plain HTTP + ws:// on your PC. Lets you test the ESP client end to end without Cloudflare.
//   RELAY_KEY=<key from esp/secrets.ini> node tools/dev-relay.mjs [port]
// Point the ESP at it with RELAY_HOST=<PC LAN IP>, RELAY_PORT=<port>, RELAY_TLS=0 in esp/secrets.ini, then browse http://localhost:<port>/
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Relay } from '../src/hub-core.js';

const port = +process.argv[2] || 8787;
const key = process.env.RELAY_KEY;
if (!key) { console.error('Set RELAY_KEY'); process.exit(1); }

let esp = null;
const relay = new Relay({
  isOnline: () => !!esp,
  send: (t) => { if (!esp) return false; try { esp.send(t); return true; } catch { return false; } },
});

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const url = `http://${req.headers.host}${req.url}`;
  const ip = req.socket.remoteAddress || '';
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const init = { method: req.method, headers: req.headers, signal: ac.signal };
  if (req.method === 'POST') init.body = Buffer.concat(chunks);
  const r = await relay.handlePublic(new Request(url, init), ip);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  if (!r.body) return res.end();
  try { for await (const c of r.body) res.write(c); } catch {}
  res.end();
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/_esp' || u.searchParams.get('key') !== key) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (esp) { try { esp.close(); } catch {} }
    esp = ws;
    console.log('ESP connected');
    ws.on('message', (m, isBin) => { if (!isBin) relay.onEspMessage(m.toString()); });
    ws.on('close', () => { if (esp === ws) { esp = null; relay.onEspClose(); console.log('ESP disconnected'); } });
  });
});
server.listen(port, '0.0.0.0', () => console.log(`dev relay on http://localhost:${port}  (ESP dials ws://<this PC>:${port}/_esp)`));
