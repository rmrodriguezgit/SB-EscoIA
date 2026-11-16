#!/usr/bin/env bash
# App de escritorio de EscoIA (Electron).
#   ./escoia-desktop.sh    compila la UI si cambió, instala Electron la primera vez y abre la ventana.
# Al salir (cerrar la ventana, Cmd+Q, Ctrl+C) se descargan los modelos de EscoIA y se cierran sus procesos.
# Comprobación: bash desktop/verify-exit.sh
set -euo pipefail
cd "$(dirname "$0")"
say() { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
[ -x .venv/bin/python ] || { echo "Falta el entorno .venv de EscoIA. Consulta README.md para instalarlo." >&2; exit 1; }
mkdir -p data
[ -d ui/node_modules ] || (cd ui && npm ci --silent)
if [ ! -f ui/dist/index.html ] || [ -n "$(find ui/src ui/index.html -newer ui/dist/index.html -print -quit)" ]; then
  say "Compilando la interfaz"; npm --prefix ui run build --silent >/dev/null
fi
[ -d desktop/node_modules/electron ] || { say "Instalando Electron (solo la primera vez)"; (cd desktop && npm ci --silent); }
exec desktop/node_modules/.bin/electron desktop
