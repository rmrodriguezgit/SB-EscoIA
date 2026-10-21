# Aprovechar el Mac mini M1 de 8 GB con EscoIA

Investigación: 2026-10-06. No se conectó ni se probó el equipo remoto.

## Compatibilidad comprobada en documentación
Backburner exige iPhone 15 Pro o posterior. El iPhone 13 no está soportado. La modalidad split-decode documentada reparte capas entre Mac de 8 GB e iPhone Air de 12 GB, no entre dos Macs. No se deben extrapolar sus resultados al M1 ni al iPhone 13.
https://github.com/StayLameBro/backburner
https://github.com/StayLameBro/backburner/blob/main/docs/INSTALL-IPHONE.md
https://github.com/StayLameBro/backburner/blob/main/docs/SPLIT-DECODE.md

## Ruta inicial: Qwen en el mini
Mantener EscoIA, RAG y LAYA en el M3. Ejecutar Ollama y Qwen 3B Q4 en el mini, con una petición activa y contexto 4096. Medir presión de memoria y swap en el mini; no basta la medición del M3. La instalación y descarga se realizan en el mini, no en el M3.

1. En el mini, instalar Ollama desde su distribución oficial y descargar el identificador actual de EscoIA: `ollama pull qwen2.5:3b-instruct-q4_K_M`.
2. Ejecutar el servidor con `OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_CONTEXT_LENGTH=4096 ollama serve`. Si la app Ollama ya ocupa ese puerto, usar una sola instancia.
3. Habilitar Inicio de sesión remoto en macOS para el usuario concreto. El usuario debe revisar ese permiso y la huella SSH.
4. En el M3 crear el túnel: `ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:11435:127.0.0.1:11434 USUARIO@IP_DEL_MINI`.
5. Comprobar: `curl --fail http://127.0.0.1:11435/api/tags`.

El puerto 11435 evita interferir con el Ollama local. El túnel conserva el backend remoto en loopback; no se expone su API a toda la red. Falta adaptar el lanzador EscoIA (actualmente fija 11434), separar telemetría/remoción de modelos remotos y locales y probar una petición real antes de habilitar este modo. No se debe simplemente quitar la comprobación RAM: hay que comprobar el presupuesto donde corre Qwen.

## Ruta experimental: dividir un modelo entre dos Macs
llama.cpp RPC expone dispositivos Metal del equipo remoto y permite distribuir pesos y caché KV entre dispositivos locales y remotos. Es memoria distribuida específica de la inferencia, no RAM adicional para macOS.
https://github.com/ggml-org/llama.cpp/blob/master/tools/rpc/README.md

Requiere una compilación fijada con GGML_RPC y Metal en ambos Macs, servidor RPC ligado a loopback, túnel SSH, un modelo GGUF y un adaptador de EscoIA para llama-server/OpenAI. Empezar con Qwen pequeño y medir carga, memoria de ambos equipos, latencia y calidad antes de ampliar modelos. Ethernet facilita una prueba estable; no garantiza acelerar.

La documentación clasifica RPC como prueba de concepto frágil e insegura: mantenerlo aislado por SSH y no publicarlo en una red abierta. El M1 no cumple el requisito Thunderbolt 5 de RDMA en macOS descrito por el proyecto; se usaría TCP. No se instaló ni se habilitó RPC en esta investigación.

## Información pendiente
Usuario e IP local del mini, versión de macOS y espacio libre. No entregar contraseñas por chat. Evaluar primero Qwen remoto; reservar RPC para una comparación experimental reproducible.
