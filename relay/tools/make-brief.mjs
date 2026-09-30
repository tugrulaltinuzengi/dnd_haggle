// Builds relay/dist/worker.bundle.js (single file, no imports) and relay/CLOUDFLARE-AI.md (the brief to hand to Cloudflare's AI assistant).
// Run after changing src/: node tools/make-brief.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const core = read('src/hub-core.js')
  .replace(/^export const _test.*$/m, '')
  .replace(/^export class Relay/m, 'class Relay');
const worker = read('src/worker.js').replace(/^import .*$/m, '');
const bundle = `// pazar-relay: single-file bundle generated from src/hub-core.js + src/worker.js. Do not edit by hand.\n${core}\n${worker}`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/worker.bundle.js'), bundle);

const toml = read('wrangler.toml');
const md = `# Task for Cloudflare's AI assistant: deploy the Pazar relay Worker

You are helping set up a small Cloudflare Worker for a hobby project (a D&D shop-haggling game that runs on an ESP32 microcontroller at home).
The ESP32 cannot accept inbound internet connections, so it opens a WebSocket **outward** to this Worker, and the Worker forwards public HTTPS requests to it through that socket.
The Worker holds no game logic, no accounts and no data. It is a dumb, authenticated relay.

Please do exactly the steps below. Ask me before doing anything that costs money or is not listed.

## What to create

- One Worker named \`pazar-relay\` on the **free plan**, reachable at \`https://pazar-relay.<my-subdomain>.workers.dev\`.
- One **Durable Object** class \`Hub\` (SQLite-backed, which is the kind available on the free plan) bound to the Worker as \`HUB\`.
- One **secret** named \`RELAY_KEY\`. I will give you the value; **do not invent or print your own**, and never put it in the code or in a commit.
- Do not enable any paid feature, custom domain, KV, R2, D1, Queues or AI binding.

## Deploy option A (preferred): Wrangler from the project folder

The project already contains \`relay/wrangler.toml\`:

\`\`\`toml
${toml.trim()}
\`\`\`

Commands, run inside the \`relay/\` folder:

\`\`\`bash
npm install
npx wrangler login            # I will complete the browser sign-in
npx wrangler secret put RELAY_KEY   # I will paste the value when prompted
npx wrangler deploy
\`\`\`

## Deploy option B: paste into the dashboard editor

Create a Worker called \`pazar-relay\`, replace its code with the single file below, then:

1. Settings → Bindings → add a **Durable Object** binding: variable name \`HUB\`, class \`Hub\`, and let the dashboard create the class in this same Worker.
2. Settings → Variables and Secrets → add the secret \`RELAY_KEY\` (I will supply the value).
3. Make sure the Durable Object migration is the SQLite one (\`new_sqlite_classes = ["Hub"]\`).
4. Deploy.

\`\`\`js
${bundle.trim()}
\`\`\`

## How it behaves (so you can sanity-check the code)

- \`GET wss://<worker>/_esp?key=<RELAY_KEY>\` is the ESP32 connecting. Wrong key returns 403, a non-WebSocket request returns 426. A new ESP connection replaces the old one.
- Every other \`GET\`/\`POST\` is a public player request. It is turned into JSON frames, sent to the ESP over the socket, and the ESP's answer is streamed back (including Server-Sent Events on \`/api/events\`).
- If the ESP is not connected the Worker answers \`503 {"error":"The table is offline"}\`.
- Limits: 6 requests in flight, 3 open event streams, 140 000 byte POST bodies, and 80 requests per 10 s per client IP.
- Only the headers \`x-token\`, \`x-now\` and \`content-type\` are forwarded. Cookies and \`Authorization\` are dropped.
- The Durable Object uses the WebSocket Hibernation API and an auto-response for the text \`ping\` → \`pong\`, so an idle table costs almost nothing.

## Acceptance checks (please run them and report the results)

Replace \`$URL\` with the deployed address.

\`\`\`bash
# 1. Deployed, ESP not connected yet: expect HTTP 503 and {"error":"The table is offline"}
curl -i $URL/api/ping

# 2. The ESP endpoint refuses a plain request: expect 426
curl -i $URL/_esp

# 3. Wrong key: expect 403
curl -i -H "Upgrade: websocket" -H "Connection: Upgrade" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" "$URL/_esp?key=wrong"

# 4. Other methods are refused: expect 405
curl -i -X DELETE $URL/api/ping
\`\`\`

## Please report back to me

1. The final \`https://….workers.dev\` address.
2. The output of the four checks above.
3. Confirmation that \`RELAY_KEY\` exists as a **secret** (not a plain variable) and that the Durable Object is SQLite-backed.
4. Any warning about plan limits. I expect a WebSocket to stay open all day, which the free plan allows because the object hibernates while idle.

## Status: it is already deployed, one question remains

I deployed this myself with Wrangler as \`https://pazar-relay.tugrulaltinuzengi.workers.dev\` (SQLite-backed Durable Object \`Hub\`, secret \`RELAY_KEY\` set). The ESP32 connects over TLS and the whole app test suite (25 tests) passes through it. So the deployment tasks above are done; please only check the settings, and answer this:

**Client disconnects are not propagated to the Durable Object.** For \`text/event-stream\` responses, the stateless Worker returns \`stub.fetch(request)\` untouched. When a viewer (curl, Node fetch, a browser) disconnects, neither the \`cancel()\` of the \`ReadableStream\` I return from the Durable Object nor \`request.signal\` "abort" ever fires there (I logged both for a minute). \`wrangler tail\` shows the request in the stateless Worker as \`canceled\`, but nothing arrives in the object. I worked around it by ending each stream after 30 s from the ESP32 side, so the browser's EventSource reconnects. Is there a supported way to learn, inside a Durable Object, that the client of a streaming \`fetch\` response left (compatibility flags, returning the body differently, piping through a \`TransformStream\`, WebSocket instead of SSE)? Note that piping through a \`TransformStream\` with \`ctx.waitUntil(res.body.pipeTo(writable))\` in the stateless Worker did not help either.
`;
fs.writeFileSync(path.join(root, 'CLOUDFLARE-AI.md'), md);
console.log('wrote dist/worker.bundle.js (' + bundle.length + ' bytes) and CLOUDFLARE-AI.md');
