#!/bin/bash
# Doble clic (o al iniciar sesión): arranca EscoIA en esta ventana de Terminal
# y abre http://127.0.0.1:8787/ cuando responde. Ctrl+C para detenerlo.
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
PORT="$(grep -E '^PORT=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2-)"; PORT="${PORT:-8787}"
( for i in $(seq 1 150); do
    if curl -fs -o /dev/null "http://127.0.0.1:$PORT/"; then open "http://127.0.0.1:$PORT/"; exit 0; fi
    sleep 2
  done ) &
/bin/bash "$ROOT/scripts/escoia-launcher.sh"
code=$?
if [[ $code -ne 0 ]]; then
  echo; echo "❌ EscoIA se detuvo (código $code). Revisa los mensajes de arriba o logs/escoia.log."
  read -rp "Enter para cerrar"
fi
