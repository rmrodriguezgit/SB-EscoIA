"""Recuperación acotada de servicios locales conocidos; sin comandos del usuario."""
import json, os, subprocess, threading, time, urllib.error, urllib.request
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

ACADEMIC = 'http://127.0.0.1:8787'

def _academic(path, payload=None, csrf=None, timeout=5):
    """Llamada servidor a servidor al módulo académico (sin Origin, mismo host local)."""
    headers = {'Content-Type': 'application/json'}
    if csrf: headers['X-CSRF-Token'] = csrf
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(ACADEMIC + path, data=data, headers=headers, method='POST' if data is not None else 'GET')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response: return json.load(response)
    except urllib.error.HTTPError as exc:
        try: message = json.load(exc).get('error') or str(exc)
        except Exception: message = str(exc)
        raise ValueError(message) from None
    except OSError:
        raise RuntimeError('El servicio académico no responde; usa «Iniciar servicios»') from None

def academic_profiles():
    """Perfil activo (rol que decide el menú) y perfiles disponibles. La autorización real la aplica 8787."""
    listing = _academic('/api/profiles')
    me = _academic('/api/me')
    return {'profile': me.get('profile'), 'locked': bool(me.get('locked')), 'profiles': listing.get('profiles', [])}

def switch_profile(user_id, pin=''):
    if not isinstance(user_id, int) or isinstance(user_id, bool): raise ValueError('Perfil no válido')
    csrf = _academic('/api/me')['csrf']
    _academic('/api/profile', {'userId': user_id, 'pin': str(pin or '')[:12]}, csrf)
    return academic_profiles()

def set_pin(pin):
    csrf = _academic('/api/me')['csrf']
    _academic('/api/profile/pin', {'pin': str(pin or '')[:12]}, csrf)
    return academic_profiles()
