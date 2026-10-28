// User annotations reference existing rooms; source properties and geometry stay untouched.
// Esquema 1: documento de marcado con un color. Esquema 2 (proyectos): estados con leyenda ordenados de menor a mayor avance,
// un estado por recinto y cortes con fecha (fotografías del avance) para comparar períodos. Los documentos del esquema 1 siguen siendo válidos.
const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const color = value => /^#[a-f0-9]{6}$/i.test(value);
export const MAX_ESTADOS = 8, MAX_CORTES = 120;
export const PLANTILLAS = {
  marcado: [{id: 'marcado', nombre: 'Marcado', color: '#2874c7'}],
  avance: [{id: 'pendiente', nombre: 'Pendiente', color: '#9aa3ad'}, {id: 'ejecucion', nombre: 'En ejecución', color: '#d9a21b'}, {id: 'terminado', nombre: 'Terminado', color: '#2e9e5b'}]
};
function validarEstados(estados) {
  if (!Array.isArray(estados) || !estados.length || estados.length > MAX_ESTADOS) throw Error(`Un proyecto necesita entre 1 y ${MAX_ESTADOS} estados.`);
  const ids = new Set(), nombres = new Set();
  for (const e of estados) {
    if (!text(e.id, 40) || !text(e.nombre, 40) || !color(e.color)) throw Error('Estado de la leyenda incompleto: nombre y color.');
    const n = e.nombre.trim().toLowerCase();
    if (ids.has(e.id) || nombres.has(n)) throw Error('Estados repetidos en la leyenda.');
    ids.add(e.id); nombres.add(n);
  }
  return ids;
}
export function validateMarking(doc) {
  if (!doc || ![1, 2].includes(doc.schema) || doc.specialty !== 'architecture' || !text(doc.id, 100) || !text(doc.level, 30)) throw Error('Documento de Arquitectura inválido.');
  for (const [key, label, max] of [['name', 'Nombre del documento', 160], ['author', 'Quién lo realizó', 160], ['purpose', 'Para qué es el plano', 2000]]) {
    if (!text(doc[key], max)) throw Error(label + ': completa este campo obligatorio.');
  }
  if (!color(doc.color)) throw Error('Color inválido.');
  if (!Number.isSafeInteger(doc.version) || doc.version < 1 || !Number.isSafeInteger(doc.nextNumber) || doc.nextNumber < 1) throw Error('Versión o numeración inválida.');
  if (![doc.createdAt, doc.updatedAt].every(at => typeof at === 'string' && Number.isFinite(Date.parse(at)))) throw Error('Fecha inválida.');
  if (!Array.isArray(doc.rooms) || doc.rooms.length > 10000) throw Error('Lista de recintos inválida.');
  const estados = doc.schema === 2 ? validarEstados(doc.estados) : null;
  const ids = new Set(), numbers = new Set();
  for (const room of doc.rooms) {
    if (!text(room.id, 160) || !text(room.code, 160) || !text(room.name, 500) || !text(room.source, 300) || !text(room.revision, 100)) throw Error('Referencia de recinto incompleta.');
    if (!Number.isSafeInteger(room.number) || room.number < 1 || room.number >= doc.nextNumber || numbers.has(room.number) || ids.has(room.id)) throw Error('Recinto o número repetido/inválido.');
    if (estados && !estados.has(room.estado)) throw Error('Recinto con un estado que no está en la leyenda.');
    ids.add(room.id); numbers.add(room.number);
  }
  if (doc.schema === 2) {
    if (!Array.isArray(doc.cortes) || doc.cortes.length > MAX_CORTES) throw Error('Lista de cortes inválida.');
    const cortes = new Set();
    for (const c of doc.cortes) {
      if (!text(c.id, 100) || cortes.has(c.id) || !text(c.nombre, 120) || !/^\d{4}-\d{2}-\d{2}$/.test(c.fecha || '') || !Number.isFinite(Date.parse(c.creado)) || !text(c.autor, 160) || !Array.isArray(c.rooms)) throw Error('Corte mal registrado.');
      const enCorte = new Set();
      for (const r of c.rooms) { if (!text(r.id, 160) || !text(r.code, 160) || !text(r.name, 500) || !text(r.estado, 40) || enCorte.has(r.id)) throw Error('Recinto mal registrado en un corte.'); enCorte.add(r.id); }
      cortes.add(c.id);
    }
  }
  return doc;
}
export function newMarking(values, level, id, at = new Date().toISOString()) {
  const principal = values.color || '#2874c7';
  const estados = values.estados?.length ? values.estados.map(e => ({id: e.id, nombre: String(e.nombre ?? '').trim(), color: e.color})) : [{...PLANTILLAS.marcado[0], color: principal}];
  return validateMarking({schema: 2, specialty: 'architecture', id, level,
    name: String(values.name ?? '').trim(), author: String(values.author ?? '').trim(), purpose: String(values.purpose ?? '').trim(),
    color: principal, estados, cortes: [], createdAt: at, updatedAt: at, version: 1, nextNumber: 1, rooms: []});
}
// Lleva un documento del esquema 1 al esquema 2 con un único estado «Marcado» de su color.
export function upgradeMarking(doc) {
  if (doc.schema === 2) return doc;
  return validateMarking({...doc, schema: 2, estados: [{...PLANTILLAS.marcado[0], color: doc.color}], cortes: [], rooms: doc.rooms.map(r => ({...r, estado: 'marcado'}))});
}
const estadoInicial = doc => doc.schema === 2 ? doc.estados[0].id : undefined;
// Pinta un recinto. Sin estado indicado, un recinto ya marcado no cambia (un toque repetido no duplica ni borra).
export function addMarkedRoom(doc, room, source, estado) {
  const actual = doc.rooms.find(mark => mark.id === room.id);
  if (actual) {
    if (doc.schema !== 2 || estado == null || actual.estado === estado) return doc;
    return validateMarking({...doc, rooms: doc.rooms.map(mark => mark.id === room.id ? {...mark, estado} : mark)});
  }
  const mark = {id: room.id, code: room.code, name: room.name, source: source.code, revision: source.revision, number: doc.nextNumber, ...(doc.schema === 2 ? {estado: estado ?? estadoInicial(doc)} : {})};
  return validateMarking({...doc, rooms: [...doc.rooms, mark], nextNumber: doc.nextNumber + 1});
}
export function removeMarkedRoom(doc, id) {
  if (!doc.rooms.some(mark => mark.id === id)) return doc;
  return validateMarking({...doc, rooms: doc.rooms.filter(mark => mark.id !== id)});
}
// Cambia la leyenda. Los recintos con un estado eliminado pasan al primer estado; los cortes conservan su registro original.
export function setEstados(doc, estados) {
  const d = upgradeMarking(doc), ids = validarEstados(estados);
  return validateMarking({...d, estados, color: estados[0].color, rooms: d.rooms.map(r => ids.has(r.estado) ? r : {...r, estado: estados[0].id})});
}
// Corte: fotografía de los estados de todos los recintos en una fecha, para comparar períodos.
export function addCut(doc, {id, nombre, fecha, autor, at = new Date().toISOString()}) {
  const d = upgradeMarking(doc);
  if (d.cortes.length >= MAX_CORTES) throw Error('Se alcanzó el máximo de cortes del proyecto.');
  const corte = {id, nombre: String(nombre ?? '').trim(), fecha, creado: at, autor: String(autor ?? '').trim(), rooms: d.rooms.map(r => ({id: r.id, code: r.code, name: r.name, estado: r.estado}))};
  return validateMarking({...d, cortes: [...d.cortes, corte].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado))});
}
export function removeCut(doc, id) { return validateMarking({...doc, cortes: doc.cortes.filter(c => c.id !== id)}); }
// Estado vigente del proyecto en la misma forma que un corte, para comparar «Actual» con un corte.
export const actual = doc => ({id: 'actual', nombre: 'Actual', fecha: null, rooms: doc.rooms.map(r => ({id: r.id, code: r.code, name: r.name, estado: r.estado}))});

export const CAMBIOS = {avanzo: {nombre: 'Avanzó', color: '#2e9e5b'}, igual: {nombre: 'Sin cambio', color: '#9aa3ad'}, retrocedio: {nombre: 'Retrocedió', color: '#c62f2f'}};
// Compara dos cortes con el orden de la leyenda (de menor a mayor avance). Un recinto que aparece cuenta como avance; uno que sale, como retroceso.
// area(id) entrega los m² del recinto (o null) para totalizar superficies por estado.
export function compareCuts(estados, antes, despues, area = () => null) {
  const orden = new Map(estados.map((e, i) => [e.id, i])), nombre = id => estados.find(e => e.id === id)?.nombre || id;
  const a = new Map(antes.rooms.map(r => [r.id, r])), b = new Map(despues.rooms.map(r => [r.id, r]));
  const filas = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const ra = a.get(id), rb = b.get(id), ia = ra ? orden.get(ra.estado) ?? -1 : -1, ib = rb ? orden.get(rb.estado) ?? -1 : -1;
    filas.push({id, code: (rb || ra).code, name: (rb || ra).name, antes: ra?.estado ?? null, despues: rb?.estado ?? null, cambio: ib > ia ? 'avanzo' : ib < ia ? 'retrocedio' : 'igual', m2: area(id)});
  }
  const porEstado = estados.map(e => {
    const en = lista => filas.filter(f => f[lista] === e.id), suma = l => l.reduce((s, f) => s + (f.m2 || 0), 0);
    return {id: e.id, nombre: e.nombre, color: e.color, antes: en('antes').length, despues: en('despues').length, m2Antes: suma(en('antes')), m2Despues: suma(en('despues'))};
  });
  const totales = Object.fromEntries(Object.keys(CAMBIOS).map(k => [k, filas.filter(f => f.cambio === k).length]));
  filas.sort((x, y) => ['avanzo', 'retrocedio', 'igual'].indexOf(x.cambio) - ['avanzo', 'retrocedio', 'igual'].indexOf(y.cambio) || x.code.localeCompare(y.code, 'es', {numeric: true}));
  return {filas, porEstado, totales, nombre};
}
// Recintos a dibujar con su color: estados del proyecto o, en modo comparación, el tipo de cambio.
export function markingItems(doc, comparacion = null) {
  if (comparacion) return comparacion.filas.map(f => ({id: f.id, color: CAMBIOS[f.cambio].color, number: null, opacity: f.cambio === 'igual' ? .18 : .45}));
  const colores = doc.schema === 2 ? new Map(doc.estados.map(e => [e.id, e.color])) : null;
  return doc.rooms.map(mark => ({id: mark.id, color: colores?.get(mark.estado) || doc.color, number: mark.number, opacity: .35}));
}
export function markingBackup(documents) { return {format: 'atlas-markings-v1', documents: structuredClone(documents)}; }
