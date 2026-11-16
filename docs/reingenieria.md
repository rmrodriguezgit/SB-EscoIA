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
