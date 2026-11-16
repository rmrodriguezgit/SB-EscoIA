# MCP de EscoIA

Servidor MCP por stdio (`brain mcp`, nombre `escoia`, versión 0.5.0). No ofrece shell ni escrituras en bases académicas.

| Herramienta | Efecto |
|---|---|
| `memory_search` | Busca en biblioteca y memoria con referencias. Solo lectura |
| `mixed_research_read` | Lee un estudio de investigación mixta. Solo lectura |
| `task_enqueue` | Encola una petición. El coordinador la responde con la cadena auditada del chat y crea su expediente (`data/requests/<id>`) |
| `task_status` | Estado, resultado resumido, expediente y últimos eventos de una tarea |
| `tasks_list` | Tareas recientes |
| `task_cancel` | Cancela una tarea pendiente o en ejecución |

Las tareas se procesan solo con el coordinador activo (app de escritorio o `Arrancar-EscoIA.command`).

## Órdenes administrativas

Ninguna orden escrita (chat, tarea o MCP) modifica listas. "Quita al alumno … de la lista …" crea una propuesta en `data/proposals/<id>.json` (permisos 600), válida 30 minutos. La base de `sistema-escolar` cambia únicamente cuando una persona pulsa **Confirmar retiro** en la respuesta de EscoIA (`POST /api/attendance/decision`, con Host, Origin y CSRF). Al confirmar se vuelve a resolver alumno, grupo y docente: si cambiaron, no se ejecuta. El registro de auditoría queda como `lista-remove-confirmed` con el id de la propuesta.

Límite conocido: el token CSRF se obtiene con `GET /api/state`, así que un proceso local con acceso a la red de 127.0.0.1 podría confirmarlo. EscoIA es una aplicación personal local; el MCP no expone esa operación y el modelo no tiene herramientas.

## Registro (2026-11-15)

- Claude Code, ámbito de usuario: `claude mcp get escoia` → conectado.
- Claude Desktop: `mcpServers.escoia` en `claude_desktop_config.json` (copia previa `.bak-escoia-2026-11-15`). Requiere reiniciar Claude Desktop; no comprobado desde la app.
- Codex: sin registrar.

Comando: `<repo>/.venv/bin/python -m second_brain --home <repo> mcp` con `PYTHONPATH=<repo>/src`.

## Pendiente

Agente MCP (`agent_run`): bucle con Qwen3 de LLMLX y llamadas a herramientas de solo lectura, con límite de pasos, cada paso en el expediente y escrituras convertidas en propuestas.
