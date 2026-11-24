// Avance de Last Planner marcado en el plano: % por recinto, cantidad repartida sola, sin asistencia obligatoria y con
// corrección (bajar el %) mediante «sustituye». Modelo y, si hay PGlite, el SQL real de Supabase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from './dist/lastplanner-cycle-model.mjs';
const actor = {id: '11111111-1111-4111-8111-111111111111', email: 'inspector@example.test', role: 'editor'};
const room = (id, code, n) => Array.from({length: n}, (_, i) => ({id: id + '-s' + i, roomId: id, code, name: 'Recinto ' + code, tipo: 'recinto', level: 'N02', label: 'Recinto completo', geometry: null}));
const values = {actividad: 'Tapado Cielo Duro QA', level: 'N02', responsable: 'Valencia', contratista: 'Valencia', especialidad: 'Tabiquería',
  inicioPlan: '2026-11-16', finPlan: '2026-11-20', cantidad: 10, unidad: 'un',
  recintos: [{id: 'r1', code: 'R-01'}, {id: 'r2', code: 'R-02'}], alcances: [...room('r1', 'R-01', 2), ...room('r2', 'R-02', 1)]};
let tests = 0; const check = (name, fn) => { fn(); tests++; console.log('✓ ' + name); };
const draft = C.createDraft(values, actor), emision = C.publishWeek([draft], draft.semana, draft.level, actor);
let a = emision.activities[0];
const marcar = (act, roomId, pct, date = '2026-11-20') => C.recordExecution(act, C.planProgressValues(act, roomId, pct / 100, date), [], [], actor);

check('La cantidad se reparte por recinto y superficie: 50 % de R-01 = 2,5 un', () => {
  assert.equal(C.roomShare(a, 'r1'), 5);
  const v = C.planProgressValues(a, 'r1', 0.5, '2026-11-20');
  assert.equal(v.cantidad, 2.5); assert.deepEqual(v.alcances.map(s => s.cantidad), [1.25, 1.25]); assert.equal(v.origen, 'plano'); assert.equal(v.sustituye, undefined);
});
check('Sin asistencia vinculada se guarda y queda marcado', () => {
  a = marcar(a, 'r1', 50);
  const e = a.ejecuciones.at(-1);
  assert.equal(e.sinAsistencia, true); assert.equal(C.roomProgress(a, 'r1'), 0.5); assert.equal(C.executed(a), 2.5); assert.equal(a.estado, 'En ejecución');
});
check('Subir a 100 % reemplaza el marcado anterior del plano', () => {
  const antes = a.ejecuciones.at(-1).id; a = marcar(a, 'r1', 100);
  assert.equal(a.ejecuciones.at(-1).sustituye, antes); assert.equal(C.roomProgress(a, 'r1'), 1); assert.equal(C.executed(a), 5);
});
check('Bajar a 25 % también se puede (corrección con motivo)', () => {
  a = marcar(a, 'r1', 25);
  assert.equal(C.roomProgress(a, 'r1'), 0.25); assert.equal(C.executed(a), 1.25); assert.ok(a.ejecuciones.at(-1).motivo);
});
check('Otro recinto suma aparte y nunca pasa lo comprometido', () => {
  a = marcar(a, 'r2', 100);
  assert.equal(C.roomProgress(a, 'r2'), 1); assert.equal(C.executed(a), 6.25);
  a = marcar(a, 'r1', 100); assert.equal(C.executed(a), 10);
});
check('Asistencia vinculada sigue validándose si se informa', () => {
  assert.throws(() => C.recordExecution(a, {...C.planProgressValues(a, 'r2', 1, '2026-11-20'), asistenciaIds: ['no-existe']}, [], [], actor), /asistencia/);
});
check('Un recinto fuera de la actividad se rechaza', () => { assert.throws(() => C.planProgressValues(a, 'r9', 0.5, '2026-11-20'), /no es parte/); });

if (process.env.PGLITE_MODULE) {
  const {cloudFixture, QA_ACTOR, requestFor} = await import('./test-support/lastplanner-cloud.mjs');
  const cloud = await cloudFixture();
  try {
    await cloud.db.exec(fs.readFileSync('supabase/lastplanner-4.sql', 'utf8'));
    const d = C.createDraft({...values, actividad: 'Avance en plano SQL'}, QA_ACTOR);
    await cloud.rpc(requestFor('draft', [{table: 'actividades', id: d.id, data: d, expectedRemote: 0}]));
    const em = C.publishWeek([d], d.semana, d.level, QA_ACTOR);
    await cloud.rpc(requestFor('publish', [{table: 'actividades', id: d.id, data: em.activities[0], expectedRemote: 1}, {table: 'semanas', id: em.plan.id, data: em.plan, expectedRemote: 0}]));
    let p = em.activities[0], version = 2;
    for (const [roomId, pct] of [['r1', 50], ['r1', 100], ['r1', 25], ['r2', 100]]) {
      p = C.recordExecution(p, C.planProgressValues(p, roomId, pct / 100, '2026-11-20'), [], [], QA_ACTOR);
      await cloud.rpc(requestFor('execution', [{table: 'actividades', id: p.id, data: p, expectedRemote: version}])); version++;
    }
    const guardada = (await cloud.rows()).find(r => r.id === d.id).data;
    assert.equal(C.executed(guardada), 6.25); assert.equal(C.roomProgress(guardada, 'r1'), 0.25);
    tests++; console.log('✓ SQL real (PGlite): publicar y marcar 50 → 100 → 25 % sin asistencia');
  } finally { await cloud.close(); }
} else console.log('(SQL omitido: falta PGLITE_MODULE)');
console.log('Avance en el plano: ' + tests + ' comprobaciones aprobadas');
