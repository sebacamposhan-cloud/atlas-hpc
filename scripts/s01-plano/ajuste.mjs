// Calza las láminas DWG del nivel −1 (data/s01/laminas.json, cm del modelo) con el plano existente del −1 (dist/runtime.json,
// armado desde PDF), por los códigos de recinto: ajuste de semejanza (escala, giro y traslación, con el eje Y invertido)
// entre el rótulo de cada recinto en el DWG y su posición en Atlas. Así el dibujo DWG cae en el mismo marco que los
// contornos, rombos y correcciones que ya tiene el −1.
// Uso: node scripts/s01-plano/ajuste.mjs  -> data/s01/marco.json (marco del render) y data/s01/ajuste.json (residuos)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeRuntime} from '../../dist/runtime-loader.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = decodeRuntime(JSON.parse(fs.readFileSync(path.join(repo, 'dist/runtime.json'), 'utf8')));
const laminas = JSON.parse(fs.readFileSync(path.join(repo, 'data/s01/laminas.json'), 'utf8'));
const dibujo = JSON.parse(fs.readFileSync(path.join(repo, 'data/s01/dibujo.json'), 'utf8'));

// Códigos que aparecen una sola vez en cada fuente. La posición de cada recinto está en su lámina PDF: se le suma el
// desplazamiento de esa lámina en el mosaico del −1 (como world() en app.js).
const unicos = lista => { const n = new Map(); for (const [c] of lista) n.set(c, (n.get(c) || 0) + 1); return new Map(lista.filter(([c]) => n.get(c) === 1)); };
const desplazamiento = new Map(runtime.atlas.tiles.map(t => [t.id, t.offset]));
const enAtlas = unicos(runtime.data.rooms.filter(r => r.position && desplazamiento.has(r.document_id)).map(r => { const [x, y] = desplazamiento.get(r.document_id); return [r.code.trim(), [r.position[0] + x, r.position[1] + y]]; }));
const enDwg = unicos(laminas.rotulos.map(r => [r.codigo.trim(), r]));
let pares = [...enDwg].filter(([c]) => enAtlas.has(c)).map(([c, r]) => ({codigo: c, lamina: r.lamina, a: [r.p[0], -r.p[1]], b: enAtlas.get(c)}));

// Semejanza a -> b por mínimos cuadrados (a ya con Y invertida).
function semejanza(lista) {
  const n = lista.length, ma = [0, 0], mb = [0, 0];
  for (const {a, b} of lista) { ma[0] += a[0] / n; ma[1] += a[1] / n; mb[0] += b[0] / n; mb[1] += b[1] / n; }
  let sxx = 0, sxy = 0, saa = 0;
  for (const {a, b} of lista) { const ax = a[0] - ma[0], ay = a[1] - ma[1], bx = b[0] - mb[0], by = b[1] - mb[1]; sxx += ax * bx + ay * by; sxy += ax * by - ay * bx; saa += ax * ax + ay * ay; }
  const c = sxx / saa, s = sxy / saa;
  return {c, s, tx: mb[0] - (c * ma[0] - s * ma[1]), ty: mb[1] - (s * ma[0] + c * ma[1])};
}
const aplicar = (T, a) => [T.c * a[0] - T.s * a[1] + T.tx, T.s * a[0] + T.c * a[1] + T.ty];
const mediana = v => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
let T = semejanza(pares), residuos;
// Dos vueltas descartando pares que no calzan (recintos renombrados o rótulos movidos).
for (let vuelta = 0; vuelta < 2; vuelta++) {
  residuos = pares.map(p => Math.hypot(...aplicar(T, p.a).map((v, i) => v - p.b[i])));
  const limite = Math.max(3 * mediana(residuos), 6);
  pares = pares.filter((_, i) => residuos[i] <= limite); T = semejanza(pares);
}
residuos = pares.map(p => Math.hypot(...aplicar(T, p.a).map((v, i) => v - p.b[i])));
const escala = Math.hypot(T.c, T.s), giro = Math.atan2(T.s, T.c) * 180 / Math.PI, cm = escala; // unidades de Atlas por cm
const porLamina = {};
pares.forEach((p, i) => { (porLamina[p.lamina] ||= []).push(residuos[i] / cm); });
const resumen = {pares: pares.length, escala, giroGrados: giro, medianaCm: mediana(residuos) / cm, p90Cm: [...residuos].sort((x, y) => x - y)[Math.floor(residuos.length * .9)] / cm,
  porLamina: Object.fromEntries(Object.entries(porLamina).map(([l, v]) => [l, {pares: v.length, medianaCm: Math.round(mediana(v) * 10) / 10}]))};
console.log(JSON.stringify(resumen, null, 1));
if (Math.abs(giro) > 0.05) throw Error('El giro es de ' + giro.toFixed(3) + '°: el marco de Atlas solo admite escala y traslación.');
if (resumen.medianaCm > 15) throw Error('El error mediano supera 15 cm: revisa los códigos antes de dibujar.');
// Marco del render: X = (x − ox)·E, Y = (oy − y)·E. Con giro ≈ 0: X = E·x + tx  y  Y = −E·y + ty.
const E = T.c, mapa = runtime.map;
const marco = {nivel: 's01', escala: E, ox: -T.tx / E, oy: T.ty / E, width: mapa.width, height: mapa.height, origen: mapa.origin, carpeta: 'map', bounds: dibujo.bounds,
  nota: 'Marco del plano existente del nivel −1 (dist/runtime.json), calzado por códigos de recinto. origen/width/height: ventana del mapa; carpeta: dist/map.'};
fs.writeFileSync(path.join(repo, 'data/s01/marco.json'), JSON.stringify(marco));
fs.writeFileSync(path.join(repo, 'data/s01/ajuste.json'), JSON.stringify({...resumen, T, pares: pares.map((p, i) => ({codigo: p.codigo, lamina: p.lamina, errorCm: Math.round(residuos[i] / cm * 10) / 10}))}, null, 1));
