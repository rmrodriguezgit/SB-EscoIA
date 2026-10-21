# Evidencia de validación

- Instalación editable con Python 3.12 en `.venv`: verificada. Núcleo sin dependencias Python de ejecución externas.
- 12 pruebas unittest pasadas: persistencia tras reinicio, corrección sin índice obsoleto, borrado de derivados, exclusión de recuerdos obsoletos, checkpoint sin repetir resultado, respaldo/restauración, consulta sin proveedor y sin capacidad de ejecutar instrucciones recuperadas, ZIP traversal, filtros, MCP stdio búsqueda exacta de clave sin arrastrar palabras genéricas y rechazo de patrones reconocibles de credenciales.
- Compilación TypeScript y Vite: pasada; React 19.2.0. Paquete UI aproximadamente 207 KB JS antes de gzip.
- Ingesta real: 18 PDF, 6 carreras, 1.554 páginas físicas, 2.288 fragmentos. Consulta LAR105 devuelve sus tres anexos originales con página. Segunda ingesta omitió 18/18 documentos sin regenerar fragmentos.
- 100 búsquedas FTS5: 0,0896 segundos en una ejecución caliente; pico RSS del proceso de prueba 34.160.640 bytes. No es una medición del sistema completo ni un benchmark de inferencia. `rag-validation.json` conserva condiciones y muestra inicial; `subject-query.json` refleja la consulta exacta después de mejorar el filtro de código.
- UI en navegador: navegación Conversación/Biblioteca, seis carreras, filtro Actuaría, consulta LAR105 y enlaces PDF observados. Captura en outputs/escola-ia-interfaz.png.
- API: protege escrituras con Host/Origin/CSRF; verificación HTTP registrada en `http-validation.json`.
- Ollama oficial 0.35.1 iniciado en localhost con memoria/concurrencia acotadas; etiqueta Qwen 3B descargada y SHA-256 verificado por Ollama. `ollama-models.json` conserva el digest. La generación no se probó: el guard de 12,5 GiB rechazó la carga con la memoria actual. `qwen-resource-check.json` prueba que la consulta continúa con evidencia literal.
- Codex CLI 0.160.0: handshake initialize/initialized por stdio pasado, sin iniciar turno ni enviar documentos. `codex-handshake.json`.
- Voz anterior: puente whisper.cpp 1.9.4 Metal compilado y una frase española sintética transcrita en el proyecto académico. Esto no verifica micrófono, conversaciones reales ni la nueva UI de voz.

## Criterios aún pendientes

Sesión de inferencia Qwen estable con medición de swap/latencia; embeddings multilingües y calidad híbrida; evaluación Laya española; micrófono pulsar-para-hablar; transferencia real a un proveedor externo; sincronización Workspace paginada; navegador Playwright con perfil aislado; automatizaciones persistentes; AutoHarness con comparación, regresión y rollback; benchmarks equivalentes MLX-LM/Magnitude. No se consideran completados por existir documentación o adaptadores.

No se declara el sistema escolar completo listo para producción. El núcleo C anterior permanece conservado y probado por separado, sin integrar todavía todos sus módulos en la interfaz nueva.

Paquete portable: extracción del ZIP en un directorio distinto, apertura de los 18 PDF con rutas reubicadas, consulta exacta LAR105, esquema SQL ejecutado en base vacía y 12 pruebas repetidas desde el paquete: verificados.
