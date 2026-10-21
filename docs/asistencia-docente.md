# Asistencia por docente y horario

En EscoIA abre **Asistencia**. Dentro del módulo:

1. En **Alta, baja y cambios de docentes**, registra el nombre, perfil y experiencia. Selecciona un docente para modificarlo o darlo de baja. Las relaciones existentes impiden una baja que rompería los registros.
2. En **Establecer horario**, asigna grupo, materia y período; selecciona la oferta y aula e indica inicio y fin. El perfil docente, las inscripciones y los cruces se validan en la base de datos. Los grupos, materias y aulas se dan de alta en **Registros**.
3. Selecciona docente y fecha. La sesión en curso se selecciona si existe una sola coincidencia. Si hay varias, elige la correcta. Se muestran semestre, grupo y materia.
4. En la sesión, importa alumnos con una línea `matrícula;nombre`. Los alumnos existentes se reutilizan y se inscriben en la materia seleccionada. Una importación puede quedar parcialmente completada si alguna inscripción falla por seriación; repetirla reutiliza las filas guardadas.
5. Busca la matrícula. Si no existe, **Alta por matrícula e inscripción** crea el alumno con nombre provisional igual a matrícula y lo inscribe. Completa sus datos después.
6. Si no tiene biometría, activa la cámara, confirma el consentimiento y guarda el rostro. Si ya tiene biometría, utiliza **Iniciar verificación facial**. Se mantiene la captura supervisada y los tres pasos de comprobación de movimiento.
7. El reconocimiento registra asistencia en la sesión del horario actual; una segunda entrada devuelve **Ya se tomó asistencia** y no duplica filas. La lista se actualiza cada diez segundos.

Las fechas anteriores se consultan y se registran manualmente con un motivo: no se presenta una captura actual como realizada en el pasado. Se guarda la fecha de la sesión y la hora real de captura.

## Arranque

`arrancar-academico.sh` inicia el servidor local del módulo en 8787 y detecta si el puerto ya está activo. La clave de cifrado se conserva en `.env` con permisos 600 y excluida de Git. Inclúyela de forma segura en las copias de respaldo de la base: sin ella no se pueden recuperar los rostros.

## Validación

Se verificaron compilación de C, TypeScript y React; 14 pruebas de integración; además una prueba HTTP aislada de docentes, sesiones, listas y duplicados. La captura de una persona mediante cámara requiere prueba presencial y no se declara verificada por estos tests.

## Flujo por reloj local (actualización 2026-10-12)

El horario semanal oficial de Rubén quedó vinculado con las 13 listas y 444 inscripciones del Excel. En Asistencia selecciona el docente; se detecta la clase activa según la fecha y hora del equipo y la zona America/Mexico_City. Si existe una sola clase se selecciona automáticamente el grupo y materia. No se pide fecha ni número de aula. Fuera del horario se avisa que no hay una clase activa.

La sesión del día se materializa al abrir el módulo y se reutiliza al actualizar; no se duplica. El núcleo conserva su restricción técnica de room_id mediante un registro interno sin aula física, oculto del flujo de asistencia. No se asigna ni confirma un aula real.

Introduce la matrícula y busca al alumno o usa Alta por matrícula si no existe. La cámara solicita permiso. La primera captura requiere consentimiento y guarda una foto cifrada AES-256-GCM en data/biometric-photos junto al vector facial cifrado en la base. El borrado de biometría elimina también esa foto. Las siguientes visitas usan la verificación facial y el registro único por alumno/sesión. No se recalcula RAG ni se usa LLM para determinar la hora.

Verificado por HTTP: 13 listas, 444 inscripciones, 20 bloques semanales; clase activa seleccionada por reloj, actualización sin duplicar sesión. 100 pruebas Python (3 omitidas), 14 académicas y compilación React/TypeScript pasan. La captura real con cámara y la foto cifrada necesitan prueba presencial; no se han usado fotos de alumnos en las pruebas.

## Flujo simplificado y reporte mensual (12 de octubre de 2026)

Seleccionar docente consulta el reloj y el horario semanal sin generar sesiones.
La pantalla propone el grupo/materia vigente y permite cambiarlo por otra
asignación del mismo docente y período. Confirmar inicia únicamente el registro
de esa clase, conservando su fecha, inicio y fin. Se reutiliza si ya existe.
No se generan todas las clases del semestre.

Dentro del grupo confirmado se busca al alumno por número de lista (orden del
archivo importado) o por matrícula. Guardar el primer rostro, con consentimiento,
guarda la biometría y la asistencia presente en una misma transacción. Para
alumnos ya registrados se exige verificación facial; buscar un alumno o abrir
la cámara no acredita asistencia. La matrícula sigue siendo el identificador.
La ventana facial es inicio inclusivo y fin exclusivo; no hay tolerancia fuera
del horario. Los duplicados no añaden asistencia.

El reporte mensual presenta una fila por alumno, grupo, materia, horario, NL,
matrícula, nombre, totales y columnas por fecha/bloque. 1 indica presente y 0
falta; las clases futuras o canceladas quedan vacías y no suman faltas. Incluye
las clases confirmadas con un cambio de grupo. Hay descarga CSV por grupo.
Los días inhábiles requieren cancelación; el horario semanal no incluye por sí
solo vacaciones ni feriados. Las inscripciones se consultan con su estado actual,
por lo que aún no se reconstruyen altas/bajas históricas del mes.

Verificado: compilación TypeScript/React, 18 pruebas del módulo académico,
7 pruebas del importador, API real del docente y matriz mensual. La captura
con cámara real requiere comprobación en el equipo del usuario.

### Separación de alta inicial y asistencia reconocida

La opción predeterminada es «Asistencia con rostro registrado»: no solicita
seleccionar un alumno, y compara las capturas únicamente con biometrías vigentes
de inscritos en el grupo de la clase confirmada. El ID reconocido determina a
quién se acredita la asistencia; el orden de llegada no interviene.

«Registro por primera vez» ofrece una caja de búsqueda por nombre, matrícula o
NL y selección explícita entre alumnos sin biometría vigente. Muestra nombre y
matrícula y exige confirmar que la persona frente a la cámara es la seleccionada,
además del consentimiento. El backend coteja matrícula con ID, valida inscripción
y horario, y guarda vector, fotografía cifrada y asistencia para ese mismo ID.
No sobrescribe un rostro vigente. La comprobación de identidad durante el primer
registro requiere supervisión docente: una captura sola no prueba el nombre.

Prueba adicional: una matrícula incompatible es rechazada antes de procesar la
cámara y la tabla de biometrías queda intacta. Total: 19 pruebas académicas pasan.

### Captura y avisos visibles

La vista de cámara precede al listado. Consentimiento y confirmación de identidad
(primera vez), o supervisión (asistencia reconocida), aparecen inmediatamente
bajo el video. La selección de docente/grupo y alumnos está debajo del bloque de
captura. Al procesar se bloquea cambiar docente, grupo, alumno o tipo de registro.

Un aviso flotante con nombre/matrícula distingue procesamiento (azul), registro
nuevo o asistencia guardada (verde), duplicado (ámbar) y error (rojo). El éxito
se muestra únicamente después de la respuesta del backend. Las instrucciones
del desafío facial no se presentan como asistencia completada. El aviso permanece
hasta cerrarlo o comenzar otra captura. La lista se actualiza después del resultado;
un rostro recién registrado se retira del selector de primeras altas.

Verificación de esta presentación: compilación React/TypeScript. No se ha
realizado inspección visual del navegador ni captura con cámara física.

### Ventana de captura por clase

La pantalla principal conserva selección de docente, reloj, confirmación de
grupo y reportes. Al confirmar la clase aparecen las acciones «Tomar asistencia»
y «Registro por primera vez». Cada una abre un diálogo modal con cámara automática,
docente, grupo, materia, fecha y bloque horario. El alta contiene buscador/listado,
identidad asignada, confirmación y consentimiento; la asistencia reconocida tiene
supervisión y desafío facial. El estado se muestra dentro de la ventana.

«Siguiente alumno» se habilita tras resultado confirmado o aviso de duplicado.
En alta propone otro alumno sin biometría; no guarda nada hasta nueva confirmación
y consentimiento. En asistencia deja la captura preparada para la siguiente
persona, sin selección de alumno. Cerrar detiene las pistas de cámara y Escape
cierra cuando no está guardando. La ventana se cierra si cambia o termina la clase.
La cámara no queda encendida si el permiso llega después de cerrar la ventana.
La navegación y el alumno no pueden cambiar durante una petición en curso.

Diseño adaptable: dos columnas en escritorio, una en pantallas pequeñas, cabecera
y acciones de ventana visibles al desplazarse. Verificada compilación; inspección
visual y prueba física con cámara pendientes.

## Administración de listas

En Asistencia, «Administrar listas por grupo · altas, cambios y bajas» permite
seleccionar grupo/materia/período, añadir e inscribir un alumno por matrícula,
editar nombre o matrícula, retirar de una lista y trasladar a otra asignación.
La corrección de identidad mantiene el ID y se aplica a todas sus listas. Retirar
solo elimina la inscripción; no elimina al alumno, biometría ni asistencia.
El traslado se hace en una transacción: si la inscripción de destino falla por
seriación, conflicto o validación, la inscripción de origen se restaura. Cada
operación se audita y exige administración y CSRF. El retiro/traslado afecta
la inscripción actual; las asistencias previas permanecen en la base de datos.

Compilaciones y 20 pruebas pasan. La activación de nuevas rutas requiere reiniciar
el servicio académico previamente iniciado en una terminal externa.

### Pase simplificado de asistencia

El botón «Reconocer y registrar asistencia» captura una imagen y completa la
verificación supervisada, sin solicitar tres gestos. Mantiene token de captura
con vencimiento, validación del horario, coincidencia facial/margen, restricción
al grupo y prevención de duplicados. Este modo no realiza prueba de vida por
movimientos; requiere supervisión docente. El contrato anterior de tres capturas
sigue disponible para clientes previos. UI/TypeScript y 21 pruebas verificadas;
activación requiere reiniciar el módulo académico en ejecución.

## Reconocimiento automático supervisado · 15 de octubre de 2026

En «Tomar asistencia», el docente habilita supervisión una vez. La cámara busca
rostros automáticamente mientras la ventana está abierta y visible. El alumno
no pulsa botones ni realiza gestos; debe permanecer visible hasta el aviso.
Tres imágenes tomadas en segundo plano (180 ms entre imágenes) deben coincidir
con el mismo alumno y superar individualmente los umbrales y margen existentes.
Se rechazan métricas inválidas y coincidencias ambiguas. No es prueba de vida.

YuNet y ArcFace se cargan una vez por lote de tres imágenes, con dos hilos OpenCV.
El filtro de calidad rechaza rostro pequeño, desenfoque intenso e iluminación
extrema. No cambia el espacio de embeddings ni rebaja los umbrales guardados.
Las capturas temporales se eliminan incluso ante error. El reconocimiento se
limita a inscritos con biometría vigente del grupo y al horario de clase.

Solo hay un ciclo activo por ventana, sin capturas paralelas. La búsqueda vacía
espera 900 ms entre lotes; tras reconocimiento espera 2600 ms para dejar visible
el resultado. Se pausa al ocultar la pestaña, detener la cámara, retirar la
supervisión, cerrar/cambiar/terminar la clase o ante errores del servicio.
«Pausar nuevas capturas» permite terminar la petición en curso sin iniciar otra.
La última identidad confirmada queda visible. La base impide duplicar asistencia.

Verificado: compilación C++/TypeScript/React, 23 pruebas académicas y extractor
nativo con escena vacía. No se midió precisión, falsos positivos/rechazos, RAM ni
latencia de reconocimiento con alumnos reales. Los filtros requieren calibración
con el equipo real antes de afirmar una mejora de precisión.

Para activar cambios de ambos servicios, `Reiniciar-EscoIA.command` comprueba la
identidad de los procesos de esta instalación en 8790 y 8787 antes de señalarlos;
no fuerza cierres si no puede comprobarlos. Este reinicio aún debe ejecutarse
fuera de la sesión restringida.
