import {inside} from './engine.mjs';

// Índice de toques del plano: qué recinto queda bajo un punto.
// Regla para contornos solapados (todos los pisos): si un recinto chico queda casi entero dentro de otro (por ejemplo,
// un mesón o una estación de enfermería sin muros propios dentro de una circulación o sala de espera), el toque elige el
// chico; cualquier toque en él caía en los dos contornos y el zoom no ayudaba. Solo los empates reales (franjas de
// borde entre vecinos) quedan como varios candidatos para la ventana «Elige un recinto».
export const CONTENIDO = .85; // parte del recinto chico que debe caer dentro del grande
const area = polygon => { let a = 0; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) a += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]); return Math.abs(a / 2); };
const dentroDe = (point, ring) => inside(point, ring.polygon) && !ring.holes.some(hole => inside(point, hole));

export function buildHitIndex(entries) {
  const cells = new Map(), size = 256, porId = new Map();
  for (const {id, rings} of entries) {
    for (const {polygon, holes = []} of rings) {
      const xs = polygon.map(point => point[0]), ys = polygon.map(point => point[1]);
      const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const entry = {id, polygon, holes, box};
      if (!porId.has(id)) porId.set(id, {rings: [], area: 0});
      const r = porId.get(id); r.rings.push(entry); r.area += Math.max(0, area(polygon) - holes.reduce((s, h) => s + area(h), 0));
      for (let y = Math.floor(box[1] / size); y <= Math.floor(box[3] / size); y++) {
        for (let x = Math.floor(box[0] / size); x <= Math.floor(box[2] / size); x++) {
          const key = x + ',' + y;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(entry);
        }
      }
    }
  }

  // Puntos de muestra dentro de un recinto (una grilla de 9 × 9 sobre su caja, solo los que caen dentro).
  const muestras = new Map();
  function muestraDe(id) {
    if (muestras.has(id)) return muestras.get(id);
    const puntos = [];
    for (const ring of porId.get(id)?.rings || []) {
      const [l, t, r, b] = ring.box;
      for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
        const p = [l + (r - l) * (i + .5) / 9, t + (b - t) * (j + .5) / 9];
        if (dentroDe(p, ring)) puntos.push(p);
      }
    }
    muestras.set(id, puntos); return puntos;
  }
  const contenidos = new Map();
  // ¿El recinto a queda casi entero dentro de b?
  function contenido(a, b) {
    const clave = a + '\u0000' + b; if (contenidos.has(clave)) return contenidos.get(clave);
    const puntos = muestraDe(a), anillos = porId.get(b)?.rings || [];
    const n = puntos.filter(p => anillos.some(ring => dentroDe(p, ring))).length;
    const si = puntos.length > 0 && n / puntos.length >= CONTENIDO && (porId.get(a)?.area || 0) < (porId.get(b)?.area || 0);
    contenidos.set(clave, si); return si;
  }

  function* matches({x, y}) {
    const cell = cells.get(Math.floor(x / size) + ',' + Math.floor(y / size)) || [];
    const point = [x, y];
    for (const {id, polygon, holes, box: [left, top, right, bottom]} of cell) {
      if (x < left || x > right || y < top || y > bottom) continue;
      if (inside(point, polygon) && !holes.some(hole => inside(point, hole))) yield id;
    }
  }
  // Candidatos sin los recintos que contienen a otro candidato; el más chico primero.
  function candidates(point) {
    const todos = [...new Set(matches(point))];
    if (todos.length < 2) return todos;
    const quedan = todos.filter(b => !todos.some(a => a !== b && contenido(a, b)));
    return quedan.sort((a, b) => (porId.get(a)?.area || 0) - (porId.get(b)?.area || 0));
  }
  const first = point => candidates(point)[0] ?? null;
  first.candidates = candidates;
  first.contenido = contenido;
  return first;
}
