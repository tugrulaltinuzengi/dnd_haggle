'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tsScript = path.join(__dirname, '..', 'tools', 'tailscale.js');
const bkScript = path.join(__dirname, '..', 'tools', 'backup.js');
const skip = process.platform === 'win32';

// Sahte `tailscale` komutu: status --json ve serve/funnel çağrılarını kaydeder.
function stub({ state = 'Running', dns = 'pazar.tail1234.ts.net.', newSyntax = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-'));
  const bin = path.join(dir, 'tailscale');
  fs.writeFileSync(bin, `#!/bin/sh
echo "$@" >> "${dir}/calls.log"
case "$1" in
  status) echo '{"BackendState":"${state}","Self":{"DNSName":"${dns}"}}' ;;
  serve|funnel)
    if [ "$2" = "reset" ]; then exit 0; fi
    ${newSyntax ? 'exit 0' : 'case "$*" in *--https=443*) echo "unknown flag" >&2; exit 1;; *) exit 0;; esac'} ;;
esac
`);
  fs.chmodSync(bin, 0o755);
  return { dir, bin, calls: () => (fs.existsSync(`${dir}/calls.log`) ? fs.readFileSync(`${dir}/calls.log`, 'utf8') : '') };
}
const runTs = (s, args = [], env = {}) => spawnSync('node', [tsScript, ...args], {
  encoding: 'utf8', env: { ...process.env, TAILSCALE_BIN: s.bin, DATA_FILE: path.join(s.dir, 'data', 'data.json'), PORT: '3000', ...env },
});

test('tailscale: serve başlatır, adresi yazar', { skip }, () => {
  const s = stub();
  const r = runTs(s);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /https:\/\/pazar\.tail1234\.ts\.net/);
  assert.match(s.calls(), /serve --bg --https=443 http:\/\/localhost:3000/);
  const addr = JSON.parse(fs.readFileSync(path.join(s.dir, 'data', 'address.json'), 'utf8'));
  assert.equal(addr.url, 'https://pazar.tail1234.ts.net');
  assert.equal(addr.funnel, false);
});

test('tailscale: eski sözdizimine düşer', { skip }, () => {
  const s = stub({ newSyntax: false });
  const r = runTs(s);
  assert.equal(r.status, 0, r.stderr);
  assert.match(s.calls(), /serve --bg 3000/);
});

test('tailscale: kurulu değil / bağlı değil / MagicDNS yok net mesaj verir', { skip }, () => {
  assert.equal(spawnSync('node', [tsScript], { encoding: 'utf8', env: { ...process.env, TAILSCALE_BIN: '/yok/tailscale' } }).status, 2);
  assert.equal(runTs(stub({ state: 'NeedsLogin' })).status, 3);
  const r = runTs(stub({ dns: '' }));
  assert.equal(r.status, 4);
  assert.match(r.stderr, /MagicDNS/);
});

test('tailscale: funnel zayıf PIN ile reddedilir, güçlü PIN ile açılır', { skip }, () => {
  const s = stub();
  assert.equal(runTs(s, ['--funnel'], { DM_PIN: '1234' }).status, 5);
  assert.equal(s.calls().includes('funnel'), false);
  const ok = runTs(s, ['--funnel'], { DM_PIN: 'guclu-pin-88' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(s.calls(), /funnel --bg --https=443/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.dir, 'data', 'address.json'), 'utf8')).funnel, true);
});

test('tailscale: --stop yayını kapatır ve adres dosyasını siler', { skip }, () => {
  const s = stub();
  runTs(s);
  const r = runTs(s, ['--stop']);
  assert.equal(r.status, 0);
  assert.match(s.calls(), /serve reset/);
  assert.equal(fs.existsSync(path.join(s.dir, 'data', 'address.json')), false);
});

test('backup: data ve media klasörlerini tgz olarak yazar', { skip }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  fs.mkdirSync(path.join(d, 'data')); fs.writeFileSync(path.join(d, 'data', 'data.json'), '{"x":1}');
  fs.mkdirSync(path.join(d, 'media')); fs.writeFileSync(path.join(d, 'media', 'a.png'), 'x');
  const r = spawnSync('node', [bkScript], { encoding: 'utf8', env: { ...process.env, BACKUP_DATA_DIR: path.join(d, 'data'), BACKUP_MEDIA_DIR: path.join(d, 'media'), BACKUP_OUT_DIR: path.join(d, 'out') } });
  assert.equal(r.status, 0, r.stderr);
  const f = fs.readdirSync(path.join(d, 'out'))[0];
  assert.match(f, /^pazar-\d{8}-\d{6}\.tgz$/);
  const list = spawnSync('tar', ['-tzf', path.join(d, 'out', f)], { encoding: 'utf8' }).stdout;
  assert.match(list, /data\/data\.json/);
  assert.match(list, /media\/a\.png/);
});

test('depo denetimi: izlenen dosyalar arasında görsel yok (telif ve depo herkese açık)', () => {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  if (r.error || r.status !== 0) return; // git deposu değilse atla
  const files = r.stdout.split('\0').filter(Boolean);
  const images = files.filter((f) => /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(f));
  assert.deepEqual(images, [], `depoya görsel girmiş: ${images.join(', ')}`);
  const svgs = files.filter((f) => /\.svg$/i.test(f));
  assert.deepEqual(svgs, ['public/icon.svg']); // yalnızca kendi uygulama simgemiz
  assert.ok(!files.some((f) => /^(media|data)\//.test(f)), 'media/ ve data/ depoya girmemeli');
});
