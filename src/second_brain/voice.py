import base64,math,os,struct,subprocess,tempfile
from pathlib import Path
from .runtime import MODEL_LOCK,assert_resources

def transcribe(home,encoded):
 home=Path(home);workspace=home.parents[1]
 raw=base64.b64decode(encoded,validate=True)
 if not raw or len(raw)%4 or len(raw)>16000*30*4:raise ValueError('Audio inválido: float32 mono 16 kHz, máximo 30 segundos')
 if any(not math.isfinite(v[0]) for v in struct.iter_unpack('<f',raw)):raise ValueError('Audio contiene valores no finitos')
 binary=Path(os.environ.get('WHISPER_BIN',str(workspace/'work/build-voice/sistema_transcribe')))
 model=Path(os.environ.get('WHISPER_MODEL',str(workspace/'work/whisper/ggml-tiny.bin')))
 if not binary.exists() or not model.exists():raise RuntimeError('Falta whisper.cpp o su modelo; instala la voz local')
 with MODEL_LOCK:
  assert_resources(reserve_gib=0.5)
  with tempfile.NamedTemporaryFile(suffix='.pcm') as f:
   f.write(raw);f.flush();r=subprocess.run([str(binary),str(model),f.name],capture_output=True,text=True,timeout=60)
  if r.returncode:raise RuntimeError('Whisper no pudo transcribir el audio')
  return {'text':r.stdout.strip(),'engine':'whisper.cpp local','language':'es','review_required':True}
