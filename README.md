# EscoIA

# Sistema Escolar

Base de arquitectura y código para Apple Silicon, con interfaz en español.
**Estado: implementación de referencia parcial; no es un sistema listo para producción.**
El núcleo C y el esquema son ejecutables. MCP y el orquestador son módulos de
integración que requieren un `DomainPort` real. La UI llama a contratos
HTTP documentados; este paquete todavía no incluye el servidor HTTP ni el addon.
No se devuelve una verificación facial ficticia ni se simula una escritura exitosa.

## Estructura
```
native/ scheduler_core.{c,h}  búsqueda CSP acotada
        whisper_mcp_bridge.c transcripción por ABI C + similitud 512-d
        metrics_core.c       ponderación y varianza muestral
        db_core.c            inicialización mediante SQLite C API
        CMakeLists.txt
db/     schema.sql           modelo relacional, FTS, restricciones
server/ contracts.ts         frontera nativa y actor autenticado
        mcp_server.ts        cinco herramientas, recurso y prompt MCP
        orchestrator.ts      máquina determinista + LAYA MLX
        events.ts            distribución aislada por usuario
ui/     src/App.tsx          Partitura, webcam, voz y encuestas
        src/style.css        Tailwind 4
 tests/ core_test.c
docs/   architecture.md      diseño, contratos e integraciones pendientes
```

## Compilación
Con CMake instalado:
```
cmake -S native -B build
cmake --build build
ctest --test-dir build --output-on-failure
./build/db_init sistema.db db/schema.sql
```
Sin CMake, desde esta carpeta:
```
clang -std=c11 -Wall -Wextra -Werror native/scheduler_core.c native/whisper_mcp_bridge.c native/metrics_core.c tests/core_test.c -o /tmp/sistema-test
/tmp/sistema-test
clang -std=c11 native/db_core.c -lsqlite3 -o /tmp/sistema-db
/tmp/sistema-db sistema.db db/schema.sql
```
```
cd server
npm install
npm run check
cd ../ui
npm install
npm run build
npm run dev
```
No ejecutar `npm run mcp` como servicio final: exporta la fábrica y exige
composición con actor autenticado y servicios de dominio. La UI sin backend
muestra errores de conexión de forma explícita.

## Verificación realizada

Clang C11 con -Wall -Wextra -Werror: correcto. Pruebas C: correctas.
Esquema SQLite y pruebas de restricciones/FTS: correctos.
CMake no está instalado en el entorno. Instalación npm interrumpida al no
completar; TypeScript y build de Vite no verificados. whisper.cpp con pesos
y procesamiento de cámara tampoco ejecutados.

## Referencias de implementación
- MCP SDK v1: https://ts.sdk.modelcontextprotocol.io/server
- whisper C API: https://github.com/ggml-org/whisper.cpp/blob/master/include/whisper.h
- MLX LM: https://github.com/ml-explore/mlx-lm

Las versiones npm son rangos; conservar el lockfile generado al instalarlas.
La compilación con WITH_WHISPER requiere encabezados, biblioteca y pesos externos.
