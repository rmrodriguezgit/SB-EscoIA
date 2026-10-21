# Recursos de EscoIA

Validado 2026-10-06: 47 pruebas Python y compilación React/TypeScript aprobadas; panel y botón comprobados en localhost:8790.

Telemetría cacheada tres segundos, dos trabajadores. Memoria estimada: páginas anónimas, cableadas y compresor físico; presupuesto 12,5 GiB. Qwen: hasta seis hilos, una generación activa. PDF: dos procesos nativos pdftotext concurrentes, SQLite escrito por el hilo propietario. HTTP: máximo doce hilos. No se ha medido mejora de velocidad.

LAYA: trabajador aislado, dos hilos, termina tras revisión; pesos aproximadamente 645 MB y reserva de 1 GiB con runtime. Su coste no es cero.

Liberar memoria descarga exclusivamente el modelo configurado de EscoIA y confirma su salida de Ollama. Se bloquea durante peticiones activas. No cierra aplicaciones ni elimina datos. Sin modelos residentes explica que queda memoria de macOS y otras aplicaciones. Descarga de un modelo realmente cargado pendiente de prueba; selección del modelo propio y bloqueo tienen pruebas automatizadas. No garantiza que todos los procesos quepan en RAM.
