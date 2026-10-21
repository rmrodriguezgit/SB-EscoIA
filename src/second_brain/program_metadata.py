"""Datos de planificación aportados por el usuario; calendario propuesto explícito."""
import calendar,re
from datetime import date,timedelta
from .core import normal
MONTHS={'ENE':1,'FEB':2,'MAR':3,'ABR':4,'MAY':5,'JUN':6,'JUL':7,'AGO':8,'SEP':9,'OCT':10,'NOV':11,'DIC':12}
NAMES=['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
def extract(question,metadata=None):
 data=dict(metadata or {})
 question=re.sub(r'(?i)\b(?:maestro|docente|profesor)\s+(?:o|y)\s+(?:maestro|docente|profesor)\b','docente',question)
 period=re.search(r'\b(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s*[-–/]\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s+(20\d{2})\b',question,re.I)
 if period and not data.get('period'):data['period']='-'.join([period[1].upper(),period[2].upper()])+' '+period[3]
 for label,field in [('grupo','group'),('docente|profesor|maestro','teacher'),('turno','shift'),('modalidad','modality')]:
  if data.get(field):continue
  m=re.search(r'(?i)\b(?:'+label+r')\s*[:=]?\s+(.+?)(?=\s+(?:grupo|docente|profesor|maestro|turno|modalidad|periodo|período)\b|[,;\n]|$)',question)
  if m:data[field]=m[1].strip()
 if data.get('group'):
  data['group']=str(data['group']).split()[0][:30]
 group=re.fullmatch(r'([1-9])([01])\d',data.get('group',''))
 inferred='Matutino' if group and group[2]=='0' else 'Vespertino' if group else None
 shift=normal(str(data.get('shift','')))
 if shift:
  shift='Matutino' if shift in {'matutino','manana','morning'} else 'Vespertino' if shift in {'vespertino','tarde','evening'} else str(data['shift'])
  if inferred and shift!=inferred:raise ValueError('El turno indicado contradice la nomenclatura del grupo; corrige grupo o turno')
 else:shift=inferred or 'Por completar'
 data['shift']=shift;data['group_semester']=int(group[1]) if group else None
 p=re.fullmatch(r'(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s*[-–/]\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s+(20\d{2})',str(data.get('period','')),re.I)
 if p:
  m1,m2,year=MONTHS[p[1].upper()],MONTHS[p[2].upper()],int(p[3]);endyear=year+(m2<m1)
  start,end=date(year,m1,1),date(endyear,m2,calendar.monthrange(endyear,m2)[1])
  data['period']=f'{NAMES[m1]}–{NAMES[m2]} {year}'+(f'–{endyear}' if endyear!=year else '')
  data['dates']=f'{start:%d/%m/%Y} al {end:%d/%m/%Y}'
  first=date.fromisoformat(data['start_date']) if data.get('start_date') else start+timedelta(days=(-start.weekday())%7)
  if first<start or first>end:raise ValueError('La fecha de inicio está fuera del período')
  data['weekly_dates']={i:f'{(first+timedelta(weeks=i-1)):%d/%m/%Y}–{(first+timedelta(weeks=i-1,days=6)):%d/%m/%Y}' for i in range(1,18)}
  if first+timedelta(weeks=16,days=6)>end:raise ValueError('El período no alcanza para 17 semanas; indica un período o inicio compatible')
  data['calendar_note']='Rangos semanales propuestos desde '+first.strftime('%d/%m/%Y')+'; ajustar festivos, días de clase y exámenes al calendario institucional.'
 else:data['weekly_dates']={};data['calendar_note']='Calendario institucional por completar.'
 return data
