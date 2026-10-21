#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
research_python=".venv/bin/python"
if [[ ! -x "$research_python" ]]; then
  research_python="$(command -v python3.12 || command -v python3.13 || command -v python3)"
fi
"$research_python" -c 'import sys; assert (3,12) <= sys.version_info[:2] <= (3,13), "Instala Python 3.12 o 3.13 para estas dependencias fijadas"'
"$research_python" -m venv .venv-research
.venv-research/bin/python -m pip install -r config/research-requirements.txt
printf 'Investigación lista: dos procesos CPU máximo; una inferencia local.\n'
