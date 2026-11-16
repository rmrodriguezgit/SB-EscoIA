#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export TOKENIZERS_PARALLELISM=false
exec .venv/bin/python scripts/laya_server.py --model mlx-community/Qwen2.5-3B-Instruct-4bit --host 127.0.0.1 --port 8081 --decode-concurrency 1 --prompt-concurrency 1 --prompt-cache-size 1 --prompt-cache-bytes 268435456
