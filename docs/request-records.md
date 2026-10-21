# Expedientes Markdown por consulta

Cada nueva consulta enviada al motor de conversación (texto, voz transcrita, CLI o tarea que utiliza `answer`) crea primero `data/requests/<id>/request.md`. No se crean expedientes retrospectivos para las conversaciones anteriores.

El expediente incluye petición original, claves esperadas, criterios de aceptación, indicaciones editables, respuesta, procedencia, enlaces de archivos y evaluación. `contract.json` conserva la solicitud original y las claves aunque se edite el Markdown. `result.json` guarda la entrega antes de retener una discrepancia. `revisions/` guarda versiones; `reviews/` conserva comprobaciones con fecha, versión y hash del documento evaluado.

En cada respuesta se puede abrir **Expediente de petición · .md**, descargarlo, editarlo, guardar otra versión y volver a comprobar con LAYA. El área **Actividad** permite recuperar los 60 expedientes más recientes después de recargar o reiniciar. Los archivos completos permanecen en disco.

Una modificación invalida la comprobación anterior. Edite los criterios y las indicaciones complementarias antes del apartado automático de resultado; la solicitud original del contrato no cambia. Para cambiar de materia o pedir otra entrega, envíe una petición nueva.

La comprobación determinista contrasta las claves solicitadas con la respuesta y el manifiesto de los archivos. Una entrega de LAR105 ante una solicitud LAN105 se retiene antes de llamar a LAYA. Las respuestas y los manifiestos se revisan por bloques acotados con LAYA remoto; si el servicio falla o trunca una evaluación no se declara aprobado. La revisión probabilística complementa las reglas y no autoriza operaciones.

Los fallos también conservan expediente. Un error no convierte una entrega inválida en aprobada. La revisión de requisitos no sustituye la revisión de sustento curricular del RAG ni la aprobación docente.

Alcance: consultas que pasan por el motor de conversación. Los formularios administrativos de módulos externos todavía tienen sus propios registros y no pasan por esta capa.

Validación: pruebas de materia equivocada, revisión real con LAYA para LAR105, historial/versionado, invalidación de revisión, modificación externa detectada, rutas protegidas contra traversal y build TypeScript. No se almacena el token de inferencia en los expedientes.
