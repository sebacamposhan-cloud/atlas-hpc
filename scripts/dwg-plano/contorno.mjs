// Contorno de un recinto desde las láminas DWG, en cm del marco del nivel. Dos fuentes, en este orden:
// 1. Zona: el relleno de color del recinto (capa A-AREA-PATT, data/<nivel>/zonas.json). Es el límite que usa el modelo de
//    Revit, así que corta los pasillos donde corresponde aunque no haya puerta. Un recinto que cruza dos láminas trae un
//    relleno en cada una: se unen los que se traslapan. Se cierran las ranuras que dejan las hojas de las puertas. Se acepta si su área queda a ±5 % de la superficie declarada.
// 2. Relleno: se rasterizan muros, ventanales, pilares y escaleras (barreras: [ax, ay, bx, by]) en una grilla de 3 cm para
//    todo el nivel, se rellena desde el rótulo y se toma el borde.
//    - Cada puerta cierra su vano con una recta de jamba a jamba (vanos.json). La hoja y el barrido no limitan.
//    - El borde se lleva a la línea del muro y, en cada puerta, a la cara del muro: el contorno pasa recto frente al vano.
//    - No hay ventana de búsqueda: un pasillo largo se rellena completo. El relleno se detiene si pasa de 125 % de la
//      superficie declarada (o de 2 m² más) (se escapó o se unió con otro recinto).
// Después se simplifica y se ponen a escuadra los tramos casi horizontales o verticales. Los huecos de más de 1,5 m²
// (núcleos rodeados por un pasillo) se devuelven aparte.
// Se acepta entre 80 % y 120 % de la superficie declarada (o hasta 1,5 m² de más en recintos chicos); entre 60 % y 80 % queda como contorno parcial. Si no, devuelve
// «auxiliar» con el motivo y, en «aux», la parte del recinto que rodea al rótulo, recortada por los muros (no se inventa un
// límite ni se invaden los recintos vecinos).
const RES = 3, MARGEN = 30, HUECO_MIN = 1.5, TOPE_SIN_AREA = 3000;
export const numero = s => { const v = parseFloat(String(s ?? '').replace(/m(²|2)/, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const areaAnillo = ring => { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
const dentroPlano = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > y) !== (r[j + 1] > y) && x < (r[j] - r[i]) * (y - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) c = !c; return c; };
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

// Máscara local: w × h celdas con origen en la celda (u0, v0) de la grilla del nivel.
function borde(m, w, h, valor) {
  // Seguimiento de Moore del borde exterior de las celdas con ese valor; termina al repetir el primer paso (criterio de Jacob).
  const inicio = m.indexOf(valor); if (inicio < 0) return [];
  const on = (X, Y) => X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X] === valor;
  let X = inicio % w, Y = (inicio / w) | 0, dir = 6, primero = -1; const x0 = X, y0 = Y, camino = [[X, Y]];
  for (let k = 0; k < 4e6; k++) {
    let nd = -1; for (let t = 0; t < 8; t++) { const d = (dir + 6 + t) % 8; if (on(X + DIRS[d][0], Y + DIRS[d][1])) { nd = d; break; } }
    if (nd < 0) break;
    if (X === x0 && Y === y0) { if (primero < 0) primero = nd; else if (nd === primero) break; }
    X += DIRS[nd][0]; Y += DIRS[nd][1]; dir = nd; camino.push([X, Y]);
  }
  if (camino.length > 1 && camino.at(-1)[0] === x0 && camino.at(-1)[1] === y0) camino.pop();
  return camino;
}
// Douglas–Peucker sobre un camino cerrado; devuelve los índices que se conservan.
function simplificar(c, tol) {
  const n = c.length; if (n < 4) return c.map((_, i) => i);
  let lejos = 0, md = -1; for (let i = 1; i < n; i++) { const d = (c[i][0] - c[0][0]) ** 2 + (c[i][1] - c[0][1]) ** 2; if (d > md) { md = d; lejos = i; } }
  const en = i => c[i % n], out = [];
  const dp = (a, b) => { // índices a < b (b puede ser n: vuelve al inicio)
    const pila = [[a, b]], guarda = new Set([a, b]);
    while (pila.length) {
      const [i, j] = pila.pop(), A = en(i), B = en(j), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; let mi = -1, mx = tol;
      for (let k = i + 1; k < j; k++) { const d = Math.abs((B[0] - A[0]) * (A[1] - c[k][1]) - (A[0] - c[k][0]) * (B[1] - A[1])) / L; if (d > mx) { mx = d; mi = k; } }
      if (mi > 0) { guarda.add(mi); pila.push([i, mi], [mi, j]); }
    }
    return [...guarda].sort((p, q) => p - q);
  };
  out.push(...dp(0, lejos).slice(0, -1), ...dp(lejos, n).slice(0, -1));
  return out;
}
// Pone a escuadra los tramos casi horizontales o verticales: cada uno toma la fila o columna más frecuente de su borde.
function escuadrar(c, idx) {
  const n = c.length, mediana = v => { v.sort((a, b) => a - b); return v[v.length >> 1]; };
  let vs = idx.map(i => ({i, p: [...c[i]]}));
  const tramo = (a, b) => { // tipo y coordenada del tramo entre los índices a y b del camino
    const A = c[a], B = c[b], dx = Math.abs(B[0] - A[0]), dy = Math.abs(B[1] - A[1]);
    const tipo = dy <= .07 * dx && dx >= 3 ? 'H' : dx <= .07 * dy && dy >= 3 ? 'V' : 'D'; if (tipo === 'D') return {tipo};
    const largo = (b - a + n) % n || n, salto = largo >= 8 ? 2 : 0, vals = [];
    for (let k = salto; k <= largo - salto; k++) vals.push(c[(a + k) % n][tipo === 'H' ? 1 : 0]);
    return {tipo, v: mediana(vals)};
  };
  for (let pasada = 0; pasada < 3; pasada++) {
    const ts = vs.map((v, k) => tramo(v.i, vs[(k + 1) % vs.length].i));
    // Dos tramos seguidos del mismo tipo y sobre la misma recta son uno solo.
    const queda = vs.filter((_, k) => { const a = ts[(k + vs.length - 1) % vs.length], b = ts[k]; return !(a.tipo !== 'D' && a.tipo === b.tipo && Math.abs(a.v - b.v) <= 1); });
    if (queda.length === vs.length || queda.length < 4) break; vs = queda;
  }
  let ts = vs.map((v, k) => tramo(v.i, vs[(k + 1) % vs.length].i));
  // Un chaflán corto entre un tramo horizontal y uno vertical es una esquina: sus dos vértices pasan a ser uno.
  for (let k = 0; k < vs.length && vs.length > 4; k++) {
    const N = vs.length, a = ts[(k + N - 1) % N], b = ts[k], d = ts[(k + 1) % N], q = vs[(k + 1) % N];
    if (b.tipo !== 'D' || a.tipo === 'D' || d.tipo === 'D' || a.tipo === d.tipo || Math.hypot(q.p[0] - vs[k].p[0], q.p[1] - vs[k].p[1]) > 4.5) continue;
    vs[k] = {i: vs[k].i, p: a.tipo === 'V' ? [a.v, d.v] : [d.v, a.v], fijo: true}; vs.splice((k + 1) % N, 1);
    ts = vs.map((v, j) => v.fijo || vs[(j + 1) % vs.length].fijo ? {tipo: 'F'} : tramo(v.i, vs[(j + 1) % vs.length].i)); k = -1;
    for (const v of vs) if (v.fijo) v.fijo = 2;
    ts = vs.map((v, j) => { const w = vs[(j + 1) % vs.length]; if (!v.fijo && !w.fijo) return tramo(v.i, w.i); const dx = Math.abs(w.p[0] - v.p[0]), dy = Math.abs(w.p[1] - v.p[1]); return dy <= .07 * dx && dx >= 3 ? {tipo: 'H', v: v.fijo ? v.p[1] : w.p[1]} : dx <= .07 * dy && dy >= 3 ? {tipo: 'V', v: v.fijo ? v.p[0] : w.p[0]} : {tipo: 'D'}; });
  }
  const out = vs.map((v, k) => {
    if (v.fijo) return v.p;
    const a = ts[(k + vs.length - 1) % vs.length], b = ts[k], p = [...v.p];
    if (a.tipo === 'V' && b.tipo !== 'V') p[0] = a.v; else if (b.tipo === 'V' && a.tipo !== 'V') p[0] = b.v;
    if (a.tipo === 'H' && b.tipo !== 'H') p[1] = a.v; else if (b.tipo === 'H' && a.tipo !== 'H') p[1] = b.v;
    return p;
  });
  return out.filter((p, k) => { const q = out[(k + 1) % out.length]; return p[0] !== q[0] || p[1] !== q[1]; });
}

export function crearContorno(barreras, {vanos = [], zonas = []} = {}) {
  // Grilla de todo el nivel.
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  const abarca = (x, y) => { if (x < X0) X0 = x; if (x > X1) X1 = x; if (y < Y0) Y0 = y; if (y > Y1) Y1 = y; };
  for (const [ax, ay, bx, by] of barreras) { abarca(ax, ay); abarca(bx, by); }
  for (const z of zonas) for (const r of z.anillos) for (let i = 0; i < r.length; i += 2) abarca(r[i], r[i + 1]);
  if (!(X1 > X0)) { X0 = Y0 = 0; X1 = Y1 = 1; }
  X0 -= MARGEN * RES; Y0 -= MARGEN * RES;
  const W = Math.ceil((X1 - X0) / RES) + MARGEN, H = Math.ceil((Y1 - Y0) / RES) + MARGEN, muro = new Uint8Array(W * H), marca = new Uint8Array(W * H);
  const cu = x => Math.floor((x - X0) / RES), cv = y => Math.floor((y - Y0) / RES), cm = ([u, v]) => [+(X0 + (u + .5) * RES).toFixed(1), +(Y0 + (v + .5) * RES).toFixed(1)];
  for (const [ax0, ay0, bx0, by0] of barreras) {
    const ax = (ax0 - X0) / RES, ay = (ay0 - Y0) / RES, bx = (bx0 - X0) / RES, by = (by0 - Y0) / RES, n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2) + 1;
    for (let i = 0; i <= n; i++) { const X = Math.floor(ax + (bx - ax) * i / n), Y = Math.floor(ay + (by - ay) * i / n); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) { const u = X + dx, v = Y + dy; if (u >= 0 && v >= 0 && u < W && v < H) muro[v * W + u] = 1; } }
  }
  const cajasZona = zonas.map(z => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const r of z.anillos) for (let i = 0; i < r.length; i += 2) { a = Math.min(a, r[i]); c = Math.max(c, r[i]); b = Math.min(b, r[i + 1]); d = Math.max(d, r[i + 1]); } return [a, b, c, d]; });

  function semilla(p) {
    const sx = cu(p[0]), sy = cv(p[1]);
    for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const u = sx + dx, v = sy + dy; if (u >= 0 && v >= 0 && u < W && v < H && !muro[v * W + u]) return [u, v]; }
    return null;
  }
  // Relleno entre barreras desde la celda s. tope: celdas; limite: [u0, v0, u1, v1] que no se cruza (superficie auxiliar).
  // Devuelve la máscara local (con margen) o el motivo por el que no cerró.
  function rellenar(s, tope, limite = null) {
    const pila = [s[1] * W + s[0]]; marca[pila[0]] = 1; let n = 0, u0 = s[0], u1 = s[0], v0 = s[1], v1 = s[1], falla = null;
    const [lu0, lv0, lu1, lv1] = limite || [0, 0, W - 1, H - 1];
    while (pila.length) {
      const i = pila.pop(), X = i % W, Y = (i / W) | 0; n++;
      if (X < u0) u0 = X; if (X > u1) u1 = X; if (Y < v0) v0 = Y; if (Y > v1) v1 = Y;
      if (!limite && (X === 0 || Y === 0 || X === W - 1 || Y === H - 1)) { falla = 'escapa'; break; }
      if (n > tope) { falla = 'tope'; break; }
      if (X > lu0 && !marca[i - 1] && !muro[i - 1]) { marca[i - 1] = 1; pila.push(i - 1); }
      if (X < lu1 && !marca[i + 1] && !muro[i + 1]) { marca[i + 1] = 1; pila.push(i + 1); }
      if (Y > lv0 && !marca[i - W] && !muro[i - W]) { marca[i - W] = 1; pila.push(i - W); }
      if (Y < lv1 && !marca[i + W] && !muro[i + W]) { marca[i + W] = 1; pila.push(i + W); }
    }
    // Lo marcado puede exceder la caja en una celda (vecinos apilados sin visitar).
    const a = Math.max(0, u0 - 1), b = Math.max(0, v0 - 1), c = Math.min(W - 1, u1 + 1), d = Math.min(H - 1, v1 + 1), P = 5;
    const w = c - a + 1 + 2 * P, h = d - b + 1 + 2 * P, m = falla ? null : new Uint8Array(w * h);
    for (let Y = b; Y <= d; Y++) { if (m) for (let X = a; X <= c; X++) if (marca[Y * W + X]) m[(Y - b + P) * w + X - a + P] = 1; marca.fill(0, Y * W + a, Y * W + c + 1); }
    return falla ? {falla} : {m, w, h, ou: a - P, ov: b - P};
  }
  function dilatar({m, w, h}) {
    const o = m.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!o[i] && (o[i - 1] || o[i + 1] || o[i - w] || o[i + w] || o[i - w - 1] || o[i - w + 1] || o[i + w - 1] || o[i + w + 1])) m[i] = 1; }
  }
  function erosionar({m, w, h}) {
    const o = m.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (o[i] && !(o[i - 1] && o[i + 1] && o[i - w] && o[i + w] && o[i - w - 1] && o[i - w + 1] && o[i + w - 1] && o[i + w + 1])) m[i] = 0; }
  }
  // Frente a cada puerta, el borde pasa por la cara del muro: se quita lo que el relleno entró en el vano.
  function enrasarVanos(L) {
    const {m, w, h, ou, ov} = L, x0 = X0 + ou * RES, y0 = Y0 + ov * RES, x1 = x0 + w * RES, y1 = y0 + h * RES;
    const celda = (x, y) => { const u = Math.floor((x - x0) / RES), v = Math.floor((y - y0) / RES); return u >= 0 && v >= 0 && u < w && v < h ? v * w + u : -1; };
    for (const {c, u, a: [a0, a1]} of vanos) {
      const mx = c[0] + u[0] * (a0 + a1) / 2, my = c[1] + u[1] * (a0 + a1) / 2, medio = (a1 - a0) / 2 + 80;
      if (mx < x0 - medio || mx > x1 + medio || my < y0 - medio || my > y1 + medio) continue;
      const nx = -u[1], ny = u[0];
      for (const s of [1, -1]) {
        let d = Infinity;
        for (const a of [a0 - 7.5, a0 - 15, a1 + 7.5, a1 + 15]) for (let t = 0; t <= 60; t += 1.5) { const i = celda(c[0] + u[0] * a + s * t * nx, c[1] + u[1] * a + s * t * ny); if (i >= 0 && m[i]) { if (t >= 4.5 && t < d) d = t; break; } }
        if (d > 45) continue;
        for (let a = a0 - 3; a <= a1 + 3; a += 1.5) for (let t = -3; t < d; t += 1.5) { const i = celda(c[0] + u[0] * a + s * t * nx, c[1] + u[1] * a + s * t * ny); if (i >= 0) m[i] = 0; }
      }
    }
  }
  // De la máscara al contorno: componente de la semilla, huecos grandes, borde, simplificación y escuadra.
  function trazar(L, s) {
    const {m, w, h, ou, ov} = L; let i0 = (s[1] - ov) * w + s[0] - ou;
    if (!m[i0]) { i0 = -1; for (let r = 1; r < 12 && i0 < 0; r++) for (let dy = -r; dy <= r && i0 < 0; dy++) for (let dx = -r; dx <= r; dx++) { const x = s[0] - ou + dx, y = s[1] - ov + dy; if (x > 0 && y > 0 && x < w - 1 && y < h - 1 && m[y * w + x]) { i0 = y * w + x; break; } } if (i0 < 0) return null; }
    const inundar = (desde, de, a) => { const pila = [desde]; m[desde] = a; let n = 0; while (pila.length) { const i = pila.pop(); n++; for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < m.length && m[j] === de) { m[j] = a; pila.push(j); } } return n; };
    inundar(i0, 1, 2);
    for (let i = 0; i < m.length; i++) if (m[i] === 1) m[i] = 0;
    const anillo = valor => { const c = borde(m, w, h, valor); if (c.length < 4) return null; const r = escuadrar(c, simplificar(c, 1.2)); return r.length >= 3 ? r.map(([x, y]) => cm([x + ou, y + ov])) : null; };
    const poly = anillo(2); if (!poly) return null;
    inundar(0, 0, 3); // exterior (el margen garantiza que la celda 0 está fuera)
    const huecos = [];
    for (let i = 0; i < m.length; i++) if (m[i] === 0) { const n = inundar(i, 0, 4); if (n * RES * RES / 1e4 >= HUECO_MIN) { const r = anillo(4); if (r) huecos.push(r); } for (let j = i; j < m.length; j++) if (m[j] === 4) m[j] = 3; }
    const area = (areaAnillo(poly) - huecos.reduce((t, r) => t + areaAnillo(r), 0)) / 1e4;
    return {areaM2: +area.toFixed(2), poly: poly.flat(), ...(huecos.length ? {huecos: huecos.map(r => r.flat())} : {})};
  }

  function porRelleno(p, declarada) {
    const s = semilla(p); if (!s) return {estado: 'auxiliar', motivo: 'sin espacio libre junto al rótulo'};
    const tope = declarada ? Math.max(1.25 * declarada, declarada + 2) : TOPE_SIN_AREA, L = rellenar(s, tope * 1e4 / (RES * RES));
    if (L.falla === 'escapa') return {estado: 'auxiliar', motivo: 'el relleno se escapa (abertura sin cerrar en el DWG)'};
    if (L.falla) return {estado: 'auxiliar', motivo: declarada ? `el relleno pasa de ${Math.round(tope)} m² contra ${declarada} m² (se une con otro recinto por una abertura sin puerta)` : 'el relleno no cierra'};
    dilatar(L); dilatar(L); enrasarVanos(L);
    const r = trazar(L, s); if (!r) return {estado: 'auxiliar', motivo: 'contorno degenerado'};
    return {metodo: 'relleno', ...r};
  }
  // Rasteriza un relleno (regla par-impar sobre todos sus anillos) en una máscara local.
  function pintar(z, m, w, h, x0, y0) {
    m.fill(0);
    const rings = z.anillos;
    for (let v = 0; v < h; v++) {
      const y = y0 + (v + .5) * RES, xs = [];
      for (const r of rings) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if ((r[i + 1] > y) !== (r[j + 1] > y)) xs.push(r[i] + (y - r[i + 1]) * (r[j] - r[i]) / (r[j + 1] - r[i + 1]));
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.max(0, Math.ceil((xs[k] - x0) / RES - .5)), b = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / RES - .5)); if (b >= a) m.fill(1, v * w + a, v * w + b + 1); }
    }
  }
  function porZona(p) {
    const contiene = z => z.anillos.reduce((n, r) => n + (dentroPlano(p[0], p[1], r) ? 1 : 0), 0) % 2 === 1;
    const k0 = zonas.findIndex(contiene); if (k0 < 0) return null;
    // Caja: los rellenos del mismo color que se tocan en cadena con el del rótulo.
    const iguales = zonas.map((z, k) => k).filter(k => zonas[k].color === zonas[k0].color), grupo = new Set([k0]); let caja = [...cajasZona[k0]];
    for (let cambio = true; cambio;) { cambio = false; for (const k of iguales) { const c = cajasZona[k]; if (!grupo.has(k) && c[0] <= caja[2] && c[2] >= caja[0] && c[1] <= caja[3] && c[3] >= caja[1]) { grupo.add(k); caja = [Math.min(caja[0], c[0]), Math.min(caja[1], c[1]), Math.max(caja[2], c[2]), Math.max(caja[3], c[3])]; cambio = true; } } }
    const P = 5, ou = cu(caja[0]) - P, ov = cv(caja[1]) - P, w = cu(caja[2]) - ou + P + 1, h = cv(caja[3]) - ov + P + 1, x0 = X0 + ou * RES, y0 = Y0 + ov * RES;
    if (w * h > 6e7) return null;
    const A = new Uint8Array(w * h), T = new Uint8Array(w * h), s = [cu(p[0]), cv(p[1])], is = (s[1] - ov) * w + s[0] - ou;
    const sumar = desde => { const pila = [desde]; A[desde] = 1; T[desde] = 0; while (pila.length) { const i = pila.pop(); for (const j of [i - 1, i + 1, i - w, i + w]) if (T[j]) { T[j] = 0; A[j] = 1; pila.push(j); } } };
    pintar(zonas[k0], T, w, h, x0, y0); if (!T[is]) return null; sumar(is);
    // Un recinto que cruza láminas: se suma el relleno de otra lámina que se traslapa con lo ya unido (no basta que se toquen).
    const usados = new Set([k0]);
    for (let cambio = true; cambio;) {
      cambio = false;
      for (const k of grupo) {
        if (usados.has(k)) continue;
        pintar(zonas[k], T, w, h, x0, y0);
        const gruesas = []; for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) { const i = y * w + x; if (T[i] && A[i] && T[i - 4] && A[i - 4] && T[i + 4] && A[i + 4] && T[i - 4 * w] && A[i - 4 * w] && T[i + 4 * w] && A[i + 4 * w]) gruesas.push(i); }
        if (gruesas.length < 100) continue;
        for (const i of gruesas) if (T[i]) sumar(i);
        usados.add(k); cambio = true;
      }
    }
    // El relleno de Revit rodea las hojas de las puertas abiertas: se cierran esas ranuras (hasta 18 cm) y se enrasan los vanos.
    const L = {m: A, w, h, ou, ov};
    for (let k = 0; k < 3; k++) dilatar(L); for (let k = 0; k < 3; k++) erosionar(L); enrasarVanos(L);
    const r = trazar(L, s); return r ? {metodo: 'zona', ...r} : null;
  }
  // Superficie auxiliar: lo que rodea al rótulo dentro de un cuadrado de un cuarto de la superficie, recortado por los muros.
  function auxiliar(p, declarada) {
    const s = semilla(p); if (!s) return null;
    const m = Math.round(Math.sqrt(declarada || 9) * 25 / RES), L = rellenar(s, Infinity, [Math.max(1, s[0] - m), Math.max(1, s[1] - m), Math.min(W - 2, s[0] + m), Math.min(H - 2, s[1] + m)]);
    dilatar(L); dilatar(L); enrasarVanos(L);
    return trazar(L, s)?.poly || null;
  }

  return function contorno(p, declarada) {
    // En recintos chicos unos centímetros de muro pesan mucho: hacia arriba se admite también hasta 1,5 m² de más.
    const dentro = (r, a, b) => r && declarada && r.areaM2 >= a * declarada && r.areaM2 <= (b > 1.1 ? Math.max(b * declarada, declarada + 1.5) : b * declarada);
    const z = zonas.length ? porZona(p) : null;
    if (z && (!declarada || dentro(z, .95, 1.05))) return {estado: 'ok', ...z};
    const f = porRelleno(p, declarada);
    if (f.poly && !declarada) return {estado: 'ok', ...f};
    const error = r => Math.abs(r.areaM2 / declarada - 1);
    if (dentro(f, .8, 1.2) && !(dentro(z, .8, 1.2) && error(z) < error(f))) return {estado: 'ok', ...f};
    if (dentro(z, .8, 1.2)) return {estado: 'ok', ...z};
    if (dentro(f, .6, .8)) return {estado: 'parcial', ...f, motivo: `contorno parcial (${f.areaM2.toFixed(1)} m² contra ${declarada} m²)`};
    const motivo = f.motivo || `área fuera de rango (${f.areaM2.toFixed(1)} m² contra ${declarada} m²)`, aux = auxiliar(p, declarada);
    return {estado: 'auxiliar', motivo, ...(aux ? {aux} : {})};
  };
}
