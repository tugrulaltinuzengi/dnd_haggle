import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(root, 'app', 'public'), dst = join(root, 'esp', 'data', 'www');
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('.map') });
let total = 0;
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f), s = statSync(p); s.isDirectory() ? walk(p) : (total += s.size); } })(dst);
console.log(`synced ${total} bytes`);
if (total > 1.4e6) { console.error('too big for the LittleFS partition'); process.exit(1); }
