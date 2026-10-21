#!/bin/bash
# Doble clic en Finder. --check solo comprueba; no inicia ni abre nada.
set -euo pipefail
ESCOIA_LAUNCH_HOME="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$ESCOIA_LAUNCH_HOME"
if [[ "${1:-}" != "" && "${1:-}" != "--check" ]]; then echo 'Uso: Arrancar-EscoIA.command [--check]'; exit 2; fi
trap 'echo; echo "No se completó el arranque. Revisa el mensaje anterior y data/logs/academic-service.log o data/server.log."; [[ -t 0 ]] && read -r -p "Pulsa Enter para cerrar…"; true' ERR
if [[ ! -x .venv/bin/python ]]; then echo 'Falta .venv. Instala las dependencias de EscoIA antes de iniciar.'; exit 1; fi
export PYTHONPATH="$ESCOIA_LAUNCH_HOME/src"
.venv/bin/python - "$ESCOIA_LAUNCH_HOME" "${1:-}" <<'PY'
import json,re,subprocess,sys,urllib.request
from pathlib import Path
from second_brain.services import academic_status
home=Path(sys.argv[1]);check=sys.argv[2]=='--check'
print('\nEscoIA · comprobación de arranque\n')
critical=False
try:
 stats=subprocess.check_output(['vm_stat'],text=True,timeout=4)
 physical=int(subprocess.check_output(['sysctl','-n','hw.memsize'],text=True,timeout=4,stderr=subprocess.DEVNULL))/1024**3
 page=int(re.search(r'page size of (\d+)',stats)[1])
 used=sum(int(re.search('^'+re.escape(k)+r':\s+(\d+)',stats,re.M)[1]) for k in ['Anonymous pages','Pages wired down','Pages occupied by compressor'])*page/1024**3
 try:pressure=int(subprocess.check_output(['sysctl','-n','kern.memorystatus_vm_pressure_level'],text=True,timeout=4,stderr=subprocess.DEVNULL))
 except Exception:pressure=None
 print(f'Memoria estimada: {used:.2f} / {physical:.2f} GiB físicos; presupuesto IA local: 12.50 GiB.')
 print('Presión: '+{1:'normal',2:'advertencia',4:'crítica'}.get(pressure,'no disponible'))
 print(subprocess.check_output(['sysctl','vm.swapusage'],text=True,timeout=4).strip())
 critical=pressure==4 or used+.35>physical
 if critical:print('No hay margen para iniciar servicios nuevos. Cierra aplicaciones y vuelve a intentar.')
 elif used+.35>12.5:print('Margen reducido: se permite iniciar la interfaz y asistencia; no se cargarán modelos locales.')
 else:print(f'Margen estimado dentro del presupuesto: {12.5-used:.2f} GiB. No se cargan Qwen ni LAYA al arrancar.')
except Exception as e:print('No se pudo comprobar toda la memoria. No se garantiza margen para inferencia local.');print(type(e).__name__)
try:
 with urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:8790/api/state',timeout=8) as r:data=json.load(r)
 main=all(k in data for k in ('csrf','library','tasks'))
except Exception:main=False
academic=academic_status()['available']
print('EscoIA (8790): '+('disponible' if main else 'sin respuesta'))
print('Asistencia y administración (8787): '+('disponibles' if academic else 'sin respuesta'))
if not check and critical and not (main and academic):sys.exit(1)
PY
if [[ "${1:-}" == "--check" ]]; then exit 0; fi
/bin/bash ./arrancar-escoia.sh --no-open
.venv/bin/python - "$ESCOIA_LAUNCH_HOME" <<'PY'
import sys
from second_brain.services import recover_academic
result=recover_academic(sys.argv[1]);print(result['message'])
if not result['available']:sys.exit(1)
PY
open 'http://127.0.0.1:8790/'
echo 'EscoIA y el módulo académico están disponibles. Puedes cerrar esta terminal; los servicios siguen activos.'
