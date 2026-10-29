import {roomContourRepairs} from './room-contour-repairs.mjs';
// Original geometry is never rewritten. The same chosen rings drive hit testing and paint.
// contornos: correcciones del editor interno (dist/<piso>/contornos.json, scripts/editor-contornos), en coordenadas del plano.
// Mandan sobre las superficies auxiliares, los perímetros reparados y los contornos técnicos, incluso validados;
// solo una edición manual guardada en el navegador de ese equipo queda por encima.
export function resolveFootprints(atlas, rooms, aliases, selection, contornos = []) {
  const geometry = new Map(), byId = new Map(rooms.map(r => [r.id, r]));
  for (const entry of selection.rooms) {
    const id = aliases.get(entry.id) || entry.id;
    if (!byId.has(id)) continue;
    if (!geometry.has(id) || entry.score > geometry.get(id).score) {
      geometry.set(id, {...entry, id, rings: structuredClone(entry.rings), method: 'auxiliary', quality: 'auxiliary_pending'});
    }
  }
  for (const repair of roomContourRepairs) {
    const id=aliases.get(repair.id)||repair.id,r=byId.get(id);
    if(!r||r.code!==repair.code)continue;
    const tile=atlas.tiles.find(t=>t.id===repair.sourceId);
    if(!tile||tile.offset.some((v,i)=>Math.abs(v-repair.offset[i])>.0001))continue;
    const shift=p=>[p[0]+tile.offset[0],p[1]+tile.offset[1]];
    geometry.set(id,{id,sourceId:repair.sourceId,
      rings:repair.rings.map(p=>({polygon:p.polygon.map(shift),holes:p.holes.map(h=>h.map(shift))})),
      method:repair.kind==='auxiliary_trim'?'auxiliary':'source_repair',
      quality:repair.kind==='auxiliary_trim'?'auxiliary_pending':'source_pending',score:2});
  }
  const corrected = new Set();
  for (const c of contornos) {
    const id = aliases.get(c.id) || c.id, r = byId.get(id);
    if (!r || r.code !== c.code || !c.parts?.length) continue;
    geometry.set(id, {id, sourceId: r.document_id, rings: structuredClone(c.parts), method: 'corrected', quality: 'dwg_corrected', score: 3});
    corrected.add(id);
  }
  for (const r of rooms) {
    const manual = r.version > 1 && r.geometry_method === 'Edición manual en navegador';
    const validated = r.geometry_status === 'Validado';
    if (!(r.geometry_parts?.length||r.polygon) || (!manual && (corrected.has(r.id) || (!validated && geometry.has(r.id))))) continue;
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
  dwg_corrected: 'Contorno corregido a mano sobre el DWG · revisión interna',
  source_pending: 'Perímetro corregido contra el PDF · pendiente de validación técnica',
  validated: 'Contorno técnico validado',
  manual_pending: 'Corrección manual · pendiente de revisión',
  technical_pending: 'Contorno técnico · pendiente de revisión',
  auxiliary_pending: 'Superficie auxiliar · pendiente de validación técnica',
};
