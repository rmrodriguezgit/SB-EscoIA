# Diagnóstico del Mac

Medición local: Apple M3 ARM64, 8 núcleos CPU, 16 GiB de memoria física, macOS 27.0 (26A428), aproximadamente 264 GiB disponibles en disco al iniciar. Los valores completos y la presión/swap están en `hardware-report.json`.

Python 3.12/3.14, uv, CMake, Node, pdftotext, Claude Code y Codex CLI 0.160.0 disponibles. Ollama, gws y ffmpeg no estaban en PATH. Ollama 0.35.1 se descargó desde su release oficial en `work/` para validación, sin instalación global. El binario no forma parte del ZIP de código.

El sistema ya utilizaba aproximadamente 21 GiB de swap y tenía muchas pestañas Chrome al diagnosticarlo. Es un dato de la sesión, no una predicción de consumo de EscoIA ni prueba de que cargar un modelo adicional sea seguro.

Presupuesto inicial estimado, sujeto a medición:

| Componente | Presupuesto inicial |
|---|---:|
| macOS y aplicaciones | 5–6 GiB reservados |
| Qwen 3B Q4: pesos y runtime | 2–3 GiB estimados |
| KV y contexto 4K | hasta 1 GiB reservado; medir |
| Python, SQLite, UI | 0,3–0,7 GiB estimados |
| Embeddings o audio | 0,5–1 GiB temporal; no a la vez que Qwen |
| Laya | apagado inicialmente; medir antes de activar |
| Margen operativo | 1–2 GiB |

Límite operativo: 12,5 GiB de memoria activa + cableada + ocupada por compresor, medida con vm_stat más una reserva estimada de 3,5 GiB antes de cargar Qwen (1,5 GiB para embeddings y 1 GiB para Laya); es un indicador conservador, no una garantía de ausencia de swap. Mantén OLLAMA_MAX_LOADED_MODELS=1 y OLLAMA_NUM_PARALLEL=1. La aplicación descarga el modelo generativo tras cada respuesta (keep_alive=0). El benchmark conserva dos minutos entre ejecuciones fría/caliente y luego descarga.

La comprobación de recursos rechazó una carga con el estado de memoria observado. No se cerraron aplicaciones del usuario ni se elevó el límite para forzar la prueba. Antes de probar Qwen, cierra las aplicaciones prescindibles y revisa Monitor de Actividad → Memoria. Si persisten presión o swap creciente, reduce contexto a 2048 y conserva el modelo 3B. No activar 7B, Laya y embeddings simultáneamente.
