#!/usr/bin/env node
'use strict';
// Sunucuyu Tailscale üzerinden HTTPS ile yayınlar: npm run tailscale [-- --funnel | --stop]
//   --funnel  herkese açık adres (Tailscale kurmayan oyuncu için). Güçlü DM_PIN (>= 8 karakter) ister.
//   --stop    yayını kapatır.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BIN = process.env.TAILSCALE_BIN || 'tailscale';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'data.json');
const ADDRESS_FILE = path.join(path.dirname(DATA_FILE), 'address.json');
const args = process.argv.slice(2);
const funnel = args.includes('--funnel');
const stop = args.includes('--stop');

const run = (a) => spawnSync(BIN, a, { encoding: 'utf8' });
const die = (code, msg) => { console.error(msg); process.exit(code); };

const st = run(['status', '--json']);
if (st.error) die(2, `Tailscale bulunamadı (${BIN}). Kur: https://tailscale.com/download`);
let status;
try { status = JSON.parse(st.stdout); } catch { die(3, 'Tailscale durumu okunamadı. Giriş yaptın mı? (tailscale up)'); }
if (status.BackendState !== 'Running') die(3, `Tailscale çalışmıyor (durum: ${status.BackendState}). Giriş yap: tailscale up`);
const dns = String((status.Self && status.Self.DNSName) || '').replace(/\.$/, '');
if (!dns) die(4, 'Cihazın MagicDNS adı yok. Tailscale yönetim panelinde MagicDNS ve HTTPS sertifikalarını aç: https://login.tailscale.com/admin/dns');

if (stop) {
  run([funnel ? 'funnel' : 'serve', 'reset']);
  try { fs.unlinkSync(ADDRESS_FILE); } catch {}
  console.log('Yayın kapatıldı.');
  process.exit(0);
}
if (funnel && String(process.env.DM_PIN || '').length < 8) {
  die(5, 'Funnel herkese açıktır. DM_PIN en az 8 karakter olmalı (DM_PIN=... npm run tailscale -- --funnel).');
}

const target = `http://localhost:${PORT}`;
const verb = funnel ? 'funnel' : 'serve';
let r = run([verb, '--bg', '--https=443', target]);
if (r.status !== 0) r = run([verb, '--bg', String(PORT)]); // eski/yeni CLI sözdizimi farkı
if (r.status !== 0) die(6, `Yayın başlatılamadı:\n${(r.stderr || r.stdout || '').trim()}`);

const url = `https://${dns}`;
fs.mkdirSync(path.dirname(ADDRESS_FILE), { recursive: true });
fs.writeFileSync(ADDRESS_FILE, JSON.stringify({ url, funnel, at: new Date().toISOString() }));
console.log(`${funnel ? 'Herkese açık' : 'Tailscale ağında'} adres: ${url}`);
console.log('Oyuncular bu adresi telefonda ya da PC tarayıcısında açar (Tailscale bağlı olmalı' + (funnel ? ', Funnel ile gerekmez' : '') + ').');
