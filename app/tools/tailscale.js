#!/usr/bin/env node
'use strict';
// Publishes the server over HTTPS through Tailscale: npm run tailscale [-- --funnel | --stop]
//   --funnel  public address (for players without Tailscale). Requires a strong DM_PIN (>= 8 characters).
//   --stop    stops publishing.
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
if (st.error) die(2, `Tailscale not found (${BIN}). Install it: https://tailscale.com/download`);
let status;
try { status = JSON.parse(st.stdout); } catch { die(3, 'Could not read the Tailscale status. Are you logged in? (tailscale up)'); }
if (status.BackendState !== 'Running') die(3, `Tailscale is not running (state: ${status.BackendState}). Log in: tailscale up`);
const dns = String((status.Self && status.Self.DNSName) || '').replace(/\.$/, '');
if (!dns) die(4, 'This device has no MagicDNS name. Enable MagicDNS and HTTPS certificates in the Tailscale admin panel: https://login.tailscale.com/admin/dns');

if (stop) {
  run([funnel ? 'funnel' : 'serve', 'reset']);
  try { fs.unlinkSync(ADDRESS_FILE); } catch {}
  console.log('Publishing stopped.');
  process.exit(0);
}
if (funnel && String(process.env.DM_PIN || '').length < 8) {
  die(5, 'Funnel is public. DM_PIN must be at least 8 characters (DM_PIN=... npm run tailscale -- --funnel).');
}

const target = `http://localhost:${PORT}`;
const verb = funnel ? 'funnel' : 'serve';
let r = run([verb, '--bg', '--https=443', target]);
if (r.status !== 0) r = run([verb, '--bg', String(PORT)]); // old/new CLI syntax difference
if (r.status !== 0) die(6, `Could not start publishing:\n${(r.stderr || r.stdout || '').trim()}`);

const url = `https://${dns}`;
fs.mkdirSync(path.dirname(ADDRESS_FILE), { recursive: true });
fs.writeFileSync(ADDRESS_FILE, JSON.stringify({ url, funnel, at: new Date().toISOString() }));
console.log(`${funnel ? 'Public' : 'Tailscale network'} address: ${url}`);
console.log('Players open this address on a phone or in a PC browser (Tailscale must be connected' + (funnel ? ', not needed with Funnel' : '') + ').');
