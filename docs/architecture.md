# Arquitectura de EscoIA 0.3

El núcleo de segundo cerebro utiliza Python estándar, SQLite FTS5 y una interfaz React 19 en español. Los servicios académicos nativos C se conservan en el proyecto hermano `sistema-escolar`; esta entrega no sustituye sus bases ni convierte automáticamente alumnos, horarios o biometría en memoria personal.

```text
second-brain/
  src/second_brain/
    core.py       SQLite, recuerdos, ZIP/PDF, referencias, grafo, respaldos
    runtime.py    Ollama, recuperación híbrida opcional, tareas y límites
    server.py     HTTP local y coordinador de cola
    adapters.py   Laya opcional, handshake Codex, lectura GWS optativa
    mcp.py        herramientas y recurso de política, transporte stdio
    cli.py        comandos brain
  ui/src/         React/TypeScript y CSS; conversación/biblioteca/memoria/actividad
  scripts/        instalación, pruebas, servidor Ollama con concurrencia limitada
  config/         configuración de ejemplo
  memory/         JSON con procedencia, fecha, sensibilidad y estado
  data/           SQLite y copias de PDF; privados, fuera de Git y del ZIP de código
  docs/           diagnóstico, fuentes, decisiones y evidencia
  tests/          pruebas de aceptación local
  benchmarks/     mediciones y propuestas; no cambia producción
```

Flujo: consulta → selección determinista de carrera → FTS5 → referencias a PDF/página → Qwen si está disponible y hay presupuesto, o extractos literales. Los documentos nunca son instrucciones. El modelo no dispone de shell ni herramientas de escritura; por ello una instrucción maliciosa recuperada no puede ejecutar una acción. La calidad textual ante inyección con Qwen todavía requiere evaluación específica.

Las tareas se reclaman con BEGIN IMMEDIATE, tienen estados persistentes, tres intentos máximos y checkpoint de resultado. Al reiniciar el único coordinador se recuperan tareas en ejecución. No existe una copia del LLM por rol. Cancelar evita la publicación del resultado; una generación que ya comenzó termina o alcanza su timeout antes de liberar el recurso. No se garantiza exactamente una inferencia tras caída antes del checkpoint; los pasos actuales son consultas sin efectos externos.

Máquina de estados pequeña frente a LangGraph: las operaciones del MVP son consultas y persistencia, por lo que una tabla y transacciones permiten inspección y recuperación sin otra dependencia. LangGraph se reevaluará al introducir flujos más complejos.

SQLite frente a LanceDB: 2.288 fragmentos caben en FTS5 y una búsqueda vectorial exacta opcional. Los embeddings `bge-m3` permanecen en SQLite y se combinan con FTS por RRF. Sin ese modelo instalado, funciona únicamente FTS5. No se afirma que esto sea HNSW ni una búsqueda semántica verificada. El grafo actual representa relaciones documentales confirmadas fragmento→carrera; no extrae relaciones semánticas con IA. Graphify queda para evaluación aislada.

El servicio escucha exclusivamente en 127.0.0.1. Comprueba Host, Origin y CSRF para escrituras y no habilita CORS. Es una aplicación personal local, sin cuentas multiusuario. No expongas este servidor a la red de la universidad; usa el sistema académico autenticado para ese caso. Las bases, respaldos y archivos son privados pero no se cifran por aplicación: protege el Mac y usa FileVault.

Laya utiliza su runtime dedicado `laya_mlx` y produce decisiones de conjunto cerrado. El adaptador opcional no está activado ni probado con pesos; sus decisiones no conceden permisos. El rol denominado LAYA en el proyecto académico anterior empleaba Qwen/MLX-LM: no es el modelo Laya real.

Los conectores externos están deshabilitados. El handshake Codex verificado es local y no inició un turno remoto. GWS requiere instalación, OAuth y habilitación explícita de lectura. Claude, Grok, OpenClaw y Magnitude no se presentan como conectados. Los documentos privados no se envían a ninguno de ellos.
