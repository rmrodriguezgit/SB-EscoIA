#!/usr/bin/env bash
# Verifica que al salir de la app de escritorio de EscoIA se libera la memoria.
#   bash desktop/verify-exit.sh close    cierra la ventana desde la app (camino normal)
#   bash desktop/verify-exit.sh signal   SIGTERM a Electron (equivale a Cmd+Q / apagar sesión)
# Exige: Electron terminado, sin coordinador ni módulo académico lanzados por la app, puertos 8790/8787 libres,
# data/server.pid retirado y la descarga de modelos pedida al coordinador.
# No carga modelos para la prueba: eso depende del presupuesto de 12,5 GiB y se informa aparte.
set -uo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-close}"
ROOT="$PWD"
fail=0
ok()  { printf '  \033[32m✔\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✘\033[0m %s\n' "$*"; fail=1; }
ports() { lsof -nP -iTCP:8790 -iTCP:8787 -sTCP:LISTEN -t 2>/dev/null | sort -u; }
ours()  { pgrep -f "$ROOT/desktop/node_modules/electron"; pgrep -f "second_brain --home $ROOT start"; pgrep -f "sistema-escolar/arrancar-academico.sh"; }
# Misma cuenta que runtime.memory_budget, sin su límite (que lanzaría error por encima de 12,5 GiB).
used()  { vm_stat | awk '/page size of/ {p=$8} /^(Anonymous pages|Pages wired down|Pages occupied by compressor):/ {gsub("\\.","",$NF); s+=$NF} END {printf "%.2f", s*p/1073741824}'; }

[ -z "$(ports)" ] || { echo "Hay algo escuchando en 8790/8787 ($(ports | tr '\n' ' ')). Cierra EscoIA antes de verificar."; exit 2; }
U0=$(used)
AFTER=""; [ "$MODE" = "close" ] && AFTER=12
echo "▸ Abriendo la app de escritorio ($MODE)"
ESCOIA_E2E=1 ESCOIA_E2E_CLOSE_AFTER="$AFTER" desktop/node_modules/.bin/electron desktop > data/desktop-verify.log 2>&1 &
EPID=$!
for _ in $(seq 60); do curl -s -m 2 127.0.0.1:8790/api/state | grep -q '"csrf"' && break; sleep 1; done
curl -s -m 2 127.0.0.1:8790/api/state | grep -q '"csrf"' && ok "EscoIA responde en 8790 dentro de la app" || bad "EscoIA no respondió"
SPID=$(cat data/server.pid 2>/dev/null || echo "")
[ -n "$SPID" ] && ok "coordinador lanzado por la app (pid $SPID, registrado en data/server.pid)" || bad "sin data/server.pid"
sleep 3
U1=$(used)
if [ "$MODE" = "signal" ]; then echo "▸ SIGTERM a Electron"; kill -TERM "$EPID"; else echo "▸ Esperando el cierre de la ventana"; fi
for _ in $(seq 60); do kill -0 "$EPID" 2>/dev/null || break; sleep 1; done
sleep 1
U2=$(used)

echo "▸ Resultado"
kill -0 "$EPID" 2>/dev/null && bad "Electron sigue vivo (pid $EPID)" || ok "Electron terminó"
left="$(ours | tr '\n' ' ')"; [ -z "${left// }" ] && ok "sin procesos de la app (Electron, coordinador, módulo académico)" || bad "quedan procesos: $left"
[ -z "$(ports)" ] && ok "puertos 8790/8787 libres" || bad "puertos ocupados por: $(ports | tr '\n' ' ')"
[ ! -f data/server.pid ] && ok "data/server.pid retirado" || bad "data/server.pid sigue presente"
grep -q "liberación de modelos: 200" data/desktop-verify.log && ok "descarga de modelos confirmada por EscoIA" || bad "sin confirmación de descarga de modelos"
echo "  memoria estimada (anónima+cableada+comprimida): antes $U0 GiB · abierta $U1 GiB · tras salir $U2 GiB"
echo "  log: data/desktop-verify.log"; grep '\[escoia-desktop\]' data/desktop-verify.log | sed 's/^/    /'
exit $fail
