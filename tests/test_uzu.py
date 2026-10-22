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
  with patch.object(runtime,'local_model',return_value=uzu_local.MODEL):self.assertGreaterEqual(runtime.model_reserve_gib(),0.85)
  # Nunca por debajo del pico medido del proceso Uzu (0,724 GiB).
  self.assertGreater(uzu_local.RESERVE_GIB,0.724)

import importlib.util,pathlib
_spec=importlib.util.spec_from_file_location('uzu_worker',pathlib.Path(__file__).resolve().parents[1]/'scripts/uzu_worker.py')
worker=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(worker)
ONE={'type':'object','properties':{'respuesta':{'type':'string'}},'required':['respuesta'],'additionalProperties':False}
ANSWER={'type':'object','properties':{'answer':{'type':'string'},'source_ids':{'type':'array','items':{'type':'integer'}}},'required':['answer','source_ids'],'additionalProperties':False}
class UzuJsonTests(unittest.TestCase):
 def test_fenced_valid_json(self):
  self.assertEqual(json.loads(worker.coerce_json('```json\n{"respuesta": "Suma entre n"}\n```',ONE)),{'respuesta':'Suma entre n'})
 def test_object_after_prose(self):
  self.assertEqual(json.loads(worker.coerce_json('Claro: {"answer": "x [1]", "source_ids": [1]} fin',ANSWER))['source_ids'],[1])
 def test_plain_text_single_string_field(self):
  # Salida real observada con el esquema de probar-uzu.py: texto plano sin JSON.
  self.assertEqual(json.loads(worker.coerce_json('La media aritmética es la suma dividida entre n.',ONE))['respuesta'],'La media aritmética es la suma dividida entre n.')
 def test_wrong_keys_or_truncated_rejected(self):
  # Salida real observada: claves distintas y JSON cortado por el límite de tokens.
  with self.assertRaisesRegex(ValueError,'esquema'):worker.coerce_json('```json\n{\n  "media_aritmetica": {\n    "definicion": "Es un',ONE)
  with self.assertRaisesRegex(ValueError,'esquema'):worker.coerce_json('{"answer": "x", "source_ids": ["1"]}',ANSWER)
  with self.assertRaisesRegex(ValueError,'esquema'):worker.coerce_json('{"answer": "x"}',ANSWER)
 def test_no_extra_fields(self):
  with self.assertRaisesRegex(ValueError,'esquema'):worker.coerce_json('{"respuesta": "a", "extra": 1}',ONE)
 def test_prompt_mentions_schema(self):
  self.assertIn('"respuesta"',worker.schema_prompt(ONE))
