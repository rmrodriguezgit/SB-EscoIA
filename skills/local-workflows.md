# Flujos locales

Estos flujos son consultas explícitas, no automatizaciones externas activadas.

- Resumen diario: `brain run "Resume la evidencia de mis recuerdos y decisiones recientes" --queue`. La recuperación actual es textual; si buscas solo hoy, usa la API Python `Brain.search(..., since="YYYY-MM-DD")`.
- Revisión de pendientes: consulta Actividad o `brain status`; cancelación con `brain cancel ID`.
- Investigación curricular con fuentes: `brain chat "LAR105" --career LAR`; abre las páginas de los anexos, contrasta versiones y guarda decisiones con procedencia.
- Preparación de agenda: recuerda compromisos y busca evidencias locales. La lectura Calendar necesita OAuth y habilitación; no se presenta como sincronizada hasta probarla.

No hay envíos automáticos, gastos ni cambios de permisos. Planificador recurrente, exportación de agenda externa y AutoHarness con promoción controlada permanecen pendientes.
