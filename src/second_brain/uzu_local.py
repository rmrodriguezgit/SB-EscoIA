"""Adaptador Uzu local; contrato interno compatible con el llamador de Ollama."""
import json,subprocess,threading
from pathlib import Path
HOME=Path(__file__).resolve().parents[2]
MODEL='uzu:qwen3.5:0.8b:4bit'
LOCK=threading.Lock()
def available():return (HOME/'.venv-uzu/bin/python').exists() and (HOME/'data/uzu-ready.json').exists()
def request(path,payload=None,timeout=120):
 if path=='/api/ps':return {'models':[{'name':MODEL,'size':0}] if LOCK.locked() else []}
 if path=='/api/tags':return {'models':[{'name':MODEL}] if available() else []}
 if path=='/api/generate' and (payload or {}).get('keep_alive')==0:return {'done':True}
 if path!='/api/chat':raise RuntimeError('Uzu admite conversación; los embeddings requieren su adaptador Ollama')
 if not available():raise RuntimeError('Prepara Uzu con scripts/preparar-uzu.sh antes de seleccionarlo')
 if not LOCK.acquire(blocking=False):raise RuntimeError('Uzu ya está procesando una petición')
 try:
  result=subprocess.run([str(HOME/'.venv-uzu/bin/python'),str(HOME/'scripts/uzu_worker.py')],input=json.dumps(payload),capture_output=True,text=True,timeout=min(timeout,120),check=False)
  if result.returncode:raise RuntimeError('Uzu no pudo generar: '+result.stderr[-800:])
  return json.loads(result.stdout.strip().splitlines()[-1])
 except subprocess.TimeoutExpired:raise RuntimeError('Uzu superó el límite de tiempo; proceso y pesos liberados') from None
 finally:LOCK.release()
