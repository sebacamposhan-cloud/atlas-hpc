import assert from 'node:assert/strict';
import * as M from './dist/lastplanner-model.mjs';

// Semanas ISO, días hábiles y desplazamiento entre semanas.
assert.equal(M.semanaDe('2026-10-29'), '2026-W44'); assert.equal(M.lunesDe('2026-W44'), '2026-10-26');
assert.equal(M.semanaDe('2027-01-01'), '2026-W53', 'el 1 de enero de 2027 pertenece a la semana 53 de 2026');
assert.equal(M.semanaDe('2026-01-01'), '2026-W01'); assert.equal(M.lunesDe('2026-W01'), '2025-12-29');
assert.equal(M.moverSemana('2026-W52', 2), '2027-W01'); assert.equal(M.moverSemana('2026-W01', -1), '2025-W52');
assert(M.esSemana('2026-W53')); assert(!M.esSemana('2025-W53'), '2025 no tiene semana 53'); assert(!M.esSemana('2026-44'));
assert.equal(M.diasHabiles('2026-10-26', '2026-11-01'), 5, 'lunes a domingo = 5 días hábiles'); assert.equal(M.diasHabiles('2026-10-31', '2026-11-01'), 0); assert.equal(M.diasHabiles('2026-10-30', '2026-10-26'), null);

// Alta de actividades: datos obligatorios, recintos del plano y restricciones.
const at = '2026-10-26T12:00:00.000Z', autor = 'Jefe de producción';
const recintos = [{id: 'n01-a501:1', code: '5.1.1.1.1-1', name: 'Oficina'}, {id: 'n01-a501:2', code: '5.1.1.1.2-1', name: 'Bodega'}];
const base = {actividad: ' Pintura asepsia media ', level: 'N01', sector: 'A', frente: 'Eje 5-7', recintos, responsable: ' Pinturas Sur ', semana: '2026-W44', inicioPlan: '2026-10-26', finPlan: '2026-10-28', cantidad: '120', unidad: 'm²', dotacion: '3', restricciones: []};
const a = M.nuevaActividad(base, {id: 'a1', autor, at});
assert.equal(a.actividad, 'Pintura asepsia media'); assert.equal(a.responsable, 'Pinturas Sur'); assert.equal(a.cantidad, 120); assert.equal(a.dotacion, 3); assert.equal(a.estado, 'Planificada');
assert.equal(a.historial[0].detalle, 'Comprometida en la semana 2026-W44');
for (const [campo, valor] of [['actividad', 'ab'], ['responsable', ' '], ['semana', '2026-W60'], ['finPlan', '2026-10-20'], ['dotacion', '2.5'], ['cantidad', '-1']]) assert.throws(() => M.nuevaActividad({...base, [campo]: valor}, {id: 'x', autor, at}), undefined, campo);
assert.throws(() => M.nuevaActividad({...base, recintos: [recintos[0], recintos[0]]}, {id: 'x', autor, at}), /repetido/);
assert.throws(() => M.nuevaActividad(base, {id: 'x', autor: '', at}), /quién registra/);

// Restricciones: pendiente → liberada con fecha; vencida si pasó el compromiso.
const r1 = M.nuevaRestriccion({tipo: 'Materiales', descripcion: 'Pintura epóxica en bodega', responsable: 'Bodega', compromiso: '2026-10-20'}, 'r1');
const r2 = M.nuevaRestriccion({tipo: 'Frente previo', descripcion: 'Retiro de andamios'}, 'r2');
assert.throws(() => M.nuevaRestriccion({tipo: 'Inventada', descripcion: 'x y'}, 'r3'), /tipo y descripción/);
const intermedia = M.nuevaActividad({...base, semana: null, restricciones: [r1, r2]}, {id: 'a2', autor, at});
assert.equal(intermedia.historial[0].detalle, 'Registrada en el plan intermedio');
assert(!M.liberada(intermedia)); assert(M.restriccionVencida(r1, '2026-10-27')); assert(!M.restriccionVencida(r2, '2026-10-27'), 'sin compromiso no vence');
const liberada1 = M.liberarRestriccion(intermedia, 'r1', {autor, fecha: '2026-10-27', at});
assert.equal(liberada1.restricciones[0].estado, 'Liberada'); assert.equal(liberada1.restricciones[0].liberada, '2026-10-27'); assert.equal(liberada1.version, 2);
const lista = M.liberarRestriccion(liberada1, 'r2', {autor, at});
assert(M.liberada(lista)); assert.equal(M.liberarRestriccion(lista, 'r2', {autor, at}).restricciones[1].estado, 'Pendiente', 'liberar de nuevo la reabre');
assert.throws(() => M.validarActividad({...lista, restricciones: [{...r1, estado: 'Liberada', liberada: null}]}), /fecha de liberación/);
assert.throws(() => M.cambiarEstado(intermedia, 'En ejecución', {}, {autor, at}), /compromete la actividad/, 'sin semana no se inicia');

// Edición: el historial nombra lo cambiado; una actividad cerrada no cambia de semana.
const editada = M.editarActividad(a, {...base, cantidad: 150}, {autor, at});
assert.equal(editada.cantidad, 150); assert.match(editada.historial.at(-1).detalle, /Editó cantidad/);
assert.equal(M.editarActividad(a, base, {autor, at}), a, 'sin cambios devuelve la misma actividad');
const comprometida = M.editarActividad(intermedia, {...base, semana: '2026-W45', ...M.ajustarFechasASemana(base, '2026-W45'), restricciones: intermedia.restricciones}, {autor, at});
assert.equal(comprometida.historial.at(-1).detalle, 'Comprometida en la semana 2026-W45');
assert.deepEqual([comprometida.inicioPlan, comprometida.finPlan], ['2026-11-02', '2026-11-04'], 'las fechas se mueven con la semana');

// Semana y fechas coherentes: lo comprometido se planifica dentro de su semana.
assert.throws(() => M.nuevaActividad({...base, inicioPlan: '2026-11-02', finPlan: '2026-11-03'}, {id: 'x', autor, at}), /dentro de la semana 44 \(26-10-2026 al 01-11-2026\)/);
assert.throws(() => M.editarActividad(a, {...base, semana: '2026-W45'}, {autor, at}), /dentro de la semana 45/, 'cambiar de semana sin mover las fechas no pasa');
assert.equal(M.nuevaActividad({...base, semana: null, inicioPlan: '2026-12-01', finPlan: '2026-12-20'}, {id: 'x', autor, at}).finPlan, '2026-12-20', 'en el plan intermedio las fechas son libres');
assert.deepEqual(M.ajustarFechasASemana({inicioPlan: '2026-10-29', finPlan: '2026-11-03'}, '2026-W50'), {inicioPlan: '2026-12-10', finPlan: '2026-12-13'}, 'conserva el día de la semana y no pasa del domingo');
assert.deepEqual(M.ajustarFechasASemana({inicioPlan: '2026-10-27', finPlan: '2026-10-28'}, '2026-W44'), {inicioPlan: '2026-10-27', finPlan: '2026-10-28'});
assert.deepEqual(M.ajustarFechasASemana({inicioPlan: null, finPlan: null}, '2026-W50'), {inicioPlan: null, finPlan: null});

// Dotación recomendada a partir del rendimiento por persona al día y los días hábiles disponibles.
assert.deepEqual(M.dotacionRecomendada(30, 10, 5), {personas: 1, exacta: 0.6, dias: 5, diasNecesarios: 3}, '30 m² a 10 m² por persona al día: 1 persona, 3 días');
assert.equal(M.dotacionRecomendada(120, 10, 3).personas, 4); assert.equal(M.dotacionRecomendada(150, 10, 5).personas, 3, 'justo al límite no suma una persona más');
assert.equal(M.dotacionRecomendada(30, 0, 5), null); assert.equal(M.dotacionRecomendada(null, 10, 5), null);
assert.equal(M.diasDisponibles(a), 3, 'lunes a miércoles'); assert.equal(M.diasDisponibles({...a, inicioPlan: null, finPlan: null}), 5, 'sin fechas, la semana completa'); assert.equal(M.diasDisponibles({...a, semana: null, inicioPlan: null, finPlan: null}), null);
const conRendimiento = M.editarActividad(a, {...base, rendimientoPlan: '12.5'}, {autor, at});
assert.equal(conRendimiento.rendimientoPlan, 12.5); assert.match(conRendimiento.historial.at(-1).detalle, /rendimiento por persona/);
assert.throws(() => M.nuevaActividad({...base, rendimientoPlan: '-3'}, {id: 'x', autor, at}), /rendimiento/);

// Cierre: cumplida exige el 100 %, fechas reales y calcula días hábiles; no cumplida exige causa.
const enCurso = M.cambiarEstado(a, 'En ejecución', {}, {autor, at, hoy: '2026-10-26'});
assert.equal(enCurso.inicioReal, '2026-10-26');
assert.throws(() => M.cambiarEstado(enCurso, 'Cumplida', {finReal: '2026-10-29', cantidadEjecutada: 100}, {autor, at}), /100 %/);
const cumplida = M.cambiarEstado(enCurso, 'Cumplida', {finReal: '2026-10-29'}, {autor, at});
assert.equal(cumplida.cantidadEjecutada, 120, 'sin cantidad ejecutada se toma la comprometida'); assert.equal(cumplida.diasReales, 4);
assert.throws(() => M.cambiarEstado(cumplida, 'En ejecución', {}, {autor, at}), /por qué se reabre/);
assert.equal(M.cambiarEstado(cumplida, 'En ejecución', {}, {autor, comentario: 'Faltó segunda mano', at}).finReal, null, 'reabrir borra el término');
assert.throws(() => M.cambiarEstado(a, 'No cumplida', {}, {autor, at}), /causa/);
assert.throws(() => M.validarActividad({...a, causa: 'Clima'}), /Solo una actividad no cumplida/);
const b = M.nuevaActividad({...base, actividad: 'Pintura asepsia media', responsable: 'Pinturas Sur', sector: 'B', cantidad: 80}, {id: 'a3', autor, at});
const noCumplida = M.cambiarEstado(M.cambiarEstado(b, 'En ejecución', {}, {autor, at, hoy: '2026-10-27'}), 'No cumplida', {causa: 'Material no disponible', cantidadEjecutada: 30, finReal: '2026-10-28'}, {autor, at});
assert.equal(noCumplida.causa, 'Material no disponible'); assert.equal(noCumplida.diasReales, 2); assert.match(noCumplida.historial.at(-1).detalle, /Material no disponible/);

// Avance sin cambio de estado: cantidades y fechas con historial; la causa solo en las no cumplidas.
const avance = M.registrarEjecucion(enCurso, {cantidadEjecutada: '60', hh: '24', causa: 'Clima'}, {autor, at});
assert.equal(avance.cantidadEjecutada, 60); assert.equal(avance.hh, 24); assert.equal(avance.causa, null, 'en ejecución no lleva causa'); assert.match(avance.historial.at(-1).detalle, /cantidad ejecutada, HH/);
assert.equal(M.registrarEjecucion(enCurso, {cantidadEjecutada: ''}, {autor, at}), enCurso, 'sin cambios devuelve la misma actividad');
assert.throws(() => M.registrarEjecucion(cumplida, {cantidadEjecutada: 50}, {autor, at}), /100 %/);
assert.equal(M.registrarEjecucion(noCumplida, {causa: 'Clima'}, {autor, at}).causa, 'Clima');
assert.throws(() => M.registrarEjecucion(noCumplida, {causa: ''}, {autor, at}), /causa/);

// Reprogramar: lo pendiente pasa a otra semana como actividad nueva; la original conserva su causa.
assert.throws(() => M.reprogramar(cumplida, '2026-W45', {id: 'x', autor, at}), /no cumplida/);
assert.throws(() => M.reprogramar(noCumplida, '2026-W44', {id: 'x', autor, at}), /posterior/);
const {original, nueva} = M.reprogramar(noCumplida, '2026-W45', {id: 'a4', autor, at});
assert.equal(original.reprogramada, '2026-W45'); assert.equal(original.estado, 'No cumplida');
assert.equal(nueva.cantidad, 50, 'se reprograma el saldo'); assert.equal(nueva.origen, 'a3'); assert.equal(nueva.inicioPlan, '2026-11-02'); assert.equal(nueva.estado, 'Planificada');
assert.throws(() => M.reprogramar(original, '2026-W46', {id: 'x', autor, at}), /Ya se reprogramó/);

// PPC, causas y cumplimiento por responsable/sector.
const c = M.cambiarEstado(M.nuevaActividad({...base, actividad: 'Sello perimetral', responsable: 'Sellos SpA', cantidad: null}, {id: 'a5', autor, at}), 'Cumplida', {inicioReal: '2026-10-27', finReal: '2026-10-27'}, {autor, at});
const d = M.cambiarEstado(M.nuevaActividad({...base, actividad: 'Cielo modular', responsable: 'Cielos Ltda', sector: 'B'}, {id: 'a6', autor, at}), 'No cumplida', {causa: 'Frente no liberado'}, {autor, at});
const e = M.nuevaActividad({...base, actividad: 'Guardapolvo', responsable: 'Pinturas Sur'}, {id: 'a7', autor, at});
const semana = [cumplida, original, c, d, e, nueva, lista];
const p = M.ppcSemana(semana, '2026-W44');
assert.deepEqual([p.comprometidas, p.cumplidas, p.noCumplidas, p.abiertas, p.cerrada], [5, 2, 2, 1, false]); assert.equal(p.ppc, 0.4);
assert.equal(M.ppcSemana(semana, '2026-W43').ppc, null, 'semana sin compromisos no tiene PPC');
assert.equal(M.ppcAcumulado(semana, ['2026-W44']), 0.5, 'el acumulado solo cuenta cerradas');
const serie = M.seriePPC(semana, '2026-W45', 3); assert.deepEqual(serie.map(s => s.semana), ['2026-W43', '2026-W44', '2026-W45']); assert.equal(serie[2].comprometidas, 1);
assert.deepEqual(M.causas(semana).map(x => [x.causa, x.n, x.acumulado]), [['Frente no liberado', 1, 0.5], ['Material no disponible', 1, 1]]);
const porResp = M.cumplimientoPor(semana, 'responsable', ['2026-W44']);
assert.deepEqual(porResp.map(g => [g.key, g.comprometidas, g.cumplidas, g.ppc]), [['Pinturas Sur', 3, 1, 0.5], ['Cielos Ltda', 1, 0, 0], ['Sellos SpA', 1, 1, 1]]);
const rr = M.resumenRestricciones([intermedia, {...lista, id: 'a8'}, cumplida], '2026-10-27');
assert.deepEqual([rr.pendientes, rr.vencidas, rr.liberadas, rr.bloqueadas, rr.listas], [2, 1, 2, 1, 1]);

// Rendimientos: por día, por persona-día y por HH; promedio ponderado por actividad; estimación de días.
const r = M.rendimiento(cumplida);
assert.equal(r.porDia, 30); assert.equal(r.porPersonaDia, 10); assert.equal(r.diasPlan, 3); assert.equal(Math.round(r.desvio * 100), 33);
assert.equal(M.rendimiento(e), null, 'sin ejecución no hay rendimiento');
const conHH = M.cambiarEstado(M.nuevaActividad({...base, cantidad: 60, dotacion: null}, {id: 'a9', autor, at}), 'Cumplida', {inicioReal: '2026-10-26', finReal: '2026-10-26', hh: 20}, {autor, at});
const grupos = M.rendimientosPorActividad([cumplida, noCumplida, conHH, c]);
const pintura = grupos.find(g => g.actividad === 'Pintura asepsia media');
assert.equal(pintura.n, 3); assert.equal(pintura.cantidad, 210); assert.equal(pintura.dias, 7); assert.equal(pintura.porDia, 30);
assert.equal(pintura.porPersonaDia, 150 / 18, 'solo pondera los registros con dotación'); assert.equal(pintura.porHH, 3);
assert.equal(Math.round(M.estimarDias(pintura, 100, 2) * 10) / 10, 6, 'con dotación usa el rendimiento por persona-día');
assert.equal(M.estimarDias({porDia: 25, porPersonaDia: null}, 100, 2), 4); assert.equal(M.estimarDias(pintura, 0, 2), null);

// Capa del plano: la peor condición manda.
assert.equal(M.estadoRecinto([]), 'Sin actividades');
assert.equal(M.estadoRecinto([cumplida, d]), 'No cumplida');
assert.equal(M.estadoRecinto([cumplida, {...intermedia, semana: '2026-W44'}]), 'Con restricción');
assert.equal(M.estadoRecinto([cumplida, enCurso]), 'En ejecución');
assert.equal(M.estadoRecinto([cumplida, a]), 'Planificada');
assert.equal(M.estadoRecinto([cumplida]), 'Cumplida');

// Puntos de bloqueo con los campos del seguimiento de obra: acción, departamento, ITO, fecha de registro y eficacia.
const pb = M.nuevaRestriccion({tipo: 'Diseño / planos', descripcion: 'Plano de puertas correderas aprobado', responsable: 'Camila Rojas', compromiso: '2026-10-20', accion: 'Gestionar aprobación con la ITO', departamento: 'Oficina técnica', requiereITO: 'on'}, 'pb1', '2026-10-14');
assert.deepEqual([pb.accion, pb.departamento, pb.requiereITO, pb.registrada], ['Gestionar aprobación con la ITO', 'Oficina técnica', true, '2026-10-14']);
assert.equal(M.nuevaRestriccion({tipo: 'Materiales', descripcion: 'Rollos de vinílico'}, 'pb0', '2026-10-01').requiereITO, false);
assert.throws(() => M.nuevaRestriccion({tipo: 'Materiales', descripcion: 'Rollos de vinílico', departamento: 'Gerencia'}, 'x'), /departamento/);
M.validarActividad({...a, restricciones: [{id: 'antigua', tipo: 'Materiales', descripcion: 'Registro anterior al seguimiento', responsable: null, compromiso: null, estado: 'Pendiente', liberada: null}]});
assert.equal(M.atrasoRestriccion(pb, '2026-10-19'), null, 'pendiente sin vencer: sin atraso');
assert.equal(M.atrasoRestriccion(pb, '2026-10-24'), 4, 'pendiente vencida: días de atraso a hoy');
assert.equal(M.atrasoRestriccion({...pb, estado: 'Liberada', liberada: '2026-10-27'}), 7, 'liberada 7 días tarde');
assert.equal(M.atrasoRestriccion({...pb, estado: 'Liberada', liberada: '2026-10-18'}), -2, 'liberada antes de plazo');
assert.equal(M.atrasoRestriccion({...pb, compromiso: null}, '2026-10-24'), null);
// Serie semanal: un punto registrado en la S42 y liberado tarde en la S44, otro nuevo de la S43 aún abierto y vencido,
// y uno de una actividad cumplida que nadie liberó (se cierra con el término real).
const conPB = (id, restricciones, extra = {}) => ({...a, id, restricciones, ...extra});
const lista1 = [conPB('p1', [{...pb, estado: 'Liberada', liberada: '2026-10-27'}]), conPB('p2', [M.nuevaRestriccion({tipo: 'Materiales', descripcion: 'Placas RH', compromiso: '2026-10-22'}, 'pb2', '2026-10-21')]),
  conPB('p3', [M.nuevaRestriccion({tipo: 'Frente previo', descripcion: 'Cielo tapado', compromiso: '2026-10-23'}, 'pb3', '2026-10-21')], {estado: 'Cumplida', finReal: '2026-10-28'})];
const serieBloqueo = M.seriePuntosBloqueo(lista1, '2026-W44', 3, '2026-10-29');
assert.deepEqual(serieBloqueo.map(s => [s.semana, s.anteriores, s.nuevos, s.resueltos, s.retrasados, s.abiertos]), [
  ['2026-W42', 0, 1, 0, 0, 1], ['2026-W43', 1, 2, 0, 3, 3], ['2026-W44', 3, 0, 2, 1, 1]]);
assert.equal(serieBloqueo[2].resuelto, 2 / 3);
// Una actividad no cumplida y reprogramada pasa su punto de bloqueo al saldo: se cuenta una sola vez.
const noCumplidaPB = M.cambiarEstado(conPB('p6', [M.nuevaRestriccion({tipo: 'Materiales', descripcion: 'Puertas en fábrica', compromiso: '2026-10-22'}, 'pb6', '2026-10-21')]), 'No cumplida', {causa: 'Material no disponible'}, {autor, at});
const repPB = M.reprogramar(noCumplidaPB, '2026-W45', {id: 'p6b', autor, at});
assert.deepEqual(M.puntosBloqueo([repPB.original, repPB.nueva]).map(x => [x.a.id, x.r.id]), [['p6b', 'pb6']]);
assert.equal(M.puntosBloqueo([noCumplidaPB]).length, 1, 'sin reprogramar sigue contando en la original');
const ef = M.eficaciaPuntosBloqueo([...lista1, conPB('p4', [{...pb, id: 'pb4', estado: 'Liberada', liberada: '2026-10-19'}])], '2026-10-12', '2026-10-31');
assert.deepEqual([ef.cerrados, ef.aTiempo, ef.atrasados, ef.pct, ef.atrasoPromedio], [2, 1, 1, .5, 7]);
const rrDep = M.resumenRestricciones([conPB('p5', [pb, M.nuevaRestriccion({tipo: 'Materiales', descripcion: 'Rollos', departamento: 'Compras'}, 'pb5')])], '2026-10-29');
assert.deepEqual([rrDep.porDepartamento, rrDep.conITO], [[['Oficina técnica', 1], ['Compras', 1]], 1]);

// Reuniones de producción: asistencia, frentes y plantilla para la siguiente.
const reunion = {schema: 1, id: 'r1', fecha: '2026-10-26', tipo: 'Semanal (Last Planner)', lugar: 'Oficina técnica', notas: null, autor, creada: at, actualizada: at, version: 1,
  asistentes: [{nombre: 'Ana', empresa: 'Pinturas Sur', cargo: 'Capataz', asistio: true}, {nombre: 'Luis', empresa: 'Cielos Ltda', cargo: null, asistio: false}, {nombre: 'Rosa', empresa: 'Pinturas Sur', cargo: null, asistio: true}],
  frentes: [{level: 'N01', sector: 'A', frente: 'Eje 5-7', responsable: 'Pinturas Sur', dotacion: 3, estado: 'Activo', nota: null}, {level: 'N01', sector: 'B', frente: 'Pabellón', responsable: 'Cielos Ltda', dotacion: 0, estado: 'Terminado', nota: null}],
  acuerdos: [{texto: 'Liberar andamios', responsable: 'Obra gruesa', plazo: '2026-10-28', cumplido: false}, {texto: 'Enviar RFI', responsable: null, plazo: null, cumplido: true}]};
M.validarReunion(reunion);
assert.throws(() => M.validarReunion({...reunion, asistentes: [...reunion.asistentes, {nombre: ' ana', empresa: null, cargo: null, asistio: true}]}), /repetido/);
assert.throws(() => M.validarReunion({...reunion, frentes: [{...reunion.frentes[0], estado: 'Otro'}]}), /frentes/);
assert.throws(() => M.validarReunion({...reunion, fecha: '2026-02-30'}), /fecha y tipo/);
assert.deepEqual(M.asistencia(reunion), {convocados: 3, presentes: 2, pct: 2 / 3});
const segunda = {...reunion, id: 'r2', fecha: '2026-11-02', asistentes: reunion.asistentes.map(p => ({...p, asistio: p.nombre !== 'Ana'}))};
assert.deepEqual(M.asistenciaPor([reunion, segunda]).map(g => [g.key, g.convocado, g.presente]), [['Cielos Ltda', 2, 1], ['Pinturas Sur', 4, 3]]);
assert.equal(M.ultimaReunion([reunion, segunda]).id, 'r2');
const plantilla = M.plantillaReunion(reunion);
assert(plantilla.asistentes.every(p => !p.asistio)); assert.equal(plantilla.frentes.length, 1, 'los frentes terminados no pasan'); assert.equal(plantilla.acuerdos.length, 1, 'los acuerdos cumplidos no pasan');
console.log(JSON.stringify({checks: 'passed', scope: 'Last Planner: semanas ISO y días hábiles, alta y edición de actividades, restricciones (liberar, vencidas), puntos de bloqueo semanales con acción, departamento, ITO y eficacia, cierre al 100 % o con causa, reprogramación del saldo, PPC semanal y acumulado, Pareto de causas, cumplimiento por responsable, rendimientos ponderados y estimación de días, estado del recinto para la capa, reuniones con asistencia, frentes y acuerdos.'}));
