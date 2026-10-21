#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f data/sistema.db ]]; then echo 'Ejecuta setup.sh primero.'; exit 1; fi
./build/sistema_service data/sistema.db --init db/demo.sql
echo 'Datos DEMO creados. Carrera #1, Finanzas #2, estudiante #1, oferta #1.'
