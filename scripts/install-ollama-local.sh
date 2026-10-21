#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { print 'Este instalador está fijado para macOS Apple Silicon'; exit 1; }
[[ ! -e vendor/ollama/ollama ]] || { print 'Ollama local ya existe; no se sustituye'; exit 0; }
mkdir -p vendor/ollama
archive=$(mktemp -t escola-ollama)
trap 'rm -f "$archive"' EXIT
curl --fail --location --show-error 'https://github.com/ollama/ollama/releases/download/v0.35.1/ollama-darwin.tgz' -o "$archive"
expected='3137dbf28948ee844e0fb3e584d9b5de6879d73d9f0cb7eff3ad64930601d307'
actual=$(shasum -a 256 "$archive" | awk '{print $1}')
[[ "$actual" == "$expected" ]] || { print 'El SHA-256 no coincide; no se ejecuta el archivo'; exit 1; }
tar -xzf "$archive" -C vendor/ollama
print 'Ollama 0.35.1 instalado solo dentro de este proyecto.'
print 'Inicia scripts/ollama-serve.sh y después vendor/ollama/ollama pull qwen2.5:3b-instruct-q4_K_M'
