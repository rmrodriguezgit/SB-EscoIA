#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/backups
chmod 700 data/backups
stamp="$(date +%Y%m%d-%H%M%S)"
sqlite3 data/sistema.db ".backup 'data/backups/sistema-$stamp.db'"
cp .env "data/backups/env-$stamp"
chmod 600 "data/backups/sistema-$stamp.db" "data/backups/env-$stamp"
echo "Respaldo creado en data/backups. Conserva ambos archivos juntos y protegidos."
