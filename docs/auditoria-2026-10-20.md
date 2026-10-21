# Auditoría de sistemas — 20 de octubre de 2026

Alcance: código (`src/`, `ui/`, `tests/`, `scripts/`), configuración, servicio en ejecución en 127.0.0.1:8790, datos locales (`data/`) y preparación del repositorio público `rmrodriguezgit/SB-EscoIA`. Equipo: Apple M3, 16 GiB, macOS 27.0.1, Python 3.12.12, Node 22.22.3.

## Verificado

| Área | Resultado |
|---|---|
| Pruebas Python | 118 ejecutadas, 115 OK, 3 omitidas (dependen de recursos opcionales) |
| UI | `tsc --noEmit` sin errores; `vite build` correcto |
| Dependencias npm | 1 alta (vite ≤ 6.4.3, launch-editor) → **corregida** con 6.4.4; `npm audit` = 0 |
| Dependencias Python | 3 paquetes fijados, sin versiones pendientes |
| SQLite | `integrity_check` = ok, modo WAL, 34 documentos, 159 recuerdos |
| HTTP: Host ajeno | 403 (protección contra DNS rebinding) |
| HTTP: POST sin token CSRF | 403 |
| HTTP: traversal `/../`, `/assets/../../../`, `%2e%2e` | Bloqueado (403 o se sirve index.html) |
| HTTP: `/api/source` | 200 con PDF válido tras el endurecimiento |
| Servicio | Escucha solo en 127.0.0.1; un coordinador con bloqueo; límite de 12 conexiones |
| Ollama | Escucha en 127.0.0.1:11434, ningún modelo cargado |

## Hallazgos y acciones

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| 1 | Crítica (privacidad) | `tests/test_attendance_commands.py` contenía nombre y matrícula aparentemente reales de un alumno y el nombre completo de un docente; el repositorio de destino es **público** | Corregido antes del primer commit: datos ficticios. No están en el historial de Git |
| 2 | Alta | vite 6.4.3 con avisos GHSA-r825-w8mm-5pxw y relacionados (solo afecta a desarrollo) | Corregido: 6.4.4 |
| 3 | Media | `/api/source` validaba la ruta sin resolverla (`..` o enlace simbólico guardado en la BD podía escapar de `data/sources`) | Corregido: `resolve()`, archivo existente, `nosniff`, `no-store` |
| 4 | Media | `data/backups/*.sqlite`, `server.log` y `ollama.log` legibles por otros usuarios (644) | Corregido localmente: 600/700 (no versionado) |
| 5 | Media | `.gitignore` no cubría `.DS_Store`, `*.sqlite`, `*.log`, `.env.*` ni `.venv-*` genérico | Corregido |
| 6 | Alta (operación) | Swap 13,6 de 15 GiB en uso y presión de memoria alta: el modelo local no puede cargarse | Pendiente del usuario: cerrar aplicaciones y reiniciar macOS |
| 7 | Baja | `config/remote-ai.json` y `config/export_runtime.json` publican rutas absolutas con el usuario de macOS y el dominio del servidor remoto | Aceptado; recomendado mover a variables de entorno |
| 8 | Baja | Los JSON de validación en `docs/` contienen fragmentos de planes de estudio institucionales | Revisar si la institución permite publicarlos; si no, mover a `data/` |
| 9 | Baja | `data/brain.db` vacío y obsoleto junto a `brain.sqlite` | Puede borrarse tras confirmarlo |
| 10 | Baja | `server.log` registra trazas `BrokenPipe`/`ConnectionReset` cuando el navegador cancela peticiones | Ruido; capturar esas excepciones en `Handler` |
| 11 | Informativa | Los errores 400 devuelven `str(e)` al cliente | Aceptable en local; no exponer el servicio fuera de 127.0.0.1 |

## Recomendaciones y actualizaciones

1. **Memoria (prioridad 1).** Reiniciar macOS para vaciar el swap y mantener el límite de 12,5 GiB. Usar el modelo 0,8B y evitar 3B mientras haya presión alta.
2. **CI en GitHub Actions.** ✅ Hecho el 2026-10-21 (`.github/workflows/ci.yml`): macOS, Python 3.12, Node 22, pruebas, `npm audit --audit-level=high` y compilación de la UI. Primera ejecución en verde.
3. **Dependabot.** ✅ Hecho el 2026-10-21 (`.github/dependabot.yml`): npm y pip semanal, Actions mensual.
4. **Escaneo de secretos y datos personales** antes de cada commit (gitleaks o un hook que busque matrículas, CURP y correos).
5. **Actualizaciones mayores, en una rama aparte y con pruebas:** React 19.2 → 19.3 (menor, bajo riesgo); vite 6 → 8 y TypeScript 5.9 → 7 (mayores, revisar cambios incompatibles).
6. **Configuración.** Cargar rutas personales desde entorno (`BRAIN_REMOTE_ENV`, etc.) en lugar de JSON versionado.
7. **Copias de seguridad.** Programar un `sqlite3 .backup` semanal en `data/backups` con permisos 600 y rotación.
8. **Licencia.** El repositorio es público y no tiene `LICENSE`; elegir una o hacerlo privado.
9. **Logs.** Rotar `ollama.log` (2,9 MB) y `server.log`.

## Control de versiones

- Repositorio: https://github.com/rmrodriguezgit/SB-EscoIA (público), rama `main`.
- Autor de los commits: dirección noreply de GitHub, para no publicar el correo personal.
- No se versionan `data/`, `memory/`, entornos, modelos, logs ni credenciales.
