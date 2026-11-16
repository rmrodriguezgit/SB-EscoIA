import io,json,os,unittest,urllib.error
from unittest.mock import patch
from second_brain import llmlx_local,runtime,inference

class Resp(io.BytesIO):
 def __enter__(self):return self
 def __exit__(self,*a):pass

class LlmlxTests(unittest.TestCase):
 def test_routes_and_strips_prefix(self):
  sent={}
  def fake(req,timeout):
   sent.update(url=req.full_url,body=json.loads(req.data),headers=dict(req.header_items()))
   return Resp(json.dumps({'message':{'content':'{}'}}).encode())
  with patch.object(runtime,'local_model',return_value='llmlx:qwen3.5:4b'),patch.object(llmlx_local._OPENER,'open',side_effect=fake):
   runtime.ollama('/api/chat',{'model':'llmlx:qwen3.5:4b','messages':[],'keep_alive':0})
  self.assertEqual(sent['url'],'http://127.0.0.1:11500/api/chat')
  self.assertEqual(sent['body']['model'],'qwen3.5:4b')
  self.assertIs(sent['body']['think'],False)
  self.assertEqual(sent['headers']['X-client-app'],'escoia')

 def test_tags_and_ps_are_prefixed(self):
  with patch.object(llmlx_local._OPENER,'open',return_value=Resp(json.dumps({'models':[{'name':'qwen3.5:4b','model':'qwen3.5:4b'}]}).encode())):
   self.assertEqual(llmlx_local.request('/api/ps')['models'][0]['name'],'llmlx:qwen3.5:4b')

 def test_breaker_429_is_explained(self):
  err=urllib.error.HTTPError('u',429,'busy',{'Retry-After':'5'},io.BytesIO(b''))
  with patch.object(llmlx_local._OPENER,'open',side_effect=err):
   with self.assertRaisesRegex(RuntimeError,'poca RAM.*5 s'):llmlx_local.request('/api/chat',{'model':'llmlx:qwen3.5:4b'})

 def test_remote_host_rejected(self):
  with patch.dict(os.environ,{'LLMLX_HOST':'http://example.com:11500'}):
   with self.assertRaisesRegex(ValueError,'local'):llmlx_local.base()

 def test_embeddings_stay_on_ollama(self):
  with patch.object(runtime,'local_model',return_value='llmlx:qwen3.5:4b'),patch.object(llmlx_local,'request') as r,patch.object(runtime.urllib.request,'urlopen',return_value=Resp(b'{"embeddings":[[0]]}')),patch('second_brain.inference.ensure_ollama'):
   runtime.ollama('/api/embed',{'model':'bge-m3','input':'x'})
  r.assert_not_called()

 def test_reserve_and_missing_model(self):
  with patch.dict(os.environ,{'BRAIN_CONTEXT':'4096'}),patch.object(runtime,'local_model',return_value='llmlx:qwen3:8b'):
   self.assertEqual(runtime.model_reserve_gib(),0.0)  # la RAM la gestiona LLMLX
  with patch.object(llmlx_local,'request',return_value={'models':[{'name':'llmlx:qwen3.5:4b'}]}):
   with self.assertRaisesRegex(ValueError,'descarga'):inference.select_model('llmlx:qwen3:8b')


 def test_budget_delegated_to_llmlx_breaker(self):
  with patch.object(runtime,'local_model',return_value='llmlx:qwen3.5:4b'),patch.object(llmlx_local,'status',return_value={'connected':True,'breaker_open':False,'available_gib':3.2}),patch.object(runtime.subprocess,'run') as run:
   self.assertEqual(runtime.assert_resources()['provider'],'LLMLX')
  run.assert_not_called()  # no se aplica el presupuesto de 12,5 GiB de EscoIA
  with patch.object(runtime,'local_model',return_value='llmlx:qwen3.5:4b'),patch.object(llmlx_local,'status',return_value={'connected':True,'breaker_open':True}):
   with self.assertRaisesRegex(RuntimeError,'breaker'):runtime.assert_resources()
  with patch.object(runtime,'local_model',return_value='llmlx:qwen3.5:4b'),patch.object(llmlx_local,'status',return_value={'connected':False,'reason':'LLMLX no responde'}):
   with self.assertRaisesRegex(RuntimeError,'no responde'):runtime.assert_resources()

 def test_other_tasks_keep_escoia_budget(self):
  # Reservas explícitas (LAYA, PDF, voz) siguen midiendo memoria del sistema.
  with patch.object(runtime,'local_model',return_value='llmlx:qwen3.5:4b'),patch.object(llmlx_local,'check') as check,patch.object(runtime,'memory_budget',return_value={'ok':1}) as budget,patch.object(runtime.subprocess,'run',return_value=runtime.subprocess.CompletedProcess([],0,'1','')):
   runtime.assert_resources(reserve_gib=1.0)
  check.assert_not_called();budget.assert_called_once()

 def test_mlx_runner_without_structured_output(self):
  # Observado 2026-11-15: qwen3.5:4b (runner mlx) responde 501 "structured output is unavailable".
  schema={'type':'object','properties':{'answer':{'type':'string'},'source_ids':{'type':'array','items':{'type':'integer'}}},'required':['answer','source_ids'],'additionalProperties':False}
  calls=[]
  def fake(req,timeout):
   body=json.loads(req.data);calls.append(body)
   if 'format' in body:raise urllib.error.HTTPError('u',501,'x',{},io.BytesIO(b'{"error":"structured output is unavailable"}'))
   return Resp(json.dumps({'message':{'content':'```json\n{"answer": "5 créditos [1]", "source_ids": [1]}\n```'}}).encode())
  llmlx_local._NO_FORMAT.discard('qwen-test')
  with patch.object(llmlx_local._OPENER,'open',side_effect=fake):
   out=llmlx_local.request('/api/chat',{'model':'llmlx:qwen-test','format':schema,'messages':[{'role':'user','content':'Pregunta'}]})
   self.assertEqual(json.loads(out['message']['content']),{'answer':'5 créditos [1]','source_ids':[1]})
   self.assertNotIn('format',calls[1]);self.assertIn('"answer"',calls[1]['messages'][-1]['content'])
   llmlx_local.request('/api/chat',{'model':'llmlx:qwen-test','format':schema,'messages':[{'role':'user','content':'Otra'}]})
  self.assertEqual(len(calls),3)  # el segundo uso ya no intenta `format`
  llmlx_local._NO_FORMAT.discard('qwen-test')

if __name__=='__main__':unittest.main()
