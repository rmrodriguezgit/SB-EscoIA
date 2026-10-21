# EscoIA · Sistema Escolar

**Versión actual: 0.3.0** (2026-10-21) · rama `main` · [github.com/rmrodriguezgit/EscoIA](https://github.com/rmrodriguezgit/EscoIA)

Sistema escolar local para Apple Silicon con interfaz en español. Incluye asistencia biométrica, listas, horarios, calificaciones e investigación, y usa IA local (LAYA/MLX, Qwen, Whisper). Los datos nunca salen de tu Mac.

> **Estado:** es una implementación de referencia en uso piloto y todavía no está lista para producción. No devuelve verificaciones faciales ficticias ni simula escrituras exitosas. El plan de mejora está en [`docs/AUDITORIA-2026-10-20.md`](docs/AUDITORIA-2026-10-20.md).

La versión aparece en la barra lateral de la interfaz (`EscoIA v0.3.0 · <commit> · <fecha>`). La única fuente de la versión es `package.json` en la raíz.

---

## Inicio rápido (macOS)

| Archivo (doble clic) | Qué hace |
|---|---|
| `Iniciar-EscoIA.command` | Arranca EscoIA en una ventana de Terminal y abre http://127.0.0.1:8787/. Se detiene con Ctrl+C. |
| `Instalar-Arranque-EscoIA.command` | Registra `Iniciar-EscoIA.command` como ítem de inicio de sesión y lo arranca en ese momento. |
| `Desinstalar-Arranque-EscoIA.command` | Quita el arranque automático. No borra datos. |

- **Arranque manual:** `./arrancar-academico.sh` y luego abrir http://127.0.0.1:8787/ o http://localhost:8787/.
- **Registro:** `logs/escoia.log` (excluido de Git).
- **Comprobaciones del lanzador:** antes de arrancar revisa Node, `.env`, el núcleo nativo, la carpeta de la base de datos y el puerto. Reinstala dependencias si cambió `package-lock.json` y recompila la UI si cambiaron sus fuentes.
- **Por qué no se usa un servicio launchd:** la privacidad de macOS (TCC) impide que los servicios de fondo lean `~/Documents` sin "Acceso total al disco" (error `Operation not permitted`). Terminal sí tiene ese acceso.
- **Rutas de datos:** se configuran en `.env` (privado, no versionado). Allí se indican el núcleo nativo (`NATIVE_BIN`), la base de datos (`DATABASE`) y los modelos faciales. Ver `.env.example`.

## Interfaz

- **React 19 + Vite 6 + Tailwind 4.** La constelación de agentes está hecha en **Vue 3** y va embebida dentro de React.
- **Constelación de agentes** (página Inicio): los 5 agentes MCP, el orquestador, el núcleo C y los modelos locales aparecen como estrellas. Las líneas muestran la ruta real de una solicitud. Con eventos en vivo, la estrella activa brilla y un cometa recorre la ruta. Los modelos sin activar se ven tenues.
- **Temas:** «Cielo nocturno» (oscuro) y «Día» (claro). Por defecto sigue el tema del sistema y se puede cambiar desde la barra lateral.
- **Accesibilidad:** foco visible, enlace «Saltar al contenido», navegación con `aria-current`, diálogos de confirmación accesibles y estrellas operables con teclado. Respeta la preferencia de reducir movimiento.
- **Errores visibles:** se muestran avisos cuando falla la red, cuando una operación supera el tiempo límite o cuando el servicio está apagado.

## Estructura

```
Iniciar-EscoIA.command, Instalar-/Desinstalar-Arranque-EscoIA.command
scripts/   escoia-launcher.sh   lanzador con diagnóstico (lo usan los .command)
           backup.sh, setup.sh, migrate.ts, install-*.sh, start-*.sh
native/    service.c            servicio JSONL sobre SQLite (núcleo C)
           scheduler_core.c     búsqueda CSP acotada de horarios
           face_bridge.cpp      extracción facial (YuNet + ArcFace, ONNX)
           whisper_mcp_bridge.c transcripción + similitud 512-d
           metrics_core.c, domains.c, generators.c, CMakeLists.txt
db/        schema.sql, 002.sql  modelo relacional, FTS, restricciones
server/    main.ts              servidor HTTP/WebSocket (127.0.0.1:8787)
           domain.ts            reglas de negocio de los 5 agentes MCP
           orchestrator.ts      máquina de estados + enrutamiento LAYA
           current_attendance.ts, attendance_report.ts, face_consensus.ts
           mcp_server.ts, events.ts, models.ts, auth.ts, config.ts
ui/src/    App.tsx              contenedor y navegación
           views/               Inicio, Plan curricular, Horarios, Asistencia,
                                Calificaciones, Investigación, Administración
           components/          comunes, asistencia, listas, voz, bitácora, avisos
           constellation/       AgentConstellation.vue + puente React→Vue
           lib/                 tipos, tema, avisos, confirmación
           theme.css, style.css tokens de tema y estilos
tests/     *.test.ts (node:test), core_test.c, import_http_test.py
docs/      architecture.md, asistencia-docente.md, local-access.md,
           importacion-listas-horarios.md, AUDITORIA-2026-10-20.md
```

## Compilación y pruebas

```bash
# Núcleo C
cmake -S native -B build && cmake --build build
ctest --test-dir build --output-on-failure

# Servidor
cd server && npm ci && npm run check && npm test

# Pruebas de asistencia (30 casos, sin binario nativo)
cd server && node --import tsx --test ../tests/attendance_audit.test.ts ../tests/attendance_report.test.ts \
  ../tests/current_attendance.test.ts ../tests/passive_capture.test.ts ../tests/single_capture.test.ts

# Interfaz
cd ui && npm ci && npm run build      # producción (ui/dist)
cd ui && npm run dev                  # desarrollo en http://localhost:5173
```

`integration.test.ts` requiere el binario `sistema_service` compilado en macOS. No ejecutes `npm run mcp` como servicio final, porque exige composición con un actor autenticado.

## Control de versiones

- Cada cambio se registra en un commit descriptivo y se sube a `origin/main`.
- Las versiones siguen SemVer (`MAYOR.MENOR.PARCHE`) y se marcan con etiquetas `vX.Y.Z`.
- **Nunca se versionan** `.env`, `data/` (biometría, listas, respaldos), `*.db`, `logs/`, `node_modules/`, `build/` ni `ui/dist/`.

## Historial de versiones

### 0.3.0 · 2026-10-21

- **Interfaz:**
  - Constelación de agentes en Vue 3 con eventos en vivo.
  - Tema «Cielo nocturno» y «Día».
  - `App.tsx` (1 916 líneas) dividido en `views/` y `components/`.
  - Mejoras de accesibilidad y avisos de error visibles.
  - Versión visible en la barra lateral.
- **Asistencia:** se corrigieron cuatro fallos y la batería de pruebas pasó de 7 a 30 casos.
  - Las faltas justificadas ya no suman faltas.
  - La verificación facial ya no acepta cualquier rostro cuando el umbral está mal configurado.
  - Se corrigió un mensaje de clase cerrada que nunca se mostraba.
  - El conflicto de grupo ahora muestra un mensaje claro.
- **Arranque:** lanzador con diagnóstico, ítem de inicio de sesión y registro en `logs/`.
- **Seguridad:**
  - `.gitignore` excluye datos personales, biometría y secretos.
  - Vite 6.4.4 corrige una vulnerabilidad alta.
- **Documentación:** auditoría de sistemas en 4 hilos con propuesta multi-hilo y multi-núcleo.

### 0.2.0 · 2026-10-05

- Línea base: núcleo C, esquema SQLite, servidor HTTP/MCP, asistencia facial (por gestos, pasiva y de captura única), importación de listas y horarios, encuestas y UI en React.

## Referencias

- MCP SDK v1: https://ts.sdk.modelcontextprotocol.io/server
- whisper C API: https://github.com/ggml-org/whisper.cpp/blob/master/include/whisper.h
- MLX LM: https://github.com/ml-explore/mlx-lm
- Vue 3 (`createApp`, SFC): https://vuejs.org/guide/
