"""Revisión opcional con LAYA en un subproceso aislado. Ningún documento activa permisos ni comandos."""
import json,os,subprocess

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
            stdout,stderr=proc.communicate(json.dumps({'model':str(model),'answer':text,'sources':sources,'purpose':purpose}),timeout=float(os.environ.get('ESCOIA_LAYA_TIMEOUT','90')))
            if proc.returncode:raise RuntimeError('Laya no pudo completar la revisión: '+stderr[-600:])
        except subprocess.TimeoutExpired:proc.kill();proc.communicate();raise RuntimeError('Laya agotó el tiempo de revisión')
        finally:resources.LAYA_PID=None;resources._stamp=0
        value=json.loads(stdout);value['status']='reviewed';return value
