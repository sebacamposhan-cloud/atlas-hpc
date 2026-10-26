// Original geometry is never rewritten. The same chosen rings drive hit testing and paint.
export function resolveFootprints(atlas, rooms, aliases, selection) {
  const geometry = new Map(), byId = new Map(rooms.map(r => [r.id, r]));
  for (const entry of selection.rooms) {
    const id = aliases.get(entry.id) || entry.id;
    if (!byId.has(id)) continue;
    if (!geometry.has(id) || entry.score > geometry.get(id).score) {
      geometry.set(id, {...entry, id, rings: structuredClone(entry.rings), method: 'auxiliary', quality: 'auxiliary_pending'});
    }
  }
  for (const r of rooms) {
    const manual = r.version > 1 && r.geometry_method === 'Edición manual en navegador';
    const validated = r.geometry_status === 'Validado';
    if (!(r.geometry_parts?.length||r.polygon) || (!manual && !validated && geometry.has(r.id))) continue;
    const tile = atlas.tiles.find(t => t.id === r.document_id);
    if (!tile) throw Error('Lámina sin transformación: ' + r.document_id);
    const shift = p => [p[0] + tile.offset[0], p[1] + tile.offset[1]];
    geometry.set(r.id, {id: r.id, sourceId: r.document_id,
      rings: (r.geometry_parts||[{polygon:r.polygon,holes:r.holes||[]}]).map(part=>({polygon:part.polygon.map(shift),holes:part.holes.map(h=>h.map(shift))})),
      method: manual ? 'manual' : 'technical',
      quality: validated ? 'validated' : manual ? 'manual_pending' : 'technical_pending', score: 2});
  }
  return geometry;
}
export const geometryLabels = {
  validated: 'Contorno técnico validado',
  manual_pending: 'Corrección manual · pendiente de revisión',
  technical_pending: 'Contorno técnico · pendiente de revisión',
  auxiliary_pending: 'Superficie auxiliar · pendiente de validación técnica',
};
