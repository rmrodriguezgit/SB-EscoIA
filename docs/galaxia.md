# Galaxia en vivo

Sustituye a "Constelaciones en vivo · Ruta de la petición" (2026-11-15). Componente `ui/src/Galaxy.tsx`, datos `GET /api/galaxy?window=1h|24h|7d` (`src/second_brain/galaxy.py`, solo lectura).

**Panel compacto** (flotante o anclado, arrastrable): galaxia, estado del motor, peticiones, tok/s, RAM libre y peticiones que requieren atención. **⤢ Explorar** abre la vista completa (Esc para cerrar).

**Lectura del lienzo**

- Brazos: tipo de trabajo (consultas, programas, lecciones, investigación, administración, cola · MCP). Las más recientes quedan cerca del núcleo.
- Estrella: una petición o tarea. Color = estado (completada, retenida, fallida, en curso, en cola, por confirmar, cancelada, interrumpida); tamaño = duración; aro = usó Qwen.
- Núcleo: motor local LLMLX (reposo, generando, pausa por RAM, sin conexión) y modelo.
- Anillo de RAM: memoria usada del Mac; la marca roja es donde LLMLX pausa la generación.
- Anillo de ruta: etapas de la petición en curso o seleccionada (Gateway → RAG → Qwen → LAYA → Resultado, o la ruta de programas, lecciones, investigación o módulos académicos).

**Vista completa**: filtros por tipo, motor local (estado, modelo elegido y en memoria, RAM con umbral de pausa, presión y swap), uso del LLM por ventana (llamadas, tokens, tok/s p50/p95, primer token p50/p95, correctas/errores/rechazadas, por modelo), llamadas recientes, incidentes de memoria, detalle de la petición con su línea de tiempo y últimas peticiones.

Las métricas del LLM provienen de `/v1/metrics` de LocalLLM.app; si no responde, el panel lo indica y el resto sigue funcionando. Actualización cada 5 s (2 s con una petición en curso o la vista completa abierta), en pausa con la pestaña oculta. Respeta `prefers-reduced-motion`; el giro se detiene al pasar el ratón.
