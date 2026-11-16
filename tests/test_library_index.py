import tempfile,unittest
from pathlib import Path
from second_brain import library_index as li
from second_brain.core import Brain

class LibraryIndex(unittest.TestCase):
 def setUp(self):
  self.dir=tempfile.TemporaryDirectory();self.b=Brain(self.dir.name)
  src=Path(self.dir.name)/'data/sources';src.mkdir(parents=True,exist_ok=True);f=src/'plan.pdf';f.write_bytes(b'%PDF-1.4 prueba')
  with self.b.db:
   self.b.db.execute("INSERT INTO documents VALUES('d1','h1','Plan de estudios LAR.pdf','LAR',?,2,'2026-11-16')",(str(f),))
   for i,t in enumerate(['Probabilidad y estadística para actuarios','Cálculo actuarial de seguros de vida']):
    self.b.db.execute('INSERT INTO chunks VALUES(?,?,?,?,?)',(f'c{i}','d1',i+1,t,f'h{i}'));self.b.db.execute('INSERT INTO search VALUES(?,?,?)',(f'c{i}','document',t))
 def tearDown(self):self.b.close();self.dir.cleanup()
 def test_status_reports_lexical_only_without_vectors(self):
  s=li.status(self.b);d=s['documents'][0]
  self.assertEqual((d['chunks'],d['vectors'],d['state']),(2,0,'solo léxico'))
  self.assertEqual(d['doc_type'],'Plan de estudios');self.assertFalse(d['categorized']);self.assertGreater(d['bytes'],0)
  self.assertIn('inactivo',s['semantic'])
 def test_meta_preview_and_search_with_citation(self):
  li.set_meta(self.b,'d1','Licenciatura','Cálculo actuarial','Plan de estudios')
  self.assertTrue(li.status(self.b)['documents'][0]['categorized'])
  with self.assertRaisesRegex(ValueError,'Categoría'):li.set_meta(self.b,'d1','Kínder','x','Plan de estudios')
  self.assertEqual(len(li.preview(self.b,'d1')['chunks']),2)
  r=li.search(self.b,'seguros de vida')
  self.assertIn('léxica',r['mode']);self.assertEqual(r['results'][0]['citation'],'Plan de estudios LAR.pdf · p. 2')
  self.assertEqual(li.search(self.b,'seguros de vida',doc_type='Normativa')['results'],[])
