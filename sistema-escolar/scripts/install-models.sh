#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-all}"
mkdir -p vendor models
if [[ "$MODE" == 'all' || "$MODE" == 'voice' ]]; then
  if [[ ! -d vendor/whisper.cpp ]]; then git clone --depth 1 --branch v1.9.4 https://github.com/ggml-org/whisper.cpp.git vendor/whisper.cpp; fi
  if [[ ! -f models/ggml-base.bin ]]; then curl -fL --retry 3 https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o models/ggml-base.bin; fi
  cmake -S native -B build -DCMAKE_BUILD_TYPE=Release -DWITH_WHISPER=ON -DGGML_METAL=ON -DGGML_OPENMP=OFF
  cmake --build build -j 2
fi
if [[ "$MODE" == 'all' || "$MODE" == 'ai' ]]; then
  command -v ollama >/dev/null || { echo 'Instala Ollama antes: brew install ollama'; exit 1; }
  ollama pull qwen2.5:7b-instruct-q4_K_M
  ollama pull nomic-embed-text
  PYTHON_BIN="$(brew --prefix python@3.12)/bin/python3.12"
  "$PYTHON_BIN" -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install 'mlx-lm==0.32.0'
  .venv/bin/python -c 'from huggingface_hub import snapshot_download; snapshot_download("mlx-community/Qwen2.5-3B-Instruct-4bit")'
  node scripts/set-env.mjs AI_ENABLED true
fi
printf '\nModelos instalados. Revisa los scripts start-ollama.sh y start-laya.sh.\n'
