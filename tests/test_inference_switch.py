import unittest,tempfile
from pathlib import Path
from unittest.mock import patch
from second_brain import inference,remote_ai,runtime
class Switch(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.old=(inference._active,inference._reason);inference._active=None;inference._reason=''
  self.config=patch.object(inference,'CONFIG',Path(self.temp.name)/'inference.json');self.config.start()
 def tearDown(self):
  self.config.stop();self.temp.cleanup();inference._active,inference._reason=self.old
 def test_default_and_persistent_selection(self):
  self.assertEqual(inference.status()['active'],'remote');inference.select('local');self.assertEqual(inference.preferred(),'local');inference.select('remote');self.assertEqual(inference.status()['active'],'remote')
 def test_failed_laya_routes_local(self):
  with patch.object(runtime,'assert_resources'),patch.object(remote_ai,'decide',side_effect=RuntimeError('HTTP 530')),patch.object(remote_ai,'_local_review',return_value={'passed':True}) as local:
   self.assertTrue(remote_ai._review('test','test')['passed']);local.assert_called_once()
  self.assertEqual(inference.status()['active'],'local');self.assertEqual(inference.preferred(),'remote')
 def test_cannot_change_during_query(self):
  runtime.PIPELINE_LOCK.acquire()
  try:
   with self.assertRaises(ValueError):inference.select('local')
  finally:runtime.PIPELINE_LOCK.release()
 def test_local_model_selection_persists(self):
  with patch.dict('os.environ',{},clear=True):
   inference.select_model('qwen2.5:3b-instruct-q4_K_M')
  import json
  data=json.loads((inference.CONFIG.parent/'local-model.json').read_text())
  self.assertEqual(data['model'],'qwen2.5:3b-instruct-q4_K_M')
  with self.assertRaises(ValueError):inference.select_model('unknown')

 def test_health_failure_does_not_switch_local(self):
  with patch.object(remote_ai,'enabled',return_value=True),patch.object(remote_ai,'health',side_effect=RuntimeError('HTTP 530')):
   state=runtime._uncached_model_status()
  self.assertFalse(state['available']);self.assertEqual(inference.status()['active'],'remote')
 def test_new_request_retries_preference(self):
  with patch.object(runtime,'assert_resources'):inference.fallback('HTTP 530')
  self.assertEqual(inference.status()['active'],'local')
  inference.begin_request();self.assertEqual(inference.status()['active'],'remote')
 def test_failed_fallback_does_not_claim_local_execution(self):
  with patch.object(runtime,'assert_resources',side_effect=RuntimeError('memoria insuficiente')):
   with self.assertRaisesRegex(RuntimeError,'servicio remoto falló'):inference.fallback('HTTP 530')
  self.assertEqual(inference.status()['active'],'remote')
