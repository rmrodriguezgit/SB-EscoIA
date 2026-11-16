import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from second_brain.core import Brain
from second_brain import galaxy,llmlx_local

class GalaxyTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.b=Brain(Path(self.tmp.name));galaxy._llm_cache=(0.0,None)
 def tearDown(self):self.b.close();self.tmp.cleanup()
 def test_runs_grouped_with_kind_and_status(self):
  for state,msg in [('Gateway','Petición recibida'),('RAG','Recuperando'),('Qwen','Procesando'),('Laya','Revisando'),('completada','Listo')]:self.b.event('a'*32,state,msg)
  for state,msg in [('Gateway','x'),('Planeación','plan'),('retenida','no')]:self.b.event('b'*32,state,msg)
  tid=self.b.enqueue('Pregunta por MCP')
  folder=self.b.home/'data/requests'/('a'*32);folder.mkdir(parents=True)
  (folder/'contract.json').write_text(json.dumps({'original_request':'¿Qué materias hay?','status':'verificada'}))
  (folder/'result.json').write_text(json.dumps({'mode':'Qwen + LAYA','sources':[{},{}]}))
  runs={r['id']:r for r in galaxy.runs(self.b)}
  a=runs['a'*32];self.assertEqual((a['kind'],a['status'],a['title'],a['sources'],a['used_llm'],a['reviewed']),('consulta','done','¿Qué materias hay?',2,True,True))
  self.assertEqual((runs['b'*32]['kind'],runs['b'*32]['status']),('programa','held'))
  self.assertEqual((runs[tid]['kind'],runs[tid]['status'],runs[tid]['title']),('cola','queued','Pregunta por MCP'))
 def test_llm_disconnected_never_raises(self):
  with patch.object(llmlx_local,'_call',side_effect=RuntimeError('LLMLX no responde')):
   self.assertEqual(galaxy.llm('24h'),{'connected':False,'reason':'LLMLX no responde','window':'24h'})
 def test_llm_metrics_summarised(self):
  data={'live':{'engine':'Listo','inFlight':1,'capacity':2,'loadedModels':[{'name':'qwen3.5:4b'}],'memory':{'availableBytes':3*1024**3,'thresholdBytes':2*1024**3,'totalBytes':16*1024**3}},
        'totals':{'requests':3},'recent':[{'time':'t','model':'m','status':200,'completion_tokens':50,'eval_ms':2000}]}
  with patch.object(llmlx_local,'_call',return_value=data):
   out=galaxy.llm('1h')
  self.assertEqual((out['in_flight'],out['loaded'],out['memory']['available_gib'],out['recent'][0]['tokens_per_sec']),(1,['qwen3.5:4b'],3.0,25.0))
 def test_window_whitelist(self):
  with patch.object(galaxy,'llm',return_value={}) as llm:galaxy.snapshot(self.b,'1y')
  llm.assert_called_once_with('24h')

if __name__=='__main__':unittest.main()
