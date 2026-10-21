"""Proceso MLX temporal: se libera toda la memoria al terminar cada revisión."""
import json,sys,re
from pathlib import Path

def main():
 import laya_mlx
 import mlx.core as mx
 mx.set_cache_limit(64*1024**2)
 payload=json.load(sys.stdin)
 agent=laya_mlx.load(payload['model'],dtype='float16')
 if payload.get('purpose')=='artifact':
  out=agent.predict(payload['answer'][:7000],{'matches':{'type':'noul','instructions':'¿La entrega final cumple los requisitos explícitos de la solicitud original? Compara dominio, herramientas y resultados solicitados. No exijas campos que la solicitud no pide. Evalúa correspondencia, no respaldo bibliográfico de cada línea de código.', 'criteria':{'false':'Entrega otro tema u omite un requisito explícito de la solicitud.','true':'Los extractos finales satisfacen los requisitos explícitos de la solicitud.'}}})
  probability=float(out['answers']['matches']['noul'])
  truncated='"truncated": true' in json.dumps(out.get('usage',{})).lower()
  print(json.dumps({'engine':'Laya MLX multilingüe','purpose':'artifact','passed':probability>=0.85 and not truncated,'match_probability':probability,'truncated':truncated}));return
 claims=[s.strip() for s in re.split(r'\n+|(?<=[.!?])\s+',payload['answer']) if len(s.strip())>15]
 results=[]
 for claim in claims[:24]:
  references=[int(n) for n in re.findall(r'\[(\d+)\]',claim)]
  refs=[payload['sources'][n-1] for n in references if 0<n<=len(payload['sources'])]
  if not refs:refs=payload['sources'][:2]
  terms=set(re.findall(r'\w+',claim.lower()))
  pieces=[]
  for source in refs:
   paragraphs=[p for p in re.split(r'\n\s*\n',source['text']) if p.strip()]
   paragraphs.sort(key=lambda p:len(terms & set(re.findall(r'\w+',p.lower()))),reverse=True)
   pieces.extend(paragraphs[:2])
  state='AFIRMACIÓN:\n'+claim[:650]+'\nEVIDENCIA ORIGINAL:\n'+'\n'.join(pieces)[:1500]
  out=agent.predict(state,{'supported':{'type':'noul','instructions':'¿Todos los datos de la afirmación coinciden exactamente con la evidencia original?', 'criteria':{'false':'Cambia una cifra o una entidad, contradice el texto o no se puede demostrar con la evidencia.','true':'Todas las cifras y entidades coinciden con la evidencia; no añade supuestos ni inferencias.'}}})
  probability=float(out['answers']['supported']['noul'])
  usage=out.get('usage',{})
  truncated='"truncated": true' in json.dumps(usage).lower()
  results.append({'claim':claim,'support_probability':probability,'truncated':truncated,'usage':usage})
 print(json.dumps({'engine':'Laya MLX multilingüe','checks':results,'passed':bool(results) and len(claims)<=24 and all(r['support_probability']>=0.85 and not r['truncated'] for r in results),'coverage_complete':len(claims)<=24},ensure_ascii=False))
if __name__=='__main__':main()
