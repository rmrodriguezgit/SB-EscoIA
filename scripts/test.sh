#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
PYTHONPATH=src python3 -m unittest discover -s tests -v
npm run build --prefix ui
