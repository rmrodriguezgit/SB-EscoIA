# Cuerdas en vivo

Diagrama inspirado en la teoría de cuerdas que sustituye a la Galaxia (2026-11-16), que a su vez sustituyó a "Constelaciones en vivo · Ruta de la petición". Componente `ui/src/Cuerdas.tsx` (canvas 2D en TypeScript, sin dependencias); datos `GET /api/galaxy?window=1h|24h|7d` (`src/second_brain/galaxy.py`, solo lectura).

## Lectura

| Elemento | Significado |
|---|---|
| Cuerda fundamental (arriba) | Motor local LLMLX. Plana en reposo; vibra mientras genera, a una frecuencia proporcional a los tok/s reales. Ámbar = generando, roja = pausa por RAM, gris = sin conexión |
| Tensión (barra bajo el motor) | RAM usada del Mac; la marca roja es donde LLMLX pausa la generación |
| D-branas (franjas) | Una por tipo de trabajo: consultas, programas, lecciones, investigación, administración, cola · MCP |
| Cuerda abierta | Una petición, con los extremos fijados a su brana. Las recientes, a la derecha |
| Cuerda cerrada (bucle) | Tarea encolada por la cola o el MCP |
| Color | Estado: completada, retenida, fallida, en curso, en cola, por confirmar, cancelada, interrumpida |
| Modo de vibración | Número de etapas que recorrió (1–7) |
| Longitud y arco | Duración y número de fuentes |
| Cuerda rota | Fallida o interrumpida |
| Línea punteada al motor | Hoja de mundo de la cuerda seleccionada; ámbar si usó Qwen |
| Onda estacionaria (abajo) | Ruta de la petición en curso o seleccionada: un nodo por etapa (Gateway → RAG → Qwen → LAYA → Resultado, o la ruta de programas, lecciones, investigación o módulos). Tramo vibrante = etapa activa; rojo = retenida o fallida |

## Uso

- **Panel compacto:** flotante o anclado, arrastrable y minimizable. Pasar el ratón muestra la petición; hacer clic abre la vista completa con ella seleccionada.
- **⤢ Explorar** (Esc para cerrar). Incluye filtros por tipo y el panel del motor local: estado, modelo, RAM, presión y swap.
- **Uso del LLM:** por ventana de 1 h, 24 h o 7 d. Muestra llamadas, tokens, tok/s p50/p95, primer token p50/p95, correctas, errores y rechazadas, también por modelo.
- **Más paneles:** llamadas recientes, incidentes de memoria, detalle con la línea de tiempo y últimas peticiones (selección con el teclado).

## Rendimiento

- **Dibujo:** a 30 fps como máximo. Se repinta en el acto al redimensionar o al llegar datos nuevos, aunque el navegador ralentice los fotogramas.
- **Pausas:** se detiene con la pestaña oculta. El panel compacto se pausa con la vista completa abierta. Con `prefers-reduced-motion` baja a 2 fps y sin vibración.
- **Datos:** cada 5 s, o cada 2 s con una petición en curso o la vista completa abierta.
