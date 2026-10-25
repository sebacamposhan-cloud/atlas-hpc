// Associations are documentary candidates, never an inferred geometric match.
export function associateCode(rooms, observations, code, specialty = 'ceilings') {
  if (!code) return {architecture: [], observations: []};
  return {
    architecture: rooms.filter(room => room.code === code),
    observations: observations.filter(row => row.code === code && row.specialty === specialty),
  };
}

export function ceilingMaterials(observation, materialLookup) {
  return (observation?.ceilingCodes || []).map(code => ({
    code,
    description: materialLookup(code)?.description || 'Sin descripción documentada',
  }));
}

const normalized = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function searchObservations(observations, rooms, query) {
  const q = normalized(query).trim();
  const namesByCode = new Map();
  for (const room of rooms) {
    const names = namesByCode.get(room.code) || [];
    names.push(room.name || '');
    namesByCode.set(room.code, names);
  }
  const exact = [], other = [];
  for (const row of observations) {
    if (q && normalized(row.code) === q) {
      exact.push(row);
    } else if (normalized([row.code, row.rawText, row.name, ...(namesByCode.get(row.code) || [])].join(' ')).includes(q)) {
      other.push(row);
    }
  }
  return [...exact, ...other];
}
