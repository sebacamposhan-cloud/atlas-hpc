// Maquetas 3D de la portada de pisos, desde los contornos reales de cada piso. Sin dependencias: dibuja por software
// (un rayo por píxel sobre un mapa de alturas) y escribe PNG; la portada usa esas imágenes convertidas a WebP.
// Entrada: <carpeta>/<piso>.json con [{d, t}], el atributo d de cada recinto del plano (#polygons path) y su título.
// Uso: node scripts/pisos-3d.mjs <carpeta de entrada> <carpeta de salida>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [entrada, salida] = process.argv.slice(2);
const PISOS = ['N-1', 'N01', 'N02', 'N03'];
// Tamaños en píxeles sobremuestreados (la imagen final queda a la mitad).
const PLACA = {ancho: 840, alto: 1080, margen: 26, radio: 38}, GIRO = -48 * Math.PI / 180, APLASTE = .56;
const LOSA = 36, MURO = 40, GRUESO_MURO = 2.1, GRUESO_BORDE = 8, CIERRE = 3;
const ANCHO = 1520, ALTO = 980, CX = ANCHO / 2, CY = 450;

const anillos = d => [...d.matchAll(/M([^MZ]+)Z?/g)].map(m => m[1].split('L').map(p => p.split(',').map(Number)));
// Encaja el edificio en la placa. Se mira el centro de cada recinto y se descartan los pocos muy lejanos (obras exteriores),
// que de otro modo achican la maqueta.
function encaje(recintos) {
  const centros = recintos.map(r => { const p = r.flat(); return [p.reduce((s, v) => s + v[0], 0) / p.length, p.reduce((s, v) => s + v[1], 0) / p.length]; });
  const corte = (v, q) => [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) * q)];
  const xc = centros.map(c => c[0]), yc = centros.map(c => c[1]), ax0 = corte(xc, .06), ax1 = corte(xc, .94), ay0 = corte(yc, .06), ay1 = corte(yc, .94), holgura = .14 * Math.max(ax1 - ax0, ay1 - ay0);
  const dentro = c => c[0] >= ax0 - holgura && c[0] <= ax1 + holgura && c[1] >= ay0 - holgura && c[1] <= ay1 + holgura;
  const xs = [], ys = [];
  recintos.forEach((r, i) => { if (dentro(centros[i])) for (const a of r) for (const [x, y] of a) { xs.push(x); ys.push(y); } });
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  console.log('  edificio', Math.round(x1 - x0), 'x', Math.round(y1 - y0), 'proporción', ((x1 - x0) / (y1 - y0)).toFixed(2));
  const util = PLACA.ancho - 2 * PLACA.margen, utilAlto = PLACA.alto - 2 * PLACA.margen, e = Math.min(util / (x1 - x0), utilAlto / (y1 - y0));
  return p => [(PLACA.ancho - (x1 - x0) * e) / 2 + (p[0] - x0) * e, (PLACA.alto - (y1 - y0) * e) / 2 + (p[1] - y0) * e];
}
const campo = () => new Uint8Array(PLACA.ancho * PLACA.alto);
function trazo(m, a, b, r) {
  const largo = Math.hypot(b[0] - a[0], b[1] - a[1]), pasos = Math.max(1, Math.ceil(largo / .75));
  for (let i = 0; i <= pasos; i++) {
    const x = a[0] + (b[0] - a[0]) * i / pasos, y = a[1] + (b[1] - a[1]) * i / pasos, c = Math.ceil(r);
    for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const u = Math.round(x + dx), v = Math.round(y + dy);
      if (u >= 0 && v >= 0 && u < PLACA.ancho && v < PLACA.alto) m[v * PLACA.ancho + u] = 1;
    }
  }
}
function relleno(m, aros) {
  for (let y = 0; y < PLACA.alto; y++) {
    const cortes = [];
    for (const aro of aros) for (let i = 0; i < aro.length; i++) {
      const a = aro[i], b = aro[(i + 1) % aro.length];
      if ((a[1] <= y) !== (b[1] <= y)) cortes.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    cortes.sort((p, q) => p - q);
    for (let i = 0; i + 1 < cortes.length; i += 2) for (let x = Math.max(0, Math.ceil(cortes[i])); x <= Math.min(PLACA.ancho - 1, cortes[i + 1]); x++) m[y * PLACA.ancho + x] = 1;
  }
}
// Dilatación y erosión con dos pasadas de distancia: rápidas aunque el radio sea grande.
function distancia(m, valor) {
  const {ancho: W, alto: H} = PLACA, d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = m[i] === valor ? 0 : 1e6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x) d[i] = Math.min(d[i], d[i - 1] + 1); if (y) d[i] = Math.min(d[i], d[i - W] + 1);
    if (x && y) d[i] = Math.min(d[i], d[i - W - 1] + 1.41); if (y && x < W - 1) d[i] = Math.min(d[i], d[i - W + 1] + 1.41);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (x < W - 1) d[i] = Math.min(d[i], d[i + 1] + 1); if (y < H - 1) d[i] = Math.min(d[i], d[i + W] + 1);
    if (x < W - 1 && y < H - 1) d[i] = Math.min(d[i], d[i + W + 1] + 1.41); if (y < H - 1 && x) d[i] = Math.min(d[i], d[i + W - 1] + 1.41);
  }
  return d;
}
function cierre(m, r) {
  const fuera = distancia(m, 1), grande = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) grande[i] = fuera[i] <= r ? 1 : 0;
  const dentro = distancia(grande, 0), r2 = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) r2[i] = dentro[i] > r ? 1 : 0;
  return r2;
}
function borroso(fuente, ancho, alto, r, pasadas = 3) {
  let a = Float32Array.from(fuente), b = new Float32Array(a.length);
  for (let n = 0; n < pasadas; n++) {
    for (let y = 0; y < alto; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * ancho + Math.max(0, Math.min(ancho - 1, x))]; for (let x = 0; x < ancho; x++) { b[y * ancho + x] = s / (2 * r + 1); s += a[y * ancho + Math.min(ancho - 1, x + r + 1)] - a[y * ancho + Math.max(0, x - r)]; } }
    for (let x = 0; x < ancho; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.max(0, Math.min(alto - 1, y)) * ancho + x]; for (let y = 0; y < alto; y++) { a[y * ancho + x] = s / (2 * r + 1); s += b[Math.min(alto - 1, y + r + 1) * ancho + x] - b[Math.max(0, y - r) * ancho + x]; } }
  }
  return a;
}

function maqueta(lista) {
  const {ancho: W, alto: H, radio} = PLACA, recintos = lista.map(r => anillos(r.d)), ajustar = encaje(recintos);
  const muros = campo(), interior = campo(), borde = campo(), dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  for (const r of recintos) {
    const aros = r.map(a => a.map(ajustar));
    if (!aros.flat().some(p => dentro(p[0], p[1]))) continue;
    relleno(interior, aros);
    for (const aro of aros) for (let i = 0; i < aro.length; i++) trazo(muros, aro[i], aro[(i + 1) % aro.length], GRUESO_MURO);
  }
  // Silueta del edificio: une recintos y pasillos, y levanta su contorno como muro exterior grueso.
  const silueta = cierre(interior, 16), lejos = distancia(silueta, 0);
  for (let i = 0; i < borde.length; i++) borde[i] = lejos[i] > 0 && lejos[i] <= GRUESO_BORDE ? 1 : 0;
  // Los recintos muy chicos se funden en bloques: de lejos se leen volúmenes, no líneas.
  const bloques = cierre(muros, CIERRE), alturas = new Float32Array(W * H);
  const dentroPlaca = (x, y) => { const cx = Math.max(radio, Math.min(W - radio, x)), cy = Math.max(radio, Math.min(H - radio, y)); return Math.hypot(x - cx, y - cy) <= radio; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!dentroPlaca(x, y)) continue;
    alturas[i] = LOSA + (borde[i] || (bloques[i] && silueta[i]) ? MURO : 0);
  }
  // Sombra suave sobre el piso: pegada a los muros y hacia la dirección de la luz.
  const masa = new Float32Array(W * H);
  for (let i = 0; i < masa.length; i++) masa[i] = alturas[i] > LOSA ? 1 : 0;
  const contacto = borroso(masa, W, H, 9), caida = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = Math.max(0, x - 15), v = Math.max(0, y - 9); caida[y * W + x] = masa[v * W + u]; }
  const arrojada = borroso(caida, W, H, 5);

  const cos = Math.cos(GIRO), sin = Math.sin(GIRO), S = 1;
  const L = new Float32Array(ANCHO * ALTO), A = new Uint8Array(ANCHO * ALTO), zMax = LOSA + MURO;
  const celda = (px, py, z) => {
    const X = (px - CX) / S, Y = (py + z - CY) / (S * APLASTE);
    return [Math.floor(X * cos + Y * sin + W / 2), Math.floor(-X * sin + Y * cos + H / 2)];
  };
  for (let py = 0; py < ALTO; py++) for (let px = 0; px < ANCHO; px++) {
    let previa = null;
    for (let z = zMax; z >= 0; z--) {
      const [gx, gy] = celda(px, py, z);
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) { previa = [gx, gy]; continue; }
      const h = alturas[gy * W + gx];
      if (h < z || !h) { previa = [gx, gy]; continue; }
      const i = py * ANCHO + px;
      A[i] = 1;
      if (z >= h - .5) {
        const j = gy * W + gx;
        L[i] = h > LOSA ? .995 : .84 - .3 * contacto[j] - .16 * arrojada[j];
      } else {
        const giroX = previa && previa[0] !== gx, altura = z / h;
        const base = giroX ? .76 : .58;
        L[i] = (h > LOSA && z < LOSA ? base : base) * (.86 + .14 * altura) + (z < LOSA ? -.02 : 0);
      }
      break;
    }
  }
  return {L, A};
}

// Pasa la luz a color y deja la mitad de tamaño, con sombra blanda bajo la placa.
const mezcla = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const BLANCO = [[92, 96, 104], [150, 155, 162], [205, 208, 214], [236, 238, 241], [255, 255, 255]];
const AZUL = [[17, 30, 74], [15, 66, 134], [18, 104, 184], [41, 168, 223], [150, 222, 248]];
const tono = (paleta, l) => { const t = Math.max(0, Math.min(.9999, (l - .45) / .55)) * (paleta.length - 1), i = Math.floor(t); return mezcla(paleta[i], paleta[i + 1], t - i); };
function imagen({L, A}, paleta) {
  const w = ANCHO / 2, h = ALTO / 2, rgba = new Uint8Array(w * h * 4), silueta = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = (y * 2 + dy) * ANCHO + x * 2 + dx;
      if (!A[i]) continue;
      const c = tono(paleta, L[i]); r += c[0]; g += c[1]; b += c[2]; a++;
    }
    const k = (y * w + x) * 4;
    if (a) { rgba[k] = r / a; rgba[k + 1] = g / a; rgba[k + 2] = b / a; rgba[k + 3] = 255 * a / 4; silueta[y * w + x] = a / 4; }
  }
  // Sombra: la silueta corrida hacia abajo, debajo de la maqueta.
  const corrida = new Float32Array(w * h);
  for (let y = 16; y < h; y++) for (let x = 0; x < w; x++) corrida[y * w + x] = silueta[(y - 16) * w + x];
  const sombra = borroso(corrida, w, h, 9);
  for (let i = 0; i < w * h; i++) {
    const k = i * 4, a = rgba[k + 3] / 255, s = sombra[i] * .3 * (1 - a);
    const total = a + s;
    if (total <= 0) continue;
    rgba[k] = rgba[k] * a / total + 20 * s / total; rgba[k + 1] = rgba[k + 1] * a / total + 30 * s / total; rgba[k + 2] = rgba[k + 2] * a / total + 60 * s / total; rgba[k + 3] = total * 255;
  }
  return {w, h, rgba};
}
function png({w, h, rgba}) {
  const crcTabla = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const v of b) c = crcTabla[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => { const t = Buffer.from(tipo), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(datos.length); c.writeUInt32BE(crc(Buffer.concat([t, datos]))); return Buffer.concat([l, t, datos, c]); };
  const cabecera = Buffer.alloc(13); cabecera.writeUInt32BE(w, 0); cabecera.writeUInt32BE(h, 4); cabecera[8] = 8; cabecera[9] = 6;
  const crudo = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(crudo, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', cabecera), trozo('IDAT', zlib.deflateSync(crudo, {level: 9})), trozo('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(salida, {recursive: true});
for (const piso of PISOS) {
  const lista = JSON.parse(fs.readFileSync(path.join(entrada, piso + '.json'), 'utf8')), m = maqueta(lista), nombre = piso.toLowerCase();
  fs.writeFileSync(path.join(salida, nombre + '-blanco.png'), png(imagen(m, BLANCO)));
  fs.writeFileSync(path.join(salida, nombre + '-azul.png'), png(imagen(m, AZUL)));
  console.log(piso, lista.length, 'recintos');
}
