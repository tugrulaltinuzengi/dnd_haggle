# HANDOFF — pazar ESP32 hosting (branch `esp-host`)

Repo: `D:\Dekstop\Coding\pazar\dnd_haggle` (GitHub tugrulaltinuzengi/dnd_haggle). Kullanıcı Türkçe/İngilizce karışık yazar; Türkçe cevap ver.
Governance: `docs/superpowers/plans/2026-09-29-table-sync-master.md` (branch `table-sync`) tek doğruluk kaynağı. Her alt uygulamanın kendi CHANGELOG.md + SemVer + `vX.Y.Z` tag'i var. **Push/tag/publish için kullanıcıdan açık onay al.** Telifli asset commit etme, DM şifresini düz metin saklama.

## Hedef (kullanıcının 1. önceliği)
Pazar'ı COM11'deki ESP32'de barındır. ESP kendi Wi-Fi'ını açar: SSID `Pazar`, WPA2, kanal 6, IP `192.168.4.1`, captive DNS. Sürüm **0.13.0** (table-sync 0.14.0'a kayar).

## Belgeler
- Spec: `docs/superpowers/specs/2026-09-29-esp-host-design.md` (E1–E12)
- Plan (12 görev): `docs/superpowers/plans/2026-09-29-esp-host.md`
- Master plan: `docs/superpowers/plans/2026-09-29-table-sync-master.md` (table-sync branch)

## Dosyalar
- `esp/platformio.ini` (envs: `esp32`, `esp32-dev` [-DDEV_STA], `native` [Unity]), `esp/extra_script.py`, `esp/partitions.csv`
- `esp/secrets.ini` (gitignored): AP_PASS, DM_PIN=1234, STA_SSID=REPLACE, STA_PASS
- `esp/lib/engine/engine.{h,cpp}` — `app/engine.js`'nin 1:1 portu; `esp/test/test_engine/` 688 vektör geçiyor
- `esp/src/`: `util, state, auth, actions, views, media, http, config.h, main.cpp` (`main.cpp` düzenlemeleri commit'lenmedi: AP-only mantığı, WiFi event log, `WiFi.setTxPower(11dBm)`)
- `esp/tools/sync-web.mjs` (app/public → esp/data/www), `esp/tools/gen-vectors.mjs`
- `app/server.js` (Node referansı; dev hook'ları `DEV_RESET`, `dm/reset`, `dm/dice`, `GET /api/limits`), `app/public/app.js` (`x-now` header, `uploadImage` limit döngüsü)
- `app/test/http/parity.test.js` + `_helpers.js` — 25 test, ESP'ye karşı çalışır

## Durum
- Bitti: spec/plan, engine portu, Node parity 25/25, tam firmware portu (derlenir, açılır, heap ~227 KB, `softAP start: OK`). Son flash: `esp32-dev`, TX 11 dBm, sürüm 0.13.0 up.
- Commit'ler: 3cc4177 spec, 404008b plan, 7c68a25 iskelet, 2ad101d engine, e03f167 HTTP suite, 1b48d68 firmware.
- **Açık sorun:** Windows PC "Pazar" ağını görmüyor / "Bu ağa bağlanılamıyor". COM11 zaman zaman USB'den düşüyor. Şüpheler: USB güç/brownout, kanal 6 (bazı ESP32'lerde 1/5/11 daha iyi). Sonraki adım: seri logda `Brownout` ara; kablo/port değiştir (arka panel, kısa data kablosu); gerekirse `WiFi.softAP(..., channel=1 veya 11)`. Ağ gizli (hidden) olabilir: parametre `0` = görünür; telefonla da dene.
- Son tur: kullanıcı "pc bağlandı, testleri çalıştır" dedi ama daha önce PC hep ev Wi-Fi'ında (FiberHGW_ZTX26X) kalmıştı. Doğrulanmadı.

## Komutlar
```bash
# derle+flash (sistem pio bozuk; penv pio kullan)
cd esp && "$HOME/.platformio/penv/Scripts/pio.exe" run -e esp32-dev -t upload --upload-port COM11
# native testler için PATH'e C:\msys64\ucrt64\bin
"$HOME/.platformio/penv/Scripts/pio.exe" test -e native
# önce doğrula: PC gerçekten Pazar'da mı?
netsh wlan show interfaces        # SSID = Pazar olmalı
curl http://192.168.4.1/api/ping  # JSON, version 0.13.0
# ESP parity (app/ içinden)
BASE=http://192.168.4.1 DM_PIN=1234 PIN_LOCK_MS=1500 node --test test/http/parity.test.js
```
PC Pazar'a bağlıyken internet yok (kullanıcı bunu kabul etti).

## Kalan işler
1. PC'yi Pazar'a bağla, parity'yi ESP'de çalıştır, hataları düzelt; `main.cpp`'yi commit'le.
2. `esp/tools/sse-load.mjs` yaz: 9 SSE istemcisiyle heap ölç; güç kesme testi (state kalıcı mı), soak; `esp/README.md`.
3. Release firmware: env `esp32` (AP-only, DEV_STA yok), gerçek DM_PIN/AP_PASS.
4. **Task 11 APK:** adres `http://192.168.4.1` gömülü, o IP için cleartext, Wi-Fi'a process bind (ConnectivityManager), `versionCode` ≥ 100, Gradle 8.10.2 + Java 17 yerel build; auto-login localStorage ile mevcut. APK'yı kullanıcıya gönder.
5. **Task 12:** CHANGELOG `[0.13.0]`, `app/package.json` → 0.13.0, master planı güncelle (Faz 0 ESP tamam; table-sync → 0.14.0; Faz 1 Task 8'de CHANGELOG oluşturmak yerine girdi ekle), memory `dnd-table-sync.md` (ESP pivot).
6. **Uzaktan erişim** (planda "0.13.x uzaktan erişim" olarak ekle): önce seçenek 1 (ESP ev Wi-Fi'ına da katılır + PC köprüsü: Tailscale Funnel/Cloudflare Tunnel), sonra seçenek 3 (ESP'de WireGuard).
7. İsteğe bağlı: DM ekranında Wi-Fi QR kodu. Table-sync Faz 1–3 kullanıcı isteyene kadar duraklatıldı.

## Bilinen tuzaklar
- Test hook'ları sadece dev'de (`DEV_STA` build / `DEV_RESET=1`); release'te olmamalı.
- Limitler: 8 oyuncu, 12 tüccar, 80 eşya, ledger 200, log 40, medya item 120KB/thumb 60KB/portrait 120KB, kota 1.2MB, body 100000 B, MIN_FREE_HEAP 40000.
- ESP'de RTC yok: tarayıcı `x-now` gönderir.
- Bash heredoc'ta `\xC3` kaçışları UTF-8'i bozar; Write/Edit kullan.
