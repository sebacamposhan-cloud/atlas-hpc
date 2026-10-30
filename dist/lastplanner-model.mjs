// Last Planner System: plan intermedio con restricciones, plan semanal con compromisos, PPC, causas de no cumplimiento,
// rendimientos de lo ejecutado y reuniones de producción con asistencia y frentes de trabajo.
// Reglas puras, sin almacenamiento. Las actividades referencian recintos del plano; no modifican ninguna fuente.
export const ESTADOS = ['Planificada', 'En ejecución', 'Cumplida', 'No cumplida'];
export const CERRADOS = new Set(['Cumplida', 'No cumplida']);
// Reabrir una actividad cerrada exige un comentario (ver cambiarEstado).
export const TRANSICIONES = {
  'Planificada': ['En ejecución', 'Cumplida', 'No cumplida'],
  'En ejecución': ['Cumplida', 'No cumplida', 'Planificada'],
  'Cumplida': ['En ejecución'],
  'No cumplida': ['En ejecución']
};
// Puntos de bloqueo que se levantan en el plan intermedio antes de comprometer la actividad.
export const TIPOS_RESTRICCION = ['Diseño / planos', 'Información / RFI', 'Materiales', 'Mano de obra', 'Equipos y herramientas', 'Subcontrato', 'Frente previo', 'Calidad / protocolo', 'Permisos / inspección', 'Otro'];
// Quién levanta el punto de bloqueo, como en el seguimiento de la obra.
export const DEPARTAMENTOS = ['Oficina técnica', 'Compras', 'Producción', 'Instalaciones', 'Calidad', 'Prevención de riesgos', 'Subcontrato', 'ITO / Mandante', 'Otro'];
// Causas de no cumplimiento (CNC) del plan semanal.
export const CAUSAS = ['Programación / planificación', 'Frente no liberado', 'Material no disponible', 'Mano de obra insuficiente', 'Equipos', 'Subcontrato', 'Diseño / información', 'Calidad / rehacer trabajo', 'Clima', 'Mandante / ITO', 'Otro'];
export const UNIDADES = ['m²', 'm', 'm³', 'un', 'kg', 'pto', 'gl'];
export const TIPOS_REUNION = ['Semanal (Last Planner)', 'Intermedia (lookahead)', 'Diaria de coordinación', 'Otra'];
export const ESTADOS_FRENTE = ['Activo', 'Detenido', 'Sin iniciar', 'Terminado'];
export const RESPALDO = 'atlas-lastplanner-v1';

const texto = (v, max, min = 1) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const opcional = (v, max) => v == null || texto(v, max);
export const esFecha = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const instante = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const numero = v => v == null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
const entero = v => v == null || (Number.isSafeInteger(v) && v >= 0);

// ---------- Semanas ISO (lunes a domingo), por ejemplo «2026-W44» ----------
export const esSemana = v => typeof v === 'string' && /^\d{4}-W\d{2}$/.test(v) && semanaDe(lunesDe(v)) === v;
export function sumarDias(fecha, n) { const d = new Date(fecha + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function semanaDe(fecha) {
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7 + 3); // jueves de esa semana: define el año ISO
  const año = d.getUTCFullYear(), n = Math.ceil(((d - Date.UTC(año, 0, 1)) / 864e5 + 1) / 7);
  return `${año}-W${String(n).padStart(2, '0')}`;
}
export function lunesDe(semana) {
  const [, año, n] = semana.match(/^(\d{4})-W(\d{2})$/).map(Number), ene4 = new Date(Date.UTC(año, 0, 4));
  return sumarDias(ene4.toISOString().slice(0, 10), -((ene4.getUTCDay() + 6) % 7) + (n - 1) * 7);
}
export const moverSemana = (semana, n) => semanaDe(sumarDias(lunesDe(semana), 7 * n));
export const rangoSemana = semana => ({desde: lunesDe(semana), hasta: sumarDias(lunesDe(semana), 6)});
// Días hábiles de lunes a viernes, ambos extremos incluidos. Los feriados se corrigen a mano en «días trabajados».
export function diasHabiles(desde, hasta) {
  if (!esFecha(desde) || !esFecha(hasta) || hasta < desde) return null;
  let n = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) { const d = new Date(f + 'T00:00:00Z').getUTCDay(); if (d !== 0 && d !== 6) n++; }
  return n;
}

// ---------- Actividades ----------
function validarRestriccion(r) {
  if (!r || !texto(r.id, 100) || !TIPOS_RESTRICCION.includes(r.tipo) || !texto(r.descripcion, 500, 2)) throw Error('Restricción mal registrada: indica tipo y descripción.');
  if (!opcional(r.responsable, 160) || (r.compromiso != null && !esFecha(r.compromiso))) throw Error('Responsable o fecha compromiso de la restricción no válidos.');
  if (!['Pendiente', 'Liberada'].includes(r.estado)) throw Error('Estado de restricción no válido.');
  if ((r.estado === 'Liberada') !== esFecha(r.liberada)) throw Error('Una restricción liberada requiere su fecha de liberación.');
  // Campos del seguimiento de puntos de bloqueo; opcionales para que los registros anteriores sigan siendo válidos.
  if (!opcional(r.accion, 500) || (r.departamento != null && !DEPARTAMENTOS.includes(r.departamento)) || (r.requiereITO != null && typeof r.requiereITO !== 'boolean') || (r.registrada != null && !esFecha(r.registrada))) throw Error('Acción, departamento, intervención de la ITO o fecha de registro de la restricción no válidos.');
}
export function validarActividad(a) {
  if (!a || a.schema !== 1 || !texto(a.id, 100) || !texto(a.level, 30)) throw Error('Actividad inválida.');
  if (!texto(a.actividad, 200, 3)) throw Error('Describe la actividad (al menos 3 caracteres).');
  if (!texto(a.responsable, 160)) throw Error('Indica el responsable (subcontrato o cuadrilla).');
  if (!opcional(a.sector, 60) || !opcional(a.frente, 200)) throw Error('Sector o frente no válidos.');
  if (!Array.isArray(a.recintos) || a.recintos.length > 300 || a.recintos.some(r => !texto(r?.id, 160) || !texto(r?.code, 160) || typeof r.name !== 'string')) throw Error('Recintos mal registrados.');
  if (new Set(a.recintos.map(r => r.id)).size !== a.recintos.length) throw Error('Recinto repetido en la actividad.');
  if (a.semana != null && !esSemana(a.semana)) throw Error('Semana no válida.');
  for (const k of ['inicioPlan', 'finPlan', 'inicioReal', 'finReal']) if (a[k] != null && !esFecha(a[k])) throw Error('Fecha no válida.');
  if (a.inicioPlan && a.finPlan && a.finPlan < a.inicioPlan) throw Error('El término planificado es anterior al inicio.');
  if (a.inicioReal && a.finReal && a.finReal < a.inicioReal) throw Error('El término real es anterior al inicio real.');
  // Lo comprometido en una semana se planifica dentro de ella; un trabajo más largo se divide por semanas.
  if (a.semana) {
    const {desde, hasta} = rangoSemana(a.semana), corta = f => f.split('-').reverse().join('-');
    if ([a.inicioPlan, a.finPlan].some(f => f && (f < desde || f > hasta))) throw Error(`Las fechas planificadas deben quedar dentro de la semana ${+a.semana.slice(6)} (${corta(desde)} al ${corta(hasta)}). Si el trabajo dura más, divídelo por semana.`);
  }
  if (![a.cantidad, a.cantidadEjecutada, a.hh, a.diasReales, a.rendimientoPlan].every(numero) || !entero(a.dotacion)) throw Error('Cantidades, rendimiento, dotación, días u horas no válidos.');
  if (a.diasReales === 0) throw Error('Los días trabajados deben ser mayores que cero.');
  if (!opcional(a.unidad, 20)) throw Error('Unidad no válida.');
  if (!Array.isArray(a.restricciones) || a.restricciones.length > 40) throw Error('Máximo 40 restricciones por actividad.');
  a.restricciones.forEach(validarRestriccion);
  if (new Set(a.restricciones.map(r => r.id)).size !== a.restricciones.length) throw Error('Restricción repetida.');
  if (!ESTADOS.includes(a.estado)) throw Error('Estado no válido.');
  if (a.estado !== 'Planificada' && !a.semana) throw Error('Para iniciarla o cerrarla, compromete la actividad en una semana.');
  if (a.estado === 'Cumplida') {
    if (!a.inicioReal || !a.finReal) throw Error('Para marcarla cumplida indica inicio y término real.');
    if (a.cantidad != null && (a.cantidadEjecutada ?? 0) < a.cantidad) throw Error('En Last Planner solo se cumple lo completado al 100 %: con avance parcial regístrala como no cumplida, con su causa.');
  }
  if ((a.estado === 'No cumplida') !== CAUSAS.includes(a.causa)) throw Error(a.estado === 'No cumplida' ? 'Indica la causa de no cumplimiento.' : 'Solo una actividad no cumplida lleva causa.');
  if (!opcional(a.causaNota, 1000) || !opcional(a.origen, 100) || (a.reprogramada != null && !esSemana(a.reprogramada))) throw Error('Datos de cierre no válidos.');
  if (!texto(a.autor, 160)) throw Error('Indica quién registra la actividad.');
  if (![a.creada, a.actualizada].every(instante)) throw Error('Fecha de registro no válida.');
  if (!Number.isSafeInteger(a.version) || a.version < 1) throw Error('Versión no válida.');
  if (!Array.isArray(a.historial) || a.historial.some(h => !instante(h?.at) || !texto(h.autor, 160) || typeof h.detalle !== 'string')) throw Error('Historial no válido.');
  return a;
}

const limpio = v => String(v ?? '').trim() || null;
const num = v => v === '' || v == null ? null : Number(v);
// Campos editables desde el formulario (los de cierre se cambian con cambiarEstado).
export const CAMPOS = {actividad: 'actividad', level: 'piso', sector: 'sector', frente: 'frente', recintos: 'recintos', responsable: 'responsable', semana: 'semana', inicioPlan: 'inicio planificado', finPlan: 'término planificado', cantidad: 'cantidad', unidad: 'unidad', rendimientoPlan: 'rendimiento por persona', dotacion: 'dotación', restricciones: 'restricciones'};
export function normalizar(v) {
  return {actividad: String(v.actividad ?? '').trim(), level: v.level, sector: limpio(v.sector), frente: limpio(v.frente), recintos: v.recintos || [],
    responsable: String(v.responsable ?? '').trim(), semana: v.semana || null, inicioPlan: v.inicioPlan || null, finPlan: v.finPlan || null,
    cantidad: num(v.cantidad), unidad: limpio(v.unidad), rendimientoPlan: num(v.rendimientoPlan), dotacion: num(v.dotacion), restricciones: v.restricciones || []};
}

// ---------- Dotación y fechas del plan ----------
// Días hábiles con que cuenta la actividad: los de su plazo o, sin fechas, lunes a viernes de su semana.
export const diasDisponibles = a => diasHabiles(a.inicioPlan, a.finPlan) || (a.semana ? 5 : null);
// Personas para completar la cantidad en esos días con un rendimiento por persona al día (se redondea hacia arriba).
export function dotacionRecomendada(cantidad, rendimiento, dias) {
  if (!(cantidad > 0) || !(rendimiento > 0) || !(dias > 0)) return null;
  const exacta = cantidad / (rendimiento * dias), personas = Math.max(1, Math.ceil(exacta - 1e-9));
  return {personas, exacta, dias, diasNecesarios: cantidad / (rendimiento * personas)};
}
// Al pasar una actividad a otra semana sus fechas se mueven con ella (mismo día de la semana y misma duración),
// sin pasarse del domingo. Si ya calzan con la semana o no tiene fechas, quedan como están.
export function ajustarFechasASemana({inicioPlan = null, finPlan = null}, semana) {
  if (!semana) return {inicioPlan, finPlan};
  const {desde, hasta} = rangoSemana(semana), dentro = f => !f || (f >= desde && f <= hasta);
  if (dentro(inicioPlan) && dentro(finPlan)) return {inicioPlan, finPlan};
  const corrimiento = Math.round((Date.parse(desde) - Date.parse(lunesDe(semanaDe(inicioPlan || finPlan)))) / 864e5);
  const mover = f => f && [sumarDias(f, corrimiento)].map(x => x < desde ? desde : x > hasta ? hasta : x)[0];
  return {inicioPlan: mover(inicioPlan), finPlan: mover(finPlan)};
}
export const entrada = (autor, detalle, comentario = '', at = new Date().toISOString()) => ({at, autor: String(autor).trim(), detalle, comentario: String(comentario || '').trim()});

export function nuevaActividad(valores, {id, autor, at = new Date().toISOString()}) {
  return validarActividad({schema: 1, id, rendimientoPlan: null, ...normalizar(valores), estado: 'Planificada', inicioReal: null, finReal: null, cantidadEjecutada: null, diasReales: null, hh: null,
    causa: null, causaNota: null, origen: null, reprogramada: null, autor: String(autor ?? '').trim(), creada: at, actualizada: at, version: 1,
    historial: [entrada(autor, valores.semana ? 'Comprometida en la semana ' + valores.semana : 'Registrada en el plan intermedio', '', at)]});
}

// Edición de los datos de plan. Devuelve la actividad nueva (sin guardar) o la misma si no cambió nada.
export function editarActividad(a, valores, {autor, at = new Date().toISOString()}) {
  if (!texto(autor || '', 160)) throw Error('Indica quién hace el cambio.');
  const nuevos = normalizar({...valores, level: valores.level ?? a.level}), cambios = Object.keys(CAMPOS).filter(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(nuevos[k] ?? null));
  if (!cambios.length) return a;
  if (CERRADOS.has(a.estado) && cambios.includes('semana')) throw Error('La actividad ya se cerró en su semana. Reábrela o reprográmala.');
  const detalle = cambios.includes('semana') && nuevos.semana ? (a.semana ? `Pasó de la semana ${a.semana} a ${nuevos.semana}` : 'Comprometida en la semana ' + nuevos.semana) : 'Editó ' + cambios.map(k => CAMPOS[k]).join(', ');
  return validarActividad({...a, ...nuevos, actualizada: at, version: a.version + 1, historial: [...a.historial, entrada(autor, detalle, '', at)]});
}

// Cambio de estado con sus exigencias: cerrar pide fechas o causa; reabrir pide motivo.
export function cambiarEstado(a, estado, datos = {}, {autor, comentario = '', at = new Date().toISOString(), hoy = at.slice(0, 10)} = {}) {
  if (!TRANSICIONES[a.estado]?.includes(estado)) throw Error(`No se puede pasar de «${a.estado}» a «${estado}».`);
  if (!texto(autor || '', 160)) throw Error('Indica quién hace el cambio.');
  const nota = String(comentario || '').trim();
  if (CERRADOS.has(a.estado) && !nota) throw Error('Indica por qué se reabre.');
  if (a.reprogramada && CERRADOS.has(a.estado)) throw Error('Ya se reprogramó en la semana ' + a.reprogramada + '; actualiza esa actividad.');
  // Un campo ausente conserva lo registrado; un campo vacío del formulario lo borra.
  const dato = (k, f) => datos[k] === undefined ? a[k] : f(datos[k]);
  const d = {inicioReal: dato('inicioReal', limpio), finReal: dato('finReal', limpio), cantidadEjecutada: dato('cantidadEjecutada', num), diasReales: dato('diasReales', num), hh: dato('hh', num), dotacion: dato('dotacion', num)};
  let causa = null, causaNota = null;
  if (estado === 'En ejecución') { d.inicioReal ||= hoy; if (CERRADOS.has(a.estado)) d.finReal = null; }
  if (estado === 'Planificada') Object.assign(d, {inicioReal: null, finReal: null});
  if (estado === 'Cumplida') {
    d.finReal ||= hoy; d.inicioReal ||= d.finReal;
    if (d.cantidadEjecutada == null) d.cantidadEjecutada = a.cantidad;
    if (d.diasReales == null) d.diasReales = diasHabiles(d.inicioReal, d.finReal) || null;
  }
  if (estado === 'No cumplida') {
    causa = datos.causa; causaNota = limpio(datos.causaNota);
    if (d.inicioReal && d.diasReales == null && d.cantidadEjecutada) d.diasReales = diasHabiles(d.inicioReal, d.finReal || hoy) || null;
  }
  const detalle = `${a.estado} → ${estado}` + (estado === 'No cumplida' && causa ? ' · ' + causa : '');
  return validarActividad({...a, ...d, estado, causa, causaNota, actualizada: at, version: a.version + 1, historial: [...a.historial, entrada(autor, detalle, nota || causaNota || '', at)]});
}

// Avance de ejecución sin cambiar de estado (fechas reales, cantidad, días, HH; causa si no se cumplió).
const EJECUCION = {inicioReal: 'inicio real', finReal: 'término real', cantidadEjecutada: 'cantidad ejecutada', diasReales: 'días trabajados', hh: 'HH', causa: 'causa', causaNota: 'detalle de la causa'};
export function registrarEjecucion(a, datos, {autor, at = new Date().toISOString()} = {}) {
  if (!texto(autor || '', 160)) throw Error('Indica quién hace el cambio.');
  const f = {inicioReal: limpio, finReal: limpio, cantidadEjecutada: num, diasReales: num, hh: num, causa: limpio, causaNota: limpio};
  const d = Object.fromEntries(Object.keys(EJECUCION).filter(k => datos[k] !== undefined && (a.estado === 'No cumplida' || !k.startsWith('causa'))).map(k => [k, f[k](datos[k])]));
  const cambios = Object.keys(d).filter(k => (a[k] ?? null) !== (d[k] ?? null));
  if (!cambios.length) return a;
  return validarActividad({...a, ...d, actualizada: at, version: a.version + 1, historial: [...a.historial, entrada(autor, 'Registró ' + cambios.map(k => EJECUCION[k]).join(', '), '', at)]});
}

// Lo no cumplido vuelve al plan en otra semana como una actividad nueva; la original conserva su causa para el PPC.
export function reprogramar(a, semana, {id, autor, at = new Date().toISOString()}) {
  if (a.estado !== 'No cumplida') throw Error('Solo se reprograma una actividad no cumplida.');
  if (a.reprogramada) throw Error('Ya se reprogramó en la semana ' + a.reprogramada + '.');
  if (!esSemana(semana) || semana <= a.semana) throw Error('Elige una semana posterior a ' + a.semana + '.');
  const saldo = a.cantidad != null && a.cantidadEjecutada ? Math.max(0, +(a.cantidad - a.cantidadEjecutada).toFixed(3)) : a.cantidad;
  const corre = f => f && sumarDias(f, (Date.parse(lunesDe(semana)) - Date.parse(lunesDe(a.semana))) / 864e5);
  const nueva = nuevaActividad({...a, semana, cantidad: saldo, inicioPlan: corre(a.inicioPlan), finPlan: corre(a.finPlan)}, {id, autor, at});
  nueva.origen = a.id;
  nueva.historial = [entrada(autor, `Reprogramada desde la semana ${a.semana} (${a.causa})`, '', at)];
  const original = validarActividad({...a, reprogramada: semana, actualizada: at, version: a.version + 1, historial: [...a.historial, entrada(autor, 'Reprogramada en la semana ' + semana, '', at)]});
  return {original, nueva: validarActividad(nueva)};
}

// ---------- Restricciones ----------
export const pendientes = a => a.restricciones.filter(r => r.estado === 'Pendiente');
export const liberada = a => !pendientes(a).length;
export const restriccionVencida = (r, hoy) => r.estado === 'Pendiente' && !!r.compromiso && r.compromiso < hoy;
// registrada: fecha en que se levantó el punto de bloqueo (por omisión, hoy); con ella se cuentan los nuevos de cada semana.
export function nuevaRestriccion(v, id, hoy = new Date().toISOString().slice(0, 10)) {
  const r = {id, tipo: v.tipo, descripcion: String(v.descripcion ?? '').trim(), responsable: limpio(v.responsable), compromiso: v.compromiso || null, estado: 'Pendiente', liberada: null,
    accion: limpio(v.accion), departamento: v.departamento || null, requiereITO: v.requiereITO === true || v.requiereITO === 'on', registrada: v.registrada || hoy};
  validarRestriccion(r); return r;
}
// Eficacia del cierre: días entre el compromiso y la liberación (positivo = atraso, negativo = antes de plazo).
// Si sigue pendiente, días de atraso a hoy; null mientras no venza o si no tiene compromiso.
export function atrasoRestriccion(r, hoy) {
  if (!r.compromiso) return null;
  if (r.estado === 'Liberada') return Math.round((Date.parse(r.liberada) - Date.parse(r.compromiso)) / 864e5);
  return r.compromiso < hoy ? Math.round((Date.parse(hoy) - Date.parse(r.compromiso)) / 864e5) : null;
}
// Puntos de bloqueo con su actividad, fecha de registro y de cierre. Sin fecha de registro (anteriores a este seguimiento)
// cuenta la creación de la actividad; una actividad cumplida cierra los puntos que nadie liberó.
// Al reprogramar, el saldo hereda las restricciones con el mismo id: cada punto se cuenta una vez, en el saldo.
export function puntosBloqueo(actividades) {
  const enSaldo = new Set(actividades.filter(a => !a.reprogramada).flatMap(a => a.restricciones.map(r => r.id)));
  return actividades.flatMap(a => a.restricciones.filter(r => !a.reprogramada || !enSaldo.has(r.id)).map(r => ({r, a, registrada: r.registrada || a.creada.slice(0, 10), cierre: r.estado === 'Liberada' ? r.liberada : a.estado === 'Cumplida' ? a.finReal : null})));
}
// Seguimiento semanal, como la planilla de obra: anteriores (abiertos al empezar la semana), nuevos, resueltos,
// retrasados (abiertos con el compromiso vencido) y abiertos al cerrar la semana (o a hoy en la semana en curso).
export function seriePuntosBloqueo(actividades, hasta, n = 8, hoy = rangoSemana(hasta).hasta) {
  const todos = puntosBloqueo(actividades);
  return Array.from({length: n}, (_, i) => {
    const semana = moverSemana(hasta, i - n + 1), {desde, hasta: domingo} = rangoSemana(semana), corte = domingo > hoy ? hoy : domingo;
    const abierto = (x, f) => x.registrada <= f && (!x.cierre || x.cierre > f);
    const anteriores = todos.filter(x => x.registrada < desde && (!x.cierre || x.cierre >= desde)).length, nuevos = todos.filter(x => x.registrada >= desde && x.registrada <= domingo).length;
    const resueltos = todos.filter(x => x.cierre && x.cierre >= desde && x.cierre <= domingo).length, abiertos = todos.filter(x => abierto(x, corte)).length;
    const retrasados = todos.filter(x => abierto(x, corte) && x.r.compromiso && x.r.compromiso < corte).length;
    return {semana, anteriores, nuevos, resueltos, retrasados, abiertos, resuelto: anteriores + nuevos ? resueltos / (anteriores + nuevos) : null};
  });
}
// Eficacia de las liberaciones del período: a tiempo, atrasadas y atraso promedio de las atrasadas.
export function eficaciaPuntosBloqueo(actividades, desde, hasta) {
  const cerrados = puntosBloqueo(actividades).filter(x => x.r.estado === 'Liberada' && x.r.compromiso && x.r.liberada >= desde && x.r.liberada <= hasta);
  const atrasos = cerrados.map(x => atrasoRestriccion(x.r)), tarde = atrasos.filter(d => d > 0);
  return {cerrados: cerrados.length, aTiempo: atrasos.length - tarde.length, atrasados: tarde.length, pct: cerrados.length ? (atrasos.length - tarde.length) / cerrados.length : null,
    atrasoPromedio: tarde.length ? tarde.reduce((s, d) => s + d, 0) / tarde.length : null};
}
export function liberarRestriccion(a, rid, {autor, fecha, at = new Date().toISOString()}) {
  const r = a.restricciones.find(r => r.id === rid);
  if (!r) throw Error('La restricción ya no existe.');
  if (!texto(autor || '', 160)) throw Error('Indica quién libera la restricción.');
  const liberada = r.estado === 'Pendiente', restricciones = a.restricciones.map(x => x.id !== rid ? x : {...x, estado: liberada ? 'Liberada' : 'Pendiente', liberada: liberada ? fecha || at.slice(0, 10) : null});
  return validarActividad({...a, restricciones, actualizada: at, version: a.version + 1, historial: [...a.historial, entrada(autor, `${liberada ? 'Liberó' : 'Reabrió'} restricción: ${r.tipo} · ${r.descripcion}`, '', at)]});
}

// ---------- Indicadores ----------
// PPC (porcentaje de plan completado) = cumplidas / comprometidas en la semana.
export function ppcSemana(lista, semana) {
  const comp = lista.filter(a => a.semana === semana), cumplidas = comp.filter(a => a.estado === 'Cumplida').length, noCumplidas = comp.filter(a => a.estado === 'No cumplida').length;
  const abiertas = comp.length - cumplidas - noCumplidas;
  return {semana, comprometidas: comp.length, cumplidas, noCumplidas, abiertas, cerrada: comp.length > 0 && !abiertas, ppc: comp.length ? cumplidas / comp.length : null};
}
export const seriePPC = (lista, hasta, n = 8) => Array.from({length: n}, (_, i) => ppcSemana(lista, moverSemana(hasta, i - n + 1)));
// PPC acumulado de las semanas indicadas (solo cuenta actividades cerradas, para no castigar la semana en curso).
export function ppcAcumulado(lista, semanas) {
  const s = new Set(semanas), cerradas = lista.filter(a => s.has(a.semana) && CERRADOS.has(a.estado));
  return cerradas.length ? cerradas.filter(a => a.estado === 'Cumplida').length / cerradas.length : null;
}
// Pareto de causas de no cumplimiento.
export function causas(lista, semanas = null) {
  const s = semanas && new Set(semanas), conteo = new Map();
  for (const a of lista) if (a.estado === 'No cumplida' && (!s || s.has(a.semana))) conteo.set(a.causa, (conteo.get(a.causa) || 0) + 1);
  const total = [...conteo.values()].reduce((x, y) => x + y, 0); let acumulado = 0;
  return [...conteo].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([causa, n]) => ({causa, n, pct: n / total, acumulado: (acumulado += n) / total}));
}
// Cumplimiento por responsable o sector en las semanas indicadas.
export function cumplimientoPor(lista, campo, semanas) {
  const s = new Set(semanas), grupos = new Map();
  for (const a of lista) {
    if (!s.has(a.semana)) continue;
    const k = a[campo] || (campo === 'sector' ? 'Sin sector' : 'Sin responsable'), g = grupos.get(k) || {key: k, comprometidas: 0, cumplidas: 0, cerradas: 0};
    g.comprometidas++; if (a.estado === 'Cumplida') g.cumplidas++; if (CERRADOS.has(a.estado)) g.cerradas++; grupos.set(k, g);
  }
  return [...grupos.values()].map(g => ({...g, ppc: g.cerradas ? g.cumplidas / g.cerradas : null})).sort((a, b) => b.comprometidas - a.comprometidas || a.key.localeCompare(b.key, 'es'));
}
export function resumenRestricciones(lista, hoy) {
  const abiertas = lista.filter(a => !CERRADOS.has(a.estado)), todas = abiertas.flatMap(a => a.restricciones.map(r => ({...r, actividad: a})));
  const porTipo = new Map(), porDepartamento = new Map();
  for (const r of todas) if (r.estado === 'Pendiente') { porTipo.set(r.tipo, (porTipo.get(r.tipo) || 0) + 1); const d = r.departamento || 'Sin departamento'; porDepartamento.set(d, (porDepartamento.get(d) || 0) + 1); }
  const intermedio = abiertas.filter(a => !a.semana || a.estado === 'Planificada');
  return {pendientes: todas.filter(r => r.estado === 'Pendiente').length, vencidas: todas.filter(r => restriccionVencida(r, hoy)).length, liberadas: todas.filter(r => r.estado === 'Liberada').length,
    porTipo: [...porTipo].sort((a, b) => b[1] - a[1]), porDepartamento: [...porDepartamento].sort((a, b) => b[1] - a[1]), conITO: todas.filter(r => r.estado === 'Pendiente' && r.requiereITO).length,
    bloqueadas: intermedio.filter(a => !liberada(a)).length, listas: intermedio.filter(liberada).length};
}

// ---------- Rendimientos de lo ejecutado ----------
// Rendimiento = cantidad ejecutada / días trabajados; por persona-día si se registró la dotación y por HH si se registraron horas.
export function rendimiento(a) {
  const dias = a.diasReales ?? diasHabiles(a.inicioReal, a.finReal), q = a.cantidadEjecutada;
  if (!q || !dias) return null;
  const diasPlan = diasHabiles(a.inicioPlan, a.finPlan);
  return {cantidad: q, unidad: a.unidad, dias, diasPlan, porDia: q / dias, porPersonaDia: a.dotacion ? q / (a.dotacion * dias) : null, porHH: a.hh ? q / a.hh : null, desvio: diasPlan ? (dias - diasPlan) / diasPlan : null};
}
const claveActividad = a => a.actividad.trim().toLocaleLowerCase('es').replace(/\s+/g, ' ') + '|' + (a.unidad || '');
// Promedios ponderados (total ejecutado / total de días), más estables que el promedio de rendimientos individuales.
export function rendimientosPorActividad(lista) {
  const grupos = new Map();
  for (const a of [...lista].sort((x, y) => x.actualizada.localeCompare(y.actualizada))) {
    const r = rendimiento(a); if (!r) continue;
    const k = claveActividad(a), g = grupos.get(k) || {actividad: a.actividad, unidad: a.unidad, n: 0, cantidad: 0, dias: 0, qDot: 0, personaDias: 0, qHH: 0, hh: 0, diasReal: 0, diasPlan: 0, registros: []};
    g.actividad = a.actividad; g.n++; g.cantidad += r.cantidad; g.dias += r.dias; g.registros.push({a, r});
    if (a.dotacion) { g.qDot += r.cantidad; g.personaDias += a.dotacion * r.dias; }
    if (a.hh) { g.qHH += r.cantidad; g.hh += a.hh; }
    if (r.diasPlan) { g.diasReal += r.dias; g.diasPlan += r.diasPlan; }
    grupos.set(k, g);
  }
  return [...grupos.values()].map(g => ({actividad: g.actividad, unidad: g.unidad, n: g.n, cantidad: g.cantidad, dias: g.dias, porDia: g.cantidad / g.dias,
    porPersonaDia: g.personaDias ? g.qDot / g.personaDias : null, porHH: g.hh ? g.qHH / g.hh : null, desvio: g.diasPlan ? (g.diasReal - g.diasPlan) / g.diasPlan : null, registros: g.registros}))
    .sort((a, b) => b.n - a.n || a.actividad.localeCompare(b.actividad, 'es'));
}
// Días hábiles estimados para una cantidad: con la dotación si hay rendimiento por persona-día; si no, con el diario.
export function estimarDias(grupo, cantidad, dotacion) {
  if (!(cantidad > 0)) return null;
  if (dotacion > 0 && grupo.porPersonaDia) return cantidad / (grupo.porPersonaDia * dotacion);
  return grupo.porDia ? cantidad / grupo.porDia : null;
}

// ---------- Estado de un recinto para la capa del plano ----------
export const ESTADOS_RECINTO = ['No cumplida', 'Con restricción', 'En ejecución', 'Planificada', 'Cumplida', 'Sin actividades'];
export function estadoRecinto(lista) {
  if (!lista?.length) return 'Sin actividades';
  if (lista.some(a => a.estado === 'No cumplida')) return 'No cumplida';
  if (lista.some(a => !CERRADOS.has(a.estado) && !liberada(a))) return 'Con restricción';
  if (lista.some(a => a.estado === 'En ejecución')) return 'En ejecución';
  if (lista.some(a => a.estado === 'Planificada')) return 'Planificada';
  return 'Cumplida';
}

// ---------- Reuniones de producción, asistencia y frentes de trabajo ----------
export function validarReunion(r) {
  if (!r || r.schema !== 1 || !texto(r.id, 100) || !esFecha(r.fecha) || !TIPOS_REUNION.includes(r.tipo)) throw Error('Indica fecha y tipo de reunión.');
  if (!opcional(r.lugar, 160) || !opcional(r.notas, 4000)) throw Error('Lugar o notas no válidos.');
  if (!Array.isArray(r.asistentes) || r.asistentes.length > 120 || r.asistentes.some(p => !texto(p?.nombre, 160) || !opcional(p.empresa, 160) || !opcional(p.cargo, 160) || typeof p.asistio !== 'boolean')) throw Error('Revisa los asistentes: cada uno necesita nombre.');
  if (new Set(r.asistentes.map(p => p.nombre.trim().toLocaleLowerCase('es'))).size !== r.asistentes.length) throw Error('Hay un asistente repetido.');
  if (!Array.isArray(r.frentes) || r.frentes.length > 80 || r.frentes.some(f => !texto(f?.frente, 200) || !opcional(f.level, 30) || !opcional(f.sector, 60) || !opcional(f.responsable, 160) || !entero(f.dotacion) || !ESTADOS_FRENTE.includes(f.estado) || !opcional(f.nota, 500))) throw Error('Revisa los frentes de trabajo: cada uno necesita su descripción.');
  if (!Array.isArray(r.acuerdos) || r.acuerdos.length > 80 || r.acuerdos.some(c => !texto(c?.texto, 1000) || !opcional(c.responsable, 160) || (c.plazo != null && !esFecha(c.plazo)) || typeof c.cumplido !== 'boolean')) throw Error('Revisa los acuerdos: cada uno necesita su texto.');
  if (!texto(r.autor, 160)) throw Error('Indica quién registra la reunión.');
  if (![r.creada, r.actualizada].every(instante) || !Number.isSafeInteger(r.version) || r.version < 1) throw Error('Reunión inválida.');
  return r;
}
export function asistencia(r) {
  const convocados = r.asistentes.length, presentes = r.asistentes.filter(p => p.asistio).length;
  return {convocados, presentes, pct: convocados ? presentes / convocados : null};
}
// Asistencia acumulada por empresa (o por persona) en las reuniones indicadas.
export function asistenciaPor(reuniones, campo = 'empresa') {
  const grupos = new Map();
  for (const r of reuniones) for (const p of r.asistentes) {
    const k = (campo === 'empresa' ? p.empresa : p.nombre) || 'Sin empresa', g = grupos.get(k) || {key: k, convocado: 0, presente: 0};
    g.convocado++; if (p.asistio) g.presente++; grupos.set(k, g);
  }
  return [...grupos.values()].map(g => ({...g, pct: g.presente / g.convocado})).sort((a, b) => a.pct - b.pct || b.convocado - a.convocado || a.key.localeCompare(b.key, 'es'));
}
export const ultimaReunion = reuniones => [...reuniones].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creada.localeCompare(a.creada))[0] || null;
// Lista de la próxima reunión: mismos convocados y frentes, con la asistencia por marcar.
export const plantillaReunion = anterior => ({asistentes: (anterior?.asistentes || []).map(p => ({...p, asistio: false})), frentes: (anterior?.frentes || []).filter(f => f.estado !== 'Terminado').map(f => ({...f})), acuerdos: (anterior?.acuerdos || []).filter(c => !c.cumplido).map(c => ({...c}))});
