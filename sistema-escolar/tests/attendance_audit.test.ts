// Batería ampliada de asistencia (auditoría 2026-10-20).
// Cubre: reporte mensual, consenso facial (falla en cerrado), selección de la
// clase vigente, concurrencia de confirmaciones y mensajes al docente.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyMatrix, cellValue } from '../server/attendance_report.js';
import { confirmFaceMatches } from '../server/face_consensus.js';
import { ensureCurrent } from '../server/current_attendance.js';
import type { Native } from '../server/native.js';

// ---------------------------------------------------------------- utilidades
const PERIODO = 'AGO-DIC 2026';
const block = { materia: 'LAR105', grupo: 'LAR-101', periodo: PERIODO, starts: 1000, ends: 4600 };
type Sched = { id: number; offering_id: number; starts: number; ends: number; cancelled?: number; closed?: number; group_code?: string };

/** Núcleo nativo simulado con estado, latencia opcional y registro de llamadas. */
function fakeNative(opts: { schedules?: Sched[]; rooms?: any[]; delayMs?: number } = {}) {
  const calls: { op: string; params: any[] }[] = [];
  const schedules: Sched[] = opts.schedules ?? [];
  const rooms = opts.rooms ?? [{ id: 9, name: 'Registro de asistencia (docente 7)' }];
  let nextId = 100;
  const native = {
    async call(op: string, params: any[] = []) {
      calls.push({ op, params });
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      switch (op) {
        case 'subjects': return [{ id: 1, code: 'LAR105', name: 'Prácticas' }, { id: 2, code: 'FIN101', name: 'Finanzas' }];
        case 'groups': return [{ id: 2, code: 'LAR-101' }, { id: 3, code: 'FIN-201' }];
        case 'offerings': return [
          { id: 3, teacher_id: 7, subject_id: 1, group_id: 2, term: PERIODO },
          { id: 4, teacher_id: 7, subject_id: 2, group_id: 3, term: PERIODO },
          { id: 5, teacher_id: 8, subject_id: 1, group_id: 2, term: PERIODO },
          { id: 6, teacher_id: 7, subject_id: 1, group_id: 2, term: 'ENE-MAY 2027' },
        ];
        case 'schedules': return schedules.map((s) => ({ ...s }));
        case 'rooms': return rooms;
        case 'room_create': { const id = nextId++; rooms.push({ id, name: params[0] }); return { id }; }
        case 'schedule_create': {
          // Reproduce el trigger schedule_conflict del esquema (mismo docente).
          if (schedules.some((s) => s.starts < params[3] && s.ends > params[2])) throw Error('schedule conflict');
          const id = nextId++; schedules.push({ id, offering_id: params[0], starts: params[2], ends: params[3] }); return { id };
        }
      }
      throw Error('op no simulada: ' + op);
    },
  } as unknown as Native;
  const count = (op: string) => calls.filter((c) => c.op === op).length;
  return { native, calls, schedules, rooms, count };
}
const worker = (blocks: any[]) => async () => blocks;

// ----------------------------------------------------- reporte mensual (matriz)
describe('Reporte mensual de asistencia', () => {
  const base = { group: 'LAR-101', subject: 'LAR105', date: '2026-10-12' };
  const lista = [{ kind: 'lista', context: { grupo: 'LAR-101' }, roster: [{ matricula: '002' }, { matricula: '001' }] }];

  test('cellValue: mapeo completo de estados', () => {
    assert.equal(cellValue('present'), 1);
    assert.equal(cellValue('excused'), 'J');
    assert.equal(cellValue('absent'), 0);
    assert.equal(cellValue('Falta'), 0);
    assert.equal(cellValue('Pendiente'), null);
    assert.equal(cellValue('Cancelada'), null);
    assert.equal(cellValue(undefined), 0, 'estado desconocido cuenta como falta, nunca como asistencia');
  });

  test('Falta justificada no suma faltas (coherente con la vista absence_totals)', () => {
    const rows = ['present', 'excused', 'absent', 'excused'].map((status, i) => ({ ...base, number: '001', name: 'A', starts: i * 10, ends: i * 10 + 5, status }));
    const [g] = monthlyMatrix(rows, lista);
    const s = g.students[0];
    assert.equal(s.total_attendance, 1);
    assert.equal(s.total_absence, 1);
    assert.equal(s.total_excused, 2);
    assert.deepEqual(Object.values(s.values), [1, 'J', 0, 'J']);
  });

  test('Columnas en orden cronológico aunque las filas lleguen desordenadas', () => {
    const rows = [300, 100, 200].map((starts) => ({ ...base, number: '001', name: 'A', starts, ends: starts + 50, status: 'present' }));
    const [g] = monthlyMatrix(rows, []);
    assert.deepEqual(g.columns.map((c) => c.starts), [100, 200, 300]);
  });

  test('Separa grupo/materia y ordena por número de lista oficial', () => {
    const rows = [
      { ...base, number: '001', name: 'Zeta', starts: 1, ends: 2, status: 'present' },
      { ...base, number: '002', name: 'Alfa', starts: 1, ends: 2, status: 'absent' },
      { ...base, number: '003', name: 'Beta', starts: 1, ends: 2, status: 'absent' },
      { ...base, subject: 'FIN101', number: '001', name: 'Zeta', starts: 5, ends: 6, status: 'present' },
    ];
    const matrix = monthlyMatrix(rows, lista);
    assert.equal(matrix.length, 2);
    const lar = matrix.find((g) => g.subject === 'LAR105')!;
    assert.deepEqual(lar.students.map((s) => [s.number, s.list_number]), [['002', 1], ['001', 2], ['003', null]]);
  });

  test('Fuentes incompletas (sin context/roster) no tumban el reporte', () => {
    const rows = [{ ...base, number: '001', name: 'A', starts: 1, ends: 2, status: 'present' }];
    const sources = [{ kind: 'lista' }, { kind: 'horario', context: {} }, null, { kind: 'lista', roster: [{ grupo: 'LAR-101', matricula: '001' }] }];
    const [g] = monthlyMatrix(rows, sources as any);
    assert.equal(g.students[0].list_number, 1);
  });

  test('Registros duplicados no duplican totales; matriz vacía sin filas', () => {
    const r = { ...base, number: '001', name: 'A', starts: 1, ends: 2, status: 'absent' };
    const [g] = monthlyMatrix([r, r, r], []);
    assert.equal(g.students[0].total_absence, 1);
    assert.deepEqual(monthlyMatrix([], []), []);
  });

  test('Rendimiento: 40 alumnos × 60 sesiones en < 250 ms', () => {
    const rows = [];
    for (let s = 0; s < 60; s++) for (let a = 0; a < 40; a++)
      rows.push({ ...base, number: String(a).padStart(3, '0'), name: 'N' + a, starts: s * 100, ends: s * 100 + 50, status: a % 5 ? 'present' : 'absent' });
    const t = performance.now();
    const [g] = monthlyMatrix(rows, lista);
    assert.ok(performance.now() - t < 250, 'matriz demasiado lenta');
    assert.equal(g.students.length, 40);
    assert.equal(g.students.reduce((n, s) => n + s.total_absence, 0), 8 * 60);
  });
});

// ------------------------------------------------- consenso facial (biometría)
describe('Consenso facial temporal', () => {
  const ok = { studentId: 7, score: 0.8, margin: 0.2 };

  test('Acepta exactamente en los límites (score = umbral, margen = mínimo)', () => {
    const edge = { studentId: 7, score: 0.55, margin: 0.08 };
    const r = confirmFaceMatches([edge, edge, edge], 0.55, 0.08, 3);
    assert.equal(r.studentId, 7);
    assert.ok(Math.abs(r.meanScore - 0.55) < 1e-12);
  });

  test('Calcula la media de puntuaciones de las capturas', () => {
    const r = confirmFaceMatches([{ ...ok, score: 0.6 }, { ...ok, score: 0.9 }, { ...ok, score: 0.9 }], 0.55, 0.08, 3);
    assert.ok(Math.abs(r.meanScore - 0.8) < 1e-12);
  });

  test('Modo de captura única: 1 coincidencia esperada', () => {
    assert.equal(confirmFaceMatches([ok], 0.55, 0.08, 1).studentId, 7);
    assert.throws(() => confirmFaceMatches([ok, ok], 0.55, 0.08, 1));
  });

  test('Falla en cerrado con configuración inválida (NaN, fuera de rango)', () => {
    for (const [th, mg, exp] of [[NaN, 0.08, 3], [0.55, NaN, 3], [0, 0.08, 3], [1.5, 0.08, 3], [0.55, -0.1, 3], [0.55, 0.08, 0], [0.55, 0.08, 2.5], [Infinity, 0.08, 3]])
      assert.throws(() => confirmFaceMatches([ok, ok, ok], th, mg, exp), /Configuración biométrica inválida/, `debe rechazar th=${th} mg=${mg} exp=${exp}`);
  });

  test('Rechaza lista vacía, entradas nulas y IDs no enteros', () => {
    assert.throws(() => confirmFaceMatches([], 0.55, 0.08, 1));
    assert.throws(() => confirmFaceMatches([ok, null as any, ok], 0.55, 0.08, 3));
    assert.throws(() => confirmFaceMatches([ok, ok, { ...ok, studentId: 7.5 }], 0.55, 0.08, 3));
    assert.throws(() => confirmFaceMatches([{ ...ok, score: Infinity }], 0.55, 0.08, 1));
  });

  test('Propiedad: si cualquiera de 3 capturas apunta a otro alumno, se rechaza', () => {
    for (let pos = 0; pos < 3; pos++) {
      const m = [ok, ok, ok].map((x, i) => (i === pos ? { ...x, studentId: 8 } : x));
      assert.throws(() => confirmFaceMatches(m, 0.55, 0.08, 3));
    }
  });
});

// ---------------------------------------------- clase vigente (ensureCurrent)
describe('Selección de la clase vigente', () => {
  test('Sin clases en el horario: mensaje y sin consultas al núcleo', async () => {
    const f = fakeNative();
    const r = await ensureCurrent(f.native, 7, undefined, worker([]));
    assert.deepEqual(r.active, []);
    assert.match(r.message, /No hay una clase/);
    assert.equal(f.calls.length, 0);
  });

  test('Envía al horario la hora actual en segundos y el docente', async () => {
    const f = fakeNative();
    let seen: any;
    const before = Date.now() / 1000;
    await ensureCurrent(f.native, 7, undefined, async (req: any) => { seen = req; return [block]; });
    assert.equal(seen.action, 'current_weekly');
    assert.equal(seen.teacherId, 7);
    assert.ok(seen.timestamp >= before - 1 && seen.timestamp <= Date.now() / 1000 + 1, 'timestamp en segundos, no milisegundos');
  });

  test('Crea el aula interna una sola vez si no existe', async () => {
    const f = fakeNative({ rooms: [] });
    const r = await ensureCurrent(f.native, 7, 3, worker([block]));
    assert.equal(r.active.length, 1);
    assert.equal(f.count('room_create'), 1);
    assert.equal(f.rooms[0].name, 'Registro de asistencia (docente 7)');
    await ensureCurrent(f.native, 7, 3, worker([block]));
    assert.equal(f.count('room_create'), 1);
  });

  test('Clase ya cerrada o cancelada: mensaje correcto y sin crear sesión', async () => {
    for (const flag of [{ closed: 1 }, { cancelled: 1 }]) {
      const f = fakeNative({ schedules: [{ id: 50, offering_id: 3, starts: block.starts, ends: block.ends, ...flag }] });
      const r = await ensureCurrent(f.native, 7, 3, worker([block]));
      assert.deepEqual(r.active, []);
      assert.match(r.message, /cerrada o cancelada/);
      assert.equal(f.count('schedule_create'), 0);
    }
  });

  test('Otro grupo ya confirmado en el bloque: error claro, sin error SQL', async () => {
    const f = fakeNative({ schedules: [{ id: 50, offering_id: 3, starts: block.starts, ends: block.ends, group_code: 'LAR-101' }] });
    await assert.rejects(ensureCurrent(f.native, 7, 4, worker([block])), /ya está confirmado para otro grupo \(LAR-101\)/);
    assert.equal(f.count('schedule_create'), 0);
  });

  test('Bloque traslapado parcialmente con otro grupo también se detecta', async () => {
    const f = fakeNative({ schedules: [{ id: 50, offering_id: 3, starts: block.starts + 1800, ends: block.ends + 1800 }] });
    await assert.rejects(ensureCurrent(f.native, 7, 4, worker([block])), /otro grupo/);
  });

  test('Una sesión cancelada de otro grupo no bloquea la confirmación', async () => {
    const f = fakeNative({ schedules: [{ id: 50, offering_id: 3, starts: block.starts, ends: block.ends, cancelled: 1 }] });
    // El fake reproduce el trigger, que no distingue canceladas; se limpia para aislar la lógica TS.
    const origCall = (f.native as any).call;
    (f.native as any).call = async (op: string, p: any[]) => op === 'schedule_create' ? (f.schedules.push({ id: 77, offering_id: p[0], starts: p[2], ends: p[3] }), { id: 77 }) : origCall(op, p);
    const r = await ensureCurrent(f.native, 7, 4, worker([block]));
    assert.deepEqual(r.active, [77]);
  });

  test('Rechaza oferta de otro docente, de otro período o bloque sin asignación', async () => {
    const f = fakeNative();
    await assert.rejects(ensureCurrent(f.native, 7, 5, worker([block])), /no pertenece/);
    await assert.rejects(ensureCurrent(f.native, 7, 6, worker([block])), /no pertenece/);
    await assert.rejects(ensureCurrent(f.native, 7, 3, worker([{ ...block, materia: 'XXX999' }])), /no tiene asignación/);
    assert.equal(f.count('schedule_create'), 0);
  });

  test('Concurrencia: 10 confirmaciones simultáneas crean UNA sola sesión', async () => {
    const f = fakeNative({ delayMs: 2 });
    const results = await Promise.all(Array.from({ length: 10 }, () => ensureCurrent(f.native, 7, 3, worker([block]))));
    assert.equal(f.count('schedule_create'), 1);
    const ids = new Set(results.flatMap((r) => r.active));
    assert.equal(ids.size, 1, 'todas las respuestas apuntan a la misma sesión');
  });

  test('Un fallo no bloquea la cola: la siguiente petición se atiende', async () => {
    const f = fakeNative();
    const failing = ensureCurrent(f.native, 7, 3, async () => { throw Error('horario ilegible'); });
    const next = ensureCurrent(f.native, 7, 3, worker([block]));
    await assert.rejects(failing, /horario ilegible/);
    assert.equal((await next).active.length, 1);
  });
});
