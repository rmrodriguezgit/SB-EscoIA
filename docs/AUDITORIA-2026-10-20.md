# Auditoría de Sistemas — EscoIA (sistema-escolar)

**Fecha:** 2026-10-20 · **Versión auditada:** commit `c4151e0` (línea base) · **Correcciones:** commit `d94fbbd`
**Método:** auditoría paralela en 4 hilos. Tres agentes trabajaron simultáneamente (Seguridad/Backend, Rendimiento/Concurrencia, Datos/Pruebas/UI) y el hilo principal se encargó de la lógica de asistencia y de integrar los resultados. Todos los hallazgos se verificaron leyendo el código y, cuando se pudo, ejecutándolo: `tsc`, `node:test`, `gcc`, ASan/UBSan, `npm audit` y un micro-benchmark.

---

## 1. Resumen ejecutivo

| Área | Estado | Comentario |
|---|---|---|
| Seguridad y privacidad (LFPDPPP) | 🔴 | La llave biométrica se respalda junto a los datos. No existe consentimiento biométrico ni purga. El riesgo de publicar datos en Git ya está mitigado. |
| Concurrencia y rendimiento | 🟠 | En la práctica usa 1 núcleo: un mutex global, el núcleo C es FIFO y la serialización JSON de unos 5 MB por verificación. |
| Base de datos y migraciones | 🟠 | Faltan índices en las rutas más usadas. Las migraciones no son idempotentes. Los respaldos no están cifrados ni rotan. |
| Pruebas y build | 🟠 | 17 de 24 pruebas dependen de un binario que solo compila en macOS. `-Werror` falla con gcc. No hay CI. |
| Asistencia | 🟢 (tras corrección) | Se corrigieron 4 defectos. La batería pasó de 7 a 30 casos y todos pasan. |
| UI y documentación | 🟡 | `App.tsx` es un monolito de 1 916 líneas. Hay errores silenciados. El README está desactualizado. |

**Fortalezas:** todo el SQL se ejecuta parametrizado (`sqlite3_prepare_v2`) y no se encontró inyección. Los procesos se lanzan con `spawn` sin shell. Toda entrada pasa por validación Zod, hay token CSRF y se validan Host y Origin. Se usa AES-256-GCM con IV aleatorio. Las cargas están limitadas (10 MB, comprobación de *magic bytes*, permisos `0600`). El desafío facial es de un solo uso y vence en 90 s. `npm audit` del servidor reporta **0 vulnerabilidades**.

---

## 2. Hallazgos críticos y altos

| ID | Sev. | Ubicación | Hallazgo | Corrección |
|---|---|---|---|---|
| SEC-1 | Crítico → **mitigado** | `.gitignore` | El ignore original habría subido a GitHub unas 315 fotos biométricas `.enc`, la importación con datos de alumnos y los respaldos (que incluyen `.env` con `BIOMETRIC_KEY`). | **Hecho:** se excluyen `data/`, `.env*` y `*.db`. Se verificó con `git check-ignore`. |
| SEC-2 / DB-1 | Alto | `scripts/backup.sh:7-9` | `cp .env data/backups/env-…` deja la llave en claro junto a la BD. No cifra, no rota y no respalda las fotos. | Guardar la llave en el Llavero de macOS. Cifrar con `age`. Respaldar BD, fotos y uploads. Conservar N copias y ejecutar `PRAGMA integrity_check`. |
| SEC-3 | Alto | `server/auth.ts:10-18`, `main.ts:250` | `/api/me` entrega rol admin y token CSRF a **cualquier proceso local** (decisión de diseño de “acceso directo”). La sesión dura 365 días. | Usar un token local en un archivo `0600` y una cookie `HttpOnly; SameSite=Strict`. Validar `Sec-Fetch-Site`. Expiración en horas. |
| SEC-4 | Alto | `server/models.ts:230-240` | Si existe `remote-ai.json`, los textos con datos personales se envían a un servidor externo sin exigir HTTPS ni consentimiento. | Activarlo solo con la bandera `REMOTE_AI=true`, exigir `https:`, mostrar aviso en la UI y seudonimizar. |
| PERF-1 | Alto | `server/domain.ts:29-40,159` | Un mutex global (`exclusive`) serializa **todo** el dominio, incluida la extracción facial ONNX. Mientras se verifica un alumno, se bloquean listas, calificaciones y otros docentes. | Candado por clave (`session:<id>`) solo en la escritura. Extracción y *matching* fuera del candado. |
| PERF-2 | Alto | `domain.ts:742-747` | Por cada fotograma se envían al proceso C las plantillas de 512-d en JSON: **5,19 MB y 45,8 ms** solo de `stringify` (500 alumnos), frente a 0,52 ms del cálculo. | `match_batch` con IDs y caché de plantillas en C o en un `Float32Array` transferible. |
| QA-1 | Alto | `tests/integration.test.ts:17-41` | 17 pruebas fallan si no existe `build/sistema_service`, y el `after` lanza un `TypeError`. | `gateway?.close()`, `{skip}` si falta el binario, y compilar en `pretest`. |
| QA-2 | Alto | `native/CMakeLists.txt:16` | `sistema_service` enlaza *frameworks* de macOS de forma incondicional, así que no hay CI posible en Linux. | Usar `if(APPLE)` y un *runner* macOS en CI. |
| QA-3 | Alto | `metrics_core.c:8`, `whisper_mcp_bridge.c:29`, `core_test.c:7` | Con `-Wall -Wextra -Werror`, gcc falla (`misleading-indentation`, `day_slots` no inicializado), así que la prueba nunca ejercita esa restricción. | Añadir llaves e inicializadores designados. |

## 3. Hallazgos medios y bajos

**Seguridad**
- **SEC-5:** el campo `supervised:true` lo declara el cliente. Los modos *single* y *passive* no tienen prueba de vida (una foto impresa pasa). Hay que auditar quién supervisó y usar *gesture* por defecto.
- **SEC-6:** AES-GCM se usa sin AAD y con la misma llave para foto y embedding, de modo que los cifrados pueden intercambiarse entre alumnos. Corrección: `setAAD("student:<id>:v1")` y subllaves HKDF.
- **SEC-7:** `expires_at` está a 365 días, pero nada borra los `.enc` vencidos. Tampoco existe la tabla `biometric_consent` (LFPDPPP art. 9).
- **SEC-8:** quedan cargas huérfanas en `data/uploads/` tras reiniciar (hay 5 ahora). Hay que purgar al arrancar.
- **SEC-9:** `{...process.env}` pasa `BIOMETRIC_KEY` a Python y a los binarios hijos. Usar una lista blanca de variables.
- **SEC-10 a SEC-14:** stderr y `sqlite3_errmsg` llegan a la UI. La CSP permite `wss:` genérico. Hay `.catch(()=>{})` y un `eventBuffer` sin TTL. Los modelos se descargan sin `sha256`. No hay manejador de `SIGTERM`.

**Rendimiento**
- **PERF-3:** en cada verificación se descifran y parsean todas las plantillas (42 ms) y se calcula el SHA-256 del modelo ONNX. Conviene una caché con invalidación.
- **PERF-4:** `face_extract` es un proceso por petición, así que recarga YuNet y ArcFace en cada verificación.
- **PERF-5:** patrón N+1 en `/api/attendance/context` y `/report`, con búsquedas O(n·m).
- **PERF-6 / DB-2:** faltan índices `enrollments(offering_id)`, `schedules(offering_id,starts)`, `offerings(teacher_id,term)` y `attendance(student_id)`.
- **PERF-7:** un *timeout* mata el proceso nativo con todas las peticiones en curso y no hay reinicio.
- **PERF-8 / PERF-9:** el servicio C usa una sola conexión SQLite. Hacer el producto punto en `float` en lugar de coseno en `double` da un **−29 %**.

**Datos, pruebas, UI y documentación**
- **DB-3:** `migrate.ts` solo contempla la versión 2 y `002.sql` no es idempotente (`duplicate column`).
- **DB-4:** las PK compuestas admiten NULL en `grades`.
- **DB-5:** las FK no definen `ON DELETE`.
- **QA-4:** `check.sh` asume un build ya configurado.
- **QA-5:** `vite ≤ 6.4.3` tiene una vulnerabilidad alta (solo en desarrollo); se corrige con `npm audit fix`.
- **UI-1/2:** `api.ts` no tiene *timeout* y `.catch(()=>{})` silencia errores.
- **UI-3:** `App.tsx` mezcla 65 `useState` en un solo componente.
- **UI-4:** solo hay ~38 etiquetas para 61 controles y falta `:focus-visible`.
- **UI-5:** se usa `confirm()` nativo.
- **DOC-1/2/3:** el README dice que no hay servidor HTTP (sí lo hay). `INSTALACION.md` está referenciado pero no existe. `architecture.md` no cubre la importación ni la asistencia actual.

### Cobertura de pruebas

| Módulo | Prueba | Estado |
|---|---|---|
| attendance_report, current_attendance, face_consensus, schemas (biometría) | 5 archivos, **30 casos** | ✅ 30/30 |
| domain, mcp_gateway, orchestrator, auth | integration.test.ts (17) | ⚠️ requiere el binario macOS |
| núcleo C (scheduler, metrics, coseno) | core_test.c | ✅ (ASan/UBSan limpio), ❌ con `-Werror` en gcc |
| main.ts HTTP | import_http_test.py | requiere el servidor en marcha |
| academic_import, transport, events, models, config, migraciones, backup, UI | — | ❌ sin pruebas |

---

## 4. Prueba de asistencia: mejoras aplicadas (commit `d94fbbd`)

**Defectos corregidos**

1. **Justificadas contadas como faltas** (`attendance_report.ts`). `excused` daba valor 0 y sumaba a `total_absence`, lo que contradice la vista `absence_totals`. Ahora el valor es `'J'`, se lleva aparte en `total_excused` y la leyenda de la UI se actualizó.
2. **Fallo abierto biométrico** (`face_consensus.ts`). Con `FACE_THRESHOLD=abc` el umbral quedaba en `NaN`, y como `score < NaN` siempre es falso, **se aceptaba cualquier rostro**. Ahora una configuración inválida rechaza la verificación.
3. **Mensaje inalcanzable** (`current_attendance.ts`). «La clase ya está cerrada o cancelada» nunca se mostraba y el docente recibía «Confirma el grupo sugerido».
4. **Error críptico al cambiar de grupo** en un bloque ya confirmado: aparecía `schedule conflict` de SQLite. Ahora el mensaje indica qué grupo ocupa el bloque, y se detectan también los traslapes parciales.

Además, una fuente `lista` sin `context` tumbaba el reporte mensual completo (TypeError). Ya está corregido.

**Nueva batería `tests/attendance_audit.test.ts` (23 casos)**
- **Reporte:** mapeo de los 6 estados, orden cronológico, separación por grupo y materia, número de lista oficial, fuentes incompletas, duplicados y un caso de rendimiento (40 alumnos × 60 sesiones en menos de 250 ms).
- **Consenso facial:** límites exactos, media de puntuación, modo de captura única, 8 configuraciones inválidas, entradas nulas o no enteras y una prueba de propiedad (cualquier captura discordante provoca rechazo).
- **Clase vigente:** horario vacío, reloj en segundos, aula interna creada una sola vez, clase cerrada o cancelada, conflicto total y parcial con otro grupo, sesión cancelada que no bloquea, oferta ajena o de otro período, **10 confirmaciones concurrentes que generan 1 sola sesión** y una cola que se recupera tras un fallo.

**Resultado:** `node --test` dio **30/30** y `tsc --noEmit` terminó sin errores. Las pruebas se ejecutaron en el contenedor Linux sobre archivos idénticos (SHA-256 verificado) porque `node_modules` de tu Mac trae esbuild para darwin.
Para ejecutarlas en tu Mac: `cd server && node --import tsx --test ../tests/attendance_audit.test.ts`

---

## 5. Propuesta de mejora: arquitectura multi-hilo y multi-núcleo (Apple Silicon P/E)

**Diagnóstico.** Hoy el sistema funciona así: un *event loop* de Node, un mutex global, un proceso C FIFO con una sola conexión SQLite y procesos de un solo uso (`face_extract`, Python). El paralelismo real solo ocurre dentro de OpenCV (2 hilos) y whisper (4).

**Benchmark** (VM aarch64, 2 vCPU; repetir en el Mac). Tiempos de similitud 512-d:

| N plantillas | Coseno actual | Producto punto float (NEON) | 4 hilos |
|---|---|---|---|
| 500 | 0,52 ms | 0,37 ms | 1,07 ms (peor) |
| 50 000 | 51,4 ms | 33,8 ms | 34,9 ms |

**Conclusión:** con grupos de 500 o menos, crear hilos por consulta **empeora** el tiempo. El cuello de botella está en la serialización (unos 90 ms y 15 MB por verificación), no en el cálculo. Primero hay que eliminar ese costo; después, paralelizar con **pools persistentes**.

### Fase 1 (1-2 semanas): rápida y de bajo riesgo
1. Migración `003_indices.sql` con los 4 índices y un `migrate.ts` que recorra `db/NNN.sql` según `user_version`.
2. `backup.sh` cifrado con `age`, rotación de 14 copias y la llave en el Llavero.
3. Corregir `-Werror`, poner `gateway?.close()` y `{skip}` sin binario, y ejecutar `npm audit fix` en la UI.
4. Purga de cargas huérfanas y de biometría vencida al arrancar. Lista blanca de `env` para los procesos hijos.
5. Validar `FACE_THRESHOLD` y `FACE_MARGIN` en `config.ts` al arrancar (complementa la corrección 2).

### Fase 2 (2-4 semanas): concurrencia
1. **Candado por clave** en lugar del `exclusive` global:
   ```ts
   const locks=new Map<string,Promise<void>>();
   export async function keyed<T>(k:string,f:()=>Promise<T>){const p=locks.get(k)??Promise.resolve();let r!:()=>void;const n=new Promise<void>(x=>r=x);locks.set(k,p.then(()=>n));await p;try{return await f()}finally{r();if(locks.get(k)===n)locks.delete(k)}}
   ```
2. **Pool de `worker_threads`** de tamaño `os.availableParallelism()-1` para descifrado, parseo y *matching*. Las plantillas viajan como `Float32Array` transferible (cero copias). Añadir `UV_THREADPOOL_SIZE=8` en `arrancar-academico.sh`.
3. **Extractor facial persistente** (`face_extract --serve`, JSONL por stdin) con un pool de 2 procesos y los modelos cargados una sola vez.
4. **Núcleo C con un escritor y K lectores:** un hilo escritor dueño de la conexión RW y K lectores con `SQLITE_OPEN_READONLY|NOMUTEX` sobre WAL, despachados según `operations[i].write`. `native.ts` ya correlaciona las respuestas por `id`. Cambiar `failure[512]` a `_Thread_local`. Reiniciar con *backoff* ante un *timeout*.
5. **Matching por lotes** con GCD y Accelerate en los núcleos P:
   ```c
   dispatch_apply(chunks, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0), ^(size_t c){
     cblas_sgemv(CblasRowMajor,CblasNoTrans,rows,512,1.f,T+a*512,512,q,1,0.f,s+a,1); });
   ```
   Las tareas de fondo (RAG, importación) van con `QOS_CLASS_UTILITY` o `taskpolicy -b` a los núcleos E.

### Fase 3 (1-2 meses): gobierno y calidad
- Autenticación local con token y cookie `HttpOnly` (SEC-3). AAD + HKDF y versión de llave en el cifrado biométrico.
- Tabla `biometric_consent` y aviso de privacidad. *Gesture* como modo por defecto, con auditoría de supervisión.
- CI en GitHub Actions con *runner* `macos-14`: cmake, ctest, `tsc`, `node --test`, `npm audit` y la compilación de la UI.
- Dividir `App.tsx` en vistas y *hooks*, añadir pruebas con Vitest y RTL, y mejorar la accesibilidad (`label`, `:focus-visible`).
- Actualizar README y `architecture.md`, y crear `INSTALACION.md`.

**Impacto esperado:** verificación facial de unos 150-300 ms a unos 30-60 ms (sin contar ONNX), varias verificaciones simultáneas sin bloquear el resto del sistema y consultas de listas y reportes sin *scans* completos.

---

## 6. Control de versiones
- Repositorio: `github.com/rmrodriguezgit/EscoIA`, rama `main`.
- Commits: `c4151e0` (línea base + `.gitignore` seguro) y `d94fbbd` (asistencia).
- Política: cada cambio va en un commit descriptivo con su push. **Nunca** se versionan `data/`, `.env` ni respaldos.
