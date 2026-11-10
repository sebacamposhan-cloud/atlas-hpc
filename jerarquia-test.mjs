// Modelo de jerarquía de obra (dist/jerarquia-model.mjs): cadena de mando, asignación, funciones por nivel, estados y
// avance que sube del hijo al padre. Personas de ejemplo con identificadores ficticios; ningún nombre real.
import assert from 'node:assert/strict';
import * as J from './dist/jerarquia-model.mjs';
import * as C from './dist/lastplanner-cycle-model.mjs';

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const fila = (n, nivel, jefe, extra = {}) => ({user_id: id(n), nombre: 'Persona de ejemplo ' + n, cargo: '', nivel, area: 'linea', jefe: jefe ? id(jefe) : null, pisos: [], activo: true, ...extra});
// 0 gerencia; 1 jefe general; 2 jefes de terreno (3); 3 jefes de terreno B (5); 4 supervisor y capataz de subcontrato.
const filas = [fila(1, 0), fila(2, 1, 1), fila(3, 2, 2), fila(4, 2, 2), fila(5, 2, 2), fila(6, 3, 3), fila(7, 3, 3), fila(8, 3, 4), fila(9, 3, 5), fila(10, 3, 5),
  fila(11, 4, 6, {pisos: ['N01']}), fila(12, 4, 6, {pisos: ['N01'], empresa: 'Subcontrato de ejemplo'}), fila(13, 4, 8),
  {user_id: id(20), nombre: 'Planificación de ejemplo', nivel: null, area: 'planificacion', jefe: id(1)}, {user_id: id(21), nombre: 'Calidad de ejemplo', nivel: null, area: 'calidad'}];
const personas = filas.map(J.perfilDesdeFila);
assert.ok(personas.every(Boolean), 'todas las filas de ejemplo son perfiles válidos');
const P = n => personas.find(p => p.id === id(n));
const actor = (n, permisosCuenta = null) => ({id: id(n), email: 'cuenta' + n + '@example.test', role: 'editor', permissions: J.permisosLastPlanner(P(n), permisosCuenta)});
let pruebas = 0;
const t = (nombre, fn) => { fn(); pruebas++; };

t('perfiles', () => {
  assert.equal(J.perfilDesdeFila({...fila(30, null, 1)}), null, 'la cadena necesita nivel');
  assert.equal(J.perfilDesdeFila({user_id: id(31), area: 'calidad', nivel: 2}), null, 'Calidad no lleva nivel');
  assert.equal(J.perfilDesdeFila({user_id: 'no-uuid', nivel: 1}), null);
  assert.equal(J.perfilDesdeFila({...fila(32, 2, 32)}), null, 'nadie es su propio jefe');
  assert.deepEqual(P(11).pisos, ['N01']);
  assert.equal(J.cargoDe(P(3)), 'Jefe de terreno');
  assert.equal(J.cargoDe(P(20)), 'Planificación');
});

t('cadena de mando y equipo', () => {
  assert.deepEqual(J.cadena(personas, id(11)), [id(6), id(3), id(2), id(1)]);
  assert.deepEqual([...J.equipo(personas, id(3))].sort(), [id(6), id(7), id(11), id(12)].sort());
  assert.equal(J.equipo(personas, id(2)).size, 11, 'el jefe general tiene a toda la cadena bajo él');
  assert.deepEqual(J.directos(personas, id(5)).map(p => p.id), [id(9), id(10)]);
  assert.ok(J.esSuperior(personas, id(3), id(11)) && !J.esSuperior(personas, id(4), id(11)) && !J.esSuperior(personas, id(11), id(11)));
  // Un ciclo cargado por error no cuelga la cadena.
  const ciclo = [{...P(3), jefe: id(6)}, {...P(6)}];
  assert.deepEqual(J.cadena(ciclo, id(6)), [id(3)]);
});

t('quién asigna a quién', () => {
  assert.ok(J.puedeAsignar(personas, id(2), id(3)), 'jefe general → jefe de terreno');
  assert.ok(J.puedeAsignar(personas, id(3), id(6)), 'jefe de terreno → jefe de terreno B');
  assert.ok(J.puedeAsignar(personas, id(6), id(11)) && J.puedeAsignar(personas, id(6), id(12)), 'jefe B → supervisor y capataz');
  assert.match(J.motivoNoAsigna(personas, id(1), id(2)), /no asigna/, 'gerencia ve todo y no asigna');
  assert.match(J.motivoNoAsigna(personas, id(2), id(6)), /directamente/, 'no salta niveles');
  assert.ok(J.puedeAsignar(personas, id(2), id(6), {saltar: true}), 'la constante permite saltar niveles');
  assert.equal(J.SALTAR_NIVELES, false);
  assert.match(J.motivoNoAsigna(personas, id(11), id(12)), /no asigna/, 'el nivel 4 ejecuta');
  assert.match(J.motivoNoAsigna(personas, id(6), id(7)), /directamente/, 'entre pares no se asigna');
  assert.match(J.motivoNoAsigna(personas, id(1), id(20)), /no asigna/);
  assert.match(J.motivoNoAsigna(personas, id(20), id(2)), /no asigna/, 'Planificación está fuera de la cadena');
  assert.match(J.motivoNoAsigna([...personas.filter(p => p.id !== id(11)), {...P(11), activo: false}], id(6), id(11)), /perfil activo/);
  assert.deepEqual(J.asignables(personas, id(6)).map(p => p.id), [id(11), id(12)]);
});

t('funciones por nivel', () => {
  assert.equal(J.funcionesDe(null), null, 'sin perfil, todo como hoy');
  assert.equal(J.funcionesDe({...P(3), activo: false}), null);
  assert.deepEqual(J.funcionesDe(P(11)).tareas, ['mias']);
  // Desde 2026-11-09 el supervisor o capataz abre Last Planner para su reporte diario; sus permisos los acota PERMISOS_NIVEL.
  assert.ok(J.funcionesDe(P(11)).tarjetas.includes('lastplanner'), 'Last Planner para el reporte diario');
  assert.deepEqual(J.PERMISOS_NIVEL[4], ['execution', 'attendance', 'restriction', 'evidence'], 'sin planificar ni verificar');
  assert.deepEqual(J.funcionesDe(P(11)).funciones.herramientas, ['proyectos', 'mas'], 'Proyectos completo');
  assert.ok(J.funcionesDe(P(11)).tarjetas.includes('puertas') && J.funcionesDe(P(3)).tarjetas.includes('puertas'), 'Puertas para todos');
  assert.deepEqual(J.funcionesDe(P(2)).tareas, ['asignar', 'equipo']);
  assert.deepEqual(J.funcionesDe(P(3)).tareas, ['mias', 'asignar', 'equipo']);
  assert.deepEqual(J.funcionesDe(P(1)).tareas, ['equipo']);
  assert.deepEqual(J.funcionesDe(P(20)).tareas, ['equipo']);
  assert.ok(J.funcionesDe(P(3)).tarjetas.includes('lastplanner'));
  assert.ok(J.pisoVisible(P(11), 'N01') && !J.pisoVisible(P(11), 'N02') && J.pisoVisible(P(13), 'N02') && J.pisoVisible(P(3), 'N03') && J.pisoVisible(null, 'N02'));
});

t('tope de permisos de Last Planner', () => {
  assert.equal(J.permisosLastPlanner(null, null), null, 'sin perfil no cambia');
  assert.deepEqual(J.permisosLastPlanner(null, ['draft']), ['draft']);
  assert.deepEqual(J.permisosLastPlanner(P(1), null), [], 'gerencia solo mira');
  assert.deepEqual(J.permisosLastPlanner(P(11), null), ['execution', 'attendance', 'restriction', 'evidence']);
  assert.deepEqual(J.permisosLastPlanner(P(11), ['attendance', 'publish']), ['attendance'], 'nunca da más que la cuenta');
  assert.deepEqual(J.permisosLastPlanner(P(3), null), C.PERMISSIONS);
  assert.deepEqual(J.permisosLastPlanner(P(21), null), ['restriction', 'evidence', 'verify']);
  assert.equal(C.allowed(actor(1), 'publish'), false);
});

// Frente de ejemplo: dos superficies del mismo recinto, 30 y 10 m².
const superficie = (n, m2) => ({id: 'r1|pavimentos|' + n, roomId: 'r1', code: 'R-EJEMPLO', tipo: 'pavimentos', level: 'N01', geometry: {type: 'polygon', points: [[0, 0], [n, 0], [n, n]]}, measurement: {value: m2, unit: 'm²', source: 'ejemplo'}});
const frente = [superficie(1, 30), superficie(2, 10)];
let m1, m2, m3;
t('asignar por la cadena', () => {
  m1 = J.crearMeta({asignadaA: id(3), titulo: 'Terminaciones ala norte (ejemplo)', piso: 'N01'}, actor(2), personas);
  assert.equal(m1.estado, 'asignada'); assert.equal(m1.asignadaPor, id(2)); assert.equal(m1.version, 1);
  m2 = J.crearMeta({asignadaA: id(6), titulo: 'Pavimentos ala norte (ejemplo)', piso: 'N01', padre: m1.id}, actor(3), personas, [m1]);
  m3 = J.crearMeta({asignadaA: id(11), titulo: 'Pavimento recinto de ejemplo', piso: 'N01', padre: m2.id, alcances: frente, fechaLimite: '2026-11-06'}, actor(6), personas, [m1, m2]);
  assert.throws(() => J.crearMeta({asignadaA: id(6), titulo: 'Saltando', piso: 'N01'}, actor(2), personas), /directamente/);
  assert.throws(() => J.crearMeta({asignadaA: id(11), titulo: 'Otro piso', piso: 'N02'}, actor(6), personas), /piso/);
  assert.throws(() => J.crearMeta({asignadaA: id(11), titulo: 'Sin piso'}, actor(6), personas), /piso/);
  assert.throws(() => J.crearMeta({asignadaA: id(12), titulo: 'De una tarea ajena', piso: 'N01', padre: m3.id}, actor(6), personas, [m3]), /asignaron a ti/);
  assert.throws(() => J.crearMeta({asignadaA: id(7), titulo: 'De otro piso', piso: 'N02', padre: m1.id}, actor(3), personas, [m1]), /piso de la tarea recibida/);
  assert.throws(() => J.crearMeta({asignadaA: id(11), titulo: 'ab', piso: 'N01'}, actor(6), personas), /3 a 200/);
  assert.throws(() => J.crearMeta({asignadaA: id(3), titulo: 'Sin permiso de borrador', piso: 'N01'}, actor(2, ['execution']), personas), /permiso/);
});

t('ver solo lo suyo y lo de su equipo', () => {
  const ve = (n, m) => J.puedeVerMeta(personas, id(n), m);
  assert.ok(ve(1, m3) && ve(20, m3) && ve(21, m3), 'gerencia, Planificación y Calidad ven todo');
  assert.ok(ve(2, m3) && ve(3, m3) && ve(6, m3) && ve(11, m3), 'la cadena de arriba ve la tarea');
  assert.ok(!ve(4, m3) && !ve(7, m3) && !ve(12, m3), 'otros equipos y pares no la ven');
  assert.ok(!J.puedeVerMeta([...personas.filter(p => p.id !== id(11)), {...P(11), activo: false}], id(11), m3), 'un perfil inactivo no ve tareas');
});

t('marcar, devolver y confirmar', () => {
  assert.throws(() => J.marcarAvance(m3, {marcas: {[frente[0].id]: 1}}, actor(12)), /recibió/);
  assert.throws(() => J.marcarAvance(m3, {marcas: {'otra': 1}}, actor(11)), /frente/);
  const t1 = J.marcarAvance(m3, {marcas: {[frente[0].id]: 1}}, actor(11));
  assert.equal(t1.estado, 'en_curso'); assert.equal(J.avancePropio(t1), .75, '30 de 40 m²');
  const todas = () => [m1, m2, m3];
  m3 = t1;
  assert.equal(J.avanceMeta(m2, todas()), .75, 'sube al jefe B');
  assert.equal(J.avanceMeta(m1, todas()), .75, 'y al jefe de terreno');
  assert.deepEqual(J.pendientes(todas(), id(11)), {porHacer: 1, porConfirmar: 0, total: 1});
  m3 = J.marcarHecha(m3, actor(11), {nota: 'Listo'});
  assert.equal(J.avanceMeta(m1, todas()), 1);
  assert.deepEqual(J.pendientes(todas(), id(6)), {porHacer: 1, porConfirmar: 1, total: 2});
  assert.throws(() => J.confirmarMeta(m3, actor(11), personas), /permiso/, 'el nivel 4 no tiene permiso de verificar');
  assert.throws(() => J.confirmarMeta(m3, actor(4), personas), /La confirma/, 'otro jefe de terreno no la confirma');
  assert.throws(() => J.devolverMeta(m3, '', actor(6), personas), /falta/);
  m3 = J.devolverMeta(m3, 'Falta el remate junto a la puerta', actor(6), personas);
  assert.equal(m3.estado, 'devuelta'); assert.equal(J.avanceMeta(m1, todas()), .75, 'al devolver vuelve a lo marcado');
  m3 = J.marcarAvance(m3, {marcas: {[frente[1].id]: 1}}, actor(11));
  m3 = J.marcarHecha(m3, actor(11));
  m3 = J.confirmarMeta(m3, actor(3), personas);
  assert.equal(m3.estado, 'confirmada', 'la jefatura de quien asignó también confirma');
  assert.throws(() => J.marcarAvance(m3, {marcas: {[frente[0].id]: 0}}, actor(11)), /abierta/);
  assert.deepEqual(m3.historial.map(h => h.operacion), ['Asignar tarea', 'Marcar avance', 'Marcar hecha', 'Devolver tarea', 'Marcar avance', 'Marcar hecha', 'Confirmar tarea']);
  const sin = J.marcarAvance(J.crearMeta({asignadaA: id(13), titulo: 'Tarea sin frente'}, actor(8), personas), {avanceManual: .5}, actor(13));
  assert.equal(J.avancePropio(sin), .5);
});

t('reasignar y anular', () => {
  let m = J.crearMeta({asignadaA: id(11), titulo: 'Sello cortafuego (ejemplo)', piso: 'N01', alcances: frente}, actor(6), personas);
  m = J.marcarAvance(m, {marcas: {[frente[0].id]: .5}}, actor(11));
  assert.throws(() => J.reasignarMeta(m, id(12), 'Ausente', actor(7), personas), /jefatura/);
  assert.throws(() => J.reasignarMeta(m, id(12), '', actor(6), personas), /por qué/);
  const r = J.reasignarMeta(m, id(12), 'Persona ausente', actor(6), personas);
  assert.equal(r.asignadaA, id(12)); assert.equal(r.estado, 'asignada'); assert.deepEqual(r.marcas, m.marcas, 'lo marcado se conserva');
  assert.throws(() => J.marcarAvance(r, {marcas: {[frente[1].id]: 1}}, actor(11)), /recibió/);
  assert.throws(() => J.anularMeta(r, 'Cambio de plan', actor(12), personas), /permiso/);
  assert.throws(() => J.anularMeta(r, 'Cambio de plan', actor(7), personas), /La anula/, 'un par no la anula');
  const a = J.anularMeta(r, 'Cambio de plan', actor(6), personas);
  assert.equal(a.estado, 'anulada');
  assert.equal(J.resumen([a]).total, 0, 'una anulada no cuenta');
});

t('control del servidor sobre lo enviado', () => {
  const base = J.crearMeta({asignadaA: id(11), titulo: 'Pavimento (ejemplo)', piso: 'N01', alcances: frente}, actor(6), personas);
  assert.equal(J.validarMutacion(null, base, 'asignar', actor(6), personas), base);
  assert.throws(() => J.validarMutacion(null, base, 'asignar', actor(3), personas), /directamente|coincide/, 'otra cuenta no firma lo de otra');
  const salto = {...base, asignadaPor: id(2), historial: base.historial.map(h => ({...h, actor: id(2), autor: 'cuenta2@example.test'})), autor: 'cuenta2@example.test'};
  assert.throws(() => J.validarMutacion(null, salto, 'asignar', actor(2), personas), /directamente/);
  const avance = J.marcarAvance(base, {marcas: {[frente[0].id]: 1}}, actor(11));
  assert.equal(J.validarMutacion(base, avance, 'avanzar', actor(11), personas), avance);
  const dos = J.marcarAvance(avance, {marcas: {[frente[1].id]: 1}}, actor(11));
  assert.equal(J.validarMutacion(avance, dos, 'avanzar', actor(11), personas), dos, 'las marcas anteriores conservan su fecha');
  const forzada = J.cambiar(base, {...base, estado: 'confirmada'}, actor(11), 'Marcar hecha');
  assert.throws(() => J.validarMutacion(base, forzada, 'hecha', actor(11), personas), /coincide/);
  const retitulo = J.cambiar(base, {...base, titulo: 'Otra cosa', estado: 'en_curso'}, actor(11), 'Marcar avance');
  assert.throws(() => J.validarMutacion(base, retitulo, 'avanzar', actor(11), personas), /no le corresponden/);
  assert.throws(() => J.validarMutacion(base, {...avance, historial: avance.historial.slice(1)}, 'avanzar', actor(11), personas), /historial/);
  assert.throws(() => J.validarMutacion(base, avance, 'avanzar', actor(12), personas), /usuario/);
  assert.throws(() => J.validarMutacion(avance, avance, 'avanzar', actor(11), personas), /otro equipo/);
  const hecha = J.marcarHecha(avance, actor(11));
  assert.throws(() => J.validarMutacion(hecha, J.confirmarMeta(hecha, actor(6), personas), 'confirmar', actor(4), personas), /usuario|La confirma/);
  assert.ok(J.validarMutacion(hecha, J.devolverMeta(hecha, 'Falta limpieza', actor(6), personas), 'devolver', actor(6), personas));
  assert.ok(J.validarMutacion(avance, J.reasignarMeta(avance, id(12), 'Ausente', actor(6), personas), 'reasignar', actor(6), personas));
  assert.ok(J.validarMutacion(avance, J.editarMeta(avance, {titulo: 'Pavimento y guardapolvo (ejemplo)', alcances: [frente[1]]}, actor(6), personas), 'editar', actor(6), personas));
  assert.deepEqual(J.editarMeta(avance, {alcances: [frente[1]]}, actor(6), personas).marcas, {}, 'las marcas de superficies quitadas se van');
});

t('resumen del equipo y contador', () => {
  const lista = [J.crearMeta({asignadaA: id(11), titulo: 'Tarea uno', piso: 'N01'}, actor(6), personas), J.marcarHecha(J.crearMeta({asignadaA: id(12), titulo: 'Tarea dos', piso: 'N01'}, actor(6), personas), actor(12))];
  lista.push(J.confirmarMeta(lista[1], actor(6), personas));
  lista.splice(1, 1);
  const filasEquipo = J.resumenEquipo(personas, lista, id(6));
  assert.deepEqual(filasEquipo.map(f => [f.persona.id, f.total, f.cumplimiento]), [[id(11), 1, 0], [id(12), 1, 1]]);
  assert.equal(J.resumen(lista).cumplimiento, .5);
  assert.deepEqual(J.resumenEquipo(personas, lista, id(20)).map(f => f.persona.id), [id(11), id(12)], 'Planificación ve a quienes tienen tareas');
  assert.ok(J.vencida({...lista[0], fechaLimite: '2026-11-01'}, '2026-11-04') && !J.vencida(lista[1], '2030-01-01'));
});

t('avance real de la actividad de Last Planner', () => {
  const qa = {id: id(6), email: 'cuenta6@example.test', role: 'editor'};
  const actividad = C.createDraft({actividad: 'Pavimento ejemplo', level: 'N01', responsable: 'Cuenta de ejemplo', inicioPlan: '2026-11-02', finPlan: '2026-11-06', cantidad: 40, unidad: 'm²', recintos: [{id: 'r1', code: 'R-EJEMPLO'}], alcances: frente}, qa);
  let m = J.crearMeta({asignadaA: id(11), titulo: 'Pavimento desde Last Planner', alcances: [frente[0]], actividadId: actividad.id}, actor(6), personas, [], {actividad});
  assert.equal(m.piso, 'N01', 'el piso sale de la actividad');
  assert.throws(() => J.crearMeta({asignadaA: id(11), titulo: 'Fuera de la actividad', alcances: [{...frente[0], id: 'otra|pavimentos|x'}], actividadId: actividad.id}, actor(6), personas, [], {actividad}), /dentro de la actividad/);
  assert.equal(J.avanceActividad(actividad, [m]).avance, 0);
  m = J.marcarAvance(m, {marcas: {[frente[0].id]: 1}}, actor(11));
  assert.equal(J.avanceActividad(actividad, [m]).avance, .75, 'lo marcado en terreno suma al avance real');
  const conLps = {...actividad, ejecuciones: [{id: 'e1', alcances: [{scopeId: frente[0].id, avance: .5, cantidad: 15}], cantidad: 15, validacion: {estado: 'Pendiente'}}]};
  assert.equal(J.avanceActividad(conLps, [m]).avance, .75, 'la misma superficie no se cuenta dos veces');
  assert.equal(J.avanceActividad(conLps, []).avance, .375);
});

// La sesión de este equipo (lastplanner-session.mjs) aplica el mismo tope con el perfil de la última sincronización.
{
  const guardado = {};
  globalThis.localStorage = {getItem: k => guardado[k] ?? null, setItem: (k, v) => { guardado[k] = String(v); }, removeItem: k => { delete guardado[k]; }};
  const S = await import('./dist/lastplanner-session.mjs');
  const jwt = n => 'x.' + Buffer.from(JSON.stringify({sub: id(n), email: 'cuenta' + n + '@example.test', app_metadata: {campo_role: 'editor'}})).toString('base64url') + '.y';
  localStorage.setItem(S.SESSION_KEY, JSON.stringify({token: jwt(11), user: {username: 'cuenta11@example.test', role: 'editor'}}));
  assert.equal(S.sessionActor().permissions, null, 'sin perfil guardado, como hoy');
  localStorage.setItem(S.PERFIL_KEY, JSON.stringify({id: id(11), perfil: P(11)}));
  assert.deepEqual(S.sessionActor().permissions, ['execution', 'attendance', 'restriction', 'evidence']);
  assert.equal(S.can('publish'), false); assert.equal(S.can('attendance'), true);
  localStorage.setItem(S.PERFIL_KEY, JSON.stringify({id: id(12), perfil: P(12)}));
  assert.equal(S.sessionActor().permissions, null, 'el perfil guardado de otra cuenta no se aplica');
  localStorage.setItem(S.PERFIL_KEY, JSON.stringify({id: id(11), perfil: {...P(11), activo: false}}));
  assert.equal(S.sessionActor().permissions, null, 'un perfil inactivo no topa');
  delete globalThis.localStorage;
  pruebas++;
}

console.log(`Jerarquía de obra: ${pruebas} grupos de pruebas aprobados (cadena, asignación, funciones, permisos, estados, avance y control del servidor).`);
