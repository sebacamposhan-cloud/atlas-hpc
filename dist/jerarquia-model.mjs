// Jerarquía de obra dentro de Last Planner: cadena de mando, quién asigna a quién, qué funciones ve cada nivel,
// estados de las tareas (metas) y cómo sube el avance del hijo al padre. Sin DOM: lo usan la interfaz, el almacén
// local y el servidor (server/jerarquia.mjs). Lo prueba jerarquia-test.mjs.
// Las personas y sus jefes se cargan en Supabase (supabase/jerarquia.sql), nunca en el repositorio.
// Quien no tiene perfil activo sigue como hoy: sin libreta, con sus tarjetas y permisos de siempre.
import {PERMISSIONS, allowed, canonical, validateScope, scopeProgress, esFecha} from './lastplanner-cycle-model.mjs';

// ── Decisiones de esta versión (aún sin revisar por la obra): se cambian aquí y en supabase/jerarquia.sql ──
// Cada nivel asigna solo a sus reportes directos. Con true, también a cualquiera que dependa de él más abajo.
export const SALTAR_NIVELES = false;
// Niveles de la cadena que reparten trabajo. El 0 (gerencia) ve todo y no asigna; el 4 ejecuta y marca avance.
export const NIVELES_QUE_ASIGNAN = [1, 2, 3];

export const NIVELES = [
  {nivel: 0, cargo: 'Gerente de contrato'},
  {nivel: 1, cargo: 'Jefe general de terreno'},
  {nivel: 2, cargo: 'Jefe de terreno'},
  {nivel: 3, cargo: 'Jefe de terreno B'},
  {nivel: 4, cargo: 'Supervisor de piso o capataz'}
];
// «linea» es la cadena de mando. Planificación y Calidad son transversales: fuera de la cadena y ven todo.
export const AREAS = ['linea', 'planificacion', 'calidad'];
export const AREA_NOMBRE = {linea: 'Terreno', planificacion: 'Planificación', calidad: 'Calidad'};

// Tope de permisos de Last Planner (los de app_metadata.lastplanner_permissions) según nivel o área.
// Se cruza con los permisos de la cuenta: nunca da más de lo que la cuenta ya tiene.
const TODOS = [...PERMISSIONS];
export const PERMISOS_NIVEL = {0: [], 1: TODOS, 2: TODOS, 3: TODOS, 4: ['execution', 'attendance', 'restriction', 'evidence']};
export const PERMISOS_AREA = {planificacion: TODOS, calidad: ['verify', 'evidence', 'restriction']};

// Estados de una tarea. «hecha» es lo que marca quien la recibe; «confirmada» o «devuelta», lo que decide quien la dio.
export const ESTADOS = ['asignada', 'en_curso', 'hecha', 'confirmada', 'devuelta', 'anulada'];
export const ETIQUETA = {asignada: 'Por hacer', en_curso: 'En curso', hecha: 'Por confirmar', confirmada: 'Confirmada', devuelta: 'Devuelta', anulada: 'Anulada'};
export const ABIERTAS = ['asignada', 'en_curso', 'devuelta'];
export const ACCIONES = ['asignar', 'editar', 'avanzar', 'hecha', 'confirmar', 'devolver', 'reasignar', 'anular'];
// Permiso de Last Planner que exige cada acción, además de la regla de jerarquía.
export const PERMISO_ACCION = {asignar: 'draft', editar: 'draft', reasignar: 'draft', anular: 'draft', avanzar: 'execution', hecha: 'execution', confirmar: 'verify', devolver: 'verify'};
// Campos que puede cambiar cada acción sobre una tarea existente (además de versión y auditoría).
export const CAMPOS_ACCION = {
  editar: ['titulo', 'detalle', 'fechaLimite', 'alcances', 'marcas'],
  avanzar: ['marcas', 'avanceManual', 'estado'],
  hecha: ['estado', 'nota'],
  confirmar: ['estado', 'nota'],
  devolver: ['estado', 'motivo'],
  reasignar: ['asignadaA', 'asignadaPor', 'estado', 'motivo'],
  anular: ['estado', 'motivo']
};
const AUDITORIA = ['version', 'actualizada', 'historial'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const falla = m => { throw Error(m); };
const texto = (v, min = 1, max = 1000) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const copia = v => structuredClone(v);
const ahora = () => new Date().toISOString();
const nuevoId = () => crypto.randomUUID();
export const esUuid = v => typeof v === 'string' && UUID.test(v);

// ── Personas ──
// Fila de atlas_personas (Supabase) o su copia local → perfil de Atlas. Devuelve null si no sirve.
export function perfilDesdeFila(f) {
  if (!f || !esUuid(f.user_id ?? f.id)) return null;
  const area = AREAS.includes(f.area) ? f.area : 'linea';
  const nivel = f.nivel === null || f.nivel === undefined || f.nivel === '' ? null : Number(f.nivel);
  const p = {id: f.user_id ?? f.id, nombre: String(f.nombre || '').trim().slice(0, 160), cargo: String(f.cargo || '').trim().slice(0, 120),
    nivel: Number.isInteger(nivel) ? nivel : null, area, jefe: esUuid(f.jefe) ? f.jefe : null,
    pisos: Array.isArray(f.pisos) ? f.pisos.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [],
    empresa: f.empresa ? String(f.empresa).trim().slice(0, 160) : null, activo: f.activo !== false};
  try { return validarPerfil(p); } catch { return null; }
}
export function validarPerfil(p) {
  if (!esUuid(p?.id) || !AREAS.includes(p.area)) falla('Perfil sin cuenta o área válida.');
  if (p.area === 'linea' ? !NIVELES.some(n => n.nivel === p.nivel) : p.nivel !== null) falla('La cadena de terreno usa niveles 0 a 4; Planificación y Calidad no llevan nivel.');
  if (p.jefe === p.id) falla('Una persona no puede ser su propio jefe.');
  if (!Array.isArray(p.pisos)) falla('Pisos inválidos.');
  return p;
}
export const perfilActivo = p => !!p && p.activo !== false;
export const nombreDe = p => p ? (p.nombre || p.cargo || 'Cuenta sin nombre') : 'Persona sin perfil';
export const cargoDe = p => !p ? '' : p.area === 'linea' ? (p.cargo || NIVELES.find(n => n.nivel === p.nivel)?.cargo || '') : (p.cargo || AREA_NOMBRE[p.area]);
// Gerencia (nivel 0), Planificación y Calidad ven todo.
export const veTodo = p => perfilActivo(p) && (p.area !== 'linea' || p.nivel === 0);
const mapa = personas => personas instanceof Map ? personas : new Map((personas || []).map(p => [p.id, p]));

// Jefes hacia arriba, del directo al más alto. Se detiene si encuentra un ciclo.
export function cadena(personas, id) {
  const m = mapa(personas), arriba = [], vistos = new Set([id]);
  for (let p = m.get(id); p?.jefe && !vistos.has(p.jefe); p = m.get(p.jefe)) { vistos.add(p.jefe); arriba.push(p.jefe); }
  return arriba;
}
// Todos los que dependen de alguien, en cualquier nivel más abajo (no incluye a la persona).
export function equipo(personas, id) {
  const lista = [...mapa(personas).values()], dentro = new Set(), pendientes = [id];
  while (pendientes.length) { const jefe = pendientes.pop(); for (const p of lista) if (p.jefe === jefe && p.id !== id && !dentro.has(p.id)) { dentro.add(p.id); pendientes.push(p.id); } }
  return dentro;
}
export const directos = (personas, id) => [...mapa(personas).values()].filter(p => p.jefe === id);
export const esSuperior = (personas, superior, persona) => !!superior && superior !== persona && cadena(personas, persona).includes(superior);

// ¿Puede «actor» asignarle trabajo a «destino»? Devuelve el motivo si no, para mostrarlo tal cual.
export function motivoNoAsigna(personas, actorId, destinoId, {saltar = SALTAR_NIVELES} = {}) {
  const m = mapa(personas), yo = m.get(actorId), otro = m.get(destinoId);
  if (!perfilActivo(yo)) return 'Tu cuenta no tiene un perfil activo en la jerarquía de obra.';
  if (yo.area !== 'linea' || !NIVELES_QUE_ASIGNAN.includes(yo.nivel)) return 'Tu cargo no asigna tareas en esta versión.';
  if (!perfilActivo(otro)) return 'Esa persona no tiene un perfil activo.';
  if (otro.id === yo.id) return 'No puedes asignarte tareas a ti mismo.';
  if (otro.area !== 'linea') return 'Planificación y Calidad están fuera de la cadena de asignación.';
  if (otro.jefe === yo.id) return null;
  if (saltar && esSuperior(m, yo.id, otro.id)) return null;
  return 'Solo puedes asignar a quienes dependen directamente de ti.';
}
export const puedeAsignar = (personas, actorId, destinoId, opciones) => !motivoNoAsigna(personas, actorId, destinoId, opciones);
export function asignables(personas, actorId, opciones) {
  return [...mapa(personas).values()].filter(p => puedeAsignar(personas, actorId, p.id, opciones)).sort((a, b) => (a.nivel ?? 9) - (b.nivel ?? 9) || nombreDe(a).localeCompare(nombreDe(b), 'es'));
}
// La persona trabaja en ese piso. Sin pisos en su perfil, trabaja en todos.
export const trabajaEnPiso = (p, piso) => !p?.pisos?.length || p.pisos.includes(piso);

// ── Qué ve cada nivel ──
// Tarjetas de Control de obra y sus funciones. null = como hoy. La tarjeta «tareas» es la libreta.
export function funcionesDe(perfil) {
  if (!perfilActivo(perfil)) return null;
  const asigna = perfil.area === 'linea' && NIVELES_QUE_ASIGNAN.includes(perfil.nivel);
  const recibe = perfil.area === 'linea' && perfil.nivel >= 2;
  const tareas = [...(recibe ? ['mias'] : []), ...(asigna ? ['asignar', 'equipo'] : []), ...(!asigna && veTodo(perfil) ? ['equipo'] : [])];
  // Supervisores y capataces: su libreta, avance y observaciones de su piso, protocolos y filtros. Last Planner es de jefatura.
  if (perfil.area === 'linea' && perfil.nivel === 4) return {tareas, tarjetas: ['tareas', 'recintos', 'protocolos', 'herramientas'], funciones: {recintos: ['avance', 'observaciones'], protocolos: ['tipos', 'criticos'], herramientas: ['filtros', 'mas']}};
  return {tareas, tarjetas: ['tareas', 'lastplanner', 'recintos', 'protocolos', 'herramientas'], funciones: {}};
}
// Permisos de Last Planner que quedan para la cuenta. Sin perfil activo: los de la cuenta, sin cambios (null = todos).
export function permisosLastPlanner(perfil, permisosCuenta) {
  if (!perfilActivo(perfil)) return permisosCuenta ?? null;
  const tope = perfil.area === 'linea' ? PERMISOS_NIVEL[perfil.nivel] || [] : PERMISOS_AREA[perfil.area] || [];
  return (permisosCuenta ?? PERMISSIONS).filter(p => tope.includes(p));
}
// Pisos que puede abrir: un capataz o supervisor con pisos en su perfil solo ve los suyos.
export const pisoVisible = (perfil, piso) => !perfilActivo(perfil) || perfil.area !== 'linea' || perfil.nivel !== 4 || trabajaEnPiso(perfil, piso);

// ── Visibilidad de tareas ──
export function puedeVerMeta(personas, actorId, meta) {
  const yo = mapa(personas).get(actorId);
  if (!perfilActivo(yo)) return false;
  if (veTodo(yo) || meta.asignadaA === actorId || meta.asignadaPor === actorId) return true;
  const mio = equipo(personas, actorId);
  return mio.has(meta.asignadaA) || mio.has(meta.asignadaPor);
}
// Quien la dio, o cualquiera más arriba en su cadena, puede confirmar, devolver, editar o anular.
export const gestiona = (personas, actorId, meta) => meta.asignadaPor === actorId || esSuperior(personas, actorId, meta.asignadaPor);

// ── Tareas ──
export function validarMeta(m) {
  if (!esUuid(m?.id) || !Number.isSafeInteger(m.version) || m.version < 1) falla('Tarea sin identidad o versión.');
  if (!esUuid(m.asignadaA) || !esUuid(m.asignadaPor) || !ESTADOS.includes(m.estado)) falla('Tarea sin persona o estado válido.');
  if (!texto(m.titulo, 3, 200)) falla('Escribe qué hay que hacer (de 3 a 200 letras).');
  if (m.detalle != null && !(typeof m.detalle === 'string' && m.detalle.length <= 2000)) falla('El detalle es demasiado largo.');
  if (m.padre != null && !esUuid(m.padre)) falla('Tarea de origen inválida.');
  if (m.padre === m.id) falla('Una tarea no puede salir de sí misma.');
  if (m.piso != null && !texto(m.piso, 1, 30)) falla('Piso inválido.');
  if (m.actividadId != null && !texto(m.actividadId, 1, 100)) falla('Actividad de Last Planner inválida.');
  if (m.fechaLimite != null && !esFecha(m.fechaLimite)) falla('Fecha límite inválida.');
  if (!Array.isArray(m.alcances) || m.alcances.length > 600 || new Set(m.alcances.map(s => s.id)).size !== m.alcances.length) falla('Frente de trabajo con superficies repetidas.');
  m.alcances.forEach(s => { validateScope(s); if (m.piso && s.level && s.level !== m.piso) falla('Todo el frente debe estar en el piso de la tarea.'); });
  if (!m.marcas || typeof m.marcas !== 'object' || Array.isArray(m.marcas)) falla('Marcas de avance inválidas.');
  for (const [scopeId, v] of Object.entries(m.marcas)) {
    if (!m.alcances.some(s => s.id === scopeId)) falla('Marcaste una superficie fuera del frente asignado.');
    if (typeof v?.avance !== 'number' || !(v.avance >= 0 && v.avance <= 1) || !esUuid(v.actor) || !texto(v.at, 10, 40)) falla('Marca de avance inválida.');
  }
  if (typeof m.avanceManual !== 'number' || !(m.avanceManual >= 0 && m.avanceManual <= 1)) falla('Avance inválido.');
  if (['devuelta', 'anulada'].includes(m.estado) && !texto(m.motivo, 1, 2000)) falla('Indica el motivo.');
  if (!Array.isArray(m.historial) || !m.historial.length) falla('Falta el historial de la tarea.');
  return m;
}
const registro = (actor, operacion, detalle = {}, at = ahora()) => ({id: nuevoId(), at, autor: actor.email, actor: actor.id, operacion, ...copia(detalle)});
// Igual que changed() de Last Planner: versión, autoría original inalterable e historial que solo crece.
export function cambiar(previa, siguiente, actor, operacion, detalle = {}, at = ahora()) {
  return {...copia(siguiente), version: (previa?.version || 0) + 1, actualizada: at, autor: previa?.autor || actor.email, creada: previa?.creada || at, historial: [...(previa?.historial || []), registro(actor, operacion, detalle, at)]};
}
const exigirPermiso = (actor, accion) => { if (!allowed(actor, PERMISO_ACCION[accion])) falla('Tu cuenta no tiene permiso para esta acción. Pide a la administración que te lo asigne.'); };
const exigirAbierta = m => { if (!ABIERTAS.includes(m.estado)) falla('La tarea ya no está abierta.'); };
// Superficie del frente dentro de la actividad: la misma o una parte de ella (plannedScopeId del selector).
const enActividad = (s, actividad) => actividad.alcances.some(a => a.id === (s.plannedScopeId || s.id));

// Asignar: actor es la cuenta autenticada; personas, las visibles; metas, las tareas locales (para el padre).
export function crearMeta(valores, actor, personas, metas = [], {actividad = null, id = nuevoId(), at = ahora()} = {}) {
  exigirPermiso(actor, 'asignar');
  const motivo = motivoNoAsigna(personas, actor.id, valores.asignadaA); if (motivo) falla(motivo);
  const destino = mapa(personas).get(valores.asignadaA), piso = valores.piso || actividad?.level || null;
  if (destino.pisos.length && !piso) falla('Indica el piso: esa persona trabaja solo en ' + destino.pisos.join(', ') + '.');
  if (piso && !trabajaEnPiso(destino, piso)) falla('Esa persona no trabaja en ese piso.');
  if (valores.padre) {
    const padre = metas.find(m => m.id === valores.padre);
    if (!padre || padre.asignadaA !== actor.id) falla('Solo puedes repartir tareas que te asignaron a ti.');
    exigirAbierta(padre);
    if (padre.piso && padre.piso !== piso) falla('La tarea debe quedar en el piso de la tarea recibida.');
  }
  if (valores.actividadId && (!actividad || actividad.id !== valores.actividadId)) falla('La actividad de Last Planner no está en este equipo. Sincroniza y vuelve a intentar.');
  if (actividad && actividad.level !== piso) falla('La tarea debe quedar en el piso de la actividad.');
  const alcances = copia(valores.alcances || []);
  if (actividad && alcances.some(s => !enActividad(s, actividad))) falla('El frente debe estar dentro de la actividad de Last Planner.');
  const meta = {id, padre: valores.padre || null, asignadaA: destino.id, asignadaPor: actor.id, estado: 'asignada', titulo: String(valores.titulo || '').trim(),
    detalle: valores.detalle ? String(valores.detalle).trim() : null, piso, actividadId: actividad?.id || null, fechaLimite: valores.fechaLimite || null,
    alcances, marcas: {}, avanceManual: 0, motivo: null, nota: null};
  return validarMeta(cambiar(null, meta, actor, 'Asignar tarea', {a: destino.id}, at));
}
export function editarMeta(m, cambios, actor, personas, {actividad = null, at = ahora()} = {}) {
  exigirPermiso(actor, 'editar'); if (!gestiona(personas, actor.id, m)) falla('Solo quien asignó la tarea, o su jefatura, puede cambiarla.'); exigirAbierta(m);
  const siguiente = {...m, ...Object.fromEntries(Object.entries(copia(cambios)).filter(([k]) => CAMPOS_ACCION.editar.includes(k) && k !== 'marcas'))};
  if (cambios.titulo !== undefined) siguiente.titulo = String(cambios.titulo).trim();
  if (actividad && siguiente.alcances.some(s => !enActividad(s, actividad))) falla('El frente debe estar dentro de la actividad de Last Planner.');
  // Las marcas de superficies que siguen en el frente se conservan; las de superficies quitadas, no.
  siguiente.marcas = Object.fromEntries(Object.entries(m.marcas).filter(([k]) => siguiente.alcances.some(s => s.id === k)));
  return validarMeta(cambiar(m, siguiente, actor, 'Editar tarea', {}, at));
}
// marcas: {scopeId: avance 0..1}. Sin superficies en el frente se usa avanceManual (0..1).
export function marcarAvance(m, {marcas = {}, avanceManual} = {}, actor, {at = ahora()} = {}) {
  exigirPermiso(actor, 'avanzar'); if (m.asignadaA !== actor.id) falla('Solo quien recibió la tarea marca su avance.'); exigirAbierta(m);
  const siguientes = copia(m.marcas);
  for (const [scopeId, avance] of Object.entries(marcas)) {
    if (!m.alcances.some(s => s.id === scopeId)) falla('Esa superficie no es parte del frente asignado.');
    if (!(avance >= 0 && avance <= 1)) falla('El avance va de 0 a 100 %.');
    if (avance === 0) delete siguientes[scopeId]; else siguientes[scopeId] = {avance, at, actor: actor.id};
  }
  const manual = avanceManual === undefined ? m.avanceManual : avanceManual;
  if (!(manual >= 0 && manual <= 1)) falla('El avance va de 0 a 100 %.');
  return validarMeta(cambiar(m, {...m, marcas: siguientes, avanceManual: manual, estado: 'en_curso'}, actor, 'Marcar avance', {}, at));
}
export function marcarHecha(m, actor, {nota = null, at = ahora()} = {}) {
  exigirPermiso(actor, 'hecha'); if (m.asignadaA !== actor.id) falla('Solo quien recibió la tarea la marca como hecha.'); exigirAbierta(m);
  return validarMeta(cambiar(m, {...m, estado: 'hecha', nota: nota ? String(nota).trim().slice(0, 2000) : m.nota}, actor, 'Marcar hecha', {}, at));
}
export function confirmarMeta(m, actor, personas, {nota = null, at = ahora()} = {}) {
  exigirPermiso(actor, 'confirmar'); if (!gestiona(personas, actor.id, m)) falla('La confirma quien asignó la tarea o su jefatura.');
  if (m.estado !== 'hecha') falla('Solo se confirma una tarea marcada como hecha.');
  return validarMeta(cambiar(m, {...m, estado: 'confirmada', nota: nota ? String(nota).trim().slice(0, 2000) : m.nota}, actor, 'Confirmar tarea', {}, at));
}
export function devolverMeta(m, motivo, actor, personas, {at = ahora()} = {}) {
  exigirPermiso(actor, 'devolver'); if (!gestiona(personas, actor.id, m)) falla('La devuelve quien asignó la tarea o su jefatura.');
  if (m.estado !== 'hecha') falla('Solo se devuelve una tarea marcada como hecha.'); if (!texto(motivo, 3, 2000)) falla('Explica qué falta para devolverla.');
  return validarMeta(cambiar(m, {...m, estado: 'devuelta', motivo: motivo.trim()}, actor, 'Devolver tarea', {motivo: motivo.trim()}, at));
}
// Si alguien falta o cambia de cargo: su jefe pasa la tarea abierta a otro de sus reportes. Las marcas se conservan.
export function reasignarMeta(m, destinoId, motivo, actor, personas, {at = ahora()} = {}) {
  exigirPermiso(actor, 'reasignar'); exigirAbierta(m);
  if (!gestiona(personas, actor.id, m) && !esSuperior(personas, actor.id, m.asignadaA)) falla('Solo la jefatura de esa persona puede reasignar la tarea.');
  if (destinoId === m.asignadaA) falla('Elige a otra persona.');
  const no = motivoNoAsigna(personas, actor.id, destinoId); if (no) falla(no);
  if (m.piso && !trabajaEnPiso(mapa(personas).get(destinoId), m.piso)) falla('Esa persona no trabaja en ese piso.');
  if (!texto(motivo, 3, 2000)) falla('Indica por qué se reasigna.');
  return validarMeta(cambiar(m, {...m, asignadaA: destinoId, asignadaPor: actor.id, estado: 'asignada', motivo: motivo.trim()}, actor, 'Reasignar tarea', {de: m.asignadaA, a: destinoId, motivo: motivo.trim()}, at));
}
export function anularMeta(m, motivo, actor, personas, {at = ahora()} = {}) {
  exigirPermiso(actor, 'anular'); if (!gestiona(personas, actor.id, m)) falla('La anula quien asignó la tarea o su jefatura.');
  if (['confirmada', 'anulada'].includes(m.estado)) falla('La tarea ya está cerrada.'); if (!texto(motivo, 3, 2000)) falla('Indica por qué se anula.');
  return validarMeta(cambiar(m, {...m, estado: 'anulada', motivo: motivo.trim()}, actor, 'Anular tarea', {motivo: motivo.trim()}, at));
}

// Control del servidor: el registro enviado debe ser exactamente un paso permitido desde el anterior.
export function validarMutacion(previa, siguiente, accion, actor, personas, {metas = [], actividad = null} = {}) {
  if (!ACCIONES.includes(accion)) falla('Acción no válida.');
  exigirPermiso(actor, accion); validarMeta(siguiente);
  if (accion === 'asignar') {
    if (previa) falla('La tarea ya existe.');
    const esperada = crearMeta(siguiente, actor, personas, metas, {actividad, id: siguiente.id, at: siguiente.creada});
    const estable = v => { const {historial, ...resto} = v; return {...resto, historial: historial.map(({id, ...h}) => h)}; };
    if (canonical(estable(esperada)) !== canonical(estable(siguiente)) || siguiente.historial.length !== 1) falla('La tarea nueva no coincide con lo que permite asignar.');
    return siguiente;
  }
  if (!previa) falla('La tarea no existe.');
  if (siguiente.id !== previa.id || siguiente.version !== previa.version + 1) falla('La tarea cambió en otro equipo. Vuelve a abrirla.');
  if (siguiente.creada !== previa.creada || siguiente.autor !== previa.autor) falla('La autoría original es inalterable.');
  if (canonical(siguiente.historial.slice(0, previa.historial.length)) !== canonical(previa.historial) || siguiente.historial.length !== previa.historial.length + 1) falla('El historial es inalterable.');
  const ultimo = siguiente.historial.at(-1);
  if (ultimo.actor !== actor.id || ultimo.autor !== actor.email || siguiente.actualizada !== ultimo.at) falla('La operación debe conservar su usuario y fecha.');
  const libres = new Set([...CAMPOS_ACCION[accion], ...AUDITORIA]), fijo = v => Object.fromEntries(Object.entries(v).filter(([k]) => !libres.has(k)));
  if (canonical(fijo(previa)) !== canonical(fijo(siguiente))) falla('La operación cambia datos que no le corresponden.');
  const at = siguiente.actualizada;
  // Se rehace el paso con las reglas y se compara con lo enviado.
  const esperada = accion === 'editar' ? editarMeta(previa, siguiente, actor, personas, {actividad, at})
    : accion === 'avanzar' ? marcarAvance(previa, {marcas: Object.fromEntries([...new Set([...Object.keys(previa.marcas), ...Object.keys(siguiente.marcas)])].filter(k => canonical(previa.marcas[k]) !== canonical(siguiente.marcas[k])).map(k => [k, siguiente.marcas[k]?.avance ?? 0])), avanceManual: siguiente.avanceManual}, actor, {at})
    : accion === 'hecha' ? marcarHecha(previa, actor, {nota: siguiente.nota, at})
    : accion === 'confirmar' ? confirmarMeta(previa, actor, personas, {nota: siguiente.nota, at})
    : accion === 'devolver' ? devolverMeta(previa, siguiente.motivo || '', actor, personas, {at})
    : accion === 'reasignar' ? reasignarMeta(previa, siguiente.asignadaA, siguiente.motivo || '', actor, personas, {at})
    : anularMeta(previa, siguiente.motivo || '', actor, personas, {at});
  const sinHistorial = v => { const {historial, ...resto} = v; return resto; };
  if (canonical(sinHistorial(esperada)) !== canonical(sinHistorial(siguiente)) || canonical({...ultimo, id: null}) !== canonical({...esperada.historial.at(-1), id: null})) falla('La tarea enviada no coincide con lo que permite esa acción.');
  return siguiente;
}

// ── Avance que sube por la cadena ──
// Peso de cada superficie: sus m² o ml medidos si todo el frente comparte unidad; si no, cada superficie pesa lo mismo.
function pesos(alcances) {
  const unidades = new Set(alcances.map(s => s.measurement?.unit || null));
  const medido = unidades.size === 1 && !unidades.has(null) && alcances.every(s => s.measurement.value > 0);
  return alcances.map(s => medido ? s.measurement.value : 1);
}
const promedio = (valores, w) => { const total = w.reduce((n, x) => n + x, 0); return total ? valores.reduce((n, v, i) => n + v * w[i], 0) / total : 0; };
// Avance propio: hecha o confirmada = 100 %; si no, sus superficies marcadas, o el avance manual si no tiene frente.
export function avancePropio(m) {
  if (m.estado === 'hecha' || m.estado === 'confirmada') return 1;
  if (!m.alcances.length) return m.avanceManual || 0;
  return promedio(m.alcances.map(s => m.marcas[s.id]?.avance || 0), pesos(m.alcances));
}
// Con tareas hijas, el avance es el promedio de las hijas (sin anuladas); sin hijas, el propio.
export function avanceMeta(m, metas, vistos = new Set()) {
  if (m.estado === 'confirmada') return 1;
  if (vistos.has(m.id)) return avancePropio(m); vistos.add(m.id);
  const hijas = metas.filter(h => h.padre === m.id && h.estado !== 'anulada');
  if (!hijas.length) return avancePropio(m);
  const hijo = hijas.map(h => avanceMeta(h, metas, vistos));
  return m.estado === 'hecha' ? 1 : hijo.reduce((n, v) => n + v, 0) / hijo.length;
}
export function resumen(lista, metas = lista) {
  const vivas = lista.filter(m => m.estado !== 'anulada'), confirmadas = vivas.filter(m => m.estado === 'confirmada').length;
  return {total: vivas.length, abiertas: vivas.filter(m => ABIERTAS.includes(m.estado)).length, porConfirmar: vivas.filter(m => m.estado === 'hecha').length, confirmadas,
    devueltas: vivas.filter(m => m.estado === 'devuelta').length, cumplimiento: vivas.length ? confirmadas / vivas.length : null,
    avance: vivas.length ? vivas.reduce((n, m) => n + avanceMeta(m, metas), 0) / vivas.length : null};
}
// Lo asignado a cada persona del equipo. Jefatura: sus reportes directos; gerencia y áreas: toda persona con tareas.
export function resumenEquipo(personas, metas, actorId) {
  const m = mapa(personas), yo = m.get(actorId); if (!perfilActivo(yo)) return [];
  const mios = directos(m, actorId);
  const filas = mios.length ? mios : veTodo(yo) ? [...m.values()].filter(p => p.id !== actorId && metas.some(x => x.asignadaA === p.id)) : [];
  return filas.sort((a, b) => (a.nivel ?? 9) - (b.nivel ?? 9) || nombreDe(a).localeCompare(nombreDe(b), 'es'))
    .map(p => ({persona: p, ...resumen(metas.filter(x => x.asignadaA === p.id), metas)}));
}
// Contador de la libreta: lo que tengo por hacer y lo que debo confirmar.
export function pendientes(metas, actorId) {
  const porHacer = metas.filter(m => m.asignadaA === actorId && ABIERTAS.includes(m.estado)).length;
  const porConfirmar = metas.filter(m => m.asignadaPor === actorId && m.estado === 'hecha').length;
  return {porHacer, porConfirmar, total: porHacer + porConfirmar};
}
export const vencida = (m, hoy) => !!m.fechaLimite && ABIERTAS.includes(m.estado) && m.fechaLimite < hoy;

// Avance real de una actividad de Last Planner por superficie: el mayor entre lo informado en Last Planner y lo
// marcado en las tareas. No se suman dos veces la misma superficie. No cambia el PPC ni la verificación de Last Planner.
export function avanceActividad(actividad, metas) {
  const propias = metas.filter(m => m.actividadId === actividad.id && m.estado !== 'anulada');
  const porSuperficie = actividad.alcances.map(s => {
    const lps = actividad.ejecuciones ? scopeProgress(actividad, s.id).avance : 0;
    const tareas = propias.flatMap(m => m.alcances.filter(a => (a.plannedScopeId || a.id) === s.id).map(a => m.estado === 'hecha' || m.estado === 'confirmada' ? 1 : m.marcas[a.id]?.avance || 0));
    return Math.max(lps, ...tareas, 0);
  });
  return {avance: actividad.alcances.length ? promedio(porSuperficie, pesos(actividad.alcances)) : 0, tareas: propias.length, porSuperficie};
}
