#!/bin/sh
# Sunucuyu başlatır. Kullanım: DM_PIN=xxxx ./start.sh
cd "$(dirname "$0")" || exit 1
if [ -z "$DM_PIN" ]; then echo "DM_PIN ayarla: DM_PIN=xxxx ./start.sh"; exit 1; fi
exec node server.js
