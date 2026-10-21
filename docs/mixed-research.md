# Investigación mixta en EscoIA

## Uso
Encuestas → Nueva investigación → Definición → Diseño → Recopilación → Análisis e integración.
La muestra admite hasta 50 participantes y un subconjunto cualitativo de 8–15 personas dentro de esa muestra. El diseño admite 20 preguntas cuantitativas y 20 cualitativas y se congela al guardar la primera respuesta.

En Recopilación, «Nuevo encuestado por número de llegada» está activo inicialmente. Al guardar se asigna P01, P02… de forma atómica; una respuesta inválida no consume número. Desactívalo para seleccionar y corregir un registro existente. Las respuestas cuantitativas y la entrevista quedan vinculadas al mismo identificador. Se requiere consentimiento para cada registro. No se crean cuentas de usuario.

## Instalación
Desde este directorio ejecuta `bash scripts/install-research.sh`. Usa Python 3.12/3.13 (preferentemente el entorno del núcleo), con NumPy 2.3.5, SciPy 1.16.2 y ReportLab 4.4.9 fijados. Inicia EscoIA con el script externo habitual.

## Arquitectura y entregables
- `config/research-schema.sql`: estudios, preguntas, participantes, versiones de análisis y trabajos persistentes.
- `src/second_brain/research.py`: validación, captura, cola persistente, contratos de IA, revisión humana y exportación.
- `src/second_brain/research_worker.py`: estadísticas y PDF en procesos aislados.
- `ui/src/ResearchDashboard.tsx`: cuatro fases, gráficos interactivos, nube, códigos, citas y tabla conjunta.
- MCP `mixed_research_read`: consulta local de un estudio.

Dos trabajos CPU como máximo; NumPy usa un hilo por proceso. Una sola generación local activa. Las constelaciones reciben eventos de cuantitativo, Qwen, LAYA e integración. Qwen propone códigos, polaridad y emociones; las citas se conservan literalmente. LAYA revisa una síntesis acotada y las reglas deterministas siguen siendo obligatorias. Los modelos se descargan tras usarse y no tienen coste cero de memoria.

## Evidencia y límites
58 pruebas locales pasan: límites de preguntas/muestra, consentimiento, tipos, numeración, edición, recuperación y valores estadísticos conocidos. El estudio DEMOSTRACIÓN contiene 50 respuestas simuladas, 10 entrevistas y un PDF de cuatro páginas inspeccionado visualmente. No representa resultados institucionales.

Los estadísticos incluyen frecuencias, porcentajes, media y desviación; chi-cuadrada, Welch, ANOVA y regresión simple se ejecutan solo según el plan de hipótesis. Se informan supuestos y datos insuficientes. Likert es ordinal: requiere justificar su tratamiento intervalar. Un valor p no demuestra causalidad ni generalización.

Qwen/LAYA para este nuevo módulo están configurados, pero su ejecución conjunta no fue validada con datos reales: no había margen bajo el presupuesto de 12,5 GiB. La clasificación es una propuesta editable, no una aprobación científica. El lote de IA limita 20 narrativas y 240 segundos; el resto queda pendiente de codificación.

Voz reutiliza la transcripción Whisper local con captura corta; debe revisarse antes de guardar. No se validó una nueva grabación de micrófono en esta entrega. Se conserva texto, no el audio original; entrevistas extensas y despacho remoto a encuestados quedan pendientes. La captura local y la importación JSON están disponibles.

Crossref recupera metadatos y DOI candidatos; el cotejo con textos completos y benchmarks sectoriales requiere revisión y no se presenta como validado. La triangulación permite documentar convergencias/divergencias y se confirma por el investigador.
