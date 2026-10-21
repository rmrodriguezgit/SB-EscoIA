import unittest,tempfile,json,os
from pathlib import Path
from unittest.mock import patch
from second_brain import runtime
class LocalModelProfile(unittest.TestCase):
 def test_reserve_smaller_model(self):
  with patch.dict(os.environ,{'BRAIN_MODEL':'qwen2.5:1.5b-instruct-q4_K_M','BRAIN_CONTEXT':'4096'}):
   self.assertEqual(runtime.local_model(),'qwen2.5:1.5b-instruct-q4_K_M')
   self.assertEqual(runtime.model_reserve_gib(),1.5)
