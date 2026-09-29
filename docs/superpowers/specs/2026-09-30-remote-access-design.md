# Remote access for the ESP32 host (pazar 0.13.x)

Status: design, awaiting the inputs listed under "Needed from the user".
Goal: the ESP32 stays the real server. Players reach it from anywhere at a permanent HTTPS address without joining the `Pazar` Wi-Fi, and the ESP also hosts the APK download.

## Architecture

```
phone / browser ──HTTPS──> Cloudflare Worker (<name>.workers.dev) ──WebSocket (ESP dials OUT)──> ESP32 ──loopback──> AsyncWebServer :80
```

- The ESP already runs the whole game. It gains a second network personality: **AP+STA**. The AP (`Pazar`, 192.168.4.1) stays for table play. The STA joins the home Wi-Fi (2.4 GHz) to reach the internet.
- The Worker is a dumb relay. One Durable Object (`hub`) holds the ESP's WebSocket and multiplexes public HTTP requests over it. No game logic, no state, no accounts.
- The ESP opens the connection outward, so there is no port forwarding, no public IP, no dynamic DNS and no PC in the loop.
- TLS terminates at Cloudflare. The ESP never serves HTTPS (which it cannot do well). The ESP-to-Worker leg is `wss://`.

## Relay protocol (JSON text frames, one WebSocket)

| Direction | Frame | Meaning |
|---|---|---|
| Worker → ESP | `{t:"req", id, method, path, headers, body?}` | body is base64, only for POST |
| ESP → Worker | `{t:"res", id, status, headers, body?}` | whole small response (base64 body) |
| ESP → Worker | `{t:"open", id, status, headers}` then `{t:"chunk", id, data}` … `{t:"end", id}` | streaming (SSE `/api/events`, large files) |
| Worker → ESP | `{t:"abort", id}` | public client went away, close the loopback socket |
| both | `{t:"ping"}` / `{t:"pong"}` every 20 s | keepalive, also lets the Worker mark the ESP offline |

- Only `x-token`, `x-now`, `content-type`, `content-length` request headers are forwarded. Cookies and `Authorization` are stripped.
- The ESP serves each `req` by calling itself over `127.0.0.1:80`. Every route, limit and auth check is reused unchanged.
- Limits: body ≤ 100 000 B (already `BODY_MAX`), at most 3 concurrent relayed SSE streams, at most 2 in-flight relayed requests. Excess gets `503 Busy, try again`.
- ESP offline: the Worker answers `503 {"error":"The table is offline"}` and the app shows it.

## Security

- The ESP authenticates to the Worker with a long random `RELAY_KEY` (Worker secret, ESP `secrets.ini`). Nobody else can take over the hub.
- Game auth is unchanged: player tokens, DM PIN, 5-try lockout. The lockout is keyed by IP, and behind the relay every client shares the relay's address, so the Worker forwards `cf-connecting-ip` as a private `x-client-ip` header that the ESP trusts **only on the loopback relay path**.
- Rate limit at the Worker per client IP (Cloudflare's free tier is enough) to protect the ESP's small heap.
- The DM PIN travels over HTTPS end to end from the phone to Cloudflare, then inside the `wss://` leg. Acceptable for a game; the DM should still change the default PIN.

## APK hosting

- `android/` builds a 15 KB WebView shell. The ESP stores it as `/www/pazar.apk` (LittleFS has 2.2 MB free) and serves it at `/pazar.apk` with `Content-Type: application/vnd.android.package-archive`.
- The DM screen shows the download link and a QR code. Over the relay the same URL works: `https://<name>.workers.dev/pazar.apk`.
- The APK embeds `https://<name>.workers.dev` as the default address (no cleartext needed). The cleartext exception for `192.168.4.1` is kept for table play.
- Debug-signed with the committed keystore. Users must allow "install unknown apps" once.

## ESP resource budget

- Heap today ~227 KB free at idle. A TLS WebSocket costs ~45 KB during the handshake and ~25 KB steady, each relayed loopback connection ~10 KB. `MIN_FREE_HEAP` (40 000) keeps guarding new connections. The budget is tight but positive; the load test (`esp/tools/sse-load.mjs`) decides the final stream caps.
- If the loopback approach proves too heavy, the fallback is a pull model: the Worker asks for snapshots instead of holding SSE streams open.

## Work plan

1. Test fixes and Hard Gamble removal (done), English app (done).
2. ESP: STA join, `/pazar.apk`, relay client (`esp/src/relay.cpp`).
3. Worker: `relay/` (wrangler project, Durable Object, protocol tests against a Node fake ESP).
4. Build the APK with the workers.dev address embedded.
5. Soak: 9 SSE clients through the relay, power-cut persistence, memory floor.
6. Docs: `esp/README.md`, CHANGELOG `[0.13.0]`, master plan update.

## Needed from the user

- Home Wi-Fi 2.4 GHz name and password in `esp/secrets.ini` (`STA_SSID`, `STA_PASS`). The file is gitignored.
- A free Cloudflare account and one `wrangler login` (a browser sign-in only the user can do).
- OK to download Gradle 8.10.2 (~130 MB) to build the APK locally.
- Permission to publish the Worker (it makes the address public).
