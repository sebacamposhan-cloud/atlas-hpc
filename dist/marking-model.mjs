// User annotations reference existing rooms; source properties and geometry stay untouched.
const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
export function validateMarking(doc) {
  if (!doc || doc.schema !== 1 || doc.specialty !== 'architecture' || !text(doc.id, 100) || !text(doc.level, 30)) throw Error('Documento de Arquitectura inválido.');
  for (const [key, label, max] of [['name', 'Nombre del documento', 160], ['author', 'Quién lo realizó', 160], ['purpose', 'Para qué es el plano', 2000]]) {
    if (!text(doc[key], max)) throw Error(label + ': completa este campo obligatorio.');
  }
  if (!/^#[a-f0-9]{6}$/i.test(doc.color)) throw Error('Color inválido.');
  if (!Number.isSafeInteger(doc.version) || doc.version < 1 || !Number.isSafeInteger(doc.nextNumber) || doc.nextNumber < 1) throw Error('Versión o numeración inválida.');
  if (![doc.createdAt, doc.updatedAt].every(at => typeof at === 'string' && Number.isFinite(Date.parse(at)))) throw Error('Fecha inválida.');
  if (!Array.isArray(doc.rooms) || doc.rooms.length > 10000) throw Error('Lista de recintos inválida.');
  const ids = new Set(), numbers = new Set();
  for (const room of doc.rooms) {
    if (!text(room.id, 160) || !text(room.code, 160) || !text(room.name, 500) || !text(room.source, 300) || !text(room.revision, 100)) throw Error('Referencia de recinto incompleta.');
    if (!Number.isSafeInteger(room.number) || room.number < 1 || room.number >= doc.nextNumber || numbers.has(room.number) || ids.has(room.id)) throw Error('Recinto o número repetido/inválido.');
    ids.add(room.id); numbers.add(room.number);
  }
  return doc;
}
export function newMarking(values, level, id, at = new Date().toISOString()) {
  return validateMarking({schema: 1, specialty: 'architecture', id, level,
    name: String(values.name ?? '').trim(), author: String(values.author ?? '').trim(), purpose: String(values.purpose ?? '').trim(),
    color: values.color || '#2874c7', createdAt: at, updatedAt: at, version: 1, nextNumber: 1, rooms: []});
}
export function addMarkedRoom(doc, room, source) {
  if (doc.rooms.some(mark => mark.id === room.id)) return doc;
  const mark = {id: room.id, code: room.code, name: room.name, source: source.code, revision: source.revision, number: doc.nextNumber};
  return validateMarking({...doc, rooms: [...doc.rooms, mark], nextNumber: doc.nextNumber + 1});
}
export function removeMarkedRoom(doc, id) {
  if (!doc.rooms.some(mark => mark.id === id)) return doc;
  return validateMarking({...doc, rooms: doc.rooms.filter(mark => mark.id !== id)});
}
export function markingBackup(documents) { return {format: 'atlas-markings-v1', documents: structuredClone(documents)}; }
