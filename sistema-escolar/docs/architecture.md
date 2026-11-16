# Arquitectura y decisiones

## Flujo y fronteras
React → HTTP autenticado en loopback → Orchestrator → LAYA MLX (intención)
→ autorización determinista → herramientas MCP → DomainPort → ABI C → SQLite.
EventHub distribuye los eventos por actor mediante WebSocket autenticado.
Ollama genera explicaciones y borradores a partir de resultados de herramientas;
no tiene acceso directo a SQLite, archivos arbitrarios ni credenciales.

Los resultados LLM son datos no confiables. El modelo no decide permisos,
identidad, seriación, aprobación de calificaciones ni validez de una sesión.
La validación en C debe repetirse dentro de la transacción que escribe.

## Presupuesto de memoria
Presupuesto inicial, no medición garantizada: SO 3 GB; Ollama pesos 4.5 GB;
MLX pesos 2 GB; KV/cache 1 GB conjunto; whisper 0.4 GB; C/SQLite 0.3 GB;
Node + UI 0.6 GB; reserva 0.7 GB = 12.5 GB aproximados.
Los 16 GB son compartidos con GPU. Contexto largo y batches aumentan memoria.
Limitar inferencia a una solicitud global, Ollama contexto 2048 y paralelismo 1;
MLX máximo 150 tokens para rutas. Usar whisper tiny/base y ventanas de 30 s.
No cargar un tercer modelo de embeddings simultáneamente sin medir presión.
Un supervisor pendiente debe consultar presión de memoria de macOS, rechazar
nuevas tareas, vaciar cachés o descargar modelos ANTES de superar el presupuesto.
Una cola JS sola no impone un límite real de RAM ni controla otros procesos.

## Scheduler
Representación de 64 slots de un mismo horizonte. Cada sesión tiene teacher,
group, duration, capacity, allowed y qualified. La disponibilidad se intersecta
antes de llamar al núcleo: docente, grupo, jornada, calendario y ventanas válidas.
Excluir inicios que crucen días/descansos al construir `allowed`; para duración
variable, usar un mapa de slots por día o extender el núcleo con máscaras de
inicios separadas. Este código no modela preferencias blandas, estudiantes que
comparten grupos, travel time ni optimización global.
DFS determinista elige la variable con menos candidatos y retorna presupuesto
agotado distinto de imposible. Complejidad exponencial, no promesa de solución
instantánea. Los arrays del usuario permanecen intactos al fallar.
Ciclo de seriación: detectar al importar mediante DFS; antes de inscripción,
consultar toda la cadena y calificaciones finales aprobadas según política local.
`101` y `711` son ejemplos de política institucional; usar columnas explícitas
semester/shift, no inferir reglas universales por dígitos.

## Persistencia y transacciones nativas pendientes
Usar sqlite3_prepare_v2 / sqlite3_bind_* / sqlite3_step, nunca SQL concatenado.
Cada conexión ejecuta foreign_keys=ON, busy_timeout, y caché acotada (p.ej. 32 MB).
Un escritor con `BEGIN IMMEDIATE`; rollback ante cualquier error. Migraciones
versionadas con PRAGMA user_version. Las modificaciones de offering también
necesitan comprobar horarios existentes: los triggers de schedules no cubren
cambios posteriores de docente o grupo. Congelar offering usado o validar cambios.

Asistencia: autenticar docente, verificar sesión y hora del servidor, pertenencia
al grupo, inscripción y consentimiento. Extraer vector con un modelo versionado;
comprobar una sola cara y liveness con componente dedicado. Una foto no prueba
presencia. UNIQUE(session_id,student_id) evita duplicados; insertar audit y
attendance en la misma transacción. Separar registro manual autorizado.
No exponer embeddings en MCP. Cifrar biometría con clave del Keychain, aplicar
retención y revocación. Actualmente se define almacenamiento, no cifrado operativo.

Calificaciones: leer XLSX como ZIP/XML con parser de streaming en C, resolver
sharedStrings y tipos numéricos, rechazar fórmulas/valores no calculados, errores,
IDs desconocidos y duplicados. Vista previa completa antes de commit atómico.
La ponderación está implementada y reforzada por columna generada en SQL.
Definir escala de aprobación y redondeo institucional, no asumirlos.
Ausencias: solo sesiones terminadas hasta cierre; NULL cuenta como ausencia
únicamente después de cierre confirmado del listado. Excluir cancelaciones antes
 de activar esta vista: el esquema actual no modela sesiones canceladas.

## RAG e ingesta pendientes
ZIP C: allowlist de formatos, límite total descomprimido, ratio y número de
archivos; rechazar rutas absolutas, `..`, enlaces y entradas cifradas. Procesar
streaming fuera del thread de UI. Documentos PDF/DOCX requieren extractores reales;
unzip no equivale a extracción de texto. Guardar hash, páginas, unidades, temas,
subtemas y citas de origen. Estructura curricular debe ir a tablas normalizadas
adicionales; FTS actual aporta búsqueda textual de chunks, no vector search.

sqlite-vec es extensión externa optativa: cargar solo ruta configurada confiable,
crear vec0 con dimensión fija del modelo de embeddings elegido, filtrar acceso
ANTES de recuperar, y mantener índice y chunks en transacción. Dimensión 512
facial no implica dimensión 512 de texto. No intercambiar modelos entre vectores.
HNSW no forma parte de sqlite-vec y requiere implementación adicional explícita.

Consultas exactas de código/semestre/horas usan SQL relacional, no generación LLM.
Syllabus completo debe recuperar todos los bloques ordenados, no top-k solamente.
Plan: semanas 1–5 docencia; 6 parcial (20%); 7–11 docencia; 12 parcial (20%);
13–16 docencia; 17 examen final (60%). Hay 14 semanas de docencia dentro de 16
semanas programadas, más el examen externo de semana 17. No inventar 16 semanas
lectivas si las dos semanas de parciales sustituyen clase.

APA: servicio de búsqueda externa explícito (consentimiento para salir de red),
consultar Crossref/DOI/editorial, guardar autores/año/título/URL y evidencia;
referencias del modelo sin verificación se marcan pendientes, no reales.
.ipynb: generar JSON nbformat 4, kernel Python 3, celdas independientes, fixtures
sin datos personales; ejecutar validación en sandbox sin acceso a SQLite ni red
por defecto. PDF necesita biblioteca de generación y verificación visual adicional.

## Investigación mixta
Capturar consentimiento y pseudónimo; autorizar por encuesta. Audio → PCM →
whisper; preservar transcripción con marcas de origen. Qwen propone códigos y
sentimiento por fragmento; investigador edita/acepta. No presentar codificación
automática como conclusión validada. Extender codes con control de ciclos y
coding con validación de encuesta coincidente. Estadística C Welford implementada;
distribuciones, cross-tabs, tasas con denominador de invitados, faltantes y métricas
inferenciales requieren servicios adicionales. Exportar datos anonimizados y
reportes con métodos, limitaciones, citas y revisión humana.

## Contratos HTTP previstos (servidor aún pendiente)
Autenticación local por sesión HttpOnly/SameSite; CSRF en mutations; Origin
allowlist en WS. Bind 127.0.0.1; uso multiusuario remoto necesita TLS y gateway.
GET /api/events: WebSocket, Event por actor; reconexión actual no hace replay.
Persistir eventos/revisión para replay durable y recuperación tras crash.
POST /api/attendance/verify: {sessionId,frame,requestId}; respuesta solo tras commit.
POST /api/voice: multipart audio ≤30 segundos; convertir Opus/WebM a PCM 16 kHz
con decoder, rechazar formatos inesperados, eliminar archivo temporal.
POST /api/surveys/create: {title,questions,requestId}; devuelve ID.
POST /api/surveys/analyze: {surveyId,codes,requestId}; devuelve métricas y códigos.
Límite JSON 2 MB, límite upload 10 MB, rate limits por sesión y TTL de solicitudes.
No aceptar actor_id enviado por navegador o por modelo.

## Integraciones que faltan para cumplir el sistema completo
N-API/HTTP C DomainPort, supervisor de memoria, extracción facial/liveness,
whisper linkage + decoder de audio, ingesta ZIP/documental, embeddings y vec0,
XLSX parser, CRUD académico y autorización, aprobaciones y cierres de notas,
encuestas de respondentes/despacho, analítica completa, búsqueda APA,
generadores ipynb/PDF y despliegue con backups. Los componentes React actuales
son una base funcional de interfaz, no todos los flujos requeridos.
