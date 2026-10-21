import json,subprocess,unittest
from unittest.mock import patch
from second_brain import uzu_local,runtime,inference
class UzuTests(unittest.TestCase):
 def test_chat_contract(self):
  result=subprocess.CompletedProcess([],0,json.dumps({'message':{'content':'respuesta'}}),'')
  with patch.object(uzu_local,'available',return_value=True),patch.object(uzu_local.subprocess,'run',return_value=result) as run:
   self.assertEqual(uzu_local.request('/api/chat',{'messages':[]})['message']['content'],'respuesta')
   self.assertLessEqual(run.call_args.kwargs['timeout'],120)
 def test_timeout_releases_lock(self):
  with patch.object(uzu_local,'available',return_value=True),patch.object(uzu_local.subprocess,'run',side_effect=subprocess.TimeoutExpired('worker',120)):
   with self.assertRaisesRegex(RuntimeError,'límite'):uzu_local.request('/api/chat',{'messages':[]})
  self.assertFalse(uzu_local.LOCK.locked())
 def test_unprepared_selection_rejected(self):
  with patch.object(uzu_local,'available',return_value=False):
   with self.assertRaisesRegex(ValueError,'preparar'):inference.select_model(uzu_local.MODEL)
 def test_memory_reserve(self):
  with patch.object(runtime,'local_model',return_value=uzu_local.MODEL):self.assertGreaterEqual(runtime.model_reserve_gib(),1.5)
