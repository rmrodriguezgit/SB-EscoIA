#!/bin/bash
# Doble clic: instala EscoIA como servicio de usuario (LaunchAgent).
# Arranca al iniciar sesión, se reinicia si falla y abre http://127.0.0.1:8787/
set -uo pipefail
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
LABEL="mx.escoia.academico"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/EscoIA.log"
PORT="$(grep -E '^PORT=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2-)"; PORT="${PORT:-8787}"
NODE="$(command -v node || ls /opt/homebrew/bin/node /usr/local/bin/node 2>/dev/null | head -1)"
[[ -n "$NODE" ]] || { echo "No se encontró Node.js. Instálalo (brew install node) y vuelve a ejecutar."; read -rp "Enter para salir"; exit 1; }
chmod +x "$ROOT/scripts/escoia-launcher.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

# Detiene una instancia manual previa en el puerto (solo si es node de esta instalación)
PID="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
if [[ -n "$PID" ]] && ps -o command= -p "$PID" | grep -q "main.ts"; then
  echo "Deteniendo instancia manual previa (PID $PID)…"; kill "$PID"; sleep 2
fi

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$ROOT/scripts/escoia-launcher.sh</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key><dict>
    <key>ESCOIA_NODE_DIR</key><string>$(dirname "$NODE")</string>
    <key>UV_THREADPOOL_SIZE</key><string>8</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
plutil -lint "$PLIST" >/dev/null || { echo "plist inválido"; exit 1; }
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
launchctl bootstrap "gui/$(id -u)" "$PLIST" && launchctl enable "gui/$(id -u)/$LABEL"
echo "Servicio instalado. Esperando a EscoIA en el puerto $PORT (puede tardar si compila la UI)…"
for i in $(seq 1 90); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then
    echo "✅ EscoIA activo: http://127.0.0.1:$PORT/"; open "http://127.0.0.1:$PORT/"; exit 0
  fi
  sleep 2
done
echo "❌ No respondió. Últimas líneas del registro ($LOG):"; tail -25 "$LOG"
echo
echo "Si ves 'Operation not permitted': Ajustes del Sistema > Privacidad y seguridad >"
echo "Acceso total al disco > agrega /bin/bash y $NODE, y vuelve a ejecutar este instalador."
read -rp "Enter para salir"
