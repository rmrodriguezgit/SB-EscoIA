# Temas académicos y constelaciones — 6 de octubre de 2026

Ejemplo: `Desarrolla el tema valor presente neto de LAN864 con caso práctico ipynb`.

El servidor recupera el plan local, envía únicamente las palabras del tema a Crossref y filtra referencias con DOI y resumen pertinente. Crossref verifica la existencia del registro, no la validez científica de todas las afirmaciones. Los extractos se identifican como resúmenes; no se afirma haber leído el artículo completo. Las fuentes privadas permanecen locales. Una falla de internet o ausencia de resumen se informa sin inventar bibliografía.

Qwen propone el marco teórico y Laya contrasta el borrador con las fuentes. La revisión de Laya es probabilística. En los casos computacionales soportados, los fundamentos matemáticos finales se toman de plantillas controladas y los cálculos se ejecutan de forma independiente; el dictamen del modelo se registra por separado. No se presenta una aprobación del borrador como certificación del texto final.

El material incluye objetivo, inicio, desarrollo, práctica, evaluación formativa, interpretación y cierre. Actualmente hay notebooks ejecutables para VPN, punto de equilibrio y estadística descriptiva; usan datos simulados, Python estándar, Markdown y fórmulas `$...$` y `$$...$$`. Otros temas reciben una propuesta de actividad cualitativa, con aviso de que aún no hay una plantilla computacional pertinente. No se ejecuta código obtenido de Qwen, GitHub ni páginas externas. No se integró búsqueda de repositorios, que era opcional.

El archivo `.ipynb` se descarga desde la respuesta. Los botones aparecen antes del texto; copiar usa un icono con nombre accesible y confirmación. El endpoint valida el identificador, formato y ruta del archivo.

Las constelaciones flotantes tienen una línea por proceso y un cursor de avance. Pueden arrastrarse con `Mover` o desplazarse con las flechas al enfocar ese control; también se pueden minimizar y anclar. Posición y modo se conservan en el navegador. Sus estados proceden de eventos del servidor, con actualización cada 700 ms. No representan inferencias simultáneas: los agentes comparten una ejecución local secuencial.

Validación: 36 pruebas Python correctas; compilación TypeScript/Vite; prueba real de consulta de VPN con Crossref, Qwen, Laya y archivo ejecutado. Las pruebas detectaron una referencia lingüística ajena al tema y errores financieros aprobados por Laya; se añadió filtrado por cobertura del tema y fundamentos deterministas para los casos implementados. No extrapolar esta prueba a todos los temas o documentos.

Al terminar la sesión, una consulta adicional encontró 10,11 GiB ocupados + 2,50 GiB de reserva = 12,61 GiB. El coordinador mantuvo el límite de 12,5 GiB, evitó cargar Qwen y respondió desde el catálogo con fuentes; las constelaciones señalan el resultado con advertencia y deja Qwen/Laya pendientes. Esto no invalida la prueba anterior de VPN ejecutada con margen disponible, pero la generación no estará siempre disponible si sube la ocupación del equipo.


## Corrección de análisis de datos — 6 de octubre de 2026

La petición `Desarrolla el tema de EL ANÁLISIS DE DATOS haz el marco teórico, ejemplos y entrega un archivo ipynb con el tema y las prácticas` se interpreta como **ANÁLISIS DE DATOS**, separando las instrucciones de entrega del nombre del tema. Los recuerdos de conversaciones no se consideran bibliografía curricular.

El notebook de análisis de datos incluye fundamentos, fórmulas LaTeX, seis prácticas (importación, limpieza documentada, descripción, histograma, asociación/sensibilidad y ejercicios), resultados ejecutados, explicación, cierre y referencias oficiales NIST/Python. La respuesta del chat contiene solo un resumen y botones de descarga/copia; el contenido completo queda en el archivo. El endpoint conserva referencias y procedencia en su manifiesto, sin desplegarlas como una respuesta larga.

39 pruebas Python correctas, incluidos el texto exacto del usuario, exclusión de recuerdos, respuesta resumida, generación de archivo y ejecución secuencial de todas sus celdas.

Prueba real con la petición exacta: respuesta resumida y enlace de notebook; HTTP 200, `application/x-ipynb+json`, nombre `Analisis-de-datos.ipynb`, 18 celdas y 5 celdas de código reejecutadas con las mismas salidas. Archivo de entrega: `outputs/Analisis-de-datos.ipynb`. Qwen no se ejecutó en esta prueba por presión del presupuesto (12,83 GiB proyectados), sin impedir generar y comprobar las prácticas controladas.
