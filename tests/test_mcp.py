import json,os,subprocess,sys,tempfile,unittest
from pathlib import Path

class McpTests(unittest.TestCase):
 def run_mcp(self,home,requests):
  env=dict(os.environ,BRAIN_HOME=str(home),PYTHONPATH=str(Path(__file__).resolve().parents[1]/'src'))
  r=subprocess.run([sys.executable,'-m','second_brain','mcp'],input='\n'.join(map(json.dumps,requests))+'\n',capture_output=True,text=True,env=env,check=True,timeout=60)
  return [json.loads(x) for x in r.stdout.splitlines()]
 def test_tools_and_task_lifecycle(self):
  with tempfile.TemporaryDirectory() as home:
   init={'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18'}}
   first=self.run_mcp(home,[init,{'jsonrpc':'2.0','method':'notifications/initialized'},{'jsonrpc':'2.0','id':2,'method':'tools/list'},
    {'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'task_enqueue','arguments':{'objective':'Resume Radiografía Social'}}}])
   self.assertEqual(first[0]['result']['serverInfo'],{'name':'escoia','version':'0.5.0'})
   self.assertEqual(first[0]['result']['protocolVersion'],'2025-06-18')
   self.assertEqual({t['name'] for t in first[1]['result']['tools']},{'memory_search','mixed_research_read','task_enqueue','task_status','tasks_list','task_cancel'})
   tid=json.loads(first[2]['result']['content'][0]['text'])['id']
   call=lambda i,n,a:{'jsonrpc':'2.0','id':i,'method':'tools/call','params':{'name':n,'arguments':a}}
   out=self.run_mcp(home,[init,call(2,'task_status',{'id':tid}),call(3,'tasks_list',{'limit':5}),call(4,'task_cancel',{'id':tid}),
    call(5,'task_status',{'id':'no-existe'}),call(6,'task_enqueue',{'objective':'x','extra':1}),call(7,'shell',{})])
   self.assertEqual(json.loads(out[1]['result']['content'][0]['text'])['status'],'pendiente')
   self.assertEqual(json.loads(out[2]['result']['content'][0]['text'])[0]['id'],tid)
   self.assertEqual(json.loads(out[3]['result']['content'][0]['text'])['status'],'cancelada')
   for n in (4,5,6):self.assertTrue(out[n]['result']['isError'])
 def test_unknown_protocol_gets_supported_version(self):
  with tempfile.TemporaryDirectory() as home:
   out=self.run_mcp(home,[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'1999-01-01'}}])
   self.assertEqual(out[0]['result']['protocolVersion'],'2025-06-18')

if __name__=='__main__':unittest.main()
