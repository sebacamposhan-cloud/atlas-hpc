// Obra complementaria fuera del alcance de Atlas (11-11-2026): los edificios de servicio separados del hospital.
// - Nivel −1: el anexo al oriente del eje A12. Son los recintos de la lámina A-509 y de las ampliaciones A-511 y A-512
//   (servicios, auditorio y central de respaldo) más los del borde oriente de las láminas 505 a 507: los 66 códigos que
//   caen fuera del ámbito del edificio en el −1 (atlas.scope).
// - Nivel 1: la lámina A-510, unos 100 m al oriente del A12 (casetas de guardia y central de gases clínicos, mismas
//   familias 8.1 y 10.1 del anexo del −1). El ámbito del piso se acota a las láminas A-501 a A-508.
// Atlas los quita al cargar el piso, junto con sus láminas, y no los cuenta en planillas ni avances.
// Sin DOM: lo prueba obra-complementaria-test.mjs, que recalcula las listas desde los datos de cada piso.
export const OBRA_COMPLEMENTARIA = {
  'N-1': {laminas: ['509-62864a89'], codigos: [
    '8.1.2.1.1-1', '8.1.2.1.2-1', '8.1.2.1.3-1', '8.1.2.1.4-1', '8.1.2.1.5-1', '8.1.2.1.5-2', '8.1.2.2.1-1', '8.1.2.2.2-1',
  '8.1.2.2.3-1', '8.1.2.3.1-1', '8.1.2.3.1-2', '8.1.2.3.2-1', '8.1.2.3.3-1', '8.1.2.3.4-1', '8.1.2.3.5-1', '8.1.2.3.6-1',
  '8.1.2.3.7-1', '8.1.2.3.8-1', '8.1.2.3.9-1', '8.1.3.2.1-1', '8.1.3.2.2-1', '8.1.3.2.2-2', '8.1.3.2.6-1', '8.1.3.2.7-1',
  '8.1.3.2.8-1', '8.1.3.2.11-1', '8.1.3.2.11-2', '8.1.3.2.11-3', '8.1.3.2.12-1', '8.1.3.2.12-2', '8.1.3.2.14-1',
  '8.1.5.1.2-1', '8.1.5.1.3-1', '8.1.5.1.4-1', '8.1.5.1.5-1', '8.1.5.1.5-2', '8.1.5.1.6-1', '9.1.2.1.1-1', '9.1.2.1.2-2',
  '9.1.2.1.2-3', '9.1.2.1.2-4', '9.1.2.1.4-1', '9.1.2.1.4-2', '9.1.2.1.5-1', '9.1.3.1.1-1', '9.1.3.1.1-2', '9.1.3.1.3-1',
  '9.1.3.1.3-2', '9.1.3.1.4-1', '9.1.3.1.5-1', '9.1.3.1.6-1', '9.1.3.1.7-1', '9.1.3.1.8-1', '9.1.3.1.8-2', '9.1.3.1.8-3',
  '9.1.3.1.8-4', '9.1.3.1.9-1', '9.1.3.1.9-2', '9.1.3.1.11-1', '10.1.1.1.8-1', '10.1.1.1.12-1', 'CT.F.(-1)-12',
  'CT.P.(-1)-5', 'CU.8.1.2-1', 'RT.(-1)-13', 'RT.(-1)-14'
  ]},
  N01: {laminas: ['n01-a510'], codigos: ['8.1.1.1.4-2', '8.1.1.1.13-4', '10.1.1.1.4-4', '10.1.1.1.4-5', '10.1.1.1.4-6'],
    alcance: {name: '8 láminas · A-501 a A-508', sourceLabels: 'A-501 a A-508', bounds: [283.5, 283.5, 6747.3, 7999.6], view: [0, 0, 7314.3, 8566.6]}}
};
export const CODIGOS_OBRA_COMPLEMENTARIA = new Set(Object.values(OBRA_COMPLEMENTARIA).flatMap(o => o.codigos));
export const LAMINAS_OBRA_COMPLEMENTARIA = Object.values(OBRA_COMPLEMENTARIA).flatMap(o => o.laminas);
// Los códigos son únicos en la obra, así que basta el código (las planillas de la oficina no siempre traen el piso).
export const esObraComplementaria = code => CODIGOS_OBRA_COMPLEMENTARIA.has(String(code ?? '').trim());
// Datos de un piso sin la obra complementaria: recintos y láminas filtrados y, si corresponde, el ámbito del plano acotado
// al hospital (atlas, el de runtime.json). Devuelve el mismo objeto de datos.
export function quitarObraComplementaria(data, nivelId, atlas = null) {
  const obra = OBRA_COMPLEMENTARIA[nivelId];
  if (!data || !obra) return data;
  data.rooms = (data.rooms || []).filter(r => !esObraComplementaria(r.code));
  data.documents = (data.documents || []).filter(d => !obra.laminas.includes(d.id));
  if (atlas && obra.alcance) atlas.scope = {...atlas.scope, ...structuredClone(obra.alcance)};
  return data;
}
