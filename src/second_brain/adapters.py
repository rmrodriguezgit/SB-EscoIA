"""Adaptadores optativos. Ningún documento activa permisos ni comandos."""
import json,os,select,shutil,subprocess,time,uuid
from .core import now

class LayaRouter:
    def __init__(self):self.agent=None
    def classify(self,text):
        from . import remote_ai
        if remote_ai.enabled():return {'recommendation':remote_ai.decide(text,{'agent':{'type':'choice','instructions':'Selecciona rol','criteria':{'rag':'Consulta académica','memoria':'Memoria','investigador':'Investigación','evaluador':'Evaluación'}}}),'authorization':False}
        if len(text)>1500:raise ValueError('Entrada demasiado larga para Laya')
        from .runtime import MODEL_LOCK,assert_resources
        with MODEL_LOCK:
            assert_resources(reserve_gib=1.0)
            if self.agent is None:
                import laya_mlx
                self.agent=laya_mlx.load('aac6fef/laya-multilingual-mlx',dtype='float16')
            questions={'agent':{'type':'choice','instructions':'Elige el rol para la solicitud en español','criteria':{'rag':'Consultar planes de estudio y fuentes','memoria':'Guardar o corregir recuerdos','investigador':'Analizar una pregunta sin ejecutar acciones','evaluador':'Comprobar un resultado'}}}
            result=self.agent.predict(text,questions)
            # Se devuelve una recomendación. Autorización permanece en las reglas.
            return {'recommendation':result,'authorization':False}
    def unload(self):
        self.agent=None
        try:
            import mlx.core as mx
            mx.clear_cache()
        except ImportError:pass

def codex_handshake(binary=None):
    exe=binary or shutil.which('codex')
    if not exe:raise RuntimeError('Codex CLI no disponible')
    proc=subprocess.Popen([exe,'app-server'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
    try:
        request={'id':1,'method':'initialize','params':{'clientInfo':{'name':'escola_ia','title':'EscoIA','version':'0.3.0'}}}
        proc.stdin.write(json.dumps(request)+'\n');proc.stdin.flush();deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            if select.select([proc.stdout],[],[],1)[0]:
                line=proc.stdout.readline()
                if not line:raise RuntimeError('Codex cerró el transporte')
                result=json.loads(line)
                if result.get('id')==1:
                    if 'error' in result:raise RuntimeError(str(result['error']))
                    proc.stdin.write(json.dumps({'method':'initialized','params':{}})+'\n');proc.stdin.flush()
                    return {'transport':'stdio','status':'verified_handshake','result':result['result'],'at':now()}
        raise TimeoutError('Codex no respondió a initialize')
    finally:
        proc.terminate()
        try:proc.wait(timeout=5)
        except subprocess.TimeoutExpired:proc.kill();proc.wait()

def workspace_read(service,params):
    if os.environ.get('BRAIN_WORKSPACE_READ')!='1':raise PermissionError('Lectura Workspace no habilitada por el usuario')
    routes={'gmail':['gmail','users','messages','list'],'calendar':['calendar','events','list'],'drive':['drive','files','list']}
    if service not in routes:raise ValueError('Servicio no permitido')
    exe=shutil.which('gws')
    if not exe:raise RuntimeError('Instala GWS versionado y completa OAuth; no introduzcas contraseñas en el chat')
    allowed={'gmail':{'userId','maxResults','pageToken','q'},'calendar':{'calendarId','maxResults','pageToken','timeMin','timeMax'},'drive':{'pageSize','pageToken','q','fields'}}
    if set(params)-allowed[service]:raise ValueError('Parámetro no autorizado')
    result=subprocess.run([exe,*routes[service],'--params',json.dumps(params)],capture_output=True,text=True,timeout=30,check=True)
    return json.loads(result.stdout)

def message_envelope(task_id,sender,recipient,objective,permissions=()):
    return {'id':uuid.uuid4().hex,'correlation_id':task_id,'task_id':task_id,'sender':sender,'recipient':recipient,'objective':objective,'permissions':list(permissions),'created':now(),'context':[],'references':[],'result':None,'error':None}

def validate_answer(home,text,sources,*,purpose="evidence"):
    from pathlib import Path
    from .runtime import assert_resources,MODEL_LOCK
    from .knowledge import numeric_checks
    numeric=numeric_checks(text,sources) if purpose=='evidence' else {'passed':True}
    if not numeric['passed']:return {'passed':False,'status':'rejected_by_rules','reason':numeric['reason'],'numeric':numeric}
    from . import remote_ai
    if remote_ai.enabled():return remote_ai.validate(text,sources,purpose)
    home=Path(home)
    executable=home/'.venv-laya/bin/python';model=home/'data/models/laya'
    if not executable.exists() or not (model/'mlx_config.json').exists():return {'passed':False,'status':'unavailable','reason':'Instala el runtime y checkpoint de Laya para comprobar la respuesta'}
    with MODEL_LOCK:
        assert_resources(reserve_gib=1.0)
        env=dict(os.environ,PYTHONPATH=str(home/'src'),OMP_NUM_THREADS='2',OPENBLAS_NUM_THREADS='2',VECLIB_MAXIMUM_THREADS='2')
        from . import resources
        proc=subprocess.Popen([str(executable),'-m','second_brain.laya_worker'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
        resources.LAYA_PID=proc.pid;resources._stamp=0
        try:
            stdout,stderr=proc.communicate(json.dumps({'model':str(model),'answer':text,'sources':sources,'purpose':purpose}),timeout=90)
            if proc.returncode:raise RuntimeError('Laya no pudo completar la revisión: '+stderr[-600:])
        except subprocess.TimeoutExpired:proc.kill();proc.communicate();raise RuntimeError('Laya agotó el tiempo de revisión')
        finally:resources.LAYA_PID=None;resources._stamp=0
        value=json.loads(stdout);value['status']='reviewed';return value
