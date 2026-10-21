"""Notebook docente de análisis de datos; datos simulados y código propio."""
import contextlib,io
from .core import identifier

THEORY=r'''## Marco teórico: análisis de datos
El análisis de datos transforma observaciones en evidencia para responder una pregunta. Antes de calcular, se definen la unidad de observación, las variables, sus unidades y el alcance de la muestra. Una asociación observada no demuestra causalidad.

### Calidad y preparación
Se revisan tipos, valores ausentes, duplicados y rangos válidos. Una regla de limpieza debe documentarse; eliminar registros puede introducir sesgos. En este caso se excluyen registros incompletos o con calificaciones fuera de rango, sin imputar valores. Los valores extremos se investigan, no se eliminan automáticamente.

### Exploración
El enfoque exploratorio busca reconocer estructura, detectar anomalías y revisar supuestos mediante resúmenes y gráficos [NIST]. La media y la mediana describen el centro; la desviación estándar muestral describe dispersión [Python].
$$\bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i,\qquad s=\sqrt{\frac{\sum_{i=1}^{n}(x_i-\bar{x})^2}{n-1}}$$
La mediana es menos sensible a valores extremos que la media. Para detectar posibles atípicos se usan $Q_1$, $Q_3$ y el rango intercuartílico $RIC=Q_3-Q_1$:
$$L_{inf}=Q_1-1.5RIC,\qquad L_{sup}=Q_3+1.5RIC$$
Un dato fuera de estas cercas es una señal de revisión, no prueba de error.

### Relación entre variables
La correlación de Pearson resume asociación lineal. Debe acompañarse de un gráfico; un valor alto no demuestra causalidad. Una regresión lineal simple describe $\hat y=a+bx$:
$$b=\frac{\sum_i(x_i-\bar{x})(y_i-\bar{y})}{\sum_i(x_i-\bar{x})^2},\qquad a=\bar{y}-b\bar{x}$$
Se compara el ajuste con y sin el caso extremo para explorar sensibilidad. Estos datos simulados no permiten conclusiones sobre estudiantes reales ni validan un modelo predictivo para otra población.
'''

def build(topic,references):
 def md(text):return {'cell_type':'markdown','metadata':{},'source':text.splitlines(True),'id':identifier()[:8]}
 cells=[];namespace={};results=[];counter=0
 def code(text):
  nonlocal counter
  out=io.StringIO()
  with contextlib.redirect_stdout(out):exec(compile(text,'practica_analisis.py','exec'),namespace)
  counter+=1;result=out.getvalue();results.append(result)
  cells.append({'cell_type':'code','metadata':{},'source':text.splitlines(True),'id':identifier()[:8],'execution_count':counter,'outputs':[{'output_type':'stream','name':'stdout','text':result.splitlines(True)}] if result else []})
 cells.append(md('# Análisis de datos: marco teórico y prácticas\n\n**Nivel:** introductorio universitario. **Duración sugerida:** 90–120 minutos.\n\n**Objetivo:** preparar datos, explorar su distribución, visualizar relaciones e interpretar resultados con sus limitaciones.\n\nLos datos son simulados. Ejecuta todas las celdas en orden en Jupyter o Google Colab. El cálculo usa Python estándar, sin archivos externos ni instalaciones.'))
 cells.append(md(THEORY))
 cells.append(md('## Práctica 1 — importar y comprender\nUna fila representa un estudiante ficticio. `horas` son horas de estudio semanal y `nota` una calificación de 0 a 100. Formula una pregunta descriptiva antes de ejecutar.'))
 code('''import csv, io, math
from statistics import mean, median, stdev, quantiles, correlation, linear_regression
csv_texto = """id,horas,nota
1,2,60
2,3,65
3,4,70
4,5,75
5,6,80
6,7,85
7,8,90
8,9,95
9,20,100
9,20,100
10,,80
11,5,130
"""
registros = list(csv.DictReader(io.StringIO(csv_texto)))
print("Registros importados:", len(registros))
print("Ejemplo:", registros[0])
''')
 cells.append(md('## Práctica 2 — limpieza y trazabilidad\nConserva el primer registro válido de cada identificador. Se excluyen campos vacíos, números no finitos, horas negativas y notas fuera de $[0,100]$. No se imputan datos. Compara las reglas con otras decisiones posibles.'))
 code('''limpios, descartados, vistos = [], [], set()
for fila in registros:
    try:
        ident = fila["id"]
        x, y = float(fila["horas"]), float(fila["nota"])
        if not ident or not all(math.isfinite(v) for v in (x, y)) or x < 0 or not 0 <= y <= 100:
            raise ValueError("fuera de rango")
        if ident in vistos:
            descartados.append((ident, "duplicado")); continue
        vistos.add(ident)
        limpios.append({"id": ident, "horas": x, "nota": y})
    except (ValueError, TypeError):
        descartados.append((fila["id"], "dato ausente o inválido"))
print("Registros válidos:", len(limpios))
print("Exclusiones:", descartados)
assert len(limpios) == 9 and len(descartados) == 3
''')
 cells.append(md('## Práctica 3 — descripción y detección de atípicos\nCalcula centro y dispersión. Se usa la convención `inclusive` de `statistics.quantiles`; otras convenciones pueden cambiar los cuartiles en muestras pequeñas.'))
 code('''horas = [r["horas"] for r in limpios]
notas = [r["nota"] for r in limpios]
print(f"Horas: media={mean(horas):.2f}, mediana={median(horas):.2f}, s={stdev(horas):.2f}")
print(f"Notas: media={mean(notas):.2f}, mediana={median(notas):.2f}, s={stdev(notas):.2f}")
q1, _, q3 = quantiles(horas, n=4, method="inclusive")
ric = q3 - q1
inferior, superior = q1 - 1.5 * ric, q3 + 1.5 * ric
atipicos = [r for r in limpios if r["horas"] < inferior or r["horas"] > superior]
print(f"Cercas RIC: [{inferior:.2f}, {superior:.2f}]")
print("Posibles atípicos:", atipicos)
assert [r["id"] for r in atipicos] == ["9"]
''')
 cells.append(md('### Interpretación\nSe conservan 9 de 12 registros: un duplicado y dos registros inválidos se excluyen. La media de horas supera la mediana por la observación de 20 horas. Esa observación es posible y permanece en el conjunto principal. Verifica las cifras calculadas y justifica por qué no se borró automáticamente.'))
 cells.append(md('## Práctica 4 — visualizar la distribución\nEl histograma textual funciona sin bibliotecas adicionales. Explica el patrón y el efecto del valor extremo.'))
 code('''intervalos = [(0, 5), (5, 10), (10, 15), (15, 21)]
for inicio, fin in intervalos:
    cantidad = sum(inicio <= x < fin for x in horas)
    print(f"[{inicio:2}, {fin:2}) " + "█" * cantidad + f" ({cantidad})")
''')
 cells.append(md('## Práctica 5 — asociación y sensibilidad\nCompara Pearson y regresión con todos los registros y sin el caso extremo. La segunda versión es un análisis de sensibilidad, no una corrección obligatoria de los datos.'))
 code('''ajuste = linear_regression(horas, notas)
print(f"Todos: r={correlation(horas, notas):.4f}; pendiente={ajuste.slope:.4f}; intercepto={ajuste.intercept:.4f}")
sin_extremo = [r for r in limpios if r not in atipicos]
x2 = [r["horas"] for r in sin_extremo]
y2 = [r["nota"] for r in sin_extremo]
ajuste2 = linear_regression(x2, y2)
print(f"Sin extremo: r={correlation(x2, y2):.4f}; pendiente={ajuste2.slope:.4f}; intercepto={ajuste2.intercept:.4f}")
assert abs(ajuste2.slope - 5) < 1e-9 and abs(ajuste2.intercept - 50) < 1e-9
''')
 cells.append(md('### Explicación de los resultados\nLos primeros ocho pares se construyeron artificialmente sobre $y=50+5x$; por eso el ajuste sin el extremo es perfecto. La observación de 20 horas y nota 100 modifica la pendiente y reduce la correlación. Esto muestra sensibilidad al conjunto analizado, no que estudiar provoque una determinada nota. No extrapoles fuera del rango observado ni presentes la muestra como evidencia institucional.'))
 cells.append(md('## Práctica 6 — ejercicios para el estudiante\n1. Cambia la nota del registro 9 y vuelve a ejecutar desde la importación.\n2. Introduce un valor ausente adicional y documenta cómo cambia el tamaño de la muestra.\n3. Sustituye la política de exclusión de horas ausentes por una imputación explícita; compara resultados y discute el sesgo.\n4. Explica cuándo no sería apropiado calcular una media de categorías ordinales.\n5. Diseña un gráfico de dispersión con las dos variables y analiza qué añade al histograma.'))
 cells.append(md('## Actividad de cierre y evaluación\nEntrega una conclusión de 150–200 palabras que conteste la pregunta inicial y contenga: dos resultados numéricos, una decisión de limpieza, una limitación y una siguiente pregunta.\n\n**Criterios:** trazabilidad de preparación (25%), exactitud y reproducibilidad (25%), interpretación sin causalidad injustificada (30%), fuentes y comunicación (20%).\n\n**Autoevaluación:** ¿otra persona puede reproducir los resultados? ¿distinguiste observaciones, supuestos y conclusiones?'))
 cells.append(md('## Referencias y procedencia\n[NIST] NIST/SEMATECH. (s. f.). *What is EDA? e-Handbook of Statistical Methods*. https://www.itl.nist.gov/div898/handbook/eda/section1/eda11.htm\n\n[Python] Python Software Foundation. (s. f.). *statistics — Mathematical statistics functions*. https://docs.python.org/3/library/statistics.html\n\nContenido docente y datos simulados originales de EscoIA. El estado de consulta de las fuentes figura en las referencias adicionales; las prácticas no requieren internet.\n\n'+'\n\n'.join(s['citation']+'\n'+s.get('access','')+'\nConsulta: '+s.get('retrieved_at','fuente local') for s in references)))
 nb={'nbformat':4,'nbformat_minor':5,'metadata':{'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},'language_info':{'name':'python','version':'3.11'}},'cells':cells}
 return nb,'\n'.join(results),'Limpieza, estadística descriptiva, histogramas, detección de atípicos, correlación y regresión con análisis de sensibilidad; resultados ejecutados con datos simulados.'
