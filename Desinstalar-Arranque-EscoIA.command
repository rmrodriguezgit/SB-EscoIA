#!/bin/bash
# Doble clic: quita el arranque automático de EscoIA (no borra datos).
LABEL="mx.escoia.academico"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "Arranque automático desinstalado. Los datos y la configuración no se tocaron."
