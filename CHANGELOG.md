# Changelog — pazar (dnd_haggle)

All notable changes to this app. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/).
Cross-app status and compatibility: `docs/superpowers/plans/2026-09-29-table-sync-master.md` (single source of truth).
History before 0.12.3: `PROJE.md` §12.

## [Unreleased]

## [0.14.0] - 2026-09-30
Haggling moves to the table: players haggle with the DM in person and the app records the result. **Breaking** for the API and saved worlds (old saves are migrated on load).
### Changed
- **Offers settle the moment they are accepted.** A player offer (`bid`) accepted by the DM, or a DM counter accepted by the player, moves gold, the item, stock and the ledger at once. Not enough gold or no stock refuses the accept and keeps the offer open. The Weekly Market no longer delivers anything; `dm/weekly` just starts a new week (and day).
- Player offers only need to be below the list price (the 25 % floor went with the engine); DM counters may be any price.
- Player item page: **Make offer** (price + note) and **Buy at list price**, with the merchant's counter shown right there. DM Live tab: offers waiting for an answer.
- Leftover Turkish messages on the ESP32 are English now (`At capacity, try again`, `Media storage is full`, `(copy)`).
### Added
- `dm/close {playerId, merchantId, closed}`: the DM closes a merchant to one player for the day (reopens on New Day or by hand). Views: player `merchants[].closed`, DM `closed[]`.
- Items have `hidden`: hidden items are invisible to players and cannot be bought or bid on.
- Node refuses a 9th player like the ESP32 (`The table is full (at most 8 players).`).
- `app/test/migrate.test.js`: a pre-0.14 save loads cleanly.
- **Relay watchdog (ESP32):** a text ping every 20 s that the Worker answers; a link that stays silent or never stays up for 30 s is dialed again, and after 4 failed attempts the board reboots.
- `esp/tools/sse-load.mjs`: 9 event streams with heap sampling, over the LAN or through the relay.
### Removed
- The dice haggle (`offer`), `insight`, advantage, merchant types, mood/patience, affinity and its settings (`dm/affinity`, `dm/affsettings`), `dm/line`, `dm/setprice`, `dm/dice`, character skill bonuses, the rules engine and its 688 conformance vectors (`app/engine.js`, `esp/lib/engine`, `pio test -e native`).

## [0.13.0] - 2026-09-30
### Added
- **ESP32 host:** the whole app runs on an ESP32 (`esp/`): its own Wi-Fi "Pazar" (WPA2, 192.168.4.1) with a captive portal, state in LittleFS, the same routes, messages and game engine as `app/server.js` (688 shared conformance vectors; the HTTP parity suite, 25 tests, runs against Node or the board).
- **Remote access without joining the table's Wi-Fi:** a Cloudflare Worker + Durable Object relay (`relay/`, free `*.workers.dev` address). The ESP32 dials out over TLS (root CA embedded from the Windows store, no download), so nothing on the home network is exposed. Relayed event streams are fed straight from the state and renewed every 30 s; PIN lockout counts the real client address.
- **Android app** (`android/`, thin WebView shell): binds to the table Wi-Fi for 192.168.4.1, otherwise uses the relay address. The DM's Players tab shows a QR and a download link when the board serves `/pazar.apk`.
- `esp/tools`: `sync-web.mjs`, `build-apk.ps1`, `relay-ca.ps1`, `parity-on-esp.ps1`.
### Changed
- **The whole app is in English** (UI, server messages, CSV export).
### Removed
- **Hard Gamble** (the "damaged item" mechanic) and its `damaged` flag.

## [0.12.3] - 2026-09-29
### Added
- **DM password change:** in the DM's **Ayar** tab ("DM şifresi"): current PIN/password, new password (6–64 characters, any text), and a repeat field.
  - The new password is stored as a salted scrypt hash in `data.json` (`settings.dmPass`) and is never kept in plain text or sent to clients.
  - Changing it signs out every other DM session and closes their live connections.
  - Until the first change, `DM_PIN` stays the login.
- **Forgotten password:** start the server once with `DM_PASSWORD_RESET=1`, and `DM_PIN` works again.
### Changed
- The DM login field accepts text (PIN or password), not just digits.
