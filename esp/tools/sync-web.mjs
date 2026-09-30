import { cpSync, rmSync, mkdirSync, readdirSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(root, 'app', 'public'), dst = join(root, 'esp', 'data', 'www');
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('.map') });
// The Android shell is served by the ESP itself as /pazar.apk (built by esp/tools/build-apk.ps1).
const apk = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (existsSync(apk)) { copyFileSync(apk, join(dst, 'pazar.apk')); console.log('added pazar.apk'); } else console.log('no APK built yet (esp/tools/build-apk.ps1), /pazar.apk will not exist');
let total = 0;
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f), s = statSync(p); s.isDirectory() ? walk(p) : (total += s.size); } })(dst);
console.log(`synced ${total} bytes`);
if (total > 1.4e6) { console.error('too big for the LittleFS partition'); process.exit(1); }
