import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { Native, type Row } from "../server/native.js";
import { Domain } from "../server/domain.js";
import { McpGateway } from "../server/mcp_gateway.js";
import { Orchestrator } from "../server/orchestrator.js";
import { config } from "../server/config.js";
import { Auth } from "../server/auth.js";
let directory: string, native: Native, domain: Domain, gateway: McpGateway;
const actor = { id: 1, roles: ["admin"] };
before(async () => {
  directory = await mkdtemp(resolve(tmpdir(), "sistema-test-"));
  const database = resolve(directory, "test.db");
  for (const file of ["schema.sql", "002.sql"])
    execFileSync(config.native, [
      database,
      "--init",
      resolve(config.root, "db", file),
    ]);
  native = new Native(config.native, database);
  await native.call("user", [
    "admin",
    "admin",
    "",
  ]);
  execFileSync(config.native, [
    database,
    "--init",
    resolve(config.root, "db/demo.sql"),
  ]);
  domain = new Domain(native);
  gateway = new McpGateway(domain);
});
after(async () => {
  await gateway.close();
  native.close();
  await rm(directory, { recursive: true, force: true });
});
test("MCP real y Partitura producen estados deterministas", async () => {
  const states: string[] = [];
  const engine = new Orchestrator(gateway, async (_a, e) => {
    states.push(e.state);
  });
  const r = await engine.runTool(
    actor,
    "mcp_curriculum_tool",
    { action: "semester", programId: 1, semester: 1 },
    randomUUID(),
  );
  assert.equal((r.result as Row[]).length, 2);
  assert.deepEqual(states, [
    "recibido",
    "validando",
    "ejecutando",
    "completado",
  ]);
});
test("lookup curricular por nombre de carrera y seriación circular", async () => {
  const r = await domain.execute(
    actor,
    "mcp_curriculum_tool",
    {
      action: "lookup",
      query: "Dame las materias de Actuaría de primer semestre",
    },
    randomUUID(),
    AbortSignal.timeout(10000),
  );
  assert.equal(r.length, 2);
  await native.call("prerequisite_create", [2, 1]);
  await assert.rejects(native.call("prerequisite_create", [1, 2]), /circular/);
});
test("horarios guardados, duplicados y rollback", async () => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 2);
  start.setUTCHours(14, 0, 0, 0);
  const base = Math.floor(start.getTime() / 1000);
  const slots = Array.from(
    { length: 40 },
    (_, i) => base + Math.floor(i / 8) * 86400 + (i % 8) * 3600,
  );
  const r = await domain.execute(
    actor,
    "mcp_scheduler_tool",
    {
      action: "solve",
      offeringIds: [1],
      slotStarts: slots,
      duration: 2,
      commit: true,
    },
    randomUUID(),
    AbortSignal.timeout(10000),
  );
  assert.equal(r.sessions.length, 2);
  const [s] = await native.call<Row[]>("schedules", [0, 0, 0, 0, 0, 0]);
  await assert.rejects(
    native.batch([
      { op: "room_create", params: ["Temporal", 20] },
      { op: "schedule_create", params: [1, 1, s.starts, s.ends] },
    ]),
    /Conflicto/,
  );
  const rooms = await native.call<Row[]>("rooms");
  assert.ok(!rooms.some((r) => r.name === "Temporal"));
});
test("calificaciones y asistencia exigen docente autorizado", async () => {
  await assert.rejects(
    domain.execute(
      { id: 1, roles: ["student"] },
      "mcp_grades_tool",
      { action: "list", offeringId: 1 },
      randomUUID(),
      AbortSignal.timeout(10000),
    ),
    /docente/,
  );
  await assert.rejects(
    domain.execute(
      { id: 1, roles: ["student"] },
      "mcp_biometrics_tool",
      {
        action: "manual",
        sessionId: 1,
        studentId: 1,
        status: "present",
        reason: "prueba",
      },
      randomUUID(),
      AbortSignal.timeout(10000),
    ),
    /docente/,
  );
});
test("encuesta idempotente, invitación, métricas, códigos y aislamiento", async () => {
  const rid = randomUUID(),
    p = {
      action: "create",
      title: "Encuesta de prueba",
      questions: [
        { prompt: "Valoración", kind: "rating" },
        { prompt: "Comentario", kind: "text" },
      ],
    };
  const s = await domain.execute(
    actor,
    "mcp_surveys_tool",
    p,
    rid,
    AbortSignal.timeout(10000),
  );
  const again = await domain.execute(
    actor,
    "mcp_surveys_tool",
    p,
    rid,
    AbortSignal.timeout(10000),
  );
  assert.equal(s.id, again.id);
  assert.equal((await native.call<Row[]>("surveys", [1])).length, 1);
  const links = await domain.execute(
    actor,
    "mcp_surveys_tool",
    { action: "invite", surveyId: s.id, count: 1 },
    randomUUID(),
    AbortSignal.timeout(10000),
  );
  const token = links.links[0].split("/").pop();
  const questions = await native.call<Row[]>("questions", [s.id]);
  await domain.submit({
    token,
    consent: true,
    answers: [
      { questionId: questions[0].id, rating: 5 },
      { questionId: questions[1].id, text: "La docencia fue excelente" },
    ],
  });
  const analysis = await domain.execute(
    actor,
    "mcp_surveys_tool",
    { action: "analyze", surveyId: s.id },
    randomUUID(),
    AbortSignal.timeout(10000),
  );
  assert.equal(analysis.metrics.completed, 1);
  assert.equal(analysis.metrics.completion_rate, 1);
  assert.equal(analysis.metrics.questions[0].mean, 5);
  await assert.rejects(
    domain.authorize({ id: 2, roles: ["researcher"] }, "mcp_surveys_tool", {
      action: "analyze",
      surveyId: s.id,
    }),
    /autorizada/,
  );
  await domain.execute(
    actor,
    "mcp_surveys_tool",
    { action: "code", surveyId: s.id, label: "Docencia" },
    randomUUID(),
    AbortSignal.timeout(10000),
  );
  const [code] = await native.call<Row[]>("codes", [s.id]);
  const response = analysis.responses[1];
  await domain.execute(
    actor,
    "mcp_surveys_tool",
    {
      action: "review",
      surveyId: s.id,
      responseId: response.id,
      codeId: code.id,
      quote: "docencia",
      confidence: 1,
    },
    randomUUID(),
    AbortSignal.timeout(10000),
  );
  assert.equal((await native.call<Row[]>("coding", [s.id])).length, 1);
});
test("índice vectorial nativo conserva dimensiones y orden", async () => {
  await native.call("embed", [], {
    chunkId: 1,
    model: "test",
    vector: [1, 0, 0],
  });
  const r = await native.call<Row[]>("search", [], {
    model: "test",
    vector: [1, 0, 0],
  });
  assert.equal(r[0].id, 1);
  assert.equal(r[0].score, 1);
  assert.deepEqual(
    await native.call("search", [], { model: "test", vector: [1, 0] }),
    [],
  );
});
test("inicialización de notas ponderadas nativa y absentismo cerrado", async () => {
  await native.call("grade_create", [
    1,
    1,
    80,
    90,
    100,
    Math.floor(Date.now() / 1000),
    1,
  ]);
  const [g] = await native.call<Row[]>("grades", [1]);
  assert.equal(g.total, 94);
  assert.equal(g.absences, 0);
  await assert.rejects(
    native.call("grade_create", [1, 1, 101, 90, 100, 0, 1]),
    /CHECK/,
  );
});
test("ZIP rechaza traversal y XLSX valida encabezados y valores", async () => {
  const script = `import zipfile,sys\nfrom pathlib import Path\np=Path(sys.argv[1])\nwith zipfile.ZipFile(p/'bad.zip','w') as z:z.writestr('../escape.txt','bad')\nwith zipfile.ZipFile(p/'good.zip','w') as z:z.writestr('finanzas.txt','Unidad 1: Finanzas\\n1.1 Valor presente\\nUnidad 2: Riesgo\\n2.1 Diversificacion')\nxml='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">'+''.join('<c r="'+chr(65+i)+'1" t="inlineStr"><is><t>'+s+'</t></is></c>' for i,s in enumerate(['student_id','p1','p2','final_exam']))+'</row><row r="2">'+''.join('<c r="'+chr(65+i)+'2"><v>'+str(v)+'</v></c>' for i,v in enumerate([1,80,90,100]))+'</row></sheetData></worksheet>'\nwith zipfile.ZipFile(p/'grades.xlsx','w') as z:z.writestr('xl/worksheets/sheet1.xml',xml)\n`;
  const path = resolve(directory, "fixture.py");
  await writeFile(path, script);
  execFileSync("python3", [path, directory]);
  await assert.rejects(
    native.call("ingest", [], {
      path: resolve(directory, "bad.zip"),
      subjectId: 2,
    }),
    /ZIP/,
  );
  const docs = await native.call("ingest", [], {
    path: resolve(directory, "good.zip"),
    subjectId: 2,
  });
  assert.equal(docs.length, 1);
  const data = await native.call("xlsx", [], {
    path: resolve(directory, "grades.xlsx"),
  });
  assert.deepEqual(data, [
    { student_id: 1, p1: 80, p2: 90, final_exam: 100, total: 94 },
  ]);
});
test("PDF UTF-8 y notebook de práctica generados por C", async () => {
  const base = resolve(directory, "reporte");
  await native.call("generate", [], {
    base,
    text: "# Investigación académica\n\nMétodos y conclusiones: participación, evaluación y análisis.\n",
    notebook: true,
  });
  const pdf = await readFile(base + ".pdf");
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const nb = JSON.parse(await readFile(base + ".ipynb", "utf8"));
  assert.equal(nb.nbformat, 4);
  const source = nb.cells
    .filter((c: Row) => c.cell_type === "code")
    .map((c: Row) => c.source)
    .join("\n");
  const code = resolve(directory, "notebook.py");
  await writeFile(code, source);
  assert.match(execFileSync("python3", [code]).toString(), /VPN/);
});
test("publicación de XLSX exige cierre y suma faltas no justificadas", async () => {
  const time = Math.floor(Date.now() / 1000);
  await native.call("schedule_cancel", [1]);
  await native.call("schedule_cancel", [2]);
  const s1 = await native.call<Row>("schedule_create", [
    1,
    1,
    time - 7200,
    time - 3600,
  ]);
  const s2 = await native.call<Row>("schedule_create", [
    1,
    1,
    time - 3500,
    time - 1800,
  ]);
  await domain.execute(
    actor,
    "mcp_biometrics_tool",
    {
      action: "manual",
      sessionId: s2.id,
      studentId: 1,
      status: "excused",
      reason: "Justificación revisada",
    },
    randomUUID(),
    AbortSignal.timeout(10000),
  );
  const uploadId = randomUUID();
  domain.uploads.set(uploadId, {
    path: resolve(directory, "grades.xlsx"),
    owner: 1,
    kind: "xlsx",
    expires: time + 100,
  });
  const preview = await domain.execute(
    actor,
    "mcp_grades_tool",
    { action: "preview", offeringId: 1, uploadId },
    randomUUID(),
    AbortSignal.timeout(10000),
  );
  await assert.rejects(
    domain.execute(
      actor,
      "mcp_grades_tool",
      { action: "commit", previewId: preview.previewId, approved: true },
      randomUUID(),
      AbortSignal.timeout(10000),
    ),
    /Cierra/,
  );
  for (const s of [s1, s2])
    await domain.execute(
      actor,
      "mcp_scheduler_tool",
      { action: "close", sessionId: s.id },
      randomUUID(),
      AbortSignal.timeout(10000),
    );
  await domain.execute(
    actor,
    "mcp_grades_tool",
    { action: "commit", previewId: preview.previewId, approved: true },
    randomUUID(),
    AbortSignal.timeout(10000),
  );
  const [g] = await native.call<Row[]>("grades", [1]);
  assert.equal(g.total, 94);
  assert.equal(g.absences, 1);
});
test("perfil docente valida experiencia y formación contra requisitos", async () => {
  await native.call("subject_policy", [2, 10, '["Finanzas"]']);
  const teacher = await native.call<Row>("teacher_create", [
    "Otro docente",
    "Contabilidad",
    4,
    null,
  ]);
  await assert.rejects(
    native.call("qualification_create", [teacher.id, 2, 1]),
    /incompatible/,
  );
});

test("acceso local directo y protección de escrituras", async () => {
 const context = new Auth(native); await context.initialize();
 const local = context.require({headers:{}} as any);
 assert.equal(local.actor.id,1);
 assert.throws(()=>context.require({headers:{}} as any,true),/CSRF_REQUIRED/);
 assert.equal(context.require({headers:{"x-csrf-token":local.csrf}} as any,true).actor.id,1);
});

test('ABC docente conserva cambios y permite baja sin relaciones',async()=>{
 const created=await native.call<Row>('teacher_create',['Docente ABC','Perfil académico',5,null]);
 await native.call('teacher_update',['Docente actualizado','Contaduría',7,created.id]);
 const rows=await native.call<Row[]>('teachers');
 assert.equal(rows.find(t=>t.id===created.id)?.name,'Docente actualizado');
 await native.call('teacher_delete',[created.id]);
 assert.ok(!(await native.call<Row[]>('teachers')).some(t=>t.id===created.id));
});

test('Asistencia repetida informa ya registrada sin duplicar filas',async()=>{
 const starts=Math.floor(Date.now()/1000)+40*86400;
 const session=await native.call<Row>('schedule_create',[1,1,starts,starts+3600]);
 const students=await native.call<Row[]>('enrolled',[session.id]);
 assert.ok(students.length);
 const payload={action:'manual',sessionId:session.id,studentId:students[0].id,status:'present',reason:'Prueba de duplicado supervisado'};
 await domain.execute(actor,'mcp_biometrics_tool',payload,randomUUID(),AbortSignal.timeout(10000));
 const second=await domain.execute(actor,'mcp_biometrics_tool',payload,randomUUID(),AbortSignal.timeout(10000));
 assert.equal(second.alreadyRecorded,true);
 const before = (await native.call<Row[]>('attendance_list',[session.id])).find(a=>a.student_id===students[0].id)!;
 await assert.rejects(native.call('attendance_create',[session.id,students[0].id,'present',before.recorded_at+60,actor.id]),/UNIQUE|constraint/i);
 const after = (await native.call<Row[]>('attendance_list',[session.id])).find(a=>a.student_id===students[0].id)!;
 assert.equal(after.recorded_at,before.recorded_at);
 assert.equal((await native.call<Row[]>('attendance_list',[session.id])).filter(a=>a.student_id===students[0].id).length,1);
});

test('Alta biométrica rechaza matrícula ajena antes de procesar la cámara',async()=>{
 const students=await native.call<Row[]>('students');
 assert.ok(students.length);
 const before=await native.call<Row[]>('biometrics');
 await assert.rejects(domain.execute(actor,'mcp_biometrics_tool',{
  action:'enroll',studentId:students[0].id,studentNumber:'MATRICULA-INCOMPATIBLE',frame:'data:image/jpeg;base64,invalid',consent:true,
 },randomUUID(),AbortSignal.timeout(10000)),/no coincide con la matrícula/);
 assert.deepEqual(await native.call<Row[]>('biometrics'),before);
});

test('Administrador de listas: corrección conserva ID y traslado fallido revierte baja',async()=>{
 const subject=await native.call<Row>('subject_create',['LISTA-ABC','Prueba listas',2]);
 await native.call('qualification_create',[1,subject.id,1]);
 const offer=await native.call<Row>('offering_create',[subject.id,1,1,'PRUEBA-ABC']);
 const student=await native.call<Row>('student_create',['PRUEBA-LISTA','Nombre inicial',null]);
 await native.call('enroll',[student.id,offer.id]);
 await native.call('student_update',['PRUEBA-LISTA-EDIT','Nombre corregido',student.id]);
 assert.equal((await native.call<Row[]>('students')).find(s=>s.id===student.id)?.name,'Nombre corregido');
 await assert.rejects(native.batch([{op:'unenroll',params:[student.id,offer.id]},{op:'enroll',params:[student.id,999999]}]));
 assert.ok((await native.call<Row[]>('enrolled_ids',[offer.id])).some(e=>e.student_id===student.id));
 await native.call('unenroll',[student.id,offer.id]);
 assert.ok(!(await native.call<Row[]>('enrolled_ids',[offer.id])).some(e=>e.student_id===student.id));
 assert.ok((await native.call<Row[]>('students')).some(s=>s.id===student.id));
});
