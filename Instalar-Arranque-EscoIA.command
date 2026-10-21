#!/bin/bash
# Doble clic: hace que EscoIA arranque solo al iniciar sesión.
# Usa un elemento de inicio (Terminal) porque macOS impide a los servicios de
# fondo (launchd) leer la carpeta Documentos sin "Acceso total al disco".
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
LABEL="mx.escoia.academico"
# 1) Quita el LaunchAgent anterior (bloqueado por privacidad de macOS)
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
chmod +x "$ROOT/Iniciar-EscoIA.command" "$ROOT/scripts/escoia-launcher.sh"
# 2) Registra Iniciar-EscoIA.command como elemento de inicio de sesión
osascript -e 'tell application "System Events" to delete (every login item whose name is "Iniciar-EscoIA.command")' >/dev/null 2>&1
if osascript -e "tell application \"System Events\" to make login item at end with properties {path:\"$ROOT/Iniciar-EscoIA.command\", hidden:false}" >/dev/null; then
  echo "✅ Arranque automático configurado (Ajustes > General > Ítems de inicio)."
else
  echo "⚠️ No se pudo registrar automáticamente. Agrégalo a mano:"
  echo "   Ajustes del Sistema > General > Ítems de inicio > + > $ROOT/Iniciar-EscoIA.command"
fi
# 3) Arranca ahora
open "$ROOT/Iniciar-EscoIA.command"
echo "Abriendo EscoIA en una ventana de Terminal…"
