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
