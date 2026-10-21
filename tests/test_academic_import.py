import tempfile,unittest,json,zipfile,io
from pathlib import Path
from second_brain.academic_import import preview,archive
from second_brain.core import Brain
class AcademicImportTests(unittest.TestCase):
 def test_csv_identifiers_and_rag(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'roster';p.write_text('matrícula;nombre\n00123;Ana Pérez\n')
   rows=preview(p,'csv','lista')['rows'];self.assertEqual(rows,[{'matricula':'00123','nombre':'Ana Pérez'}])
   b=Brain(Path(tmp)/'brain')
   try:
    result=archive(b,p,'csv','lista','alumnos.csv',rows,{'grupo':'101','docente':'Silva'})
    self.assertTrue(b.search('00123'))
    self.assertTrue(archive(b,p,'csv','lista','alumnos.csv',rows,{'grupo':'101','docente':'Silva'})['duplicate'])
    self.assertEqual(len(b.rows('SELECT * FROM documents')),1)
   finally:b.close()
 def test_xlsx_without_extension(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'upload'
   # Minimal OOXML input fixture, no workbook authoring dependency.
   with zipfile.ZipFile(p,'w') as z:
    z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>')
    z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Lista" sheetId="1" r:id="rId1"/></sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
    z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>matricula</t></is></c><c r="B1" t="inlineStr"><is><t>nombre</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>00123</t></is></c><c r="B2" t="inlineStr"><is><t>Ana</t></is></c></row></sheetData></worksheet>')
   self.assertEqual(preview(p,'xlsx','lista')['rows'][0]['matricula'],'00123')
 def test_header_duplicates(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'csv';p.write_text('matricula;matrícula\n1;Ana\n')
   with self.assertRaises(ValueError):preview(p,'csv','lista')
 def test_csv_quoted_values(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'csv';p.write_text('matricula,nombre\n001,"Ana, Pérez"\n')
   self.assertEqual(preview(p,'csv','lista')['rows'][0]['nombre'],'Ana, Pérez')
 def test_roster_title_rows_and_missing_dimensions(self):
  from unittest.mock import patch
  from types import SimpleNamespace
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'upload'
   with zipfile.ZipFile(p,'w') as z:z.writestr('placeholder','fixture')
   sheet=SimpleNamespace(max_row=None,max_column=None,values=iter([('Materia:',None,'Prácticas'),('Grupo:',None,'LAR-101'),(),(),(),(),('#','Matricula','Nombre'),(1,85253.0,'Alumno de prueba'),(None,None,None)]))
   class Book:
    sheetnames=['LAR-101']
    def __getitem__(self,name):return sheet
    def close(self):pass
   with patch('openpyxl.load_workbook',return_value=Book()):
    result=preview(p,'xlsx','lista','LAR-101')
   self.assertEqual(result['rows'],[{'matricula':'85253','nombre':'Alumno de prueba'}])
   self.assertEqual(result['metadata']['grupo'],'LAR-101')
 def test_weekly_expansion_preserves_timezone_and_exclusions(self):
  import subprocess,sys
  with tempfile.TemporaryDirectory() as tmp:
   home=Path(tmp)/'brain';b=Brain(home);p=Path(tmp)/'source.pdf';p.write_bytes(b'%PDF-1.4')
   result=archive(b,p,'pdf','horario','horario.pdf',[{'dia_semana':0,'materia':'LAR105','grupo':'LAR-101','hora_inicio':'09:00','hora_fin':'11:00'}],{'docente_id':2,'horario_tipo':'semanal','periodo':'AGO-DIC 2026','zona_horaria':'America/Mexico_City'});b.close()
   args={'action':'expand_weekly','home':str(home),'documentId':result['document_id'],'teacherId':2,'start':'2026-10-12','end':'2026-10-19','exclude':['2026-10-12'],'room':'Aula 1'}
   r=subprocess.run([sys.executable,'-m','second_brain.academic_import'],input=json.dumps(args),capture_output=True,text=True)
   self.assertEqual(r.returncode,0,r.stdout+r.stderr)
   rows=json.loads(r.stdout)['rows'];self.assertEqual(len(rows),1);self.assertEqual(rows[0]['inicio'],'2026-10-19T09:00:00-06:00')
   args['teacherId']=3
   r=subprocess.run([sys.executable,'-m','second_brain.academic_import'],input=json.dumps(args),capture_output=True,text=True)
   self.assertNotEqual(r.returncode,0)
 def test_current_class_uses_clock_and_end_is_exclusive(self):
  from datetime import datetime
  from zoneinfo import ZoneInfo
  import subprocess,sys
  with tempfile.TemporaryDirectory() as tmp:
   home=Path(tmp)/'brain';b=Brain(home);p=Path(tmp)/'source.pdf';p.write_bytes(b'%PDF-1.4')
   archive(b,p,'pdf','horario','weekly',[{'dia_semana':0,'materia':'LAR105','grupo':'LAR-101','hora_inicio':'09:00','hora_fin':'11:00'}],{'docente_id':2,'horario_tipo':'semanal','periodo':'AGO-DIC 2026','zona_horaria':'America/Mexico_City'});b.close()
   for hour,count in [(10,1),(11,0)]:
    timestamp=datetime(2026,10,12,hour,tzinfo=ZoneInfo('America/Mexico_City')).timestamp()
    r=subprocess.run([sys.executable,'-m','second_brain.academic_import'],input=json.dumps({'action':'current_weekly','home':str(home),'teacherId':2,'timestamp':timestamp}),capture_output=True,text=True,check=True)
    self.assertEqual(len(json.loads(r.stdout)),count)
