#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv-uzu/bin/python ]; then
 .venv/bin/python -m venv .venv-uzu
 .venv-uzu/bin/python -m pip install --only-binary=:all: -r config/uzu-requirements.lock
fi
exec .venv-uzu/bin/python scripts/uzu_worker.py --download
