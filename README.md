# Pazar — D&D haggling & economy app

A table-side market for D&D: dice-driven haggling, a long-term rapport system the DM controls,
offers, a shopping ledger, and live sync between the DM and players (SSE). Zero-dependency Node
server (Node 18+) plus a small Android WebView shell. The design document is `PROJE.md`
(Turkish); release notes are in `CHANGELOG.md`.

## Run

```sh
cd app
DM_PIN=choose-a-pin node server.js      # http://localhost:3000
npm test                                 # unit / API / vector tests
```

Without `DM_PIN` the server falls back to a dev PIN and refuses to start when
`NODE_ENV=production`. Game state lives in `app/data/data.json` (git-ignored).

## Deploy

`render.yaml` and `app/Dockerfile` are provided; set `DM_PIN` in the host's environment.

## Android

`android/` builds a WebView shell (`.github/workflows/apk.yml`). For updates that install over
older builds, supply your own keystore via the `PAZAR_KEYSTORE_B64` / `PAZAR_KEYSTORE_PASSWORD`
repo secrets; no signing key is stored in this repository.

## License

MIT, see `LICENSE`.
