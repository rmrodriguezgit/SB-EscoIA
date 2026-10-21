import unittest,json
from unittest.mock import Mock
from second_brain.runtime import resolve_career
from second_brain.academic_json import academic_evidence
class CareerAlias(unittest.TestCase):
 def test_contabilidad_as_career(self):
  self.assertEqual(resolve_career('Materias de la Carrera de Contabilidad para 1er Semestre',''),'LCP')
  self.assertEqual(resolve_career('Materias de la Carrera de Contabilidad para 1er Semestre','LAR'),'LCP')
  self.assertEqual(resolve_career('Contabilidad',''),'')
 def test_ordinal_filters_semester(self):
  for ordinal in ['1er','primer','1','1ro','1º']:
   brain=Mock();brain.rows.side_effect=[[{'name':'academic_records'}],[]]
   academic_evidence(brain,'Materias de Contaduría '+ordinal+' semestre','LCP')
   self.assertIn('semester=?',brain.rows.call_args.args[0])
   self.assertEqual(brain.rows.call_args.args[1],('LCP',1))
