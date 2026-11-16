import json,unittest,tempfile
from pathlib import Path
from unittest.mock import patch
from second_brain import inference,llmlx_local,runtime
class Switch(unittest.TestCase):
 """Solo LLMLX: el motor remoto y los modelos Ollama/Uzu propios no se ofrecen."""
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.old=(inference._active,inference._reason);inference._active=None;inference._reason=''
  self.config=patch.object(inference,'CONFIG',Path(self.temp.name)/'inference.json');self.config.start()
 def tearDown(self):
  self.config.stop();self.temp.cleanup();inference._active,inference._reason=self.old
 def test_only_local_engine(self):
  self.assertEqual(inference.status()['active'],'local')
  with self.assertRaisesRegex(ValueError,'LLMLX'):inference.select('remote')
  self.assertEqual(inference.select('local')['active'],'local')
 def test_cannot_change_during_query(self):
  runtime.PIPELINE_LOCK.acquire()
  try:
   with self.assertRaises(ValueError):inference.select('local')
  finally:runtime.PIPELINE_LOCK.release()
 def test_only_llmlx_models_selectable(self):
  self.assertEqual(inference.LOCAL_MODELS,['llmlx:qwen3.5:4b','llmlx:qwen3:8b'])
  for model in ['uzu:qwen3.5:0.8b:4bit','qwen2.5:1.5b-instruct-q4_K_M','unknown']:
   with self.assertRaisesRegex(ValueError,'no permitido'):inference.select_model(model)
 def test_llmlx_selection_persists(self):
  with patch.dict('os.environ',{},clear=True),patch.object(llmlx_local,'request',return_value={'models':[{'name':'llmlx:qwen3:8b'}]}):
   inference.select_model('llmlx:qwen3:8b')
  self.assertEqual(json.loads((inference.CONFIG.parent/'local-model.json').read_text())['model'],'llmlx:qwen3:8b')

class InstalledModels(unittest.TestCase):
 def test_selector_lists_llmlx_installed_chat_models(self):
  tags={'models':[{'name':'qwen3:8b','model':'qwen3:8b','size':5225388164,'capabilities':['completion']},{'name':'bge-m3','model':'bge-m3','size':1,'capabilities':['embedding']},{'name':'qwen3.5-4b-ctx16k:latest','model':'qwen3.5-4b-ctx16k:latest','size':3973304967}]}
  llmlx_local._MODELS_CACHE=(0.0,None)
  with patch.object(llmlx_local,'_call',return_value=tags):
   state=inference.status()
  llmlx_local._MODELS_CACHE=(0.0,None)
  self.assertEqual(state['local_models'],['llmlx:qwen3:8b','llmlx:qwen3.5-4b-ctx16k:latest'])
  self.assertEqual(state['local_models_info'][0]['size_gib'],4.87)
 def test_selector_falls_back_when_llmlx_down(self):
  llmlx_local._MODELS_CACHE=(0.0,None)
  with patch.object(llmlx_local,'_call',side_effect=RuntimeError('LLMLX no responde')):
   self.assertEqual(inference.status()['local_models'],inference.LOCAL_MODELS)
