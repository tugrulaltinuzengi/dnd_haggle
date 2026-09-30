# Pazar: Real-life haggling, Lobby + Sheets, SRD in D1, Damerung link — Staged Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`.
> Repo `D:\Dekstop\Coding\pazar\dnd_haggle`, branch `esp-host` (unpushed b720471, 4ce49d3). Damerung: `D:\Dekstop\Coding\dnd_player` (`main`).
> Talk to the user in Turkish; the app UI stays English.

## Context

User requests (2026-09-30): delete all users; players **haggle in real life, no dice**; lobby screen; easy own-character entry incl. Damerung sheet import; 5e SQL database; Damerung inventory/gold sync.
Decisions (user answers):
- **Haggle flow:** player types an offer in the app → DM (playing the merchant, after the table-talk) **Accept / Counter / Reject**; acceptance settles **immediately** (gold deducted, item into inventory). "Buy at list price" stays.
- **Old engine removed entirely** from Node and ESP: dice, patience/rep, merchant mood/types, insight roll, negotiations, advantage, 688 conformance vectors.
- **Extra rules:** automatic rules go; DM can manually close a merchant to a player for the day and hide/show items. **Affinity removed.**
- **SRD:** pure SRD 5.1 (CC-BY-4.0) re-fetched from open5e `document__slug=wotc-srd`; Damerung's mixed `content/5e-srd` (untraceable Kobold/OGL records) and bg3/skyrim are not used.
- **Characters live at the table** (`p.sheet` in pazar state) + browser localStorage copy; everything works in offline AP mode; D1 only powers SRD lookup (hidden when offline).
- **"Damerung interface"** = Electron Damerung connects to pazar (existing Phase-2 plan, trimmed).
- **Unified UI** with tactile "pushed" buttons and sound effects (library researched here, final picks made with the user in an audition step); free D&D-style portraits, item pictures and a logo; **5e icons first**.
- **Staged releases**, each: tests green, CHANGELOG, approval before push/tag/deploy: 0.14.0 real haggling → 0.15.0 unified UI/sound/icons/art → 0.16.0 lobby + sheets → 0.17.0 SRD in D1 → 0.18.0 + Damerung 0.2.0 link.

Key code facts:
- Two ports must change together: `app/server.js` (Node) and `esp/src/{actions,views,http,state}.cpp`; `app/test/http/parity.test.js` (25 tests, exact view key sets at 78-111) runs against both (`BASE=`).
- The offer "CRM" already exists and is reused: `P.bid`, `P.bidreply` (accept/counter/withdraw), `D.bidreply` (accept/counter/reject), `D.bidsend`, `OPEN`, `hist`, `offerView` (`server.js:215-224, 308-338, 405-427`). Today accepted offers are only delivered in `D.weekly` (428-449) — that settle logic moves to acceptance time.
- Engine users in Node: `require('./engine')` → `E.haggle, newNegotiation, moodOf, APPROACHES, TYPES, MIN_RATIO, round`. ESP: `esp/lib/engine/*`, `esp/test/test_engine/*`.
- Player cap (8) exists only on ESP (`http.cpp:166-184`, `config.h MAX_PLAYERS`); `dm/reset` is dev-only on both.

---

## Stage 0 — delete all users now

- [ ] ESP (dev firmware, only test debris): `node scratchpad/reset.mjs http://192.168.1.103` (DM login 1234 + `dm/reset`); confirm DM view `players: []`. Delete local `app/data/data.json` if present.

---

## Stage 1 — 0.14.0: real-life haggling (Node + ESP + PWA)

Detailed plan with full code per step is written first to `docs/superpowers/plans/2026-09-30-real-haggle.md` and committed.

### Behaviour
- `POST /api/bid {merchantId, itemId?|itemName, price, note}` (unchanged) — player offer; for listed items `0 < price < list` (the 25 % floor goes with the engine). Max 10 open offers (unchanged).
- DM `dm/bidreply accept` and player `bidreply accept` (of a DM counter) now call **`settle(o)`** immediately: checks player exists, item exists/not sold out/not hidden, gold ≥ price → deduct, push inventory `{id,itemId,name,paid,magical}`, stock−1, `book('offer',…)`, status `settled`, hist `delivered`. On failure the accept call fails with the reason (`Not enough gold.`, `Sold out.`, `Item is gone`) and the offer stays open. DM counters may be any positive price (DM can raise it).
- `P.accept` → rename semantics to **buy at list price** (no negotiation lookup), same `grant` minus affinity.
- `D.weekly` becomes week+1 + newday only (no deliveries; there are no `accepted` offers any more). Status `accepted` disappears from `OPEN`.
- DM manual controls: `dm/close {playerId, merchantId, closed:bool}` (closed for that player until the next day; stored in existing `S.bans` = day) ; item field `hidden:bool` via `dm/item` (hidden items are omitted from player views and cannot be bid/bought).
- Merchants lose `type` (form no longer requires it); `D.merchant` validates name/emoji only.
- Removed: `P.offer`, `P.insight`, `D.line`, `D.setprice`, `D.dice`, `D.affsettings`, `D.affinity`, `S.negs/revealed/insightTries/affinity/affinityWeek`, `p.advantage`, `chars.json` `bonus` field, view keys `negs, affinity, settings.affinity, revealed, insightTried, mood`, `item.minAffinity/locked`.
- Migration on load (both ports): drop removed keys, drop merchant `type`, convert any `accepted` offers to `new` (DM re-accepts → settles).
- Node gets `MAX_PLAYERS = 8` (parity with ESP).

### Files
- `app/server.js`: remove engine require; local `round2`; new `settle`; edit P/D as above; views (227-267) slimmed; seed merchants without type; load-time migration (line 115).
- Delete `app/engine.js`, `app/test/engine.test.js`, `app/test/vectors.test.js`, `app/conformance/`, `app/tools/gen-vectors.js`; `app/package.json` drop `vectors` script.
- `app/public/app.js` + `style.css`: player item card → **Make offer** (price + note) and **Buy at list price**; offers tab shows DM counter with Accept/Counter/Withdraw; remove dice/approach/mood/insight/affinity UI. DM: live tab offer inbox (Accept/Counter/Reject with note), per-player "close merchant today" toggle, item hidden toggle; remove affinity settings. `sw.js` cache `pazar-v2`.
- `app/public/chars.json`: drop `bonus`.
- ESP: delete `esp/lib/engine/`, `esp/test/test_engine/`, `esp/tools/gen-vectors.mjs`, `native` env in `esp/platformio.ini`; mirror server changes in `esp/src/actions.cpp` (settle, close, remove offer/insight/line/setprice/dice/aff*), `views.cpp`, `state.cpp` (`seedWorld`, `ensureShape` migration), `http.cpp`. Fix leftover Turkish strings (`actions.cpp:335`, `http.cpp:306`, `media.cpp:119`) to the Node English texts.
- Tests: rewrite haggle parts of `app/test/api.test.js` and `app/test/http/parity.test.js`: offer→DM accept settles (gold, inventory, stock, ledger); accept with too little gold fails and keeps offer open; counter→player accept settles; reject; withdraw; list-price buy; hidden item not visible/not biddable; DM close blocks bids for that player until newday; 9th player rejected; view key sets updated. `app/test/e2e.js` updated for new UI.
- Docs: `PROJE.md` rules, `CHANGELOG.md [0.14.0]` (Removed/Changed — breaking), `app/package.json` + `esp/src/config.h PAZAR_VERSION` 0.14.0.

### Verification
- `cd app && npm test`; parity on Node: `DM_PIN=1234 PIN_LOCK_MS=1500 node --test --test-timeout=120000 --test-force-exit test/http/parity.test.js`.
- `node esp/tools/sync-web.mjs`, `pio run -e esp32-dev -t upload` + `-t uploadfs` (retry loop), parity with `BASE=http://192.168.1.103` and `BASE=https://pazar-relay.tugrulaltinuzengi.workers.dev`; `node esp/tools/sse-load.mjs` (heap min > 40 KB).
- Browser pane: player offers, DM counters, player accepts → gold/inventory update live on both screens.
- Ask approval → push `esp-host` + tag `v0.14.0`.

---

## Stage 2 — 0.15.0: unified UI, pushed buttons, sound, 5e icons, portraits

Plan doc `docs/superpowers/plans/2026-09-30-unified-ui.md`. Done after Stage 1 (the dice UI is gone, so nothing is restyled twice) and before the lobby (built on the kit).

**Unified UI = one visual language for pazar and Damerung.** Damerung already ships Kenney CC0 UI art (`dnd_player/app/src/assets/ui/`: `buttonLong_beige/_brown(+_pressed)`, `buttonSquare_brown(_pressed)`, `panel_beige/brown`, `panelInset_*`, Fantasy UI Borders frames, RPG-expansion bars, cursors, 104 KB total, credits in `CREDITS.md`). Pazar adopts the same assets and tokens; Damerung's Pazar section (Stage 5) uses the same classes. Per D6 (no shared npm package) the kit is a copied folder with a version line.
- Create `app/public/ui/ui.css` with design tokens (colors, radii, spacing, fonts) and components: `.btn` (primary/secondary/danger/icon, 9-slice `border-image` from the Kenney PNGs, **pushed feel** = `:active` swaps to the `_pressed` art + `translateY(2px)`, 60 ms transition, `navigator.vibrate(8)` where supported), `.panel`, `.inset`, `.card`, `.tabbar`, `.chip`, `.toast`, `.dialog`, `.coin` (gp/sp/cp display), `.portrait`. Copy the used Kenney PNGs to `app/public/ui/kenney/` with `CREDITS.md`.
- Fonts (SIL OFL, bundled as woff2 subsets for offline ESP, ~40 KB each): **Cinzel** (headings, logo), **IM Fell English** (flavor text); numbers/body stay system sans for legibility.
- Restyle every screen in `app/public/app.js` to use only kit classes; remove ad-hoc styles from `style.css` (keep it for layout only).
- Logo: wordmark "Pazar" in Cinzel + a game-icons emblem (e.g. `swap-bag`/`coins`), exported as SVG + PWA icons (`manifest.webmanifest`, Android shell launcher icon).

**Icons — 5e first.** game-icons.net (CC BY 3.0, 4180 SVGs, repo `github.com/game-icons/icons`; attribution "Icons made by {author}. Available on https://game-icons.net"). The 5e mapping already exists: Damerung's `content/5e-srd/*.json` `icon` field holds game-icons slugs for SRD items/spells/classes (only the slug↔name mapping is reused, not the mixed text).
- Create `app/tools/build-icons.mjs`: reads a curated list (`app/icons.json`: 12 SRD classes, 9 SRD species, 8 spell schools, item types weapon/armor/potion/ring/rod/scroll/staff/wand/wondrous/gear/tool, rarities, coins, merchant, UI glyphs) → one SVG sprite `app/public/ui/icons.svg` (`<symbol id="gi-<slug>">`, `currentColor`), ~60-120 KB. `<svg><use href="/ui/icons.svg#gi-sword">`.
- Item cards show the type icon (or DM image); DM item form gets an icon picker from the sprite; `item.icon` (slug) field added to both ports (validated against a slug regex, ≤40 chars).

**Portraits and item pictures** (CC0 preferred, CC-BY acceptable with credits; never commit unlicensed art — Damerung's `assets/portraits/` and `backgrounds/` have no recorded license and are NOT reused):
| Use | Source | License | Notes |
|---|---|---|---|
| Player/merchant portraits (painted) | Justin Nichol "Creative Commons Fantasy Portrait Marathon" (108 portraits, OGA) / "Flare Portrait Pack Resized" | CC-BY-SA 4.0 / CC-BY-SA 3.0 | Most D&D-looking; credit + share-alike on those files |
| Portraits (pixel, many) | Hyptosis "200 Free Lorestrome Portraits" | CC0 | Big pack, pick ~24 |
| Portraits (race set) | Ravenmore "Fantasy Portrait Pack" (human/elf/dwarf/gnome) | CC0 | Small |
| Item pictures | 7Soul1 "496 pixel art icons for medieval/fantasy RPG" | CC0 | Potions, weapons, armor, scrolls |
- Budget: ESP LittleFS web cap 1.4 MB (`esp/tools/sync-web.mjs`), ~111 KB used. Bundle a curated core (≤24 portraits at 128 px WebP ≈ 8 KB each ≈ 200 KB; ~120 item sprites in one atlas ≈ 60 KB) under `app/public/art/` + `art/CREDITS.md`. The full packs go into Cloudflare Worker static assets (`relay/assets/`, free tier) in Stage 4 and are offered only when online.
- Portrait picker in the join/sheet form and DM merchant form (`p.portrait` / `m.portrait` = `art:<file>` or existing uploaded media).

**Sound effects — Kenney CC0 first** ("Interface Sounds" 100 files, "UI Audio" 50, "RPG Audio" 50: coins, cloth, book, door, metal, footsteps), OGG, each ≤ 20 KB, total budget ≤ 200 KB. Event map (to be auditioned):
| Event | Candidates |
|---|---|
| button press | Interface Sounds `click_00x`, UI Audio `click1-5` |
| tab/toggle | `switch_00x`, `toggle_00x` |
| offer sent | RPG Audio `bookFlip`, `cloth` |
| DM counter arrives | `metalLatch`, shop bell (Interface `confirmation_00x`) |
| deal / purchase | RPG Audio `handleCoins`, `handleCoins2` |
| rejected / error | Interface `error_00x`, `drop_00x` |
| session start (lobby → market) | `doorOpen_1`, `confirmation` |
| player joins lobby | `footstep`, `pluck` |
- Create `app/public/ui/sfx.js`: preload with `AudioContext` (decode once, low latency), `sfx.play(name)`, mute toggle + volume in a settings sheet (localStorage `sfx`), respects `prefers-reduced-motion` for vibrate only; buttons declare `data-sfx`.
- **Discussion checkpoint (user):** `app/public/dev/sounds.html` audition page (dev only, not synced to ESP) plays every candidate per event; the user picks, then `app/tools/build-sfx.mjs` copies the chosen files to `app/public/sfx/` with `CREDITS.md`. Downloading the Kenney zips is asked first (name, source, size).
- Credits: `app/public/credits.html` linked from settings (game-icons authors, Kenney, portrait authors, SRD notice later).
- Tests: `app/test/tools.test.js` cases for build-icons (sprite contains every listed slug, no duplicate ids) and a size-budget test (web folder ≤ 1.4 MB); `app/test/e2e.js` screenshots of player, DM, offer dialog at 375 px.

---

## Stage 3 — 0.16.0: lobby + character sheets

Plan doc `docs/superpowers/plans/2026-09-30-lobby-sheets.md`.
- State: `S.phase = "lobby"|"market"` (seed → lobby; loaded state without it → market). `p.sheet = {cls≤24, lvl 1..20, species≤24, src:"preset"|"manual"|"damerung"}`.
- API: `join {name, charId? | sheet, gold 0..100000}` (sheet → `charId:"custom"`); `POST /api/sheet {sheet}`; `dm/start`, `dm/lobby`, `dm/clearplayers` (release-safe: removes players + their offers/bans/ledger, keeps merchants/items/settings, phase → lobby). In lobby, `bid`/`accept` fail `"The market has not opened yet."`.
- Views: `phase`, `table:[{id,name,charId,cls,lvl,online}]` (online = live stream: Node `clients`; ESP local `slots` + new `relayOnline(who)` over `relay.cpp` `streams[].who`); `me.sheet`, DM `players[].sheet/online`.
- PWA: `app/public/sheet.js` (`fromDamerung(save)` → name, cls/lvl from `meta.classLevel` "Bard 3 / Rogue 2", species, `currency.gp`; `validateSheet`; localStorage saved sheets). Join screen tabs: Presets / My character / Import from Damerung (file or paste → prefilled form); lobby screen (table with online dots, DM online, edit own sheet, waiting text); DM lobby panel (players, address + QR via `qr.js`, Start session, Back to lobby, Clear all players with confirm).
- Tests: `app/test/sheet.test.js` (fixture from Damerung `app/saves/desideravit.json`, stripped); api + parity cases for phase gate, start/lobby, clearplayers, sheet join/update, online flags.

## Stage 4 — 0.17.0: SRD 5.1 in Cloudflare D1 (+ full art packs as Worker static assets)

Plan doc `docs/superpowers/plans/2026-09-30-srd-d1.md`.
- `relay/srd/fetch-srd.mjs` (open5e v1, `document__slug=wotc-srd`: spells, magicitems, weapons, armor, monsters, classes, races, conditions, feats, backgrounds → `raw/` cache + `seed.sql`, both gitignored; cost → `cost_gp`), `relay/srd/schema.sql` (per-kind tables + FTS5 `srd_fts`), `relay/srd/ATTRIBUTION.md`.
- `relay/src/srd.js` `handleSrd(request, env)`: `GET /srd/search?q=&kind=&limit≤25`, `/srd/:kind/:slug`, `/srd/list/:kind`, `/srd/about`; CORS `*`, cached 1 day. `relay/src/worker.js` routes `/srd/` before the Hub DO; `wrangler.toml` `[[d1_databases]] binding="SRD"`; `make-brief.mjs` bundles srd.js and drops the "no D1" line.
- Full portrait/item art packs (Stage 2 sources) go to `relay/assets/art/` served by Workers static assets (`[assets] directory`, path `/art/*`) with `CREDITS.md`; the PWA's pickers list them via `/art/index.json` when online.
- Test `relay/test/srd.test.js` with a fake `env.SRD` over `node:sqlite` (Node 24 available).
- PWA `app/public/srd.js`: class/species autocomplete in the sheet form; DM item editor "From SRD" (name, price from `cost_gp`, magical, desc); hidden when the Worker is unreachable.
- Cloudflare actions each need approval: `wrangler d1 create pazar-srd`, `d1 execute --remote` schema + seed, `wrangler deploy`.

## Stage 5 — pazar 0.18.0 + Damerung 0.2.0: Electron Damerung connects (Pazar section uses the unified UI kit)

Plan: revise `dnd_player/docs/superpowers/plans/2026-09-29-table-sync-phase2-damerung.md`.
- Pazar (both ports + parity): `tableApi: 1` in snapshots; `POST /api/table/gold {delta, note}` (own gold, `|delta|≤100000`, gold ≥ 0); write `app/contract/table-api.md` (join with sheet, events, sheet, bid, table/gold).
- Damerung Tasks 0–6, 8, 9 (drop dice Task 7): baseline tag `v0.1.0` (user gate), test tooling, `app/hub/client.js` (join sends `{name, sheet, gold}` via `toPazarSheet(save)`), IPC + `hub.json` + preload, feed helpers, store + Settings (hub URL = LAN IP or relay), gp mirror + read-only "Pazar" inventory section (pazar purchases), e2e against in-process `server.js`, release 0.2.0.

## Standing rules
- Approval per action: push, tag, `wrangler deploy`, D1 create/execute. Secrets only in `esp/secrets.ini`, never printed.
- Unpushed b720471/4ce49d3 go out with the first approved push.
- Short Turkish status updates during flash/uploadfs/imports.
