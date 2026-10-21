#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for cmd in node npm cmake clang; do
  command -v "$cmd" >/dev/null || { echo "Falta $cmd. Revisa INSTALACION.md."; exit 1; }
done
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo 'Se requiere Node.js 22 o posterior.'; exit 1; }
cmake -S native -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j 2
ctest --test-dir build --output-on-failure
npm ci --prefix server --no-audit --no-fund
npm ci --prefix ui --no-audit --no-fund
npm run check --prefix server
npm run build --prefix ui
mkdir -p data/uploads artifacts models
chmod 700 data data/uploads artifacts
if [[ ! -f .env ]]; then
  cp .env.example .env
  node scripts/set-env.mjs BIOMETRIC_KEY "$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')"
  chmod 600 .env
fi
if [[ -f data/sistema.db ]]; then
  node --import ./server/node_modules/tsx/dist/loader.mjs scripts/migrate.ts
fi
if [[ ! -f data/sistema.db ]] || ! node --import ./server/node_modules/tsx/dist/loader.mjs scripts/has-admin.ts; then
  if [[ -f data/sistema.db ]]; then
    node --import ./server/node_modules/tsx/dist/loader.mjs scripts/init.ts --bootstrap
  else
    node --import ./server/node_modules/tsx/dist/loader.mjs scripts/init.ts
  fi
fi
printf '\nInstalación base terminada. Ejecuta: bash scripts/start.sh\n'
