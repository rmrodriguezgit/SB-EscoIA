"""Recuperación acotada de servicios locales conocidos; sin comandos del usuario."""
import json, os, subprocess, threading, time, urllib.request
from pathlib import Path
_lock = threading.Lock()

def academic_status():
    try:
        with urllib.request.urlopen('http://127.0.0.1:8787/api/me', timeout=2) as response:
            data = json.load(response)
            if not isinstance(data, dict) or not data.get('csrf'):
                raise ValueError('El puerto no corresponde al servicio académico')
        return {'available': True, 'message': 'Servicio académico conectado', 'url': 'http://127.0.0.1:8787/'}
    except Exception:
        return {'available': False, 'message': 'No se pudo conectar con el servicio académico', 'url': 'http://127.0.0.1:8787/'}

def recover_academic(home):
    with _lock:
        status = academic_status()
        if status['available']: return {**status, 'started': False}
        root = Path(home).resolve().parent / 'sistema-escolar'
        script = root / 'arrancar-academico.sh'
        if not script.is_file(): raise ValueError('No se encontró el módulo académico junto a EscoIA')
        logs = Path(home).resolve() / 'data/logs'
        logs.mkdir(parents=True, exist_ok=True)
        path = logs / 'academic-service.log'
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(descriptor, 'ab') as output:
            child = subprocess.Popen(['/bin/bash', str(script)], cwd=root, stdin=subprocess.DEVNULL,
                stdout=output, stderr=output, start_new_session=True)
        for _ in range(30):
            status = academic_status()
            if status['available']: return {**status, 'started': True, 'message': 'Servicio académico iniciado y conectado'}
            if child.poll() is not None: break
            time.sleep(.25)
        return {**status, 'started': False, 'message': 'El servicio no respondió. Revisa data/logs/academic-service.log; comprueba Node.js y la configuración del módulo.'}
