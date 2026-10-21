# Selección de componentes

Metadatos oficiales consultados en esta sesión. Commit observado identifica el contenido investigado; no significa que esté instalado. Los requisitos no comprobados por ejecución se señalan como pendientes.

## ollama/ollama

- Fuente: [ollama/ollama](https://github.com/ollama/ollama)
- Commit investigado: `42e911bc3d05798cad729cb474bf62f378cb2e26`. Fecha: 2026-10-02T18:52:27Z. Licencia: MIT. Archivado: False.
- Selección: Seleccionado: 0.35.1. Función: Inferencia Qwen local.
- Requisitos/restricciones: Binario macOS ARM64; Metal y pesos requieren RAM.
- Alternativa: MLX-LM. Motivo: API estable y descargado localmente; prueba limitada por memoria.

## ml-explore/mlx-lm

- Fuente: [ml-explore/mlx-lm](https://github.com/ml-explore/mlx-lm)
- Commit investigado: `5cfec4cb39deba54210b3ff4d86f2337c7bc10b5`. Fecha: 2026-10-02T08:28:40Z. Licencia: MIT. Archivado: False.
- Selección: No instalado en el nuevo MVP. Función: Backend alternativo.
- Requisitos/restricciones: Apple Silicon, Python/MLX, cuantización y KV deben medirse.
- Alternativa: Ollama. Motivo: Aplazado hasta disponer de benchmark equivalente.

## mizorewww/laya-mlx

- Fuente: [mizorewww/laya-mlx](https://github.com/mizorewww/laya-mlx)
- Commit investigado: `ca5940aa9286dbbdfaacbecbdb7b337295ad36a2`. Fecha: 2026-10-02T03:17:45Z. Licencia: Apache-2.0. Archivado: False.
- Selección: Adaptador desactivado. Función: Clasificación cerrada.
- Requisitos/restricciones: macOS14+, Python3.11+, MLX; contexto total acotado.
- Alternativa: Reglas deterministas. Motivo: Runtime auténtico; necesita evaluación española y presupuesto.

## magnitudedev/magnitude

- Fuente: [magnitudedev/magnitude](https://github.com/magnitudedev/magnitude)
- Commit investigado: `2a481f7c5d3c78e8e16ddf4f551ba0c13ba9c16f`. Fecha: 2026-10-05T04:17:12Z. Licencia: Apache-2.0. Archivado: False.
- Selección: Experimental pendiente. Función: Backend optimizado.
- Requisitos/restricciones: Compatibilidad/API y compilación en M3 requieren prueba; no ejecutado.
- Alternativa: Ollama. Motivo: No aceptar mejoras publicadas como mediciones locales.

## googleworkspace/cli

- Fuente: [googleworkspace/cli](https://github.com/googleworkspace/cli)
- Commit investigado: `a3768d0e82ad83cca2da97724e46bea4ff0e6dbd`. Fecha: 2026-03-31T18:51:15Z. Licencia: Apache-2.0. Archivado: False.
- Selección: Lectura preparada, pendiente OAuth. Función: Gmail/Calendar/Drive.
- Requisitos/restricciones: Binario ARM64, proyecto Google Cloud y consentimiento.
- Alternativa: gogcli/APIs oficiales. Motivo: No habilitar cuentas ni scopes automáticamente.

## openclaw/gogcli

- Fuente: [openclaw/gogcli](https://github.com/openclaw/gogcli)
- Commit investigado: `414e2ff8afa281ec3d9f0cdb057bdbc53386db91`. Fecha: 2026-10-01T04:35:53Z. Licencia: MIT. Archivado: False.
- Selección: Alternativa no instalada. Función: Workspace alternativo.
- Requisitos/restricciones: Go/binario y OAuth; compatibilidad no ejecutada.
- Alternativa: GWS. Motivo: No duplicar conectores sin necesidad.

## Graphify-Labs/graphify

- Fuente: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)
- Commit investigado: `35adf432b9d50f6f3d530ab5d7ec316819ef081c`. Fecha: 2026-10-04T21:28:19Z. Licencia: Apache-2.0. Archivado: False.
- Selección: Evaluación documental. Función: Grafo de conocimiento.
- Requisitos/restricciones: graphifyy→graphify; extras ollama; extracción semántica depende backend.
- Alternativa: SQLite. Motivo: Relaciones documentales locales bastan para MVP.

## lancedb/lancedb

- Fuente: [lancedb/lancedb](https://github.com/lancedb/lancedb)
- Commit investigado: `7f5933594f42eeeec1ce73a7ce8e0cd0113cbd82`. Fecha: 2026-10-04T04:30:13Z. Licencia: Apache-2.0. Archivado: False.
- Selección: Evaluado, no instalado. Función: Vector store embebido.
- Requisitos/restricciones: Binding Python nativo, tamaño e índices deben medirse.
- Alternativa: SQLite FTS5 + vectores exactos. Motivo: 2.288 fragmentos no justifican dependencia adicional todavía.

## langchain-ai/langgraph

- Fuente: [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)
- Commit investigado: `9a0394d88b2211f299dcd69df92db3480c69ee61`. Fecha: 2026-10-03T12:55:59Z. Licencia: MIT. Archivado: False.
- Selección: Evaluado, no instalado. Función: Checkpoints/agentes.
- Requisitos/restricciones: Dependencias Python y adaptación de permisos.
- Alternativa: Máquina de estados SQLite. Motivo: Flujo actual pequeño y fácil de auditar.

## microsoft/playwright-mcp

- Fuente: [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- Commit investigado: `f183dad4a52965583e3cc1d59b88cdc279e2e57d`. Fecha: 2026-09-28T23:12:55Z. Licencia: Apache-2.0. Archivado: False.
- Selección: No instalado. Función: Navegación opcional.
- Requisitos/restricciones: Node, navegador descargado, perfil aislado y límites.
- Alternativa: Herramientas acotadas. Motivo: No es necesario para consultas a biblioteca privada.

## ggml-org/whisper.cpp

- Fuente: [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- Commit investigado: `60c0be6ac8fa71b1a2ae2dd938a31a34a508e774`. Fecha: 2026-10-02T13:21:13Z. Licencia: MIT. Archivado: False.
- Selección: Puente previo verificado: 1.9.4. Función: Transcripción española.
- Requisitos/restricciones: C/C++, CMake, Metal, modelo multilingüe; micrófono nuevo pendiente.
- Alternativa: Voz macOS para salida. Motivo: Reutilizar servicio nativo antes que otro modelo residente.

## openclaw/openclaw

- Fuente: [openclaw/openclaw](https://github.com/openclaw/openclaw)
- Commit investigado: `fa468f6a64c40e2d65664bec00bfbf91f8664edb`. Fecha: 2026-10-05T04:45:06Z. Licencia: MIT. Archivado: False.
- Selección: Deshabilitado. Función: Interoperabilidad opcional.
- Requisitos/restricciones: Revisión permisos y costes pendiente.
- Alternativa: Bus local propio. Motivo: No instalar un agente autónomo con permisos amplios por defecto.

## andrehuang/claude-claw

- Fuente: [andrehuang/claude-claw](https://github.com/andrehuang/claude-claw)
- Commit investigado: `84a99521be61177ec77f2ef1a453fee2865b20e5`. Fecha: 2026-03-28T11:49:58Z. Licencia: MIT. Archivado: False.
- Selección: Candidato concreto examinado. Función: Mejoras Claude Code.
- Requisitos/restricciones: Identidad ambigua por nombre; repo concreto MIT; runtime no probado.
- Alternativa: Adaptador Claude Code separado. Motivo: No asumir que es un sustituto de OpenClaw.

