import json,tempfile,threading,unittest,urllib.request,urllib.error
from pathlib import Path
from unittest.mock import patch
from second_brain.core import Brain
from second_brain import request_records
from second_brain.server import BoundedHTTPServer,Handler
class RequestGitHTTP(unittest.TestCase):
 def test_routes_csrf_versions_trash_and_forget(self):
  with tempfile.TemporaryDirectory() as folder:
   try:server=BoundedHTTPServer(('127.0.0.1',0),Handler)
   except PermissionError:self.skipTest('Red local no autorizada en este entorno')
   server.home=Path(folder);server.token='test-csrf';thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   b=Brain(folder)
   try:
    rid=request_records.start(b,'Petición de prueba HTTP')
    with patch.object(request_records,'verify',return_value={'passed':True,'status':'prueba'}):request_records.finish(b,rid,{'text':'Resultado de prueba'})
    base='http://127.0.0.1:'+str(server.server_port)
    def get(path):
     with urllib.request.urlopen(base+path,timeout=10) as response:return json.load(response)
    def post(payload,token='test-csrf'):
     req=urllib.request.Request(base+'/api/request-git',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','X-CSRF-Token':token})
     with urllib.request.urlopen(req,timeout=10) as response:return json.load(response)
    h=get('/api/request-git?id='+rid);self.assertGreaterEqual(len(h['commits']),2)
    with self.assertRaises(urllib.error.HTTPError) as error:post({'id':rid,'action':'delete','head':h['head']},'wrong')
    self.assertEqual(error.exception.code,403)
    self.assertTrue(post({'id':rid,'action':'delete','head':h['head']})['archived'])
    h=get('/api/request-git?id='+rid)
    self.assertFalse(post({'id':rid,'action':'restore','head':h['head']})['archived'])
    with self.assertRaises(urllib.error.HTTPError) as error:get('/api/request-git?id='+rid+'&action=diff&sha=invalid')
    self.assertEqual(error.exception.code,400)
    h=get('/api/request-git?id='+rid)
    self.assertEqual(post({'id':rid,'action':'forget','head':h['head'],'confirmation':rid})['forgotten'],rid)
    with self.assertRaises(urllib.error.HTTPError) as error:get('/api/request-git?id='+rid)
    self.assertEqual(error.exception.code,404)
   finally:b.close();server.shutdown();server.server_close();thread.join(timeout=2)
