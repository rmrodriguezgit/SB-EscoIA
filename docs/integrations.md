# Integraciones y estado real

| Componente | Estado | Condición para avanzar |
|---|---|---|
| SQLite FTS5, memoria, biblioteca PDF | Verificado | Funciona sin internet |
| React 19 español y API local | Verificado | Compilación y navegación local |
| Qwen/Ollama | Adaptador implementado; prueba de generación pendiente de recursos | Modelo pequeño y presupuesto de RAM |
| Embeddings bge-m3 / RRF | Configurado sin probar con pesos | `ollama pull bge-m3`, luego `brain sync --embeddings` |
| Grafo SQLite | Verificado, relaciones documentales | No equivale a extracción semántica |
| LLMLX (LocalLLM.app, gateway :11500) | **Único motor de conversación.** Verificado 2026-11-15: generación con `qwen3.5:4b` (6,3 s; cadena completa 9,6 s) y descarga tras la respuesta. `qwen3:8b` rechazado por el breaker de LLMLX (429) con 3 GiB libres | La RAM del modelo la protege el breaker de LLMLX (pausa < 1,8 GiB libres), no el presupuesto de 12,5 GiB. LAYA, PDF y voz conservan el presupuesto de EscoIA |
| Laya multilingual MLX | Adaptador opcional, sin probar | Runtime dedicado y evaluación española |
| Codex app-server | Handshake stdio verificado | No se inició un turno ni se transfirió tarea externa |
| Workspace CLI | Adaptador de lectura preparado | Instalar versión seleccionada, OAuth del usuario, BRAIN_WORKSPACE_READ=1 |
| Voz whisper.cpp | Puente C probado en proyecto académico; CLI de archivos preparada | WHISPER_BIN, WHISPER_MODEL; float32 mono 16kHz, máximo 30 segundos |
| Síntesis macOS | Voz Paulina probada en la sesión | `brain voice --say "Hola"` |
| Micrófono en nueva UI | Pendiente | Integrar pulsar para hablar y revisión de transcripción |
| Playwright MCP | Investigado, no instalado | Perfil separado, límites y política de navegación |
| Claude Code/Claude/Grok | Pendiente | Adaptadores separados y autenticación/consumo explícitos |
| Magnitude/MLX-LM benchmark | Pendiente | Condiciones equivalentes y memoria suficiente |
| OpenClaw / Claude-Claw | Deshabilitado | Revisión aislada del proyecto concreto |

Fuentes oficiales, licencia y commit observados están en `source-lock.json`; esas versiones son referencias de investigación, no instalaciones de todos los candidatos. Verifica sus requisitos antes de activar alguno.

Laya no es un servidor de chat ni un modelo servido por mlx-lm/Ollama. Su variante multilingüe publicada es 322M FP16 y el límite de contexto incluye preguntas y opciones. Las cifras del proyecto sobre M3 Max no se extrapolan a este M3. Adaptador: `second_brain.adapters.LayaRouter`, recomendaciones sin autorización. [Runtime original](https://github.com/mizorewww/laya-mlx), [checkpoint](https://huggingface.co/aac6fef/laya-multilingual-mlx).

Graphify instala el paquete `graphifyy` y expone el comando `graphify`; tiene backend Ollama opcional. Se mantiene SQLite para no instalar un conjunto adicional antes de medirlo. [Repositorio](https://github.com/Graphify-Labs/graphify).

Magnitude publica compilación/ajuste de kernels de inferencia. Sus afirmaciones de rendimiento se deben medir; no es modificar el kernel de macOS. No se ejecutaron sus instaladores ni se cambiaron backends. [Repositorio](https://github.com/magnitudedev/magnitude).

GWS requiere proyecto Google Cloud y OAuth. No se solicitan contraseñas ni se ejecutó consentimiento automáticamente. `workspace_read` acepta únicamente Gmail messages list, Calendar events list y Drive files list, sin comandos arbitrarios. Sincronización incremental completa de Workspace y escrituras con vista previa permanecen pendientes. [Documentación original](https://github.com/googleworkspace/cli).

Codex: initialize → initialized por stdio, probado con CLI 0.160.0. La evidencia está en `codex-handshake.json`. La integración de turnos, aprobación y bus persistente externo está pendiente. [Protocolo oficial](https://learn.chatgpt.com/docs/app-server).

Claude-Claw es ambiguo: se examinó específicamente andrehuang/claude-claw, una colección de mejoras para Claude Code. No se considera sinónimo de OpenClaw ni se activa por nombre. [Proyecto examinado](https://github.com/andrehuang/claude-claw).

LLMLX ([repositorio](https://github.com/rmrodriguezgit/LLMLX)) es la app de barra de menú LocalLLM: gateway SwiftNIO sobre su propio Ollama (127.0.0.1:11501) con breaker de RAM, cola de prioridad y telemetría. EscoIA usa su API nativa Ollama en `127.0.0.1:11500` (`LLMLX_HOST` solo admite localhost), con `X-Client-App: escoia`, `X-Priority: high`, `think:false` y `keep_alive:0`. No inicia, configura ni actualiza la app. Los embeddings siguen en el Ollama de EscoIA (11434). Un 429 de LLMLX (poca RAM o cola llena) se muestra como error; no se reintenta en silencio.

Desde 2026-11-15 EscoIA solo ofrece LLMLX: el motor remoto Quant-AI, Uzu y los Qwen 2.5 de Ollama no aparecen en el selector ni se aceptan en `inference.select_model` (el código permanece). `qwen3.5:4b` usa el runner MLX de Ollama, que responde `501 structured output is unavailable` a `format`; `llmlx_local` reintenta sin `format` con la plantilla JSON y la validación estricta del respaldo de Uzu (`scripts/uzu_worker.py`), con un reintento y sin inventar campos. Si LAYA no cabe en memoria o no está instalada, la respuesta de LLMLX se entrega con las comprobaciones de reglas y el modo `Qwen · LLMLX · sin revisión LAYA`.
