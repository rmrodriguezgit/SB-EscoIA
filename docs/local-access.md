# Acceso directo local

Desde 2026-10-06 los módulos académicos no solicitan usuario ni contraseña. Se retiraron formularios de acceso, cierre y creación de cuentas, rutas de login y alta de cuentas, verificación scrypt y solicitud de contraseña en instalación. Hashes de la base activa vaciados. Se conserva el identificador interno necesario para relaciones académicas y auditoría. No se borran datos académicos, archivos históricos ni copias de seguridad. No se afirma borrado forense de rastros.

Solo se admite bind 127.0.0.1. Se mantienen validaciones de origen/host y token anti-CSRF efímero para escrituras. Doce pruebas de integración aprobadas, ambas interfaces compiladas y Administración comprobada sin credenciales en localhost:8790.
