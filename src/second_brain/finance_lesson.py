"""Notebook financiero controlado y contrato de aceptación previo a exportación."""
import ast,json,re
from .core import normal,identifier,atomic,now
SOURCES=[
 ('Aroussi, R. (s. f.). yfinance: documentación y código fuente.', 'https://github.com/ranaroussi/yfinance'),
 ('Aroussi, R. (s. f.). yfinance.download: parámetros y datos ajustados.', 'https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html'),
 ('Tseng, J.-J., & Li, S.-P. (2011). Asset returns and volatility clustering in financial time series. Physica A, 390, 1300–1314.', 'https://doi.org/10.1016/j.physa.2010.12.002'),
 ('NIST/SEMATECH. (s. f.). Autocorrelation. e-Handbook of Statistical Methods.', 'https://www.itl.nist.gov/div898/handbook/eda/section3/eda35c.htm')]

def requested(q):return 'yfinance' in normal(q) or ('analisis de datos' in normal(q) and 'finanza' in normal(q))

def check(question,nb):
 code='\n'.join(''.join(c['source']) for c in nb.get('cells',[]) if c['cell_type']=='code')
 prose='\n'.join(''.join(c['source']) for c in nb.get('cells',[]) if c['cell_type']=='markdown')
 errors=[]
 for c in nb.get('cells',[]):
  if c['cell_type']=='code':
   try:ast.parse(''.join(c['source']))
   except SyntaxError:errors.append('Código Python inválido')
 if requested(question):
  tree=ast.parse(code) if not errors else ast.parse('')
  imports={a.name for n in ast.walk(tree) if isinstance(n,ast.Import) for a in n.names}
  calls={n.func.attr for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)}
  if 'yfinance' not in imports or 'download' not in calls:errors.append('Falta importar y usar yfinance para descargar datos')
  for term in ['rendimiento','volatilidad','drawdown','marco teorico','actividad de cierre','referencias']:
   if term not in normal(prose):errors.append('Falta '+term)
  if 'horas de estudio' in normal(prose+code):errors.append('Caso escolar ajeno a finanzas')
 return {'passed':not errors,'status':'artifact_contract','errors':errors}

def build(question):
 cells=[]
 def md(s):cells.append({'id':identifier()[:8],'cell_type':'markdown','metadata':{},'source':s.splitlines(True)})
 def code(s):cells.append({'id':identifier()[:8],'cell_type':'code','metadata':{},'execution_count':None,'outputs':[],'source':s.splitlines(True)})
 md('# Análisis de datos en finanzas con yfinance\n\nObjetivo: obtener precios ajustados de activos, evaluar calidad y comparar rendimiento, volatilidad y drawdown. Caso: SPY, QQQ y GLD, cotizados en USD, durante 2024–2025. No se seleccionan como inversiones recomendadas. Cambia los parámetros para otro estudio.\n\nDatos reales descargados al ejecutar; no se sustituyen silenciosamente por datos simulados. Se requiere internet. Si Yahoo no responde, el notebook se detiene con una explicación. Código docente original adaptado al contrato de la API del repositorio oficial yfinance (Apache-2.0), consultado el 6 de octubre de 2026. No se ejecuta código remoto de GitHub.')
 md(r'''## Marco teórico
El análisis financiero comienza con una pregunta, un horizonte y unidades comparables. Se trabaja con cierres ajustados: `auto_adjust=True` incorpora los ajustes suministrados por el proveedor [1–2]. Son adecuados para comparar series con eventos corporativos, aunque no sustituyen una auditoría del proveedor ni una contabilidad exacta del inversionista.

El rendimiento simple es $r_t=P_t/P_{t-1}-1$ y el logarítmico es $\ell_t=\ln(P_t/P_{t-1})$. La riqueza acumulada de una unidad es:
$$W_t=\prod_{i=1}^{t}(1+r_i).$$
El rendimiento anual compuesto, usando aproximadamente 252 sesiones por año, es:
$$CAGR=W_T^{252/N}-1.$$
La volatilidad anualizada se estima como $\sigma_{anual}=s(r)\sqrt{252}$. La regla de raíz del tiempo supone una estructura temporal apropiada; no es una garantía de riesgo futuro. La literatura documenta agrupamiento de fluctuaciones, por lo que se incorpora una ventana móvil y autocorrelación [3–4].

El drawdown mide caída desde un máximo previo:
$$D_t=\frac{W_t}{\max_{0\leq s\leq t}W_s}-1.$$
Incluimos $W_0=1$ para contar una pérdida inicial. Correlación no implica causalidad; se calcula sobre rendimientos, no sobre niveles de precios. Una cartera equiponderada aquí se rebalancea diariamente: esa hipótesis difiere de comprar y mantener. Se omiten costos, impuestos, fricciones y divisas; no se predicen precios.''')
 md('## Preparación\nEjecuta la siguiente celda en Jupyter o Colab. Instala los paquetes si faltan. El notebook registra las versiones realmente utilizadas; no instala nada automáticamente dentro del servidor EscoIA.')
 code('import importlib.util, subprocess, sys\npaquetes = ["yfinance", "pandas", "numpy", "matplotlib"]\nfaltantes = [p for p in paquetes if importlib.util.find_spec(p) is None]\nif faltantes:\n    subprocess.check_call([sys.executable, "-m", "pip", "install", *faltantes])\nimport yfinance as yf\nimport pandas as pd\nimport numpy as np\nimport matplotlib.pyplot as plt\nfrom importlib.metadata import version\nfrom datetime import datetime, timezone\nprint({p: version(p) for p in paquetes})\n')
 md('## Práctica 1 — descargar y documentar\n`end` es exclusivo [2]. Conserva CSV y manifiesto con fecha, parámetros, moneda y versiones. No rellena feriados como si fueran precios observados.')
 code('TICKERS = ["SPY", "QQQ", "GLD"]\nINICIO, FIN = "2024-01-01", "2026-01-01"\nraw = yf.download(TICKERS, start=INICIO, end=FIN, auto_adjust=True,\n                  interval="1d", threads=False, progress=False, timeout=20)\nif raw is None or raw.empty:\n    raise RuntimeError("Yahoo no devolvió datos. Revisa internet, símbolos o límites; no se generaron precios ficticios.")\nprecios = raw["Close"].copy()\nif isinstance(precios, pd.Series):\n    precios = precios.to_frame(TICKERS[0])\nprecios = precios.reindex(columns=TICKERS).sort_index()\nprint("Ausentes por activo:", precios.isna().sum().to_dict())\nif precios.index.has_duplicates or (precios.dropna() <= 0).any().any():\n    raise ValueError("Fechas duplicadas o precios no positivos: revisar antes de continuar")\nprecios = precios.dropna(how="any")\nif len(precios) < 60:\n    raise ValueError("Menos de 60 fechas comunes válidas; revisa los activos y el horizonte")\nprecios.to_csv("precios_ajustados.csv")\nimport json\nmanifiesto = {"fuente": "Yahoo Finance vía yfinance", "consulta_utc": datetime.now(timezone.utc).isoformat(), "tickers": TICKERS, "inicio": INICIO, "fin_exclusivo": FIN, "moneda": "USD (activos del ejemplo)", "auto_adjust": True, "filas_comunes": len(precios), "versiones": {p: version(p) for p in paquetes}}\nwith open("procedencia.json", "w") as f:\n    json.dump(manifiesto, f, indent=2)\nprint(precios.head()); print(manifiesto)\n')
 md('## Práctica 2 — rendimientos, riesgo y comparación\nLa eliminación conjunta de fechas ausentes cambia la muestra. Comprueba la pérdida de observaciones antes de interpretar. No calcula rendimientos a través de huecos rellenados artificialmente.')
 code('rendimientos = precios.pct_change(fill_method=None).dropna()\nlog_rendimientos = np.log(precios).diff().dropna()\nriqueza = (1 + rendimientos).cumprod()\nmaximos = riqueza.cummax().clip(lower=1.0)\ndrawdown = riqueza / maximos - 1\nmetricas = pd.DataFrame({"Rendimiento acumulado": riqueza.iloc[-1] - 1, "CAGR aproximado": riqueza.iloc[-1] ** (252/len(rendimientos)) - 1, "Volatilidad anualizada": rendimientos.std(ddof=1) * np.sqrt(252), "Máximo drawdown": drawdown.min()})\nprint(metricas.to_string(float_format=lambda x: f"{x:.2%}"))\nprint("Correlación de rendimientos:\\n", rendimientos.corr())\nmetricas.to_csv("metricas_financieras.csv")\nfig, ax = plt.subplots(2, 1, figsize=(10, 7))\nriqueza.plot(ax=ax[0], title="Crecimiento de una unidad, desde la primera fecha de precios")\ndrawdown.plot(ax=ax[1], title="Caída desde el máximo previo")\nplt.tight_layout(); plt.show()\n')
 md('## Práctica 3 — riesgo temporal y cartera\nLa cartera tiene pesos constantes de un tercio y rebalanceo diario. El benchmark de esta práctica es SPY. La comparación es histórica y excluye costos.')
 code('vol_movil = rendimientos.rolling(21).std(ddof=1) * np.sqrt(252)\nvol_movil.plot(figsize=(10,4), title="Volatilidad anualizada móvil: 21 sesiones"); plt.show()\nprint("Autocorrelación lag 1 de rendimientos absolutos:", rendimientos.abs().apply(lambda x: x.autocorr(lag=1)).to_dict())\npesos = pd.Series(1/len(TICKERS), index=TICKERS)\ncartera = rendimientos.mul(pesos, axis=1).sum(axis=1)\nriqueza_cartera = (1 + cartera).cumprod()\ndd_cartera = riqueza_cartera / riqueza_cartera.cummax().clip(lower=1) - 1\nprint(f"Cartera: rendimiento={riqueza_cartera.iloc[-1]-1:.2%}, volatilidad={cartera.std(ddof=1)*np.sqrt(252):.2%}, máximo drawdown={dd_cartera.min():.2%}")\nprint(f"Activo con mayor rendimiento histórico: {metricas[\"Rendimiento acumulado\"].idxmax()}")\nprint(f"Activo con mayor volatilidad: {metricas[\"Volatilidad anualizada\"].idxmax()}")\nprint("Una correlación menor puede contribuir a diversificar, pero no elimina las pérdidas comunes.")\n')
 md('## Explicación de resultados\nLee las cifras calculadas en tu ejecución, sin copiar valores de otra fecha. Un crecimiento superior a 1 indica ganancia acumulada; drawdowns más negativos indican pérdidas históricas más profundas. Compara retorno y riesgo conjuntamente. Discute por qué el activo más rentable puede tener mayor volatilidad y por qué una cartera diversificada todavía puede caer. Una autocorrelación aislada no demuestra por sí sola clustering: contrasta varios rezagos y períodos.\n\n## Actividad de cierre\n1. Compara 2024 y 2025 por separado: ¿se conserva el orden de rendimiento y riesgo?\n2. Cambia la ventana a 63 sesiones y explica su efecto.\n3. Contrasta la cartera rebalanceada con comprar y mantener.\n4. Entrega una tabla, dos gráficos y una conclusión de 200 palabras con tres cifras, unidades, procedencia y dos limitaciones.\n\nEvaluación: trazabilidad 25%, cálculos 30%, interpretación 30%, fuentes y cierre 15%.')
 md('## Referencias\n\n'+'\n\n'.join(f'[{i+1}] {title} {url}' for i,(title,url) in enumerate(SOURCES))+'\n\nEl artículo se consultó a nivel de resumen y metadatos; no se presenta una revisión de su texto completo. Repositorio alternativo examinado: https://github.com/stefan-jansen/machine-learning-for-trading ; su alcance de trading y aprendizaje automático es mayor que esta práctica introductoria. Se eligió la API original de yfinance por ajuste al requisito y menor complejidad. No se afirma que exista un repositorio universalmente «mejor».')
 return {'nbformat':4,'nbformat_minor':5,'metadata':{'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},'language_info':{'name':'python'},'escoia':{'request':question,'execution':'not_executed_live','sources':[u for _,u in SOURCES]}},'cells':cells}

def artifact_digest(question,nb):
 code='\n'.join(''.join(c['source']) for c in nb['cells'] if c['cell_type']=='code')
 headers=[line for c in nb['cells'] if c['cell_type']=='markdown' for line in ''.join(c['source']).splitlines() if line.startswith('#')]
 selected=[line for line in code.splitlines() if any(t in line for t in ['import yfinance','yf.download','TICKERS =','INICIO, FIN','rendimientos =','drawdown =','metricas =','cartera ='])]
 return 'SOLICITUD ORIGINAL: '+question+'\nENTREGA FINAL (extractos exactos del notebook):\n'+'\n'.join(headers+selected)

def create(brain,question,run):
 from .adapters import validate_answer
 brain.event(run,'Investigación','Seleccionando fuentes financieras y repositorio original yfinance')
 nb=None
 for attempt in range(2):
  nb=build(question);validation=check(question,nb)
  brain.event(run,'Validación',f'Contrato del notebook: intento {attempt+1}')
  if validation['passed']:break
 if not validation['passed']:raise ValueError('Notebook rechazado: '+', '.join(validation['errors']))
 sources=[{'id':u,'kind':'web','citation':t+' '+u,'url':u,'text':t,'access':'Referencia seleccionada; revisión de fuentes documentada el 2026-10-06'} for t,u in SOURCES]
 try:
  brain.event(run,'Laya','Revisando la correspondencia de la solicitud con el notebook final')
  digest=artifact_digest(question,nb)
  review=validate_answer(brain.home,digest,sources,purpose="artifact")
 except Exception as e:review={'passed':False,'status':'pending','reason':str(e)}
 # Ninguna aprobación probabilística puede suplir el contrato. Un rechazo bloquea la publicación.
 if review.get('status')=='reviewed' and not review.get('passed'):
  brain.event(run,'Regeneración','LAYA rechazó la correspondencia; regenerando una vez')
  nb=build(question);validation=check(question,nb)
  review=validate_answer(brain.home,artifact_digest(question,nb),sources,purpose="artifact")
  if not review.get('passed'):raise ValueError('LAYA rechazó la entrega regenerada; no se publicó el notebook')
 nb['metadata']['escoia']['validation']={'contract':validation,'laya':review}
 eid=identifier();folder=brain.home/'data/exports'/eid;folder.mkdir(parents=True,exist_ok=True)
 name='Analisis-de-datos-en-finanzas-yfinance.ipynb'
 atomic(folder/name,json.dumps(nb,ensure_ascii=False,indent=2));atomic(folder/'plan.json',json.dumps({'id':eid,'code':'tema','created':now(),'files':{'ipynb':name},'sources':sources}))
 brain.event(run,'completada','Notebook financiero con contrato comprobado; descarga Yahoo al ejecutarlo')
 return {'text':'Análisis de datos en finanzas: notebook con yfinance, precios ajustados, rendimientos, volatilidad, correlación, cartera y drawdown; incluye marco teórico, gráficos y actividad de cierre. Requiere internet al ejecutar. '+('Revisión LAYA pendiente; no se presenta como aprobada.' if not review.get('passed') else 'Correspondencia revisada por LAYA.'),'sources':[],'references':sources,'artifacts':[{'format':'ipynb','label':'Notebook financiero','url':f'/api/export?id={eid}&format=ipynb'}],'validation':{'contract':validation,'laya':review},'run_id':run,'mode':'Notebook financiero · yfinance','notice':'Descarga y ejecución con datos reales pendientes; no se inventaron resultados.'}
