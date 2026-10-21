import unittest,tempfile,json,zipfile,threading
from pathlib import Path
from unittest.mock import patch
from second_brain.core import Brain
from second_brain.resources import release_models
from second_brain.runtime import PIPELINE_LOCK
class ResourceControl(unittest.TestCase):
 def setUp(self):
  local=patch("second_brain.remote_ai.enabled",return_value=False);local.start();self.addCleanup(local.stop)
 def test_release_refuses_active_request(self):
  PIPELINE_LOCK.acquire()
  try:
   with self.assertRaises(RuntimeError):release_models(Path('/unused'))
  finally:PIPELINE_LOCK.release()
 def test_release_preserves_other_models(self):
  def api(path,payload=None,timeout=None):
   if path=='/api/ps':return {'models':[{'name':'other:7b'}]}
   self.fail('Un modelo ajeno no debe descargarse')
  with patch('second_brain.resources.ollama',side_effect=api),patch('second_brain.resources.snapshot',return_value={}):
   self.assertEqual(release_models(Path('/unused'))['released'],[])
 def test_release_reports_remaining_shortfall_after_unlock(self):
  def telemetry(home):
   return {'memory':{'used_gib':11.8,'can_load':False,'pressure':'Normal','shortfall_gib':1.8,'reserve_gib':2.5},'pipeline_busy':PIPELINE_LOCK.locked()}
  with patch('second_brain.resources.ollama',return_value={'models':[]}),patch('second_brain.resources.snapshot',side_effect=telemetry):
   result=release_models(Path('/unused'))
  self.assertFalse(result['resources']['pipeline_busy'])
  self.assertIn('Faltan 1.80 GiB',result['message'])
  self.assertIn('No había modelos',result['message'])
 def test_release_handles_unavailable_ollama_without_claiming_success(self):
  with patch('second_brain.resources.ollama',side_effect=ConnectionError()),patch('second_brain.resources.snapshot',return_value={}):
   result=release_models(Path('/unused'))
  self.assertIn('Ollama no respondió',result['message'])
  self.assertIn('no se garantiza',result['message'])
  self.assertFalse(PIPELINE_LOCK.locked())
 def test_two_pdf_processes_and_serial_database_writes(self):
  import subprocess
  barrier=threading.Barrier(2);owner=threading.get_ident();threads=set()
  def extract(*args,**kwargs):
   threads.add(threading.get_ident());barrier.wait(timeout=3);return subprocess.CompletedProcess(args,0,stdout=b'Texto academico\f')
  with tempfile.TemporaryDirectory() as t:
   b=Brain(Path(t));z=Path(t)/'planes.zip'
   with zipfile.ZipFile(z,'w') as archive:archive.writestr('LAR A.pdf',b'pdf1');archive.writestr('LAN B.pdf',b'pdf2')
   with patch('second_brain.core.subprocess.run',side_effect=extract):r=b.ingest_zip(z)
   self.assertEqual(len(r['imported']),2);self.assertEqual(len(threads),2);self.assertNotIn(owner,threads);self.assertEqual(len(b.rows('SELECT * FROM documents')),2);b.close()
