import unittest,io
from unittest.mock import patch
from second_brain import remote_ai
class RemoteTransportTests(unittest.TestCase):
 def test_sse_requires_completion(self):
  with patch.object(remote_ai,'request',return_value=io.BytesIO(b'data: {"content":"hola"}\n\n')):
   with self.assertRaisesRegex(RuntimeError,'incompleta'):remote_ai.chat({'messages':[]},2)
 def test_sse_accumulates_content(self):
  with patch.object(remote_ai,'request',return_value=io.BytesIO(b'data: {"content":"hola"}\n\ndata: {"done":true}\n\n')):
   self.assertEqual(remote_ai.chat({'messages':[]},2)['message']['content'],'hola')
 def test_local_embed_has_no_fallback(self):
  with self.assertRaisesRegex(RuntimeError,'deshabilitada'):remote_ai.ollama_contract('/api/embed',{})
 def test_decision_invalid_probability_rejected(self):
  with patch.object(remote_ai,'enabled',return_value=True),patch.object(remote_ai,'decide',return_value={'answers':{'supported':{'noul':True}}}):
   with self.assertRaisesRegex(RuntimeError,'inválido'):remote_ai.validate('respuesta',[],'artifact')

 def test_stream_has_total_deadline_even_with_content(self):
  with patch.object(remote_ai.time,'monotonic',return_value=10):
   with self.assertRaises(TimeoutError):remote_ai._consume(io.BytesIO(b'data: {"content":"hola"}\n'),9)
