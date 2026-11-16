#!/usr/bin/env bash
# Commit + push automático de los cambios pendientes de EscoIA. Uso: scripts/autosync.sh ["mensaje"]
# Lo invoca el hook Stop de Claude Code (.claude/settings.json) al terminar cada turno; también sirve a mano.
# El pre-commit bloquea datos privados, secretos, correos y rutas personales; el post-commit hace el push.
set -uo pipefail
cd "$(dirname "$0")/.."
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
[[ "$(git config --bool escoia.autosync 2>/dev/null)" == "false" ]] && exit 0
git add -A
if git diff --cached --quiet; then
  # Sin cambios nuevos: si quedaron commits sin subir (p. ej. un push que falló), se reintenta.
  if [[ -n "$(git log --oneline '@{u}..' 2>/dev/null)" ]]; then git push -q 2>/dev/null && echo "autosync: commits pendientes subidos"; fi
  exit 0
fi
files=$(git diff --cached --name-only | head -6 | tr '\n' ' ')
count=$(git diff --cached --name-only | wc -l | tr -d ' ')
MSG="${1:-Auto-sync $(date '+%Y-%m-%d %H:%M'): ${count} archivo(s) · ${files}}"
if ! out=$(git commit -q -m "$MSG" 2>&1); then
  git reset -q
  echo "autosync: commit bloqueado; cambios sin commitear. $out" >&2
  exit 1
fi
[[ "$(git config --bool escoia.autopush 2>/dev/null)" == "false" ]] && git push -q -u origin HEAD
git log -1 --oneline
