import json,unittest,tempfile,zipfile
from pathlib import Path
from unittest.mock import patch
from second_brain.program_metadata import extract
from second_brain.programs import prepare,write_docx,NS
from second_brain.core import Brain
class Programs(unittest.TestCase):
 def test_user_planning_intents(self):
  from second_brain.programs import requested
  for text in ['Planificación para un semestre de 16 semanas de la materia de LAR105','Crea el programa de Planificación para un semestre de 16 semanas de la materia de LAR105']:
   self.assertTrue(requested(text))
  self.assertFalse(requested('Dame LAR105 y las horas por semana'))

 def test_remote_export_does_not_check_local_model_pressure(self):
  from second_brain.programs import create
  with tempfile.TemporaryDirectory() as folder:
   b=Brain(Path(folder))
   with patch('second_brain.remote_ai.enabled',return_value=True),patch('second_brain.runtime.assert_resources',side_effect=RuntimeError('presión alta')) as guard,patch('second_brain.programs.prepare',side_effect=ValueError('preparación alcanzada')):
    with self.assertRaisesRegex(ValueError,'preparación alcanzada'):create(b,'Crea programa LAR105')
    guard.assert_not_called()
   b.close()
 def test_period_group_teacher(self):
  d=extract('Elabora LAN864 periodo AGO-DIC 2026 grupo 801 turno matutino docente Rubén Rodríguez')
  self.assertEqual(d['period'],'Agosto–Diciembre 2026');self.assertEqual(d['shift'],'Matutino');self.assertEqual(d['teacher'],'Rubén Rodríguez');self.assertEqual(d['dates'],'01/08/2026 al 31/12/2026');self.assertEqual(d['weekly_dates'][17],'23/11/2026–29/11/2026')
 def test_evening_and_conflict(self):
  self.assertEqual(extract('grupo 711')['shift'],'Vespertino')
  with self.assertRaises(ValueError):extract('grupo 711 turno matutino')
 def test_short_period_rejected(self):
  with self.assertRaises(ValueError):extract('periodo AGO-SEP 2026')
 def test_explicit_metadata_wins(self):
  self.assertEqual(extract('grupo 801',{'group':'811','period':'AGO-DIC 2026'})['shift'],'Vespertino')
 def test_template_typography_and_preserved_header(self):
  from xml.etree import ElementTree as ET
  template=Path(__file__).resolve().parents[1]/'config/templates/planeacion-curso.docx'
  record={'clave':'LAN864','nombre':'Formulación y Evaluación de Proyectos de Inversión','semestre':8,'programa_asignatura':{'contenido_tematico':'Tema','objetivo':'Objetivo','unidades':[{'numero':'I','titulo':'Tema','temas_y_subtemas':[{'numero':'1.1','texto':'Tema'}]}]}}
  with tempfile.TemporaryDirectory() as t:
   b=Brain(Path(t))
   with patch('second_brain.programs.academic_evidence',return_value={'records':[record],'sources':[]}),patch('second_brain.program_references.select',return_value=([],'')):
    plan=prepare(b,'Crea programa LAN864 AGO-DIC 2026 grupo 801')
   target=Path(t)/'plan.docx';write_docx(template,target,plan)
   with zipfile.ZipFile(template) as source,zipfile.ZipFile(target) as out:
    for name in source.namelist():
     if name!='word/document.xml':self.assertEqual(source.read(name),out.read(name))
    root=ET.fromstring(out.read('word/document.xml'));self.assertLessEqual(max(int(s.attrib['{'+NS['w']+'}val']) for s in root.findall('.//w:sz',NS)),28)
    tables=root.findall('.//w:body/w:tbl',NS);self.assertEqual(len(tables[12].findall('w:tr/w:tc',NS)),2)
   self.assertEqual(sum(len(w['topics']) for w in plan['weeks']),14)
   self.assertTrue(all(w['topics'] for w in plan['weeks'] if w['kind']=='teaching'));b.close()
