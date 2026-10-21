#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
command -v python3 >/dev/null || { print 'Instala Python 3.12 con brew install python@3.12'; exit 1; }
command -v node >/dev/null || { print 'Instala Node 22 con brew install node@22'; exit 1; }
command -v pdftotext >/dev/null || { print 'Instala extracción PDF con brew install poppler'; exit 1; }
interpreter=$(command -v python3.12 || command -v python3)
"$interpreter" -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check -e .
npm ci --prefix ui
npm run build --prefix ui
.venv/bin/python -m unittest discover -s tests -v
print '\nListo. Inicia con: .venv/bin/brain start'
