#!/bin/bash
# Arranque seguro desde esta carpeta o cualquier directorio.
set -euo pipefail
ESCOIA_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
case "${1:-}" in
  "") ESCOIA_OPEN=1 ;;
  --no-open) ESCOIA_OPEN=0 ;;
  *) echo "Uso: $0 [--no-open]" >&2; exit 2 ;;
esac
if [[ ! -x "$ESCOIA_DIR/.venv/bin/python" ]]; then
  echo "Falta el entorno .venv de EscoIA. Consulta README.md para instalarlo." >&2
  exit 1
fi
"$ESCOIA_DIR/.venv/bin/python" - "$ESCOIA_DIR" <<'PY'
import fcntl,json,os,socket,subprocess,sys,time,urllib.request
from pathlib import Path
home=Path(sys.argv[1]);data=home/'data';data.mkdir(exist_ok=True)
url='http://127.0.0.1:8790'
# Serializa dos ejecuciones simultáneas del script.
with open(data/'launcher.lock','a') as launch:
 fcntl.flock(launch,fcntl.LOCK_EX)
 def responding():
  try:
   with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url+'/api/state',timeout=8) as r:
    state=json.load(r)
   return isinstance(state,dict) and all(k in state for k in ['model','library','csrf','tasks'])
  except Exception:return False
 def port_busy():
  try:
   with socket.create_connection(('127.0.0.1',8790),timeout=.5):return True
  except OSError:return False
 if responding():
  print('EscoIA ya está ejecutándose. No se inicia otra copia.');print(url);sys.exit(0)
 if port_busy():
  sys.exit('El puerto 8790 está ocupado, pero EscoIA no responde. Revisa data/server.log; no se inicia otra copia.')
 # El bloqueo del coordinador también detecta un proceso que todavía está iniciando.
 with open(data/'coordinator.lock','a') as coordinator:
  try:fcntl.flock(coordinator,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:
   sys.exit('EscoIA ya tiene un proceso activo o está iniciando. Espera y vuelve a ejecutar el script.')
  pidfile=data/'server.pid'
  if pidfile.exists():
   try:
    pid=int(pidfile.read_text().strip());os.kill(pid,0)
   except (ValueError,ProcessLookupError):pidfile.unlink()
   except PermissionError:sys.exit('No se pudo comprobar el proceso registrado; no se inicia otra copia.')
   else:
    sys.exit('El PID registrado sigue activo pero la aplicación no responde. Revisa data/server.log antes de iniciar otra copia.')
  # Reserva el bloqueo hasta justo antes de crear el coordinador.
  fcntl.flock(coordinator,fcntl.LOCK_UN)
  env=dict(os.environ);env['PYTHONPATH']=str(home/'src')
  with open(data/'server.log','a') as log:
   proc=subprocess.Popen([str(home/'.venv/bin/python'),'-m','second_brain','--home',str(home),'start','--port','8790'],cwd=home,env=env,stdout=log,stderr=log,start_new_session=True)
  pidfile.write_text(str(proc.pid));pidfile.chmod(0o600)
 for _ in range(20):
  if proc.poll() is not None:
   if pidfile.read_text().strip()==str(proc.pid):pidfile.unlink()
   sys.exit('EscoIA no pudo arrancar. Revisa data/server.log.')
  if responding():print('EscoIA iniciada correctamente. PID: '+str(proc.pid));print(url);break
  time.sleep(.5)
 else:sys.exit('El proceso inició pero aún no responde. Revisa data/server.log; no vuelvas a crear otra copia.')
PY
if [[ "$ESCOIA_OPEN" == 1 ]] && command -v open >/dev/null 2>&1; then
  open 'http://127.0.0.1:8790/'
fi
