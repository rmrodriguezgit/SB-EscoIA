# Reingeniería EscoIA (2026-11-16)

Registro por fases de la reingeniería solicitada el 2026-11-16. Cada fase indica qué se cambió y qué quedó verificado, configurado sin probar o pendiente.

## Fase 1 · Diagnóstico del repositorio

### Estructura

| Pieza | Ubicación | Tecnología |
|---|---|---|
| Coordinador (shell EscoIA) | `src/second_brain/` · puerto 8790 | Python stdlib HTTP, SQLite FTS5 (`core.Brain`) |
| UI del shell | `ui/src/main.tsx` (secciones, estado global en `App`), `Cerebro.tsx`, `Cuerdas.tsx`, `ResearchDashboard.tsx` | React 19 + Vite + TS |
| Escritorio | `desktop/main.cjs` | Electron 44, una `BrowserWindow`, `sandbox:true` |
| Módulo académico | `sistema-escolar/` (subtree; clon de trabajo en `../sistema-escolar`) · puerto 8787 | Node + TS (`server/main.ts`, `domain.ts`), núcleo C con SQL en lista blanca (`native/service.c`), React (`ui/src/views`) |

**Rutas y estado global**
- En el shell, las secciones son las claves de `icons` en `main.tsx`.
- Asistencia, Horarios, Calificaciones y Administración se incrustan como iframe de 8787 (`academicModules`).
- El estado global se refresca con `/api/state` cada 700 ms.

**Conexión a la API local**
- `runtime.ollama()` es la puerta única. Enruta a LLMLX (`llmlx_local.request`, 127.0.0.1:11500) y también cubre el remoto opcional y Uzu.
- Exclusión: `MODEL_LOCK` permite una generación a la vez y `PIPELINE_LOCK` una petición completa a la vez.
- Breaker de RAM en `resources`/`llmlx_local`.

### Estado real de LAYA

**Activo y útil, como revisor opcional; no enruta.**
- Lo usa `adapters.validate_answer()` en `runtime._answer`, `lessons`, `finance_lesson`, `request_records`, `document_reviews` y `research.ai_codes`.
- Corre en un subproceso aislado (`.venv-laya`, `laya_worker.py`) con `MODEL_LOCK`, reserva de RAM y timeout.
- El checkpoint está instalado en `data/models/laya`.
- Si falta, la revisión devuelve `unavailable` sin romper la respuesta.

**Código muerto eliminado** (sin referencias en código ni pruebas):
- `adapters.LayaRouter`, que cargaba LAYA dentro del proceso y duplicaba el subproceso.
- `codex_handshake`, `workspace_read` y `message_envelope`.

### Modelo de datos académico existente (`sistema-escolar/db/schema.sql` + `002.sql`)

| Entidad pedida | Tabla actual |
|---|---|
| Usuario / Rol | `users(role ∈ admin, teacher, student, researcher)`; `teachers.user_id` |
| Carrera / Plan | `programs`, `curriculum` |
| Materia | `subjects`, `course_units`, `prerequisites` |
| Grupo | `groups`, `offerings` (Grupo↔Materia↔Docente), `enrollments` |
| Alumno | `students` |
| Horario | `schedules`, `rooms`, `availability` |
| BiometriaFacial | `biometrics` (embedding cifrado, consentimiento, caducidad) |
| Asistencia | `attendance` (`present`/`excused`/`absent`) |
| Investigacion | `surveys`… en el académico; `research_*` en el shell (módulo Encuestas) |
| Memoria | `memories` en `core.Brain` (shell) |

**Hallazgos clave**
- `Auth` siempre fijaba al administrador. El dominio ya filtra por docente (`teacher_user`, `teacher_user_id`), pero nunca se ejercía porque no había forma de entrar como docente.
- Ningún docente tenía usuario vinculado: 2 docentes, `user_id` nulo.
- La asistencia no admite «Retardo».
- La gestión de listas (`/api/attendance/roster`) y el reporte mensual (`/api/attendance/report`) eran solo para administración.
- El shell tenía la sección «Actividad · Git» (`RequestGit.tsx` + `GET/POST /api/request-git`). Las instantáneas Git por petición (`request_git.snapshot`) son internas y se conservan.
- «Explorar» de Cuerdas solo expandía el diagrama dentro de la misma página. Electron no tenía preload ni IPC.

## Fase 2 · Modelo de datos y Auth/RBAC

**Perfiles locales**
- La autoridad está en `sistema-escolar/server/auth.ts`.
- Hay un perfil de **Administración** y uno de **Docente** por cada fila de `teachers`. Al listar los perfiles se crea su usuario local `docente-<id>` y se vincula en `teachers.user_id`.
- Roles efectivos: admin → `admin`; docente → `teacher` + `researcher`, porque administra sus propias investigaciones.

**Entrada y PIN**
- El PIN es opcional, de 4 a 12 dígitos, guardado como hash scrypt con sal en `users.password_hash`.
- Si el último perfil usado tiene PIN, el servicio arranca **bloqueado**: solo responde `/api/me`, `/api/profiles` y `/api/profile`. El shell muestra entonces la pantalla «¿Quién usa EscoIA?».
- Cambiar de perfil rota el token CSRF y queda en `audit` como `perfil-entrada`.

**Aislamiento del docente en el servidor (verificado con curl)**
- El reporte de otro docente se rechaza: «Solo puedes consultar tu propio reporte».
- En las listas, el docente solo puede dar altas y bajas en sus propias ofertas. Editar o mover alumnos es de administración.
- El resto del dominio ya filtraba por `teacher_user` y `teacher_user_id`.

**Migración v3** (`db/003.sql`)
- `attendance` admite `late` (Retardo, cuenta como asistencia) y añade `note` (justificación) y `confidence` (reconocimiento facial).
- Se aplica sola al arrancar, con respaldo `.pre-v3`. Aplicada en la base real: 316 registros conservados, `integrity_check` ok.

**Shell**
- `GET/POST /api/profile` hace de proxy servidor a servidor hacia 8787 (`services.py`).
- `ui/src/Perfil.tsx` contiene el selector en la barra lateral, la pantalla de entrada y el PIN propio.

**Pruebas**
- `tests/auth_profiles.test.ts`: roles, vinculación sin duplicados, PIN, arranque bloqueado y rotación de CSRF.
- Suite del módulo académico: 49/49.

## Fase 3 · UI/UX y navegación

**Menú por rol** (`SECTIONS_BY_ROLE`)
- El docente no ve Administración, ni el selector de modelo, ni la auditoría.
- La autorización real sigue en el servidor.

**«Actividad · Git» eliminada**
- Se retiraron la vista `RequestGit.tsx`, las rutas `GET/POST /api/request-git` y su prueba HTTP.
- El versionado Git por petición sigue **en segundo plano** (`request_git.snapshot`; ver `docs/historial-git.md`).
- La revisión LAYA del expediente pasa a `POST /api/request {action:"review"}`.
- La sincronización `git subtree` del módulo académico sigue *headless* en `scripts/autosync.sh`.

**Sección «Tareas»**
- Conserva la cola de tareas en segundo plano para ambos roles.
- Para Administración añade «Auditoría · registro de ejecución» y «Métricas del modelo»: generaciones, RAG, completadas, fallidas, bloqueadas y LAYA.

**Otros cambios de UI**
- **Encuestas → Investigaciones** en el menú, la detección de intención y el catálogo del Cerebro.
- **Burbuja «Tú»** alineada a la derecha (desde el commit 48c5dc6).
- **«Explorar» en ventana independiente**
  - `desktop/preload.cjs` (contextBridge) expone solo `escoia.openWindow("cuerdas")`.
  - `ipcMain.handle("escoia:open-window")` valida la vista y el origen y crea una `BrowserWindow` con `contextIsolation`, `sandbox` y sin Node, una por vista.
  - En la web hay respaldo con `window.open('/?vista=cuerdas')`, y si se bloquea, overlay en la misma página.
  - **Verificado** el respaldo web y la vista `?vista=cuerdas` en el navegador. La ventana nativa por IPC está **configurada sin probar** a mano dentro de Electron.

## Fase 4 · Módulos

### Investigaciones (antes Encuestas)

**Cuantitativo** (`research_worker.hypothesis_test`)
- Corre en el subproceso aislado con scipy (`.venv-research`), igual que el análisis existente.
- **Pruebas paramétricas**
  - t de una muestra, t independientes (Student y Welch) y t pareadas.
  - ANOVA de un factor.
  - Pearson y regresión lineal simple.
- **Pruebas no paramétricas**
  - Mann-Whitney U y Wilcoxon.
  - Kruskal-Wallis y Spearman.
  - χ² de independencia y χ² de bondad de ajuste.
- Cada prueba devuelve estadístico, p, gl, tamaño del efecto con su magnitud, descriptivos, supuestos y avisos (Levene, esperadas < 5, post hoc).
- **Interpretación con el LLM local**
  - Se descarta si cita un número que no está en el resultado y, en ese caso, se entrega la interpretación determinista.
  - El prompt prohíbe afirmar que los supuestos se cumplen.
  - **Verificado** con LLMLX qwen3.5 4B en 13 s.

**Cualitativo** (Izcara Palacios)
- Diseño: entrevista en profundidad, grupo focal u observación participante, con guion y criterios del muestreo intencional.
- Informantes con alias, sin nombres reales.
- Curva de **saturación teórica**: se alcanza cuando *k* entrevistas seguidas no aportan códigos nuevos.
- Códigos **abiertos → axiales → emergentes**, y matriz categoría × informante.

**Triangulación**
- Contrasta la última prueba con los segmentos codificados.
- Solo conserva afirmaciones con **cita literal** de un segmento existente; si ninguna queda respaldada, el veredicto es «sin evidencia suficiente».

**Propiedad**
- Cada estudio y documento cualitativo guarda `owner`, que es el perfil activo.
- El docente solo ve los suyos; Administración ve todos.

### Calificaciones · fase 1 (módulo académico)
- **Matriz fechas × alumnos** (`/api/attendance/history`) con P, R, J, F y C.
- **Porcentaje de asistencia** = (presentes + retardos) / (impartidas − justificadas). El umbral de riesgo es configurable, 80 % por defecto.
- **Edición manual** (`/api/attendance/set`): exige justificación de al menos 5 caracteres, queda en auditoría y no permite tocar clases futuras.
- **Exportación** en CSV con BOM para Excel y en PDF vía impresión con estilos de papel.
- **Verificado** con datos reales: oferta 6, 44 alumnos, 4 en riesgo.

### Asistencia facial
**Hecho**
- «Retardo» se registra pasados `LATE_TOLERANCE_MIN` minutos (10 por defecto).
- Se guarda y se muestra la **confianza** del consenso multicaptura.
- Hay un tono de confirmación: agudo para presente, grave para retardo.
- Ya existían: el registro biométrico solo por Administración, con consentimiento y embedding cifrado AES-256-GCM, y el reconocimiento pasivo con 3 capturas.

**Recuadro de detección en vivo (añadido el 2026-11-16)**
- `face_extract --detect-stdin` es un proceso persistente que solo usa YuNet: no corre ArcFace ni produce embeddings.
- Devuelve la caja, la puntuación y la calidad, con los mismos umbrales que la extracción: un rostro, ≥ 80 px, nitidez y luz.
- `POST /api/face/detect` atiende un cuadro a la vez y descarta el siguiente si el detector está ocupado. Borra el JPEG temporal y cierra el proceso tras 60 s sin uso. Responde en 12–27 ms.
- En la UI, la caja se actualiza unas 4 veces por segundo con una pista («Acércate un poco», «Falta luz», «Solo una persona…»). Al reconocer, la caja muestra «Nombre · Presente/Retardo · %» o «No registrado».
- **Verificado** con una imagen de muestra de OpenCV, por prueba automática y por HTTP. **No probado con cámara real** en una clase vigente.

**Pendiente**
- La **captura multiángulo** del registro.
- La **biometría de docentes**: la tabla `biometrics` solo admite alumnos.

### Horarios propios del docente
- `POST /api/schedules/block` crea un bloque semanal (día, inicio, fin, aula, desde, semanas) **solo sobre ofertas asignadas**.
- Todo ocurre en una transacción. Si hay conflicto de aula, grupo o docente no se crea ninguna sesión.
- Se asume CDMX en UTC−06:00, sin horario de verano desde 2022.

### Memoria en tres capas (`memory_layers.py`)
1. **Sesión**
   - Muestra los tokens estimados (~3,6 caracteres por token) frente al contexto de 4096.
   - **Compactar** resume con el LLM local y guarda un recuerdo `sessions` (inferido). **Limpiar** vacía la sesión.
2. **Pedagógica** por perfil
   - Guarda estilo, rigor, lenguajes y reglas en la tabla `pedagogy`.
   - Tiene un recuerdo espejo para el RAG; el Cerebro y el Copiloto la usan como contexto.
3. **Hechos**
   - Se pueden fijar (prioridad en el contexto del Cerebro), cambiar de estado, editar y eliminar.
   - Un hecho obsoleto no entra al contexto aunque esté fijado.

### Biblioteca (`library_index.py`)
- Muestra por documento los fragmentos, los embeddings activos y el peso en disco.
- Categorías Nivel/Carrera/Materia/Tipo, con tipo sugerido y editable por Administración.
- Vista previa de los primeros fragmentos y enlace al PDF original.
- Búsqueda con filtros y cita «documento · p. N».
- **Estado real**: 34 documentos, 3 582 fragmentos y **0 embeddings**. La búsqueda es **solo léxica (FTS5)** y la interfaz lo indica.
- El botón «Generar embeddings» (bge-m3 vía Ollama) está **configurado sin probar**.

### Copiloto pedagógico (`copilot.py`, sección «Copiloto»)
- **Mis materias**: ofertas del perfil cruzadas con los programas del RAG (`academic_records`). El temario oficial se muestra con cita al PDF.
- **Planeación de 16 semanas, determinista**
  - Toma los subtemas oficiales en orden y reserva las semanas 1 (encuadre), 8 (parcial) y 16 (final).
  - Objetivos, actividades y entregables salen del programa. Exporta Markdown y CSV.
  - **Verificado** con LARRDS.
- **Recursos de un clic**: ejemplo, código, ejercicio guiado, caso y explicación.
  - Usan el LLM local y solo aceptan temas oficiales.
  - El código **no se ejecuta**: se marca como borrador.

## Fase 5 · Verificación (2026-11-16)

**Compilación**

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit`: shell, servidor académico, UI académica | sin errores |
| `vite build`: shell y UI académica | correcto |
| `node --check desktop/main.cjs desktop/preload.cjs` | correcto |

**Pruebas**

| Suite | Resultado |
|---|---|
| Python (`unittest`) | todo OK, 3 omitidas por entorno |
| Módulo académico (`node --test`) | 49/49 |
| Electron `desktop/verify-exit.sh close` | ✔ arranque con el preload nuevo, cierre, procesos y puertos liberados, descarga de modelos confirmada |

**Empaquetado de Electron**
- El repositorio no tiene empaquetador (electron-builder/forge). La app se ejecuta desde el código con `escoia-desktop.sh`.
- No se añadió ninguno: requiere decidir firma y notarización de macOS.

**Pendientes explícitos**
- Recuadro de detección en vivo y captura multiángulo, que requieren cambios en el extractor nativo.
- Biometría de docentes.
- Embeddings de la biblioteca.
- Probar a mano la ventana nativa de «Explorar» dentro de Electron.
- Probar la voz con micrófono real.
