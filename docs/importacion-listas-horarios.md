# Importación de listas y horarios al RAG

En **Asistencia**, selecciona el docente.

- **Importar listas de alumnos por grupo y materia**: selecciona una asignación docente y sube CSV, XLS o XLSX. No requiere que exista ya una sesión de horario.
- **Establecer horario del docente**: sube CSV, XLS, XLSX o PDF. Deben existir la asignación docente/materia/grupo y las aulas.
- También puedes importar la lista desde la sesión seleccionada.

Pulsa **Leer y revisar archivo**, corrige las filas y después **Registrar y anexar al RAG**. Se registran con una transacción del núcleo C: ante un error o choque de horario, no se aplican parcialmente. Un reintento conserva matrículas e inscripciones existentes y evita duplicar sesiones.

## Encabezados de las listas

```csv
matricula;nombre
001234;Ana Pérez
001235;Juan Silva
```

Matrículas con ceros iniciales deben guardarse como texto en Excel. Se detectan encabezados Matrícula/Nombre después de títulos y se permite seleccionar cada hoja. Se omiten filas vacías y se conservan matrículas numéricas sin sufijo decimal. No se actualiza el nombre de un alumno existente mediante esta importación.

## Encabezados de los horarios

```csv
materia;grupo;aula;inicio;fin
LAR106;101;Aula 1;2026-10-12T08:00:00-06:00;2026-10-12T10:00:00-06:00
```

Una fila por sesión, fechas completas con zona horaria. Usa la clave exacta de materia y los nombres de aula/grupo registrados. Los horarios semanales recurrentes deben expandirse a fechas; no se inventa un calendario a partir de lunes/martes.

El PDF se extrae con `pdftotext -layout`. Las tablas con los encabezados anteriores y columnas separadas pueden convertirse automáticamente. Otros diseños muestran el texto para transcribir y verificar las filas. PDF escaneado requiere OCR o conversión a CSV. No se ejecutan instrucciones incluidas en documentos.

## RAG y procedencia

El original y un JSON con los registros confirmados se guardan de forma privada en `second-brain/data/sources`. El JSON registra fecha, docente, nombre de fuente y datos revisados. Cada fila se indexa en SQLite FTS5 para recuperación con referencias. No se carga un modelo para importar. Los datos son una instantánea fechada; posteriores cambios manuales no reescriben automáticamente esa fuente.

Si la base académica se guarda pero la indexación RAG falla, la pantalla lo indica: repite la confirmación con las mismas filas. El registro de operación evita repetir la escritura académica. Tras reiniciar, vuelve a cargar el archivo: también se comprueban los registros existentes.

Límites: 10 MB por archivo, 1000 filas, 40 columnas para Excel. Dependencias de lectura fijadas en `second-brain/pyproject.toml`: xlrd, openpyxl y et-xmlfile. PDF necesita Poppler (`pdftotext`).

## Activación y pruebas

Reinicia el módulo académico con `arrancar-academico.sh` después de detener su terminal con Ctrl+C. La interfaz nueva ya está compilada.

Pruebas ejecutadas: 97 pruebas Python (3 omitidas), 14 pruebas académicas, compilación React/TypeScript, XLS de prueba del proyecto xlrd, XLSX sin extensión de carga, extracción de PDF tabular y prueba HTTP de listas/horarios con RAG, reintentos y rollback ante choques. No se verificó visualmente en navegador ni con archivos reales del usuario.

Prueba HTTP reproducible desde la raíz del proyecto:

```bash
python3 outputs/sistema-escolar/tests/import_http_test.py
```

Usa una base de datos temporal y el puerto 8789; no altera listas reales.
