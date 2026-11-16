# Cerebro

Asistente flotante, abajo a la derecha. Se abre con el botón «Cerebro» o con ⌘K y se cierra con Esc. Responde **cualquier consulta**, escrita o hablada, con el modelo local de LLMLX. Si conviene hacer algo, lo **propone** como acción. Nada se ejecuta hasta que pulsas **Aceptar**.

## Acciones (catálogo cerrado)

| Acción | Al aceptarla |
|---|---|
| `consulta` | Se envía a la conversación principal: cadena con fuentes, programas, lecciones y órdenes de listas, con sus propias confirmaciones |
| `abrir` | Abre esa sección de la ventana principal |
| `recordar` | Guarda un recuerdo en Memoria (bandeja), con referencia `cerebro:<id>` |
| `tarea` | Encola una tarea; su avance aparece en Actividad y en Cuerdas |
| `liberar_memoria` | Descarga el modelo de EscoIA en LLMLX |

## Garantías

- El servidor descarta cualquier acción fuera del catálogo y propone como máximo 4.
- Cuando pides abrir una sección («abre horarios»), se detecta con una regla y no depende del modelo.
- El plan se guarda en `data/cerebro/<id>.json` (modo 600, fuera de Git). `POST /api/cerebro/decision` (con CSRF) ejecuta solo acciones de ese plan, una vez cada una y durante 24 h como máximo.
- La memoria y los documentos recuperados entran como datos, no como instrucciones. Se excluyen las conversaciones pasadas.
- Usa el mismo candado de modelo que la conversación: una sola generación local activa.
- Cada paso queda como evento: aparece en Cuerdas y en Actividad.

## Voz

- 🎙 graba hasta 29 s. El audio se transcribe en local (`/api/voice`) y se envía directamente: aquí enviar no ejecuta nada.
- Si hablaste, la respuesta se lee en voz alta con la síntesis de voz del sistema. 🔈/🔊 activa la lectura también para lo escrito.

## Estado (2026-11-16)

- **Verificado con LLMLX qwen3.5:4b:** respuesta en 17–27 s.
- **Verificado en la interfaz:** aceptar `abrir` cambia de sección; aceptar `consulta` la ejecuta en la conversación principal.
- **Configurado sin probar:** la voz con micrófono real.

## Tema unificado (2026-11-16)

Toda la interfaz comparte el lenguaje visual de Cuerdas y del Cerebro: fondo azul noche, superficies `#0e1630`, líneas `#22305a`, texto `#e6ecff`, turquesa para lo completado o aceptado, ámbar para la generación y violeta para lo pendiente.
- Los colores claros de `ui/src/style.css` se pasaron a esta paleta. La capa final del archivo («Tema unificado») fija los tokens `--ui-*`.
- Los módulos académicos incrustados se abren con `?embed=1&theme=dark`, que activa el tema «cielo nocturno» de sistema-escolar sin cambiar el que la app independiente tiene guardado.
