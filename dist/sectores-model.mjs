// Sectores de obra que usa jefatura de producción (11-11-2026): tres por piso, en vez de una letra por lámina.
// La regla se definió sobre el piso 2:
// - Sector 1: lo dibujado en las láminas A-501 y A-505 (la franja superior de la planta).
// - Sector 3: desde el eje AJ hacia el AW, incluido lo que sobresale después del AW.
// - Sector 2: lo que queda entre ambos.
// Las láminas no se numeran igual en los demás pisos, así que la regla se lleva a los ejes, que son los mismos en todo el
// edificio: el borde inferior de las láminas 501 y 505 del piso 2 cae entre los ejes AD y AE, a 0,7376 del tramo
// (342,9 de 464,9 unidades, unos 6,05 m bajo el AD). En el piso 2 esta línea reproduce exactamente las láminas.
// Cada recinto se ubica por su rótulo, en coordenadas del plano (las de dist/<piso>/ejes.json): un recinto partido por
// la línea de corte queda en la lámina donde se rotuló, igual que en el plano.
// Sin DOM: lo prueba sectores-test.mjs.
export const SECTORES = ['1', '2', '3'];
export const nombreSector = s => s ? 'Sector ' + s : 'Sin sector';
export const TRAMO_SECTOR_1 = 342.9 / 464.9;

// Posición sobre la grilla con letras (AA → AW): distancia a lo largo de la normal de los ejes con letra.
export function cortesSectores(ejes) {
  const lista = ejes?.ejes || [], buscar = id => lista.find(e => e.id === id);
  const aa = buscar('AA'), ad = buscar('AD'), ae = buscar('AE'), aj = buscar('AJ'), aw = buscar('AW') || buscar('AK');
  if (!aa || !ad || !ae || !aj || !aw) return null;
  const dx = aj.b[0] - aj.a[0], dy = aj.b[1] - aj.a[1], L = Math.hypot(dx, dy);
  if (!L) return null;
  let normal = [-dy / L, dx / L];
  const sobre = p => (p[0] - aa.a[0]) * normal[0] + (p[1] - aa.a[1]) * normal[1];
  if (sobre(aw.a) < sobre(aa.a)) normal = [-normal[0], -normal[1]];
  const medir = p => (p[0] - aa.a[0]) * normal[0] + (p[1] - aa.a[1]) * normal[1];
  const enAD = medir(ad.a), enAE = medir(ae.a);
  return {medir, normal, origen: aa.a, sector1: enAD + TRAMO_SECTOR_1 * (enAE - enAD), sector3: medir(aj.a)};
}

export function sectorObra(punto, cortes) {
  if (!cortes || !punto) return '';
  const s = cortes.medir(punto);
  return s < cortes.sector1 ? '1' : s >= cortes.sector3 ? '3' : '2';
}

// Reescribe r.sector de cada recinto. alPlano(r) devuelve el recinto en coordenadas del plano (world de app.js).
// Sin grilla de ejes el recinto queda sin sector: no se inventa uno.
export function asignarSectores(rooms, alPlano, ejes) {
  const cortes = cortesSectores(ejes);
  for (const r of rooms || []) r.sector = sectorObra(alPlano(r)?.position, cortes);
  return rooms;
}

// Capa «Bordes de sectores» del plano: tres franjas con su nombre, cortadas en las mismas líneas de la regla.
// origen, ancho y alto: el marco del plano de fondo (runtime.map); limites: [x, y, ancho, alto] del edificio (atlas.scope.bounds).
export function svgSectores({origen = [0, 0], ancho, alto, limites, ejes}) {
  const r = n => Math.round(n * 10) / 10, cortes = cortesSectores(ejes);
  const marco = `<svg xmlns="http://www.w3.org/2000/svg" width="${r(ancho)}" height="${r(alto)}" viewBox="${r(origen[0])} ${r(origen[1])} ${r(ancho)} ${r(alto)}">`;
  if (!limites || !cortes) return marco + '</svg>';
  const [x0, y0] = limites, x1 = limites[0] + limites[2], y1 = limites[1] + limites[3];
  // Los ejes con letra son horizontales en todos los pisos: la línea de cada corte es una altura del plano.
  const altura = s => cortes.origen[1] + s * cortes.normal[1];
  // Tamaños proporcionales al ancho del edificio, para que se lean con el piso completo en pantalla. El texto lleva un
  // borde blanco (paint-order) para leerse sobre el dibujo, sin rellenos de color.
  const c1 = altura(cortes.sector1), c3 = altura(cortes.sector3), letra = (x1 - x0) / 26, linea = (x1 - x0) / 220;
  const franjas = [['1', y0, c1, 'hasta la línea de las láminas A-501 y A-505 del piso 2 (entre AD y AE)'], ['2', c1, c3, 'entre el sector 1 y el eje AJ'], ['3', c3, y1, 'desde el eje AJ hacia el AW']]
    .map(([s, a, b, nota]) => [s, Math.max(a, y0), Math.min(b, y1), nota]).filter(([, a, b]) => b - a > 1);
  return marco + franjas.map(([s, a, b, nota]) =>
    `<rect x="${r(x0)}" y="${r(a)}" width="${r(x1 - x0)}" height="${r(b - a)}" fill="none" stroke="#1f3b73" stroke-width="${r(linea)}" stroke-dasharray="${r(linea * 6)} ${r(linea * 3)}"/>` +
    `<text x="${r(x0 + letra * 0.4)}" y="${r(a + letra * 1.1)}" font-family="Arial,Helvetica,sans-serif" font-size="${r(letra)}" font-weight="700" fill="#1f3b73" stroke="#fff" stroke-width="${r(letra / 8)}" paint-order="stroke">Sector ${s}</text>` +
    `<text x="${r(x0 + letra * 0.4)}" y="${r(a + letra * 1.75)}" font-family="Arial,Helvetica,sans-serif" font-size="${r(letra * 0.42)}" fill="#1f3b73" stroke="#fff" stroke-width="${r(letra / 14)}" paint-order="stroke">${nota}</text>`).join('') + '</svg>';
}
// La capa como entrada de runtime.map.overlays, para cualquier piso: se arma con los ejes del piso al cargarlo.
export function capaSectores({map, scope, ejes}) {
  if (!map || !scope?.bounds || !cortesSectores(ejes)) return null;
  const svg = svgSectores({origen: map.origin || [0, 0], ancho: map.width, alto: map.height, limites: scope.bounds, ejes});
  return {id: 'sectores', nombre: 'Bordes de sectores', href: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), visible: false};
}
// Agrega (o reemplaza) la capa de sectores en el mapa del piso. Devuelve el mapa.
export function conCapaSectores(map, scope, ejes) {
  const capa = capaSectores({map, scope, ejes});
  if (!capa) return map;
  map.overlays = [...(map.overlays || []).filter(o => o.id !== 'sectores'), capa];
  return map;
}
