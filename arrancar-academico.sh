#!/bin/bash
set -euo pipefail
ESCOIA_ACADEMIC="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$ESCOIA_ACADEMIC"
if ! command -v node >/dev/null; then echo 'Falta Node.js.' >&2; exit 1; fi
if [[ ! -f .env ]]; then echo 'Falta la configuración privada .env.' >&2; exit 1; fi
if lsof -nP -iTCP:8787 -sTCP:LISTEN >/dev/null 2>&1; then
 echo 'El módulo académico ya está activo en http://127.0.0.1:8787/'
 echo 'Para aplicar cambios, detén su terminal con Ctrl+C y vuelve a ejecutar este script.'
 exit 0
fi
exec npm run start --prefix server
