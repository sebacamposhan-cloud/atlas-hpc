// Recintos en el plano del pago: los contornos oficiales de cada piso (los mismos del visor, resolveFootprints) en
// coordenadas normalizadas de la imagen general del piso, para marcar recintos completos y medir cuánto de cada uno
// está pintado como ejecutado, pendiente u observación (recintos marcados y trazos de lápiz, tal como se ven).
import {decodeRuntime} from './runtime-loader.mjs';
import {resolveFootprints} from './geometry-authority.mjs';

export const COLORES = {'#21854b': 'ejecutado', '#d68b20': 'pendiente', '#c83c3c': 'observacion'};
export const NOMBRES = {ejecutado: 'Ejecutado', pendiente: 'Pendiente', observacion: 'Observación', sinMarcar: 'Sin marcar'};
// Plano 1:50 en puntos PDF: 1 unidad = 1,7639 cm.
const M2_POR_UNIDAD2 = 0.0176389 ** 2;
const area = anillo => Math.abs(anillo.reduce((s, p, i) => { const q = anillo[(i + 1) % anillo.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
// Bajo este porcentaje pintado, un trazo que solo cruza el recinto no lo cuenta como parte del avance.
const MINIMO_PINTADO = 0.03;

// Recintos con contorno del piso: [{codigo, nombre, m2, anillos: [{polygon, holes}]}] en coordenadas 0–1 de la imagen general.
export async function cargarRecintos(prefijo, leer = async ruta => { const r = await fetch(ruta); if (!r.ok) throw Error('No se pudo leer ' + ruta); return r.json(); }) {
  const rt = decodeRuntime(await leer(prefijo + 'runtime.json')), rooms = rt.data.rooms;
  await Promise.all(rt.data.documents.map(async doc => {
    try {
      const g = await leer(prefijo + 'geometry/' + encodeURIComponent(doc.id) + '.json'), porId = new Map(g.rooms.map(r => [r.id, r]));
      for (const r of rooms) if (porId.has(r.id)) Object.assign(r, porId.get(r.id));
    } catch {}
  }));
  const huellas = resolveFootprints(rt.atlas, rooms, new Map(), rt.selection), {origin: [ox, oy], width: W, height: H} = rt.map;
  const n = p => [(p[0] - ox) / W, (p[1] - oy) / H], porCodigo = new Map();
  for (const r of rooms) {
    const h = huellas.get(r.id), codigo = r.code?.trim();
    if (!h || !codigo) continue;
    const m2 = h.rings.reduce((s, a) => s + area(a.polygon) - a.holes.reduce((t, x) => t + area(x), 0), 0) * M2_POR_UNIDAD2;
    // Un código repetido en láminas que se solapan conserva su contorno más grande.
    if (!(porCodigo.get(codigo)?.m2 >= m2)) porCodigo.set(codigo, {codigo, nombre: r.name, m2, anillos: h.rings.map(a => ({polygon: a.polygon.map(n), holes: a.holes.map(x => x.map(n))}))});
  }
  return [...porCodigo.values()];
}

const dentro = (p, anillo) => { let d = false; for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) { const [xi, yi] = anillo[i], [xj, yj] = anillo[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) d = !d; } return d; };
// Recinto bajo un punto (0–1). Si hay recintos anidados, el más chico.
export const recintoEn = (recintos, p) => recintos.filter(r => r.anillos.some(a => dentro(p, a.polygon) && !a.holes.some(h => dentro(p, h)))).sort((a, b) => a.m2 - b.m2)[0] || null;

// Cuenta, por recinto, los píxeles de cada estado: primero los recintos marcados completos y encima los trazos.
// proporcion = alto / ancho de la imagen general. Solo en el navegador (usa canvas).
export function medirAvance(recintos, hoja, proporcion, ancho = 1000) {
  const W = ancho, H = Math.max(1, Math.round(ancho * proporcion)), lienzo = document.createElement('canvas');
  lienzo.width = W; lienzo.height = H;
  const ctx = lienzo.getContext('2d', {willReadFrequently: true}), porCodigo = new Map(recintos.map(r => [r.codigo, r]));
  const camino = (r, dx = 0, dy = 0) => { const p = new Path2D(); for (const a of r.anillos) for (const anillo of [a.polygon, ...a.holes]) { anillo.forEach(([x, y], i) => p[i ? 'lineTo' : 'moveTo'](x * W - dx, y * H - dy)); p.closePath(); } return p; };
  for (const [codigo, color] of Object.entries(hoja?.rooms || {})) { const r = porCodigo.get(codigo); if (r) { ctx.fillStyle = color; ctx.fill(camino(r), 'evenodd'); } }
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const s of hoja?.strokes || []) {
    ctx.strokeStyle = s.color; ctx.lineWidth = Math.max(1, (s.w || .003) * W); ctx.beginPath();
    s.points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x * W, y * H));
    if (s.points.length === 1) ctx.lineTo(s.points[0][0] * W + .1, s.points[0][1] * H);
    ctx.stroke();
  }
  const pintura = ctx.getImageData(0, 0, W, H).data, mascara = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
  const tonos = Object.entries(COLORES).map(([h, nombre]) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), nombre]);
  const marcados = new Set(Object.keys(hoja?.rooms || {}));
  return recintos.map(r => {
    const xs = r.anillos.flatMap(a => a.polygon.map(p => p[0] * W)), ys = r.anillos.flatMap(a => a.polygon.map(p => p[1] * H));
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), x1 = Math.min(W, Math.ceil(Math.max(...xs))), y1 = Math.min(H, Math.ceil(Math.max(...ys)));
    const w = x1 - x0, h = y1 - y0, cuenta = {codigo: r.codigo, nombre: r.nombre, m2: r.m2, marcado: marcados.has(r.codigo), total: 0, ejecutado: 0, pendiente: 0, observacion: 0};
    if (w <= 0 || h <= 0) return cuenta;
    mascara.canvas.width = w; mascara.canvas.height = h; mascara.fill(camino(r, x0, y0), 'evenodd');
    const m = mascara.getImageData(0, 0, w, h).data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (m[(j * w + i) * 4 + 3] < 128) continue;
      cuenta.total++;
      const q = ((y0 + j) * W + x0 + i) * 4;
      if (pintura[q + 3] < 128) continue;
      let mejor = null, distancia = Infinity;
      for (const [R, G, B, nombre] of tonos) { const e = (pintura[q] - R) ** 2 + (pintura[q + 1] - G) ** 2 + (pintura[q + 2] - B) ** 2; if (e < distancia) { distancia = e; mejor = nombre; } }
      cuenta[mejor]++;
    }
    return cuenta;
  });
}

// Avance por superficie de los recintos marcados o pintados (al menos un 3 % de su superficie).
export function resumirAvance(mediciones) {
  const parte = (m, k) => m.total ? m[k] / m.total : 0, pintado = m => parte(m, 'ejecutado') + parte(m, 'pendiente') + parte(m, 'observacion');
  const involucrados = mediciones.filter(m => m.total > 0 && (m.marcado || pintado(m) >= MINIMO_PINTADO));
  const m2 = involucrados.reduce((s, m) => s + m.m2, 0), partes = {};
  for (const k of ['ejecutado', 'pendiente', 'observacion']) partes[k] = involucrados.reduce((s, m) => s + m.m2 * parte(m, k), 0);
  partes.sinMarcar = Math.max(0, m2 - partes.ejecutado - partes.pendiente - partes.observacion);
  return {recintos: involucrados.length, m2,
    partes: Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, {m2: v, pct: m2 ? v / m2 * 100 : 0}])),
    detalle: involucrados.map(m => ({codigo: m.codigo, nombre: m.nombre, m2: m.m2, marcado: m.marcado, ejecutado: parte(m, 'ejecutado') * 100, pendiente: parte(m, 'pendiente') * 100, observacion: parte(m, 'observacion') * 100}))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', {numeric: true}))};
}
// Lo que se guarda en el pago por piso (para mostrarlo sin recalcular): porcentajes y m² redondeados.
export const avanceGuardado = r => ({recintos: r.recintos, m2: Math.round(r.m2 * 10) / 10, ...Object.fromEntries(Object.entries(r.partes).map(([k, v]) => [k, Math.round(v.pct * 10) / 10]))});
const numero = (v, d = 0) => v.toLocaleString('es-CL', {maximumFractionDigits: d, minimumFractionDigits: d});
export const textoAvance = a => a?.recintos ? `${numero(a.ejecutado, 0)} % ejecutado · ${numero(a.pendiente, 0)} % pendiente · ${numero(a.observacion, 0)} % observación de ${numero(a.m2, 0)} m² (${a.recintos} recintos)` : 'sin recintos marcados';
