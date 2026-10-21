#!/bin/bash
# Lanzador de EscoIA (lo usa Iniciar-EscoIA.command). Registro en logs/escoia.log.
# Verifica requisitos, reconstruye la UI si cambió y deja todo en el log.
set -uo pipefail
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
cd "$ROOT" || exit 78
mkdir -p logs && exec > >(tee -a logs/escoia.log) 2>&1
export PATH="${ESCOIA_NODE_DIR:+$ESCOIA_NODE_DIR:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
log() { echo "[$(date '+%F %T')] $*"; }
envval() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2-; }
abs() { case "$1" in /*) echo "$1";; *) echo "$ROOT/$1";; esac; }

log "Iniciando EscoIA en $ROOT"
command -v node >/dev/null || { log "ERROR: no se encontró Node.js (instala con: brew install node)"; exit 78; }
[[ -f .env ]] || { log "ERROR: falta el archivo .env (copia .env.example y configúralo)"; exit 78; }
PORT="$(envval PORT)"; PORT="${PORT:-8787}"

NATIVE="$(envval NATIVE_BIN)"; NATIVE="$(abs "${NATIVE:-build/sistema_service}")"
if [[ ! -x "$NATIVE" ]]; then
  log "ERROR: no existe el núcleo nativo: $NATIVE"
  log "       Compílalo con: cmake -S native -B build && cmake --build build  (y ajusta NATIVE_BIN en .env)"
  exit 78
fi
DB="$(envval DATABASE)"; DB="$(abs "${DB:-data/sistema.db}")"
[[ -d "$(dirname "$DB")" ]] || { log "ERROR: no existe la carpeta de la base de datos: $(dirname "$DB")"; exit 78; }
[[ -f "$DB" ]] || log "AVISO: la base $DB no existe todavía; se creará vacía"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  log "El puerto $PORT ya está en uso: EscoIA ya está activo en http://127.0.0.1:$PORT/"
  exit 0
fi
# Reinstala dependencias si faltan o si el lockfile cambió (p. ej. tras un git pull)
needs_ci() { [[ ! -d "$1/node_modules" ]] || [[ "$1/package-lock.json" -nt "$1/node_modules/.package-lock.json" ]]; }
if needs_ci server; then
  log "Instalando dependencias del servidor…"; (cd server && npm ci --no-audit --no-fund) || { log "ERROR: npm ci en server"; exit 1; }
fi
if needs_ci ui; then
  log "Instalando dependencias de la interfaz…"; (cd ui && npm ci --no-audit --no-fund) || log "AVISO: npm ci en ui falló"
fi
if [[ ! -f ui/dist/index.html ]] || [[ -n "$(find ui/src ui/index.html ui/vite.config.ts ui/package.json package.json -newer ui/dist/index.html -print -quit 2>/dev/null)" ]]; then
  log "Compilando la interfaz (cambios detectados)…"
  (cd ui && npm run build) || log "AVISO: no se pudo compilar la UI; se usa la versión anterior"
fi
log "Servidor en http://127.0.0.1:$PORT/"
cd server && exec node --import tsx main.ts
