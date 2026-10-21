#!/bin/bash
set -euo pipefail
ESCOIA_RESTART_HOME="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$ESCOIA_RESTART_HOME"
trap 'echo "No se completó el reinicio. Revisa el mensaje anterior."; [[ -t 0 ]] && read -r -p "Pulsa Enter para cerrar…"; true' ERR
.venv/bin/python - "$ESCOIA_RESTART_HOME" <<'PY'
import json,os,signal,socket,subprocess,sys,time,urllib.request
from pathlib import Path
home=Path(sys.argv[1]).resolve()
targets=[]
for port,kind,root in [(8790,'escoia',home),(8787,'academico',home.parent/'sistema-escolar')]:
 result=subprocess.run(['lsof','-t','-nP',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True)
 pids=set(result.stdout.split())
 if len(pids)>1:sys.exit(f'Hay varios procesos en el puerto {port}. No se detuvo ninguno.')
 if not pids:continue
 pid=int(next(iter(pids)))
 command=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True)
 cwd=subprocess.run(['lsof','-a','-p',str(pid),'-d','cwd','-Fn'],capture_output=True,text=True).stdout.splitlines()
 correct=(kind=='escoia' and 'second_brain' in command and str(root) in command) or (kind=='academico' and 'main.ts' in command and 'n'+str(root.resolve()/'server') in cwd)
 if not correct:sys.exit(f'No se pudo confirmar la instalación del proceso en {port}. No se detuvo ninguno; cierra su terminal manualmente.')
 if kind=='escoia':
  try:
   with urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:8790/api/state',timeout=8) as response:state=json.load(response)
  except Exception:sys.exit('EscoIA no respondió al comprobar tareas. No se detuvo ningún servicio.')
  if state.get('resources',{}).get('pipeline_busy') or any(t.get('status')=='ejecutándose' for t in state.get('tasks',[])):sys.exit('Hay una petición en curso. Espera a que termine antes de reiniciar.')
 targets.append((port,pid))
for port,pid in targets:
 print(f'Reiniciando el servicio de esta instalación en el puerto {port}…')
 os.kill(pid,signal.SIGINT)
 for _ in range(60):
  try:os.kill(pid,0)
  except ProcessLookupError:break
  time.sleep(.25)
 else:sys.exit('El proceso no terminó. No se forzó su cierre ni se inició otra copia.')

PY
exec /bin/bash "$ESCOIA_RESTART_HOME/Arrancar-EscoIA.command"
