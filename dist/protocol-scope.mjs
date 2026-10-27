// Exact documented references only: endpoints such as N01-N09 do not prove levels N02…N08.
export const protocolFloors = {
  'N-1': {code: 'S01', name: 'Piso −1'},
  N01: {code: 'N01', name: 'Piso 1'},
  N02: {code: 'N02', name: 'Piso 2'},
  N03: {code: 'N03', name: 'Piso 3'}
};
export function protocolLevels(value) {
  const clean = String(value ?? '').toUpperCase().replace(/\s/g, '').replace(/[–—]/g, '-');
  if (!/^[SN]\d{1,2}(?:[-,;/+][SN]\d{1,2})*$/.test(clean)) return [];
  return [...new Set(clean.split(/[-,;/+]/).map(level => level[0] + level.slice(1).padStart(2, '0')))];
}
export function onProtocolFloor(level, floor) {
  const code = protocolFloors[floor]?.code;
  return !!code && protocolLevels(level).includes(code);
}
export const scopedProtocolRows = (rows, floor) => rows.filter(row => onProtocolFloor(row.level, floor));
export const sharedProtocol = level => protocolLevels(level).length > 1;
export function protocolStateMatches(actual, wanted = '') {
  actual = String(actual ?? '').trim();
  return !wanted || (wanted === 'PENDING_CLOSURE' ? actual === 'ABIERTO' : wanted === 'CLOSED_ALL' ? ['CERRADO', 'CERRADO POR AUTOCONTROL'].includes(actual) : actual === wanted);
}
export function scopeProtocolCatalog(catalog, floor, state = '') {
  if (!protocolFloors[floor]) throw Error('Elige un piso de trabajo: −1, 1, 2 o 3.');
  const states = {}, groups = new Map(), types = [];
  let total = 0, matching = 0, shared = 0;
  for (const type of catalog.types) {
    if (!Array.isArray(type.facets)) throw Error('Actualiza la copia de Atlas para consultar los protocolos por piso.');
    let scopeCount = 0, visibleCount = 0;
    const specialtyIds = new Set();
    for (const [level, rowState, specialtyId, count] of type.facets) {
      if (!onProtocolFloor(level, floor)) continue;
      scopeCount += count; total += count; states[rowState] = (states[rowState] || 0) + count;
      if (!protocolStateMatches(rowState, state)) continue;
      visibleCount += count; matching += count;
      if (sharedProtocol(level)) shared += count;
      specialtyIds.add(specialtyId);
      const group = groups.get(specialtyId) || {count: 0, ids: new Set()};
      group.count += count; group.ids.add(type.id); groups.set(specialtyId, group);
    }
    if (visibleCount) types.push({...type, scopeCount, visibleCount, specialtyIds: [...specialtyIds]});
  }
  return {total, matching, shared, states, types,
    specialties: catalog.specialties.filter(s => groups.has(s.id)).map(s => ({...s, count: groups.get(s.id).count, typeIds: [...groups.get(s.id).ids]}))};
}
