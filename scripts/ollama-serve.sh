#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
export OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_QUEUE=8 OLLAMA_CONTEXT_LENGTH=4096
export OLLAMA_MODELS="$PWD/data/models/ollama"
if [[ -x vendor/ollama/ollama ]]; then
 exec vendor/ollama/ollama serve
fi
if [[ -x ../../work/ollama/ollama ]]; then
 export OLLAMA_MODELS="$PWD/../../work/ollama/models"
 exec ../../work/ollama/ollama serve
fi
exec ollama serve
