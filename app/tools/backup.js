#!/usr/bin/env node
'use strict';
// Yedek: data/ ve media/ klasörlerini tarihli bir .tgz olarak backups/ altına yazar. npm run backup
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dataDir = path.resolve(process.env.BACKUP_DATA_DIR || path.join(root, 'data'));
const mediaDir = path.resolve(process.env.BACKUP_MEDIA_DIR || path.join(root, 'media'));
const outDir = path.resolve(process.env.BACKUP_OUT_DIR || path.join(root, 'backups'));

const items = [dataDir, mediaDir].filter((d) => fs.existsSync(d));
if (!items.length) { console.error('Yedeklenecek klasör yok (data/, media/).'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const d = new Date(), z = (n) => String(n).padStart(2, '0');
const file = path.join(outDir, `pazar-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.tgz`);
const args = ['-czf', file];
for (const it of items) args.push('-C', path.dirname(it), path.basename(it));
const r = spawnSync('tar', args, { encoding: 'utf8' });
if (r.error || r.status !== 0) { console.error(`tar çalışmadı: ${(r.error && r.error.message) || r.stderr}`); process.exit(2); }
console.log(`Yedek yazıldı: ${file}`);
