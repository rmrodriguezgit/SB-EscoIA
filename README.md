# EscoIA · Segundo cerebro académico local

MVP 0.3 con interfaz React 19 en español, biblioteca por carrera, conversación documental con fuentes, memoria corregible, cola de tareas persistente, MCP y CLI Python. El ZIP proporcionado se indexó: **18 PDF, 6 carreras, 1.554 páginas y 2.288 fragmentos**. No se ejecutaron instrucciones dentro de los documentos.

Esta entrega cubre diagnóstico y núcleo local, con coordinación básica. Las fases de conectores externos y optimización avanzada siguen pendientes; consulta el estado preciso en [integrations.md](docs/integrations.md). La búsqueda textual funciona sin modelos ni credenciales. Qwen requiere instalar Ollama y tener memoria disponible. Los módulos académicos C anteriores se conservan aparte en `sistema-escolar`.

## Instalación en tu Mac

Descomprime `escola-ia.zip` en una carpeta nueva. No lo extraigas encima de tu instalación `sistema-escolar` anterior. En Terminal entra en la carpeta `second-brain` recién creada:

```sh
cd "/ruta/donde/descomprimiste/second-brain"
```

CMake ya está instalado. Para este MVP necesitas Python, Node y extracción PDF:

```sh
brew install python@3.12 node@22 poppler
export PATH="$(brew --prefix node@22)/bin:$PATH"
./scripts/install.sh
```

El instalador crea `.venv`, instala el comando `brain`, compila la UI y ejecuta las pruebas. No instala modelos ni conecta cuentas. Si ya tienes Node 22 o superior y Python 3.11 o superior no necesitas reinstalarlos. Usa siempre el entorno local:

```sh
source .venv/bin/activate
brain doctor
brain start
```

Abre **http://127.0.0.1:8790/**. Para detener el servicio en primer plano, Ctrl+C. También puedes usar `brain start --background` y `brain stop`. `brain status` muestra biblioteca, modelo y tareas. No ejecutes dos coordinadores sobre los mismos datos.

La vista que se dejó abierta en esta sesión usa el puerto 8790. Si vas a arrancar una segunda instalación, usa `brain start --port 8791` y abre http://127.0.0.1:8791/ para evitar el puerto ocupado.

El paquete de entrega incluye tu biblioteca ya indexada. `escola-ia.zip` contiene copias privadas de los PDF, la base y recuerdos locales: no lo publiques. `escola-ia-codigo.zip` excluye data y memory para compartir solamente código y documentación. Si utilizas el ZIP de código sin datos, o quieres volver a importar planes:

```sh
brain sync "$HOME/Downloads/RE_ SOLICITUD DE PLANES DE ESTUDIO (CON NUEVOS RVOES) (1).zip"
brain search "LAR105" --career LAR
brain chat "Dame las materias del primer semestre de Actuaría"
```

Las fuentes conservan PDF original y número de página física. La segunda importación del mismo ZIP omite los documentos por SHA-256. El RAG no resuelve por sí solo diferencias entre anexos: comprueba los documentos cuando reporten cargas o nomenclaturas distintas.

## Activar Qwen local

Para reproducir la versión probada sin cambios globales, ejecuta:

```sh
./scripts/install-ollama-local.sh
./scripts/ollama-serve.sh
```

En otra terminal usa `vendor/ollama/ollama pull qwen2.5:3b-instruct-q4_K_M`. Los pesos se guardan en `data/models/ollama`, fuera de Git. La descarga se verifica con SHA-256 y no ejecuta un instalador remoto. No inicies otro servidor si el puerto 11434 ya está ocupado.

Alternativamente, instala Ollama desde [su distribución oficial](https://ollama.com/download/mac), o con Homebrew si prefieres ese gestor:

```sh
brew install ollama
./scripts/ollama-serve.sh
```

Deja ese servidor en una terminal. Si la aplicación Ollama ya está escuchando en 11434, detén esa instancia antes de iniciar el script para aplicar los límites. En otra terminal descarga el modelo oficial pequeño:

```sh
ollama pull qwen2.5:3b-instruct-q4_K_M
cd "/ruta/donde/descomprimiste/second-brain"
source .venv/bin/activate
brain chat "Explica el objetivo de LAR105" --career LAR
```

El modelo seleccionado se solicita con contexto 4K y keep_alive=0. El script aplica un modelo cargado y una solicitud paralela. La versión usada para la comprobación local fue Ollama 0.35.1; el gestor puede instalar una posterior. Identificador verificado en [catálogo oficial](https://ollama.com/library/qwen2.5:3b-instruct-q4_K_M). La familia 3B tiene licencia Qwen Research: revisa sus condiciones antes de uso institucional o comercial; no asumas la licencia Apache de otros tamaños Qwen.

El diagnóstico encontró mucho swap preexistente y el control de memoria bloqueó una carga; reserva 3,5 GiB adicionales para Qwen antes de permitirla. Cierra aplicaciones prescindibles antes de generar; no cargues 7B para comenzar. Consulta [hardware-report.md](docs/hardware-report.md). Si falta presupuesto, la UI conserva la consulta documental y muestra el motivo. Para reducir contexto:

```sh
export BRAIN_CONTEXT=2048
```

Las variables de `.env.example` son una referencia; el programa lee el entorno, **no carga automáticamente .env**. Exporta las variables antes de iniciar el servicio.

## Memoria y tareas

```sh
brain remember "La interfaz debe estar en español" --type preferences --source usuario
brain search "español"
brain remember "Prefiero respuestas breves en español" --id ID_DEL_RECUERDO --type preferences
brain forget ID_DEL_RECUERDO
brain run "Consulta el programa LAR105" --queue
brain cancel ID_DE_TAREA
brain graph
```

`brain run` sin `--queue` crea una tarea y procesa la más antigua pendiente. Con el servicio iniciado, el coordinador procesa la cola automáticamente. Tareas actuales: consultas documentales; no envían correos ni alteran registros académicos. La UI permite crear, cancelar y ver resultados. La memoria contiene fuente, fecha, tipo, sensibilidad, estado y referencia; las conversaciones se guardan como inferidas, no como hechos confirmados. Corregir retira embeddings anteriores y olvidar elimina índices y relaciones.

## Embeddings y voz opcionales

```sh
ollama pull bge-m3
brain sync --embeddings
brain search "gestión del talento humano" --career LTH
brain voice --say "Hola, soy EscoIA"
```

Los embeddings y su calidad multilingüe aún requieren prueba en este Mac. La recuperación combina ranking textual/vectorial cuando hay vectores del mismo modelo; se descargan los pesos tras cada operación. El nuevo MVP todavía no incluye micrófono UI. `brain voice ARCHIVO` acepta PCM float32 mono 16 kHz de hasta 30 segundos con `WHISPER_BIN` y `WHISPER_MODEL` exportados; el puente C de whisper.cpp permanece en el proyecto académico. No pases un WAV directamente a ese puente.

## MCP y respaldos

```sh
brain mcp
brain backup "/ruta/nueva/respaldo-escola"
brain --home "/ruta/nueva/restaurada" restore "/ruta/nueva/respaldo-escola"
```

El MCP stdio expone `memory_search`, `task_enqueue` y `brain://policy`. Configura tu cliente con ruta absoluta a `.venv/bin/brain`, argumentos `--home`, ruta absoluta del proyecto y `mcp`. Es un proceso independiente del protocolo de coordinación de agentes.

El respaldo usa la API backup de SQLite y copia memoria y fuentes; debe hacerse cuando la cola esté quieta para conservar un corte consistente entre archivos y base. El destino debe ser nuevo. Restaurar exige un BRAIN_HOME vacío y ajusta rutas de los PDF. Los respaldos contienen datos privados: no los publiques ni los subas a Git.

## Verificación y límites

```sh
./scripts/test.sh
brain benchmark --model qwen2.5:3b-instruct-q4_K_M
```

Pruebas locales y evidencia en [validation.md](docs/validation.md). Benchmark registra ejecuciones fría/caliente, duración, tokens y estado del sistema; requiere modelo y memoria. No hay comparación medida con MLX-LM ni Magnitude. Los conectores que requieren OAuth, API de pago o nuevas dependencias permanecen deshabilitados.

## Investigación mixta

Módulo integrado en Encuestas: [uso, arquitectura y límites](docs/mixed-research.md). Instalación adicional: `bash scripts/install-research.sh`. Incluye captura por número de llegada, análisis, revisión y descarga PDF/JSON.

### Uzu como motor local opcional

Qwen3.5 0.8B mediante Uzu ARM64 está integrado como opción experimental junto a Ollama. Remoto sigue siendo predeterminado. Preparación, límites y estado de validación: [docs/uzu.md](docs/uzu.md).

### Arranque con doble clic en macOS

Abre `Arrancar-EscoIA.command` desde esta carpeta. Comprueba memoria y presión,
consulta EscoIA (8790) y el módulo académico (8787), reutiliza los servicios
activos e inicia los que faltan. Abre el navegador solo tras comprobar ambos.
No carga modelos locales ni cierra aplicaciones. La presión crítica o falta de
margen físico detiene el inicio de servicios nuevos; superar el presupuesto de
IA local muestra una advertencia y permite la interfaz sin cargar modelos.
Si macOS impide medir memoria, lo informa y no garantiza margen para inferencia.
Para diagnóstico sin iniciar nada: `./Arrancar-EscoIA.command --check`.
Registros: `data/server.log` y `data/logs/academic-service.log`.
