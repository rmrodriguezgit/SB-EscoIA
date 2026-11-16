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
   self.assertEqual(runtime.model_reserve_gib(),6.5)
  with patch.object(llmlx_local,'request',return_value={'models':[{'name':'llmlx:qwen3.5:4b'}]}):
   with self.assertRaisesRegex(ValueError,'descarga'):inference.select_model('llmlx:qwen3:8b')

if __name__=='__main__':unittest.main()
