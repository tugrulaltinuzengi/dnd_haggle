// Heap / stability test: 1 DM + 8 players (the maximum, 9 event streams) stay connected while the DM changes the world every few seconds.
//   node esp/tools/sse-load.mjs [BASE] [seconds]
//   BASE   where the clients connect: the board (http://192.168.1.103) or the relay (https://pazar-relay.<you>.workers.dev). Default: ESP_URL.
//   ESP_URL  the board on the LAN, always used for the heap readings (/api/ping). Default http://192.168.1.103
//   DM_PIN   default 1234
// Prints heap min/max over the run, events received per client, stream restarts, and how long an ordinary request takes under load.
const ESP = process.env.ESP_URL || 'http://192.168.1.103';
const BASE = (process.argv[2] || ESP).replace(/\/$/, '');
const SECONDS = +process.argv[3] || 90;
const PIN = process.env.DM_PIN || '1234';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const post = async (base, name, body, tok) => {
  const r = await fetch(`${base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': tok || '' }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ping = async () => { const t = Date.now(); const r = await fetch(`${ESP}/api/ping`, { signal: AbortSignal.timeout(5000) }); return { ...(await r.json()), ms: Date.now() - t }; };

const dmTok = (await post(BASE, 'dm/login', { pin: PIN })).body.token;
if ((await post(BASE, 'dm/reset', {}, dmTok)).status !== 200) throw new Error('dm/reset failed');
const tokens = [];
for (let i = 1; i <= 8; i++) {
  const j = await post(BASE, 'join', { name: 'P' + i, charId: 'bard' });
  if (!j.body?.token) throw new Error('join failed: ' + JSON.stringify(j));
  tokens.push(j.body.token);
}
console.log(`base ${BASE}, ${SECONDS}s, 9 streams (DM + 8 players)`);
const before = await ping();
console.log(`heap before: free ${before.heap}, min ${before.minHeap}`);

const stats = [];
let stop = false;
const client = (label, tok) => {
  const st = { label, events: 0, opens: 0, errors: 0, last: 0, maxGap: 0 };
  stats.push(st);
  (async () => {
    while (!stop) {
      try {
        const r = await fetch(`${BASE}/api/events?token=${tok}`);
        if (r.status !== 200) { st.errors++; await sleep(1000); continue; }
        st.opens++;
        const rd = r.body.getReader(), dec = new TextDecoder();
        let buf = '';
        while (!stop) {
          const { value, done } = await rd.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            if (chunk.startsWith('data:')) { const now = Date.now(); if (st.last) st.maxGap = Math.max(st.maxGap, now - st.last); st.last = now; st.events++; }
          }
        }
        rd.cancel().catch(() => {});
      } catch { st.errors++; await sleep(500); }
    }
  })();
};
client('DM', dmTok);
tokens.forEach((t, i) => client('P' + (i + 1), t));
await sleep(3000);

const samples = [];
const lat = [];
const t0 = Date.now();
let n = 0;
while (Date.now() - t0 < SECONDS * 1000) {
  await post(BASE, 'dm/newday', {}, dmTok);          // broadcasts a fresh snapshot to every stream
  const t = Date.now();
  const p = await fetch(`${BASE}/api/ping`).then((r) => r.status).catch(() => 0);   // an ordinary request while all streams are busy
  lat.push({ ms: Date.now() - t, status: p });
  try { samples.push(await ping()); } catch { samples.push(null); }
  if (++n % 10 === 0) { const s = samples.filter(Boolean).at(-1); console.log(`+${Math.round((Date.now() - t0) / 1000)}s heap ${s?.heap} min ${s?.minHeap} sse ${s?.sse}`); }
  await sleep(2500);
}
stop = true;
await sleep(500);
const ok = samples.filter(Boolean);
const heaps = ok.map((s) => s.heap), mins = ok.map((s) => s.minHeap);
console.log('\n--- result ---');
console.log(`heap free: min ${Math.min(...heaps)}, max ${Math.max(...heaps)}; lowest ever (minHeap): ${Math.min(...mins)}; ping failures: ${samples.length - ok.length}`);
console.log(`ordinary request under load: ${lat.filter((l) => l.status === 200).length}/${lat.length} ok, median ${lat.map((l) => l.ms).sort((a, b) => a - b)[lat.length >> 1]} ms, worst ${Math.max(...lat.map((l) => l.ms))} ms`);
for (const s of stats) console.log(`${s.label.padEnd(3)} events ${String(s.events).padStart(3)}  opens ${s.opens}  errors ${s.errors}  longest gap ${(s.maxGap / 1000).toFixed(1)}s`);
const bad = stats.filter((s) => s.events < n / 2 || s.maxGap > 40000);
console.log(bad.length ? `WARNING: ${bad.map((s) => s.label).join(', ')} missed events` : 'all 9 streams received the broadcasts');
const after = await ping();
console.log(`heap after: free ${after.heap}, min ${after.minHeap}, streams ${after.sse}`);
process.exit(bad.length || Math.min(...mins) < 40000 ? 1 : 0);
