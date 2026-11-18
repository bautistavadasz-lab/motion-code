#!/bin/bash
# 3D WebGL: narração (Fish) -> som em código -> captura no Chromium -> mp4 final em prontos/.
# Uso: ./fazer.sh episodios/<slug> [--provisorio]   (--provisorio: sem chave, voz muda, só para ver a cena)
set -e
cd "$(dirname "$0")"
EP="${1%/}"; SLUG="$(basename "$EP")"
[ -f "$EP/roteiro.json" ] || { echo "Falta $EP/roteiro.json"; exit 1; }
[ -d node_modules/three ] || npm install --silent

python3 narrar.py "$EP" $2
python3 som.py "$EP"
node motor/capturar.mjs "$EP" "$EP/audio/video-mudo.mp4" --partes 3

[ "$2" = "--provisorio" ] && { echo "Provisório: não entrega."; exit 0; }
OUT="../../prontos/3d-webgl/$SLUG"; mkdir -p "$OUT"
ffmpeg -y -loglevel error -i "$EP/audio/video-mudo.mp4" -i "$EP/audio/mix.wav" \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$OUT/$SLUG-9x16.mp4"
for f in voz-final efeitos trilha; do cp "$EP/audio/$f.wav" "$OUT/$SLUG-$f.wav"; done
cp "$EP/roteiro.json" "$OUT/"
echo "Entregue em $OUT"
