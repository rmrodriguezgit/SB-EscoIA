import React from "react";
export function WeeklyTimetable({
  source,
}: {
  source: any;
  teacherId: string;
  rooms: any[];
  onDone: () => void;
}) {
  return (
    <details className="subpanel">
      <summary>
        Horario semanal · {source.context.horas_semanales} horas ·{" "}
        {source.context.periodo}
      </summary>
      <p>
        La asistencia utiliza la fecha y hora de la máquina; no necesitas
        indicar aula.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Día</th>
              <th>Hora</th>
              <th>Grupo</th>
              <th>Materia</th>
            </tr>
          </thead>
          <tbody>
            {source.weekly.map((b: any, i: number) => (
              <tr key={i}>
                <td>
                  {
                    [
                      "Lunes",
                      "Martes",
                      "Miércoles",
                      "Jueves",
                      "Viernes",
                      "Sábado",
                      "Domingo",
                    ][b.dia_semana]
                  }
                </td>
                <td>
                  {b.hora_inicio}–{b.hora_fin}
                </td>
                <td>{b.grupo}</td>
                <td>{b.materia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
