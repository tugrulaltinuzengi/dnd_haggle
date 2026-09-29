# pazar on the ESP32: design

**Date:** 2026-09-29 · **Status:** approved by the user ("First this work")
**Single source of truth for status, versions and decisions:** `docs/superpowers/plans/2026-09-29-table-sync-master.md`, where this is Phase 0 and first priority.

## 1. Goal

pazar runs **entirely on the ESP32 on COM11**, with no PC and no cloud. Players join the ESP's own Wi-Fi, and the phone app opens pazar with no setup. The PC is only used to build and flash.

**Hardware:** ESP32-D0WD-V3 (rev 3.1), dual core at 240 MHz, **no PSRAM** (about 300 KB usable heap), **4 MB flash**, CP210x USB-UART on COM11, MAC `14:2b:2f:c1:5f:88`.

**Non-goals:**
- internet access;
- table sync (the Damerung/Theatre Box API), which comes later on the same firmware;
- OTA updates;
- HTTPS.

## 2. Decisions

| # | Decision |
|---|---|
| E1 | **The ESP creates its own Wi-Fi:** SSID `Pazar`, WPA2 with a password set in `secrets.ini`, fixed IP **192.168.4.1**. A **captive-portal DNS** answers every name with 192.168.4.1, so phones that join open pazar by themselves. |
| E2 | **Stack:** Arduino framework via PlatformIO (`espressif32` platform, already installed), `ESP32Async/ESPAsyncWebServer` + `AsyncTCP` (HTTP and SSE), ArduinoJson 7, LittleFS. |
| E3 | **Feature parity with pazar 0.12.3:** join, market, haggling, Hard Gamble, Insight, offers/bids, the weekly market, affinity (DM-configurable), the ledger plus CSV, all DM actions, the invite QR, and the DM password. **The HTTP API and SSE snapshot shapes are identical to Node's**, so the web client (`app/public`) runs unchanged, apart from what E6 lists. |
| E4 | **Parity proof:** a **black-box HTTP suite** (`app/test/http/`) takes a `BASE` URL. It must pass against the Node server **and** against the ESP. The C++ engine must also pass all **688** `conformance/haggle-vectors.json` cases in a native (PC) PlatformIO test. |
| E5 | **Capacity limits:** up to 9 SSE clients (8 players + DM); ledger up to 200 entries; log up to 40; up to 12 merchants, 80 items and 8 players. Images: item main ≤120 KB, thumb ≤60 KB, portrait ≤120 KB, **1.2 MB media quota in total**. Over-limit requests return 413/400 with Turkish messages. |
| E6 | **Differences from Node:** the DM password hash is **PBKDF2-HMAC-SHA256** (mbedtls, 10 000 iterations) instead of scrypt, which is fine because the data files are separate. `/api/address` returns `{url:"http://192.168.4.1"}`. The service worker does nothing on plain HTTP, which is harmless. |
| E7 | **Persistence:** state lives in one ArduinoJson document, saved to LittleFS `/data.json` with a 1 s debounce; a write goes to `/data.tmp` and is then renamed, so a power cut can't corrupt the file. Media is stored under `/media/{items,portraits}/`. |
| E8 | **Web files:** `tools/sync-web.mjs` copies `app/public/**` into `esp/data/www/`, and `pio run -t uploadfs` flashes them. Node's `app/public` stays the only source. |
| E9 | **Dev networking:** firmware built with `-DDEV_STA` *also* joins the home Wi-Fi (credentials in the gitignored `secrets.ini`), so the PC can run the HTTP suite without leaving its own network. Release builds are AP-only. |
| E10 | **APK:** built with the address `http://192.168.4.1`. Cleartext HTTP is allowed only for `192.168.4.1` (plus the existing `ts.net`). The app **binds its traffic to Wi-Fi**, so phones don't send it over mobile data when the Wi-Fi has no internet. `versionCode` is 100+, so it installs over every CI build. It is built locally with the cached Gradle 8.10.2 and the local Android SDK. |
| E11 | **Test hooks:** only in test firmware, `-DDICE_FIXED=20` makes dice deterministic (as Node's `DICE_FIXED` does), and `-DDM_PIN_DEFAULT=...` sets the first DM PIN. Release firmware uses real randomness (`esp_random`), and its first PIN comes from `secrets.ini`. |
| E12 | **Versions:** this ships as **pazar 0.13.0** (Node server and ESP firmware share the version). Table sync moves to **0.14.0** (`tableApi` 1). |

## 3. Architecture (firmware, `esp/`)

```
esp/
  platformio.ini        env:esp32 (release), env:esp32-dev (DEV_STA+test hooks), env:native (engine tests)
  partitions.csv        nvs 20K · otadata 8K · app 1.75M · littlefs ~2.2M
  secrets.ini.example   AP_PASS, DM_PIN_DEFAULT, STA_SSID, STA_PASS (secrets.ini is gitignored)
  lib/engine/           engine.h/.cpp: haggle rules, a 1:1 port of app/engine.js (no Arduino deps)
  src/main.cpp          Wi-Fi AP (+STA in dev), DNS captive portal, LittleFS mount, server start
  src/state.*           state document, seed, load/save (atomic), lookups
  src/views.*           playerView / dmView JSON (the same fields as server.js)
  src/actions.*         player (P) and DM (D) actions, a port of server.js
  src/http.*            routes, auth, readBody, SSE broadcast, media, CSV, PIN lockout
  src/media.*           sniffImage, limits, quota
  test/test_engine/     native Unity test that replays haggle-vectors.json
  tools/sync-web.mjs    copies app/public into data/www
```

**Request flow:**
1. An AsyncWebServer handler collects the body, up to 100 KB.
2. It calls `api(name, body, token)`, which returns `{status, json}`.
3. On success, `broadcast()` marks the state dirty.
4. A loop task, at most every 150 ms, builds **one DM view and one view per connected player**, sends each to its SSE clients, and schedules a save.

All state access happens on one FreeRTOS mutex.

## 4. Error handling

- JSON parse errors return 400 `Geçersiz JSON`. Unknown routes return 404 `Yok`.
- Handler failures use the same Turkish messages as `server.js`.
- A heap below 40 KB rejects new SSE clients with 503 `Kapasite dolu` and logs the event.
- If `data.json` is corrupt, the firmware boots from `seed()` and keeps the bad file as `/data.bad`.

## 5. Testing

1. **Native:** `pio test -e native` runs 688 engine vectors.
2. **HTTP suite against Node:** `node --test app/test/http/`, with `BASE` unset, starts a Node server using `DICE_FIXED=20`.
3. **HTTP suite against the ESP:** `BASE=http://<esp-sta-ip> node --test app/test/http/`, using the dev firmware.
4. **Power cycle:** after creating state, reset the board via RTS and check that the state survives.
5. **Manual phone check:** join the "Pazar" Wi-Fi, the portal opens, the APK opens straight into pazar, and the DM password change works.
