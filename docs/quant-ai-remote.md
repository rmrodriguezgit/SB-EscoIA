# Inferencia remota Quant-AI

Activada el 2026-10-07 para Qwen y LAYA. Servidor: https://quantlabs.site/ai por HTTPS. Qwen usa /ai/api/chat SSE y qwen2.5:7b; LAYA usa /ai/api/decision y multilingual. No usa el contrato OpenAI.

`config/remote-ai.json` contiene URL y ruta absoluta del archivo privado .env, no el token. `src/second_brain/remote_ai.py` lee QUANT_AI_API_TOKEN del backend y exige permisos restrictivos. Nunca se envía al navegador, a VITE_* ni a registros. El archivo privado permanece fuera de Git.

El lanzador omite Ollama local. Las llamadas de generación y comprobación usan el servidor; no existe fallback local al fallar Tailscale o credenciales. Los embeddings locales quedan deshabilitados: conservar búsquedas textuales/estructuradas e índices previos. La API indicada no proporciona embeddings. Audio Whisper, visión, PDF, estadísticas, RAG y almacenamiento siguen locales y conservan sus límites de recursos.

Las constelaciones conservan estados Qwen/LAYA; los recursos muestran T4/multilingual remotos y reserva local de modelos cero. Liberar memoria actualiza recursos locales: no descarga ni administra modelos del servidor, porque el contrato no ofrece esa operación. La presión local y los procesos propios todavía consumen RAM.

Comprobaciones reales: health reportó Tesla T4, LAYA CUDA y sin fallback CPU; chat SSE completó done; decisión noul devolvió probabilidad válida; inferencia estructurada con evidencia sintética devolvió LAN645 y LAYA revisó la respuesta. También se adaptó el servidor académico TypeScript para chat remoto. 64 pruebas Python y compilación TypeScript/UI pasan. No se probaron todos los flujos académicos con datos reales.

Si cambia la ubicación del .env, actualizar env_file sin copiar su contenido al repositorio. Si el servidor falla, revisar Tailscale y el estado API; no arrancar modelos locales. Los datos necesarios de cada petición se transmiten al servidor autorizado; el token se mantiene exclusivamente en backend.
