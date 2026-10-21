# Actividad · Git

Cada petición dispone de un repositorio Git privado en `data/request-git/<id>`.
Se versionan Markdown, contrato, resultado, trazas de agentes y artefactos de
`data/exports/<id>`. No se configura remoto ni se publica contenido. El directorio
es privado y los patrones habituales de credenciales se omiten en las copias Git.
Los repositorios existentes se incorporan al abrirlos; las revisiones Markdown
anteriores se conservan, pero no se inventan versiones históricas de artefactos.

## Operaciones

- Consultar commits, diferencias, eventos y descargas del expediente.
- Editar expediente y artefactos de texto, JSON o notebooks sin ejecutar código.
- Revisar con el mecanismo LAYA/reglas existente. Sin proveedor disponible la
  revisión queda pendiente; no se inventa una aprobación.
- Restaurar documentos y archivos como un commit nuevo, pendiente de revisión.
  No revierte ni repite acciones académicas, envíos ni herramientas externas.
- Reutilizar requisitos e instrucciones como borrador independiente, sin ejecutar
  la petición. Puede editarse; la ejecución se solicita desde conversación.
- Mover a papelera y recuperar sin perder versiones.
- Olvidar definitivamente expediente, repositorio Git, revisiones, exportaciones,
  eventos y recuerdos/indexaciones derivados enlazados, incluidos borradores hijos.
  Requiere confirmar el identificador. No permite borrar una ejecución activa.

El olvido también depura recuerdos y eventos de los respaldos SQLite administrados
bajo `data/backups`. Se informa si hay respaldos no depurables. Fuentes compartidas,
datos académicos originales, exportaciones descargadas y respaldos externos no se
borran por eliminar una petición. No se promete sobreescritura física del SSD.

La protección contra conflictos usa el commit esperado; un editor obsoleto no
sobrescribe una versión posterior. Los endpoints de escritura exigen CSRF y origen
local. Los repositorios no ejecutan hooks ni código de documentos. Límite de
artefactos: 64 MiB por snapshot; ediciones de texto: 300000 caracteres.

## Activación y comprobación

Abre `Reiniciar-EscoIA.command` con doble clic. Solo detiene el coordinador si
identifica esta instalación y no hay tareas ejecutándose; luego usa el lanzador
con comprobación de memoria y servicios. Puede cerrarse la terminal tras iniciar.

Verificado: compilación React/TypeScript; pruebas de commits, rollback, conflicto,
artefactos, papelera, olvido, respaldos, redacción de tokens y rutas HTTP con CSRF.
La inspección visual en navegador y revisión con LAYA real no se han realizado en
esta entrega. No se borraron peticiones reales durante las pruebas.

## Revisión individual de Markdown · v0.4.1

Cada `request.md` y artefacto `.md` tiene edición y revisión documental LAYA
independientes. El panel muestra pendiente, aprobado, requiere cambios o
revisión desactualizada, junto con fecha, motor, revisión y hash del contenido.
Una aprobación de entrega obtenida mediante reglas o LAYA no se etiqueta
automáticamente como aprobación documental del Markdown completo.

Guardar cambios o restaurar una versión invalida las revisiones anteriores.
Los cambios sin guardar se señalan y bloquean revisar ese texto hasta guardarlo.
Una revisión comprueba el archivo completo por bloques, sin aprobar muestras;
truncamiento, falta de conexión o límites dejan el estado pendiente. Si el
archivo o la versión cambia mientras LAYA trabaja, su respuesta se descarta.
Las revisiones se guardan y versionan; nunca ejecutan las instrucciones del MD.
Los borradores también pueden revisarse como documentos de requisitos sin
pretender que ya exista una entrega.

Se corrigió la carga del editor abierto desde Actividad. El editor de artefactos
señala cambios sin guardar y su estado actual. La revisión de la entrega sigue
separada en «Comprobar entrega y archivos». El modo de inferencia respeta la
selección remoto/local y su comprobación de recursos existente.

Verificado: pruebas de estados por contenido y versión, edición/tampering,
revisiones independientes, rechazo y servicio LAYA caído mediante adaptadores
simulados. No se ejecutó una revisión con el modelo real en esta actualización.
