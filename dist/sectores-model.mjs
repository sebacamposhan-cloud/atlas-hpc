// Sectores de obra que usa jefatura de producción (11-11-2026): tres por piso, en vez de una letra por lámina.
// - Sector 1: lo dibujado en las láminas A-501 y A-505 (la franja superior de la planta).
// - Sector 3: desde el eje AJ en adelante (AJ a AW, incluido lo que sobresale después del AW).
// - Sector 2: lo que queda entre ambos.
// El recinto se ubica por el centro de su contorno (o por su rótulo si no tiene contorno), en coordenadas del plano,
// las mismas de dist/<piso>/ejes.json. Sin DOM: lo prueba sectores-test.mjs.
export const SECTORES = ['1', '2', '3'];
export const nombreSector = s => s ? 'Sector ' + s : 'Sin sector';
const LAMINA_SECTOR_1 = /(?:^|-a?)50[15](?:-|$)/i;
export const enLaminaSector1 = documento => LAMINA_SECTOR_1.test(String(documento || ''));

// Línea del eje AJ y su normal orientada hacia el AW (o hacia el siguiente eje con letra si el AW no está).
export function lineaSector3(ejes) {
  const lista = ejes?.ejes || [], buscar = id => lista.find(e => e.id === id);
  const aj = buscar('AJ'), hacia = buscar('AW') || buscar('AK');
  if (!aj || !hacia) return null;
  const dx = aj.b[0] - aj.a[0], dy = aj.b[1] - aj.a[1], L = Math.hypot(dx, dy);
  if (!L) return null;
  let n = [-dy / L, dx / L];
  if ((hacia.a[0] - aj.a[0]) * n[0] + (hacia.a[1] - aj.a[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return {origen: aj.a, normal: n};
}

// Punto representativo del recinto ya llevado al plano (world de app.js): centro del contorno o rótulo.
export function puntoRecinto(r) {
  const pts = r?.polygon?.length > 2 ? r.polygon : null;
  if (!pts) return r?.position || null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

export function sectorObra(documento, punto, linea) {
  if (enLaminaSector1(documento)) return '1';
  if (linea && punto) {
    const d = (punto[0] - linea.origen[0]) * linea.normal[0] + (punto[1] - linea.origen[1]) * linea.normal[1];
    if (d >= 0) return '3';
  }
  return '2';
}

// Reescribe r.sector de cada recinto. alPlano(r) devuelve el recinto en coordenadas del plano.
// Sin grilla de ejes solo se distingue el sector 1; lo demás queda en el 2.
export function asignarSectores(rooms, alPlano, ejes) {
  const linea = lineaSector3(ejes);
  for (const r of rooms || []) r.sector = sectorObra(r.document_id, puntoRecinto(alPlano(r)), linea);
  return rooms;
}

// Capa «Bordes de sectores» del plano: tres franjas con su nombre. laminas: [{id, clip: [x, y, ancho, alto]}] del atlas.
export function svgSectores({ancho, alto, laminas, ejes}) {
  const cajas = (laminas || []).filter(l => l.clip).map(l => ({id: l.id, x0: l.clip[0], y0: l.clip[1], x1: l.clip[0] + l.clip[2], y1: l.clip[1] + l.clip[3]}));
  if (!cajas.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}"></svg>`;
  const x0 = Math.min(...cajas.map(c => c.x0)), x1 = Math.max(...cajas.map(c => c.x1)), y0 = Math.min(...cajas.map(c => c.y0)), y1 = Math.max(...cajas.map(c => c.y1));
  const uno = cajas.filter(c => enLaminaSector1(c.id)), corte1 = uno.length ? Math.max(...uno.map(c => c.y1)) : y0;
  const aj = (ejes?.ejes || []).find(e => e.id === 'AJ'), corte3 = aj ? (aj.a[1] + aj.b[1]) / 2 : y1;
  const r = n => Math.round(n * 10) / 10;
  const franjas = [['1', y0, corte1, 'láminas A-501 y A-505'], ['2', corte1, corte3, 'entre el sector 1 y el eje AJ'], ['3', corte3, y1, 'ejes AJ a AW']].filter(([, a, b]) => b - a > 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${franjas.map(([s, a, b, nota]) =>
    `<rect x="${r(x0)}" y="${r(a)}" width="${r(x1 - x0)}" height="${r(b - a)}" fill="none" stroke="#1f3b73" stroke-width="4" stroke-dasharray="24 12"/>` +
    `<text x="${r(x0 + 24)}" y="${r(a + 64)}" font-family="Arial,Helvetica,sans-serif" font-size="56" font-weight="700" fill="#1f3b73">Sector ${s}</text>` +
    `<text x="${r(x0 + 24)}" y="${r(a + 104)}" font-family="Arial,Helvetica,sans-serif" font-size="28" fill="#1f3b73">${nota}</text>`).join('')}</svg>`;
}
