// Observaciones en terreno (lista de pendientes o «punch list») por recinto, con registro fotográfico.
// Reglas puras, sin almacenamiento: validación, transiciones de estado, vencimientos y resúmenes.
// Cada observación referencia un recinto existente; no modifica terminaciones, geometrías ni otras fuentes.
export const ESTADOS = ['Abierta', 'En corrección', 'Corregida', 'Cerrada', 'Descartada'];
// Pendientes de cierre: cuentan como abiertas en indicadores y vencimientos.
export const PENDIENTES = new Set(['Abierta', 'En corrección', 'Corregida']);
export const TRANSICIONES = {
  'Abierta': ['En corrección', 'Corregida', 'Descartada'],
  'En corrección': ['Corregida', 'Abierta', 'Descartada'],
  'Corregida': ['Cerrada', 'Abierta'],
  'Cerrada': ['Abierta'],
  'Descartada': ['Abierta']
};
export const CATEGORIAS = ['Pavimento', 'Cielo', 'Muros y tabiques', 'Pintura', 'Puertas y quincallería', 'Ventanas y vidrios', 'Instalaciones', 'Mobiliario y equipos', 'Aseo y orden', 'Seguridad', 'Otro'];
export const PRIORIDADES = ['Alta', 'Media', 'Baja'];
export const TERMINACIONES = {GENERAL: 'General del recinto', PAV: 'Pavimento', CIE: 'Cielo', M1: 'Muro M1', M2: 'Muro M2', M3: 'Muro M3', M4: 'Muro M4'};
export const TIPOS_FOTO = {antes: 'Antes', despues: 'Después'};
export const MAX_FOTOS = 12;

const texto = (v, max, min = 1) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const fecha = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const instante = v => typeof v === 'string' && Number.isFinite(Date.parse(v));

export function validarObservacion(o) {
  if (!o || o.schema !== 1 || !texto(o.id, 100) || !texto(o.level, 30)) throw Error('Observación inválida.');
  const r = o.room;
  if (!r || !texto(r.id, 160) || !texto(r.code, 160) || !texto(r.name, 500) || !texto(r.source, 300) || !texto(r.revision, 100)) throw Error('Recinto de la observación incompleto.');
  if (!(o.terminacion in TERMINACIONES)) throw Error('Terminación no válida.');
  if (o.codigo != null && !texto(o.codigo, 40)) throw Error('Código de terminación no válido.');
  if (!texto(o.descripcion, 2000, 3)) throw Error('Describe la observación (al menos 3 caracteres).');
  if (!CATEGORIAS.includes(o.categoria)) throw Error('Categoría no válida.');
  if (!PRIORIDADES.includes(o.prioridad)) throw Error('Prioridad no válida.');
  if (o.responsable != null && o.responsable !== '' && !texto(o.responsable, 160)) throw Error('Responsable no válido.');
  if (o.plazo != null && !fecha(o.plazo)) throw Error('Plazo no válido.');
  if (!ESTADOS.includes(o.estado)) throw Error('Estado no válido.');
  if (!texto(o.autor, 160)) throw Error('Indica quién registra la observación.');
  if (![o.creada, o.actualizada].every(instante) || (o.cerrada != null && !instante(o.cerrada))) throw Error('Fecha de registro no válida.');
  if (o.estado === 'Cerrada' && !o.cerrada) throw Error('Una observación cerrada requiere su fecha de cierre.');
  if (!Number.isSafeInteger(o.version) || o.version < 1) throw Error('Versión no válida.');
  if (!Array.isArray(o.fotos) || o.fotos.length > MAX_FOTOS) throw Error(`Máximo ${MAX_FOTOS} fotos por observación.`);
  const ids = new Set();
  for (const f of o.fotos) {
    if (!texto(f.id, 100) || ids.has(f.id) || !(f.tipo in TIPOS_FOTO) || !instante(f.at) || !texto(f.autor, 160)) throw Error('Foto mal registrada.');
    ids.add(f.id);
  }
  return o;
}

export function nuevaObservacion(valores, room, source, level, id, at = new Date().toISOString()) {
  const v = {...valores};
  return validarObservacion({schema: 1, id, level,
    room: {id: room.id, code: room.code, name: room.name, source: source.code, revision: source.revision},
    terminacion: v.terminacion || 'GENERAL', codigo: v.codigo || null, descripcion: String(v.descripcion ?? '').trim(),
    categoria: v.categoria, prioridad: v.prioridad || 'Media', responsable: String(v.responsable ?? '').trim() || null, plazo: v.plazo || null,
    estado: 'Abierta', autor: String(v.autor ?? '').trim(), creada: at, actualizada: at, cerrada: null, version: 1, fotos: []});
}

// Cambio de estado con sus exigencias. Devuelve la observación nueva (sin guardar) y la entrada de historial.
export function cambiarEstado(o, estado, {autor, comentario = '', at = new Date().toISOString()} = {}) {
  if (!TRANSICIONES[o.estado]?.includes(estado)) throw Error(`No se puede pasar de «${o.estado}» a «${estado}».`);
  const nota = String(comentario).trim();
  if (!texto(autor || '', 160)) throw Error('Indica quién hace el cambio.');
  if (estado === 'Corregida' && !nota && !o.fotos.some(f => f.tipo === 'despues')) throw Error('Para marcarla corregida agrega una foto «después» o un comentario de la corrección.');
  if ((estado === 'Descartada' || estado === 'Abierta') && !nota) throw Error(estado === 'Abierta' ? 'Indica por qué se reabre.' : 'Indica por qué se descarta.');
  const siguiente = validarObservacion({...o, estado, cerrada: estado === 'Cerrada' ? at : null, actualizada: at, version: o.version + 1});
  return {observacion: siguiente, historial: entrada(o.id, autor, 'estado', `${o.estado} → ${estado}`, nota, at)};
}

export function entrada(obsId, autor, accion, detalle, comentario = '', at = new Date().toISOString(), id = crypto.randomUUID()) {
  return {id, obsId, at, autor: String(autor).trim(), accion, detalle, comentario: String(comentario || '').trim()};
}

// El plazo es para corregir: una observación ya corregida (por verificar) no cuenta como vencida.
export const vencida = (o, hoy) => (o.estado === 'Abierta' || o.estado === 'En corrección') && !!o.plazo && o.plazo < hoy;
const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

// Estado de un recinto para la capa del plano.
export const ESTADOS_RECINTO = ['Con vencidas', 'Abiertas', 'Corregidas por verificar', 'Cerradas', 'Sin observaciones'];
export function estadoRecinto(lista, hoy) {
  if (!lista?.length) return 'Sin observaciones';
  if (lista.some(o => vencida(o, hoy))) return 'Con vencidas';
  if (lista.some(o => o.estado === 'Abierta' || o.estado === 'En corrección')) return 'Abiertas';
  if (lista.some(o => o.estado === 'Corregida')) return 'Corregidas por verificar';
  return 'Cerradas';
}

export function resumen(lista, hoy) {
  const porEstado = Object.fromEntries(ESTADOS.map(e => [e, 0])), porResponsable = new Map(), porCategoria = new Map();
  const cierres = [];
  for (const o of lista) {
    porEstado[o.estado]++;
    if (PENDIENTES.has(o.estado)) {
      const k = o.responsable || 'Sin responsable', r = porResponsable.get(k) || {pendientes: 0, vencidas: 0};
      r.pendientes++; if (vencida(o, hoy)) r.vencidas++; porResponsable.set(k, r);
      porCategoria.set(o.categoria, (porCategoria.get(o.categoria) || 0) + 1);
    }
    if (o.estado === 'Cerrada' && o.cerrada) cierres.push(dias(o.creada, o.cerrada));
  }
  return {total: lista.length, porEstado, pendientes: lista.filter(o => PENDIENTES.has(o.estado)).length, vencidas: lista.filter(o => vencida(o, hoy)).length,
    porVerificar: porEstado.Corregida, recintos: new Set(lista.filter(o => PENDIENTES.has(o.estado)).map(o => o.room.code)).size,
    diasCierre: cierres.length ? cierres.reduce((a, b) => a + b, 0) / cierres.length : null,
    porResponsable: [...porResponsable].sort((a, b) => b[1].pendientes - a[1].pendientes), porCategoria: [...porCategoria].sort((a, b) => b[1] - a[1])};
}

export const RESPALDO = 'atlas-observaciones-v1';
