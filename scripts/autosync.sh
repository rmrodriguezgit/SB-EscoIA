#!/usr/bin/env bash
# Commit + push automático de los cambios pendientes de EscoIA. Uso: scripts/autosync.sh ["mensaje"]
# Lo invoca el hook Stop de Claude Code (.claude/settings.json) al terminar cada turno; también sirve a mano.
# El pre-commit bloquea datos privados, secretos, correos y rutas personales; el post-commit hace el push.
set -uo pipefail
cd "$(dirname "$0")/.."
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
[[ "$(git config --bool escoia.autosync 2>/dev/null)" == "false" ]] && exit 0
push_on() { [[ "$(git config --bool escoia.autopush 2>/dev/null)" != "false" ]] && git push -q -u origin HEAD 2>/dev/null; }
# Módulo académico: la app usa ../sistema-escolar; sus commits nuevos se integran en sistema-escolar/ (git subtree).
# El merge de subtree no ejecuta hooks: se revisa el rango con el mismo pre-commit y se deshace si no pasa.
sync_academic() {
  local SE=../sistema-escolar head before
  [[ -d sistema-escolar && -d "$SE/.git" && -z "$(git status --porcelain)" ]] || return 0
  head=$(git -C "$SE" rev-parse -q --verify main 2>/dev/null) || return 0
  git merge-base --is-ancestor "$head" HEAD 2>/dev/null && return 0
  before=$(git rev-parse HEAD)
  if ! git subtree pull -q --prefix=sistema-escolar "$SE" main -m "Sincroniza sistema-escolar ($(git -C "$SE" log -1 --format=%h main))" >/dev/null 2>&1; then
    git merge --abort 2>/dev/null; git reset -q --hard "$before"; echo "autosync: no se pudo integrar sistema-escolar; revisa a mano" >&2; return 1
  fi
  if ! out=$(ESCOIA_CHECK_RANGE="$before..HEAD" .githooks/pre-commit 2>&1); then
    git reset -q --hard "$before"; echo "autosync: sistema-escolar no integrado (repo público). $out" >&2; return 1
  fi
  push_on; echo "autosync: sistema-escolar integrado en sistema-escolar/"
}
git add -A
if git diff --cached --quiet; then
  sync_academic
  # Sin cambios nuevos: si quedaron commits sin subir (p. ej. un push que falló), se reintenta.
  if [[ -n "$(git log --oneline '@{u}..' 2>/dev/null)" ]]; then push_on && echo "autosync: commits pendientes subidos"; fi
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
git log -1 --oneline
sync_academic
