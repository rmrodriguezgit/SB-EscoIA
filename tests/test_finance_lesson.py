import unittest
from second_brain.finance_lesson import build,check,requested
class Finance(unittest.TestCase):
 def test_wrong_original_rejected(self):
  old={'cells':[{'cell_type':'code','source':['from statistics import mean\nnotas=[60,70]']},{'cell_type':'markdown','source':['Horas de estudio']}]}
  self.assertFalse(check('análisis de datos en finanzas usa yfinance',old)['passed'])
 def test_correct_contract(self):
  q='Desarrolla el tema de EL ANÁLISIS DE DATOS EN FINANZAS usa yfinance, entrega un ipynb'
  self.assertTrue(requested(q));n=build(q);self.assertTrue(check(q,n)['passed'])
 def test_import_alone_not_enough(self):
  n=build('finanzas usa yfinance')
  for c in n['cells']:
   if c['cell_type']=='code' and 'yf.download' in ''.join(c['source']):c['source']=['pass']
  self.assertFalse(check('usa yfinance',n)['passed'])
