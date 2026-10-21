#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cmake --build build -j 2
ctest --test-dir build --output-on-failure
npm run check --prefix server
npm run test --prefix server
npm run build --prefix ui
