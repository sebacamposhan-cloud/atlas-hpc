// Geometría del editor de contornos, sin DOM, en unidades del plano de Atlas.
// 1 unidad = 1 punto PDF de una lámina 1:50 = 1,7639 cm (scripts/dwg-plano/marco.mjs).
export const METROS = 2.54 / 72 * 50 / 100;
export const aMetros = u => u * METROS;
export const aUnidades = m => m / METROS;

export function areaAnillo(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s) / 2; }
export const areaPartes = parts => parts.reduce((s, p) => s + areaAnillo(p.polygon) - p.holes.reduce((h, x) => h + areaAnillo(x), 0), 0);
export const areaM2 = parts => areaPartes(parts) * METROS * METROS;
// Superficie del PMA como texto: «19,41», «11,21 m²» o «1.234,5».
export function areaDeclarada(texto) { const m = String(texto ?? '').replace(/\.(?=\d{3}\b)/g, '').match(/\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(',', '.')) : null; }

export function enAnillo(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
export const enPartes = (p, parts) => parts.some(x => enAnillo(p, x.polygon) && !x.holes.some(h => enAnillo(p, h)));

const resta = (a, b) => [a[0] - b[0], a[1] - b[1]], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export { dist };
// Cruce de los tramos ab y cd: t y u en [0, 1].
export function cruce(a, b, c, d) {
  const r = resta(b, a), s = resta(d, c), den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const q = resta(c, a), t = (q[0] * s[1] - q[1] * s[0]) / den, u = (q[0] * r[1] - q[1] * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? {t, u, p: [a[0] + t * r[0], a[1] + t * r[1]]} : null;
}
// Punto del tramo ab más cercano a p.
export function proyectar(p, a, b) { const d = resta(b, a), l = d[0] * d[0] + d[1] * d[1], t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l)) : 0; return {t, p: [a[0] + t * d[0], a[1] + t * d[1]]}; }

// Quita puntos repetidos y el cierre duplicado.
export function limpiar(r, tol = 1e-6) { const out = []; for (const p of r) if (!out.length || dist(out.at(-1), p) > tol) out.push([p[0], p[1]]); while (out.length > 1 && dist(out[0], out.at(-1)) <= tol) out.pop(); return out; }
// Un anillo no puede cruzarse a sí mismo ni tocarse entre tramos no vecinos.
export function seCruza(r) {
  const n = r.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (cruce(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true;
  }
  return false;
}
export function errorAnillo(r) {
  if (r.length < 3) return 'El contorno necesita al menos 3 vértices.';
  if (r.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return 'Hay coordenadas inválidas.';
  if (areaAnillo(r) < 1) return 'El contorno no tiene superficie.';
  if (seCruza(r)) return 'El contorno se cruza consigo mismo.';
  return null;
}
export const errorPartes = parts => parts.length ? parts.flatMap(p => [p.polygon, ...p.holes]).map(errorAnillo).find(Boolean) || null : 'El recinto quedó sin contorno.';

// Douglas-Peucker sobre un anillo cerrado y luego quita vértices alineados.
export function simplificar(r, tol) {
  r = limpiar(r); if (r.length < 4) return r;
  let lejos = 0; for (let i = 1; i < r.length; i++) if (dist(r[0], r[i]) > dist(r[0], r[lejos])) lejos = i;
  const dp = (pts) => { if (pts.length < 3) return pts; let max = 0, k = 0; for (let i = 1; i < pts.length - 1; i++) { const d = dist(pts[i], proyectar(pts[i], pts[0], pts.at(-1)).p); if (d > max) { max = d; k = i; } } return max > tol ? [...dp(pts.slice(0, k + 1)).slice(0, -1), ...dp(pts.slice(k))] : [pts[0], pts.at(-1)]; };
  const out = [...dp(r.slice(0, lejos + 1)).slice(0, -1), ...dp([...r.slice(lejos), r[0]]).slice(0, -1)];
  return out.length >= 3 ? out : r;
}

// Índice espacial de tramos por celdas, para enganchar sin recorrer todo el dibujo.
export function crearIndice(celda = 64) { return {celda, celdas: new Map(), tramos: []}; }
const claveCelda = (cx, cy) => cx * 1e6 + cy;
export function agregarTramo(ix, a, b, origen = 'dwg') {
  const id = ix.tramos.length; ix.tramos.push({a, b, origen});
  const C = ix.celda;
  for (let cx = Math.floor(Math.min(a[0], b[0]) / C); cx <= Math.floor(Math.max(a[0], b[0]) / C); cx++)
    for (let cy = Math.floor(Math.min(a[1], b[1]) / C); cy <= Math.floor(Math.max(a[1], b[1]) / C); cy++) {
      const k = claveCelda(cx, cy); let c = ix.celdas.get(k); if (!c) ix.celdas.set(k, c = []); c.push(id);
    }
  return id;
}
export function tramosCerca(ix, x0, y0, x1, y1) {
  const C = ix.celda, ids = new Set();
  for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) for (const id of ix.celdas.get(claveCelda(cx, cy)) || []) ids.add(id);
  return [...ids].map(id => ix.tramos[id]);
}

// Orto: el tramo desde el ancla queda horizontal o vertical.
export const orto = (p, ancla) => Math.abs(p[0] - ancla[0]) >= Math.abs(p[1] - ancla[1]) ? [p[0], ancla[1]] : [ancla[0], p[1]];

// Enganche como el OSNAP de AutoCAD. Entre los candidatos dentro del radio gana el de mejor puntaje:
// extremo, intersección, punto medio, perpendicular y, solo si no hay otro, el punto más cercano del tramo.
const PRIORIDAD = {extremo: 0, interseccion: .08, medio: .15, perpendicular: .25, 'orto-cruce': .05, 'orto-extremo': .1, cercano: .7};
export function enganchar(p, {indices, radio, ancla = null, usarOrto = false, modos = {extremo: true, medio: true, interseccion: true, perpendicular: true, cercano: true}}) {
  const base = usarOrto && ancla ? orto(p, ancla) : p;
  const tramos = indices.flatMap(ix => tramosCerca(ix, base[0] - radio, base[1] - radio, base[0] + radio, base[1] + radio)).slice(0, 400);
  let mejor = null;
  const probar = (tipo, q) => { const d = dist(base, q); if (d > radio) return; const puntaje = d / radio + PRIORIDAD[tipo]; if (!mejor || puntaje < mejor.puntaje) mejor = {tipo, p: q, puntaje}; };
  if (usarOrto && ancla) {
    // Con orto el punto queda sobre la recta horizontal o vertical del ancla: se busca dónde corta los muros o dónde se alinea con un extremo.
    const horizontal = base[1] === ancla[1], lejos = horizontal ? [[base[0] - radio, base[1]], [base[0] + radio, base[1]]] : [[base[0], base[1] - radio], [base[0], base[1] + radio]];
    for (const s of tramos) {
      const c = cruce(lejos[0], lejos[1], s.a, s.b); if (c) probar('orto-cruce', c.p);
      if (modos.extremo) for (const e of [s.a, s.b]) probar('orto-extremo', horizontal ? [e[0], base[1]] : [base[0], e[1]]);
    }
    return mejor ? {p: mejor.p, tipo: mejor.tipo} : {p: base, tipo: 'orto'};
  }
  for (const s of tramos) {
    if (modos.extremo) { probar('extremo', s.a); probar('extremo', s.b); }
    if (modos.medio) probar('medio', [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]);
    if (modos.perpendicular && ancla) { const d = resta(s.b, s.a), l = d[0] * d[0] + d[1] * d[1]; if (l) { const t = ((ancla[0] - s.a[0]) * d[0] + (ancla[1] - s.a[1]) * d[1]) / l; if (t > 0 && t < 1) probar('perpendicular', [s.a[0] + t * d[0], s.a[1] + t * d[1]]); } }
    if (modos.cercano) probar('cercano', proyectar(base, s.a, s.b).p);
  }
  if (modos.interseccion) { const cerca = tramos.slice(0, 80); for (let i = 0; i < cerca.length; i++) for (let j = i + 1; j < cerca.length; j++) { const c = cruce(cerca[i].a, cerca[i].b, cerca[j].a, cerca[j].b); if (c && c.t > 1e-6 && c.t < 1 - 1e-6 && c.u > 1e-6 && c.u < 1 - 1e-6) probar('interseccion', c.p); } }
  return mejor ? {p: mejor.p, tipo: mejor.tipo} : {p: base, tipo: null};
}

// Parte un anillo con una polilínea que lo cruza dos veces: devuelve los dos anillos resultantes.
export function partir(r, linea) {
  const n = r.length, cortes = [];
  for (let k = 0; k < linea.length - 1; k++) for (let i = 0; i < n; i++) { const c = cruce(linea[k], linea[k + 1], r[i], r[(i + 1) % n]); if (c) cortes.push({k, t: c.t, i, u: c.u, p: c.p}); }
  cortes.sort((a, b) => a.k + a.t - (b.k + b.t));
  const unicos = cortes.filter((c, i) => !i || dist(c.p, cortes[i - 1].p) > 1e-6);
  if (unicos.length < 2) throw Error('La línea de corte debe cruzar el contorno dos veces.');
  const [A, B] = unicos, interior = linea.slice(A.k + 1, B.k + 1);
  // Vértices del anillo recorridos desde el punto A (lado A.i) hasta el punto B (lado B.i), hacia adelante.
  const recorrer = (desde, hasta) => { const out = []; if (desde.i === hasta.i && hasta.u > desde.u) return out; for (let i = (desde.i + 1) % n; ; i = (i + 1) % n) { out.push(r[i]); if (i === hasta.i) break; } return out; };
  const uno = limpiar([A.p, ...recorrer(A, B), B.p, ...[...interior].reverse()]), dos = limpiar([B.p, ...recorrer(B, A), A.p, ...interior]);
  for (const x of [uno, dos]) { const e = errorAnillo(x); if (e) throw Error('El corte deja una parte inválida: ' + e.toLowerCase()); }
  return [uno, dos];
}
