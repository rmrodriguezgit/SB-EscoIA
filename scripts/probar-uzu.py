"""Prueba real con protección de recursos y salida JSON para comparar ejecuciones."""
import json,time
from second_brain.runtime import assert_resources
from second_brain.uzu_local import request
assert_resources(1.5,force_local=True)
start=time.monotonic()
result=request('/api/chat',{'messages':[{'role':'system','content':'Responde en español con JSON.'},{'role':'user','content':'Define la media aritmética en una frase.'}],'format':{'type':'object','properties':{'respuesta':{'type':'string'}},'required':['respuesta'],'additionalProperties':False},'options':{'num_predict':100}})
content=json.loads(result['message']['content'])
if not content.get('respuesta'):raise RuntimeError('Respuesta estructurada vacía')
print(json.dumps({'seconds':round(time.monotonic()-start,3),'response':content,'runtime':'uzu 0.6.3'},ensure_ascii=False))
