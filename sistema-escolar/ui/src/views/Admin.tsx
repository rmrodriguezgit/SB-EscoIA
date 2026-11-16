import { useState } from "react";
import { request } from "../api";
import { useTask, Status, Result, Field } from "../components/common";
export const fields: Record<
  string,
  { label: string; type?: string; nullable?: boolean }[]
> = {
  subject_policy: [
    { label: "ID de materia", type: "number" },
    { label: "Años mínimos de experiencia", type: "number" },
    { label: 'Palabras de formación requeridas JSON: ["Finanzas"]' },
  ],
  student_create: [
    { label: "Matrícula" },
    { label: "Nombre" },
    { label: "ID de usuario vinculado", type: "number", nullable: true },
  ],
  teacher_create: [
    { label: "Nombre" },
    { label: "Formación académica" },
    { label: "Años de experiencia", type: "number" },
    { label: "ID de usuario", type: "number", nullable: true },
  ],
  program_create: [{ label: "Nombre de carrera" }],
  subject_create: [
    { label: "Código" },
    { label: "Nombre de materia" },
    { label: "Horas por semana", type: "number" },
  ],
  curriculum_create: [
    { label: "ID carrera", type: "number" },
    { label: "ID materia", type: "number" },
    { label: "Semestre", type: "number" },
  ],
  prerequisite_create: [
    { label: "ID materia", type: "number" },
    { label: "ID materia requerida", type: "number" },
  ],
  qualification_create: [
    { label: "ID docente", type: "number" },
    { label: "ID materia", type: "number" },
  ],
  group_create: [
    { label: "Código de grupo" },
    { label: "Semestre", type: "number" },
    { label: "Jornada", type: "shift" },
  ],
  room_create: [
    { label: "Nombre de aula" },
    { label: "Capacidad", type: "number" },
  ],
  offering_create: [
    { label: "ID materia", type: "number" },
    { label: "ID grupo", type: "number" },
    { label: "ID docente", type: "number" },
    { label: "Periodo: por ejemplo 2026-2" },
  ],
  enroll: [
    { label: "ID estudiante", type: "number" },
    { label: "ID oferta", type: "number" },
  ],
  unit_create: [
    { label: "ID materia", type: "number" },
    { label: "Posición", type: "number" },
    { label: "Título de unidad" },
    { label: 'Temas JSON: ["Tema","Subtema"]' },
  ],
  availability_create: [
    { label: "ID docente", type: "number" },
    { label: "Slot disponible 0–39", type: "number" },
    { label: "Jornada", type: "shift" },
  ],
  group_availability_create: [
    { label: "ID grupo", type: "number" },
    { label: "Slot disponible 0–39", type: "number" },
  ],
};
export const names: Record<string, string> = {
  subject_policy: "Requisitos de perfil docente",
  student_create: "Estudiante",
  teacher_create: "Docente",
  program_create: "Carrera",
  subject_create: "Materia",
  curriculum_create: "Materia por semestre",
  prerequisite_create: "Seriación",
  qualification_create: "Acreditación docente",
  group_create: "Grupo",
  room_create: "Aula",
  offering_create: "Oferta académica",
  enroll: "Inscripción",
  unit_create: "Unidad curricular",
  availability_create: "Disponibilidad docente",
  group_availability_create: "Disponibilidad del grupo",
};
export function Admin() {
  const [op, setOp] = useState("student_create"),
    [values, setValues] = useState<string[]>([]),
    [list, setList] = useState("students");
  const task = useTask();
  return (
    <section>
      <h2>Administración académica</h2>
      <Field label="Registro a crear">
        <select
          value={op}
          onChange={(e) => {
            setOp(e.target.value);
            setValues([]);
          }}
        >
          {Object.keys(fields).map((k) => (
            <option key={k} value={k}>
              {names[k]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid">
        {fields[op].map((f, i) =>
          f.label.startsWith("ID de usuario") ? null : (
            <Field key={op + i} label={f.label}>
              {f.type === "shift" ? (
                <select
                  value={values[i] ?? ""}
                  onChange={(e) =>
                    setValues((old) => {
                      const n = [...old];
                      n[i] = e.target.value;
                      return n;
                    })
                  }
                >
                  <option value="">Selecciona una jornada</option>
                  <option value="morning">Matutina</option>
                  <option value="evening">Vespertina</option>
                </select>
              ) : (
                <input
                  type={f.type ?? "text"}
                  value={values[i] ?? ""}
                  onChange={(e) =>
                    setValues((old) => {
                      const n = [...old];
                      n[i] = e.target.value;
                      return n;
                    })
                  }
                />
              )}
            </Field>
          ),
        )}
      </div>
      <button
        disabled={task.busy}
        onClick={() =>
          task.run(() =>
            request("records", {
              op,
              params: fields[op].map((f, i) =>
                !values[i] && f.nullable
                  ? null
                  : f.type === "number"
                    ? Number(values[i])
                    : (values[i] ?? ""),
              ),
              requestId: crypto.randomUUID(),
            }),
          )
        }
      >
        Guardar registro
      </button>
      <div className="subpanel">
        <h3>Consultar registros e IDs</h3>
        <select value={list} onChange={(e) => setList(e.target.value)}>
          {[
            ["students", "Estudiantes"],
            ["teachers", "Docentes"],
            ["programs", "Carreras"],
            ["subjects", "Materias"],
            ["groups", "Grupos"],
            ["rooms", "Aulas"],
            ["offerings", "Ofertas"],
            ["biometrics", "Registros biométricos"],
          ].map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>{" "}
        <button
          disabled={task.busy}
          onClick={() => task.run(() => request(`records/${list}`))}
        >
          Consultar
        </button>
      </div>
      <Status task={task} />
      <Result value={task.result} />
    </section>
  );
}
