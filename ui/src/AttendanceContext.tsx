import { WeeklyTimetable } from "./WeeklyTimetable";
import { AcademicFileImport } from "./AcademicFileImport";
import React, { useState, useEffect, useRef } from "react";
import { request } from "./api";
export function AttendanceContext({
  onSession,
  onClass,
  captureActions,
  onStudent,
  registrationMode,
  refreshRevision,
  onSelectionClear,
}: {
  captureActions?: React.ReactNode;
  onClass: (value: any | null) => void;
  registrationMode: boolean;
  refreshRevision: number;
  onSelectionClear: () => void;
  onSession: (id: string) => void;
  onStudent: (id: string, identity: {name: string; number: string; list_number?: number}) => void;
}) {
  const [teachers, setTeachers] = useState<any[]>([]),
    [teacher, setTeacher] = useState(""),
    [date, setDate] = useState(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }),
    [sessions, setSessions] = useState<any[]>([]),
    [lists, setLists] = useState<any[]>([]),
    [sources, setSources] = useState<any[]>([]),
    [session, setSession] = useState(""),
    [number, setNumber] = useState(""),
    [error, setError] = useState(""),
    [teacherName, setTeacherName] = useState(""),
    [background, setBackground] = useState("Por completar"),
    [years, setYears] = useState("0"),
    [roster, setRoster] = useState(""),
    [room, setRoom] = useState(""),
    [offer, setOffer] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [offerings, setOfferings] = useState<any[]>([]),
    [rooms, setRooms] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [subjects, setSubjects] = useState<any[]>([]),
    [groups, setGroups] = useState<any[]>([]),
    [subject, setSubject] = useState(""),
    [group, setGroup] = useState(""),
    [term, setTerm] = useState("");
  const [registrationStudent, setRegistrationStudent] = useState("");
  useEffect(() => {setRegistrationStudent(""); setNumber("");}, [session, registrationMode]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [chosenOffer, setChosenOffer] = useState("");
  const chosenRef = useRef("");
  const [reportMonth, setReportMonth] = useState(new Date().toLocaleDateString("sv-SE", {timeZone:"America/Mexico_City"}).slice(0,7));
  const [report, setReport] = useState<any>(null);
  async function confirmGroup() {
    const result = await request("attendance/current", { teacherId: Number(teacher), offeringId: Number(chosenRef.current) });
    if (result.active.length !== 1) throw Error("No hay una clase vigente para confirmar");
    const id = String(result.active[0]);
    setSession(id); onSession(id);
    const context = await request("attendance/context?teacher=" + teacher);
    setSessions(context.sessions);
    setError("Grupo confirmado. Puedes registrar la asistencia de esta clase.");
  }
  async function save(op: string, params: unknown[]) {
    return request("records", { op, params, requestId: crypto.randomUUID() });
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    Promise.all([
      request("records/teachers"),
      request("records/offerings"),
      request("records/rooms"),
      request("records/subjects"),
      request("records/groups"),
    ])
      .then(([t, o, r, s, g]) => {
        setTeachers(t);
        setOfferings(o);
        setRooms(r);
        setSubjects(s);
        setGroups(g);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function load() {
    try {
      const current = await request("attendance/current", {
        teacherId: Number(teacher),
      });
      const r = await request("attendance/context?teacher=" + teacher);
      setCandidates(current.candidates || []);
      if (!chosenRef.current && current.candidates?.length === 1) {
        chosenRef.current = String(current.candidates[0].offering_id);
        setChosenOffer(chosenRef.current);
      }
      setDate(day(Date.now() / 1000));
      setSessions(r.sessions);
      setLists(r.lists || []);
      setSources(r.sources || []);
      const now = Date.now() / 1000,
        active = r.sessions.filter(
          (s: any) =>
            s.starts <= now &&
            s.ends >= now &&
            !s.closed &&
            day(s.starts) === day(Date.now() / 1000),
        );
      const confirmed = active.find((s: any) => String(s.offering_id) === chosenRef.current);
      if (confirmed) {
        setSession(String(confirmed.id));
        onSession(String(confirmed.id));
      }
      if (!confirmed) {
        setSession("");
        onSession("");
        setError(current.message);
      } else setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    chosenRef.current = ""; setChosenOffer("");
    setSession("");
    onSession("");
    if (teacher) void load();
  }, [teacher]);
  useEffect(() => {if (teacher && refreshRevision) void load();}, [refreshRevision]);
  useEffect(() => {
    if (!teacher) return;
    const timer = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [teacher]);
  const day = (stamp: number) => {
    const d = new Date(stamp * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const selected = sessions.find((s) => String(s.id) === session);
  useEffect(() => {onClass(selected || null);}, [sessions, session]);
  useEffect(() => {
    if (registrationStudent && selected?.students.some((s:any) => String(s.id) === registrationStudent && s.biometric)) {
      setRegistrationStudent("");
      onSelectionClear();
    }
  }, [sessions, registrationStudent]);
  return (
    <section className="subpanel">
      <details>
        <summary>Alta, baja y cambios de docentes</summary>
        <label>
          Nombre
          <input
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
          />
        </label>
        <label>
          Perfil académico
          <input
            value={background}
            onChange={(e) => setBackground(e.target.value)}
          />
        </label>
        <label>
          Años de experiencia
          <input
            type="number"
            min="0"
            max="80"
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !teacherName.trim()}
          onClick={() =>
            void act(async () => {
              await save("teacher_create", [
                teacherName,
                background,
                Number(years),
                null,
              ]);
              setTeachers(await request("records/teachers"));
            })
          }
        >
          Alta de docente
        </button>
        <button
          disabled={busy || !teacher}
          onClick={() =>
            void act(async () => {
              await save("teacher_update", [
                teacherName,
                background,
                Number(years),
                Number(teacher),
              ]);
              setTeachers(await request("records/teachers"));
              await load();
            })
          }
        >
          Guardar cambios del docente seleccionado
        </button>
        <button
          disabled={busy || !teacher}
          onClick={() => {
            if (
              confirm(
                "¿Dar de baja al docente? Si tiene horarios o registros relacionados, la baja será rechazada.",
              )
            )
              void act(async () => {
                await save("teacher_delete", [Number(teacher)]);
                setTeachers(await request("records/teachers"));
                setTeacher("");
              });
          }}
        >
          Baja del docente seleccionado
        </button>
      </details>
      <h3>Docente, fecha y grupo</h3>
      <label>
        Docente
        <select
          value={teacher}
          onChange={(e) => {
            setTeacher(e.target.value);
            const t = teachers.find((t) => String(t.id) === e.target.value);
            setTeacherName(t?.name || "");
            setBackground(t?.background || "Por completar");
            setYears(String(t?.industry_years || 0));
          }}
        >
          <option value="">Selecciona docente</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {teacher &&
        sources
          .filter((s) => s.weekly?.length)
          .map((s) => (
            <WeeklyTimetable
              key={s.id}
              source={s}
              teacherId={teacher}
              rooms={rooms}
              onDone={() => void load()}
            />
          ))}
      {teacher &&
        sources.some((s) => s.kind === "lista" && s.context.estado_lista) && (
          <section className="subpanel">
            <h3>Listas vinculadas en RAG · pendientes de asignación</h3>
            {sources
              .filter((s) => s.kind === "lista" && s.context.estado_lista)
              .map((s) => (
                <p key={s.id}>
                  <b>{s.context.hoja}</b> · {s.context.materia} · {s.rows}{" "}
                  alumnos. {s.context.motivo}.{" "}
                  <a
                    href={"http://127.0.0.1:8790/api/source?id=" + s.id}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver fuente JSON
                  </a>
                </p>
              ))}
          </section>
        )}
      {teacher && (
        <section className="subpanel">
          <h3>Listas vinculadas al docente</h3>
          {!lists.length ? (
            <p>No tiene listas inscritas todavía.</p>
          ) : (
            lists.map((l) => (
              <details key={l.offering_id}>
                <summary>
                  {l.group_code} · {l.subject} · {l.term} · {l.students.length}{" "}
                  alumnos
                </summary>
                <ol>
                  {l.students.map((s: any) => (
                    <li key={s.id}>
                      {s.number} · {s.name}
                    </li>
                  ))}
                </ol>
              </details>
            ))
          )}
        </section>
      )}
      <details>
        <summary>Importar listas de alumnos por grupo y materia</summary>
        <label>
          Grupo y materia del docente
          <select value={offer} onChange={(e) => setOffer(e.target.value)}>
            <option value="">Seleccionar grupo y materia</option>
            {offerings
              .filter((o) => String(o.teacher_id) === teacher)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.group_code} · {o.subject} · {o.term}
                </option>
              ))}
          </select>
        </label>
        <AcademicFileImport
          key={teacher + ":" + offer}
          kind="lista"
          teacherId={teacher}
          offeringId={offer ? Number(offer) : undefined}
          onDone={() => void load()}
        />
      </details>
      {!sources.some((s) => s.weekly?.length) && (
        <details>
          <summary>Establecer horario del docente</summary>
          <AcademicFileImport
            key={teacher}
            kind="horario"
            teacherId={teacher}
            onDone={() => void load()}
          />
          <p>
            Asigna grupo y materia al docente. Su perfil se valida antes de
            crear la oferta.
          </p>
          <label>
            Grado y grupo
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Selecciona grupo</option>
              {groups.map((g) => (
                <option value={g.id} key={g.id}>
                  Semestre {g.semester} · Grupo {g.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Materia
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">Selecciona materia</option>
              {subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Período
            <input
              value={term}
              placeholder="AGO-DIC 2026"
              onChange={(e) => setTerm(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !teacher || !group || !subject || !term.trim()}
            onClick={() =>
              void act(async () => {
                await save("qualification_create", [
                  Number(teacher),
                  Number(subject),
                ]);
                await save("offering_create", [
                  Number(subject),
                  Number(group),
                  Number(teacher),
                  term.trim(),
                ]);
                setOfferings(await request("records/offerings"));
                setError(
                  "Materia y grupo asignados. Selecciona la oferta y establece las horas.",
                );
              })
            }
          >
            Asignar grupo y materia
          </button>
          <p>Los cruces de aula, docente y alumnos se rechazan.</p>
          <label>
            Grupo y materia
            <select value={offer} onChange={(e) => setOffer(e.target.value)}>
              <option value="">Selecciona oferta</option>
              {offerings
                .filter((o) => String(o.teacher_id) === teacher)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.group_code || o.group_id} · {o.subject || o.subject_id}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Aula
            <select value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">Selecciona aula</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Inicio
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Fin
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !offer || !room || !start || !end}
            onClick={() =>
              void act(async () => {
                await save("schedule_create", [
                  Number(offer),
                  Number(room),
                  Math.floor(new Date(start).getTime() / 1000),
                  Math.floor(new Date(end).getTime() / 1000),
                ]);
                await load();
              })
            }
          >
            Guardar sesión de horario
          </button>
        </details>
      )}
      <p>Fecha y hora de la máquina: {new Date().toLocaleString("es-MX")}</p>
      <button disabled={!teacher} onClick={() => void load()}>
        Actualizar horario y lista
      </button>
      {candidates.length > 0 && <>
        <p>Horario actual: {candidates.map(c => `${c.group_code} · ${c.subject} · ${new Date(c.starts * 1000).toLocaleTimeString("es-MX", {hour:"2-digit",minute:"2-digit"})}–${new Date(c.ends * 1000).toLocaleTimeString("es-MX", {hour:"2-digit",minute:"2-digit"})}`).join(" / ")}</p>
        <label>Confirmar o cambiar grupo y materia
          <select value={chosenOffer} onChange={e => {
            chosenRef.current = e.target.value; setChosenOffer(e.target.value);
            setSession(""); onSession("");
          }}>
            <option value="">Selecciona grupo</option>
            {lists.filter(l => l.term === candidates[0].periodo).map(l => <option key={l.offering_id} value={l.offering_id}>{l.group_code} · {l.subject}</option>)}
          </select>
        </label>
        <button disabled={busy || !chosenOffer} onClick={() => void act(confirmGroup)}>Confirmar grupo e iniciar asistencia</button>
        <p>Se utiliza la fecha de la máquina y el inicio y fin del bloque actual. No se generan sesiones del semestre.</p>
      </>}
      {selected && captureActions}
      {selected && (
        <>
          <p>
            {selected.teacher} · Grupo {selected.group_code} ·{" "}
            {selected.subject}
          </p>
          <details>
            <summary>Dar de alta la lista de alumnos del grupo</summary>
            <AcademicFileImport
              key={selected.offering_id + ":" + teacher}
              kind="lista"
              teacherId={teacher}
              offeringId={selected.offering_id}
              onDone={() => void load()}
            />
            <p>
              Una línea por alumno: matrícula;nombre. Una matrícula sin nombre
              se registra con ese dato pendiente.
            </p>
            <textarea
              value={roster}
              onChange={(e) => setRoster(e.target.value)}
              rows={6}
            />
            <button
              disabled={busy || !roster.trim()}
              onClick={() =>
                void act(async () => {
                  const rows = roster.split("\n").filter((r) => r.trim());
                  if (rows.length > 200)
                    throw Error("Máximo 200 alumnos por importación");
                  let students = await request("records/students");
                  for (const line of rows) {
                    const [n, name] = line.split(";").map((x) => x.trim());
                    if (!n) throw Error("Matrícula vacía");
                    let s = students.find((s: any) => s.number === n);
                    if (!s) {
                      const result = await save("student_create", [
                        n,
                        name || n,
                        null,
                      ]);
                      s = { id: result.id, number: n };
                      students.push(s);
                    }
                    if (!selected.students.some((x: any) => x.id === s.id)) {
                      await save("enroll", [s.id, selected.offering_id]);
                      selected.students.push(s);
                    }
                  }
                  setRoster("");
                  await load();
                })
              }
            >
              Guardar lista e inscripciones
            </button>
          </details>
          {registrationMode && <section className="subpanel">
            <h3>Seleccionar alumno para registro por primera vez</h3>
            <label>Filtrar por nombre, matrícula o número de lista (opcional)
              <input value={number} placeholder="Ver todos o escribir para filtrar" onChange={e => {setNumber(e.target.value); setRegistrationStudent(""); onSelectionClear();}} />
            </label>
            <label>Alumno de la lista del grupo
              <select value={registrationStudent} onChange={e => {
                const id = e.target.value;
                setRegistrationStudent(id);
                onSelectionClear();
                const s = selected.students.find((s:any) => String(s.id) === id && !s.biometric);
                if (!s) return;
                onStudent(String(s.id), {name:s.name,number:s.number,list_number:s.list_number});
                setError(`Seleccionado: ${s.name} · Matrícula ${s.number}. Confirma su identidad antes de guardar el rostro.`);
              }}>
                <option value="">Selecciona al alumno que vas a registrar</option>
                {selected.students.filter((s:any) => !s.biometric && (!number.trim() || s.name.toLocaleLowerCase("es-MX").includes(number.trim().toLocaleLowerCase("es-MX")) || s.number.includes(number.trim()) || String(s.list_number) === number.trim()))
                  .sort((a:any,b:any) => (a.list_number ?? 9999)-(b.list_number ?? 9999) || a.name.localeCompare(b.name,"es"))
                  .map((s:any) => <option key={s.id} value={s.id}>{s.list_number ? `NL ${s.list_number} · ` : ""}{s.name} · Matrícula {s.number}</option>)}
              </select>
            </label>
            <p>Solo aparecen alumnos del grupo confirmado sin biometría vigente. Si ya tiene rostro registrado, utiliza «Asistencia con rostro registrado».</p>
          </section>}
          <table>
            <thead>
              <tr>
                <th>N.º lista</th>
                <th>Matrícula</th>
                <th>Alumno</th>
                <th>Biometría</th>
                <th>Asistencia</th>
              </tr>
            </thead>
            <tbody>
              {selected.students.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.list_number ?? "—"}</td>
                  <td>{s.number}</td>
                  <td>{s.name}</td>
                  <td>{s.biometric ? "Registrada" : "Pendiente"}</td>
                  <td>
                    {selected.attendance.some((a: any) => a.student_id === s.id)
                      ? "Ya registrada"
                      : "Pendiente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {teacher && <details>
        <summary>Reporte mensual de asistencia</summary>
        <label>Mes <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} /></label>
        <button disabled={busy} onClick={() => void act(async () => setReport(await request(`attendance/report?teacher=${teacher}&month=${reportMonth}`)))}>Consultar reporte</button>
        {report && <>
          <p>1 = asistencia · 0 = falta · J = falta justificada (no suma faltas) · vacío = clase futura o cancelada. {report.note}</p>
          {report.matrix.map((g:any) => <section key={g.group + g.subject}>
            <h4>{g.group} · {g.subject}</h4>
            <button onClick={() => {
              const quote = (v:unknown) => '"' + String(v ?? "").replace(/"/g,'""') + '"';
              const hours = (c:any) => `${new Date(c.starts*1000).toLocaleTimeString("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit"})}–${new Date(c.ends*1000).toLocaleTimeString("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit"})}`;
              const headers = ["Grupo","Materia","Horario","NL","Matrícula","Nombre","Total asistencias","Total faltas",...g.columns.map((c:any) => `${c.date} ${hours(c)}`)];
              const rows=g.students.map((s:any) => [g.group,g.subject,[...new Set(g.columns.map(hours))].join(" / "),s.list_number,s.number,s.name,s.total_attendance,s.total_absence,...g.columns.map((c:any) => s.values[c.key] ?? "")].map(quote).join(","));
              const url=URL.createObjectURL(new Blob(["\uFEFF" + headers.map(quote).join(",") + "\r\n" + rows.join("\r\n")],{type:"text/csv;charset=utf-8"}));
              const a=document.createElement("a");a.href=url;a.download=`asistencia-${g.group}-${g.subject}-${report.month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
            }}>Descargar reporte CSV del grupo</button>
            <div style={{overflowX:"auto"}}><table><thead><tr>
              <th>Grupo</th><th>Materia</th><th>Horario</th><th>NL</th><th>Matrícula</th><th>Nombre</th><th>Total asistencias</th><th>Total faltas</th>
              {g.columns.map((c:any) => <th key={c.key}>{c.date}<br/>{new Date(c.starts*1000).toLocaleTimeString("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit"})}–{new Date(c.ends*1000).toLocaleTimeString("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit"})}</th>)}
            </tr></thead><tbody>{g.students.map((s:any) => <tr key={s.number}>
              <td>{g.group}</td><td>{g.subject}</td><td>{[...new Set(g.columns.map((c:any)=>`${new Date(c.starts*1000).toLocaleTimeString("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit"})}–${new Date(c.ends*1000).toLocaleTimeString("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit"})}`))].join(" / ")}</td>
              <td>{s.list_number ?? "—"}</td><td>{s.number}</td><td>{s.name}</td><td>{s.total_attendance}</td><td>{s.total_absence}</td>
              {g.columns.map((c:any) => <td key={c.key}>{s.values[c.key] ?? ""}</td>)}
            </tr>)}</tbody></table></div>
          </section>)}
        </>}
      </details>}
      <p>
        La cámara registra la sesión del horario actual. Para fechas anteriores
        usa el registro manual con motivo; no se simula una captura pasada.
      </p>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
