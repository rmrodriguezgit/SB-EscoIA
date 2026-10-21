"""Bibliografía por asignatura: catálogo verificado o metadatos pertinentes."""
import json
from .core import normal

def select(brain,record):
 path=brain.home/'config/academic_references.json'
 registry=json.loads(path.read_text()) if path.exists() else []
 matched=[r for r in registry if normal(record['nombre']) in [normal(n) for n in r['courses']]]
 if matched:return [r['citation']+' '+r['url'] for r in matched],'Bibliografía seleccionada por correspondencia con la asignatura y datos de la editorial. Consulta: '+matched[0]['checked']+'.'
 try:
  from .lessons import web_sources
  sources=web_sources(record['nombre'])
  if sources:return [s['citation'] for s in sources],'Lecturas pertinentes recuperadas de fuentes públicas; revisar su cobertura para la bibliografía básica del curso.'
 except Exception:pass
 return [],'Bibliografía pendiente de selección y verificación; no se trasladaron referencias ajenas a la asignatura.'
