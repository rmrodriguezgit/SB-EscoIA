"""Preferencia persistente y motor efectivo; recuperación local sin cambiar credenciales."""
import json,threading
from pathlib import Path
from .core import atomic
CONFIG=Path(__file__).resolve().parents[2]/'config/inference.json'
LOCK=threading.RLock()
_active=None
_reason=''
def preferred():
 return json.loads(CONFIG.read_text()).get('mode','remote') if CONFIG.exists() else 'remote'
def status():
 from .runtime import local_model
 with LOCK:return {'preferred':preferred(),'active':_active or preferred(),'reason':_reason,'local_model':local_model(),'local_models':LOCAL_MODELS}
def remote():return status()['active']=='remote'
def select(mode):
 global _active,_reason
 if mode not in {'remote','local'}:raise ValueError('Motor inválido')
 from .runtime import PIPELINE_LOCK
 if not PIPELINE_LOCK.acquire(blocking=False):raise ValueError('Espera a que termine la petición activa')
 try:
  with LOCK:
   atomic(CONFIG,json.dumps({'mode':mode}));_active=mode;_reason=''
  from . import runtime,resources
  runtime._STATUS_AT=0;resources._stamp=0
 finally:PIPELINE_LOCK.release()
 return status()
def begin_request():
 global _active,_reason
 with LOCK:_active=preferred();_reason=''
 from . import runtime,resources
 runtime._STATUS_AT=0;resources._stamp=0

def fallback(reason,reserve_gib=None):
 global _active,_reason
 from .runtime import assert_resources,model_reserve_gib
 try:assert_resources(reserve_gib=reserve_gib if reserve_gib is not None else model_reserve_gib(),force_local=True)
 except RuntimeError as exc:
  raise RuntimeError('El servicio remoto falló ('+str(reason)+'). La recuperación local no se inició: '+str(exc)) from None
 with LOCK:_active='local';_reason='Servicio remoto no disponible: '+str(reason)
 from . import runtime,resources
 runtime._STATUS_AT=0;resources._stamp=0

def ensure_ollama():
 import socket,subprocess,time
 home=CONFIG.parents[1]
 with LOCK:
  try:
   with socket.create_connection(('127.0.0.1',11434),timeout=.3):return
  except OSError:pass
  script=home/'scripts/ollama-serve.sh'
  with open(home/'data/ollama.log','a') as log:
   proc=subprocess.Popen([str(script)],stdout=log,stderr=log,start_new_session=True)
  for _ in range(20):
   try:
    with socket.create_connection(('127.0.0.1',11434),timeout=.3):return
   except OSError:
    if proc.poll() is not None:break
    time.sleep(.15)
  raise RuntimeError('Ollama local no pudo iniciarse; revisa data/ollama.log')

LOCAL_MODELS=['uzu:qwen3.5:0.8b:4bit','qwen2.5:1.5b-instruct-q4_K_M','qwen2.5:3b-instruct-q4_K_M']
def select_model(model):
 if model not in LOCAL_MODELS:raise ValueError('Modelo local no permitido')
 if model.startswith('uzu:'):
  from .uzu_local import available
  if not available():raise ValueError('Uzu requiere completar scripts/preparar-uzu.sh; consulta docs/uzu.md')
 from . import runtime,resources
 if not runtime.PIPELINE_LOCK.acquire(blocking=False):raise ValueError('Espera a que termine la petición activa')
 try:
  if __import__('os').environ.get('BRAIN_MODEL'):raise ValueError('BRAIN_MODEL fija el modelo; retira esa variable para utilizar el selector')
  atomic(CONFIG.parent/'local-model.json',json.dumps({'model':model}))
  runtime._STATUS_AT=0;resources._stamp=0
 finally:runtime.PIPELINE_LOCK.release()
 return status()
