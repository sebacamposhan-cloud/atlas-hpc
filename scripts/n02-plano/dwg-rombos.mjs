// Extrae de las 8 láminas DWG del nivel 2 los rombos de terminación y las líneas de límite de recintos (capa A-AREA).
// Requiere el lector @mlightcad/libredwg-web (LibreDWG, GPL) instalado fuera del repo; no forma parte del sitio.
// Uso: node scripts/n02-plano/dwg-rombos.mjs <carpeta con node_modules del lector> <carpeta «Planos N02»>
//   -> data/n02/rombos-dwg.json
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [herramienta, carpeta] = process.argv.slice(2);
const {Dwg_File_Type, LibreDwg} = await import(pathToFileURL(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js')).href);
const libredwg = await LibreDwg.create(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/wasm/') + path.sep);
const plano = JSON.parse(fs.readFileSync(path.join(repo, 'data/n02/plano.json'), 'utf8'));
const porCodigo = new Map(plano.recintos.map(r => [r.codigo, r]));
const CODIGO = /^\d+(\.\d+)+-\d+$/;

// Campos del rombo según la posición del texto en el bloque (unidades del bloque × 1000).
function campo([x, y]) {
  const cerca = v => Math.abs(y - v) < .45;
  if (cerca(7.45)) return 'M1';
  if (cerca(5.71)) return 'CIE';
  if (cerca(3.58)) return 'PAV';
  if (cerca(1.77)) return 'M3';
  if (cerca(4.75)) return x > 0 ? 'M2' : 'M4';
  return null;
}
// Ajuste de semejanza (escala, giro, traslación) de puntos a -> b por mínimos cuadrados.
function semejanza(pares) {
  const n = pares.length, ma = [0, 0], mb = [0, 0];
  for (const {a, b} of pares) { ma[0] += a[0] / n; ma[1] += a[1] / n; mb[0] += b[0] / n; mb[1] += b[1] / n; }
  let sxx = 0, sxy = 0, saa = 0;
  for (const {a, b} of pares) { const ax = a[0] - ma[0], ay = a[1] - ma[1], bx = b[0] - mb[0], by = b[1] - mb[1]; sxx += ax * bx + ay * by; sxy += ax * by - ay * bx; saa += ax * ax + ay * ay; }
  const c = sxx / saa, s = sxy / saa;
  return {c, s, tx: mb[0] - (c * ma[0] - s * ma[1]), ty: mb[1] - (s * ma[0] + c * ma[1])};
}
const aplicar = (T, p) => [T.c * p[0] - T.s * p[1] + T.tx, T.s * p[0] + T.c * p[1] + T.ty];

const salida = {nota: 'Rombos y líneas de límite leídos de las láminas DWG del nivel 2. Coordenadas en cm del marco de data/n02/plano.json.', laminas: [], rombos: [], limites: [], bloques: {}};
for (const archivo of fs.readdirSync(carpeta).filter(f => /^HPC-ARQ-PLA-N02-A-50\d.*\.dwg$/i.test(f)).sort()) {
  const dwg = libredwg.dwg_read_data(fs.readFileSync(path.join(carpeta, archivo)), Dwg_File_Type.DWG);
  const db = libredwg.convert(dwg); libredwg.dwg_free(dwg);
  const ents = db.entities, textos = ents.filter(e => (e.type === 'MTEXT' || e.type === 'TEXT') && e.layer === 'A-AREA-IDEN' && e.insertionPoint);
  const bloques = new Map((db.tables.BLOCK_RECORD.entries || []).map(b => [b.name, b]));
  const leidos = [];
  for (const r of ents.filter(e => e.type === 'INSERT' && /Rombo/i.test(e.name))) {
    const p = r.insertionPoint, s = r.xScale, g = r.rotation || 0;
    const local = t => { const dx = t.insertionPoint.x - p.x, dy = t.insertionPoint.y - p.y; return [(dx * Math.cos(-g) - dy * Math.sin(-g)) / s * 1000, (dx * Math.sin(-g) + dy * Math.cos(-g)) / s * 1000]; };
    const propios = textos.map(t => ({t, l: local(t)})).filter(({l}) => l[0] > -20 && l[0] < 6 && l[1] > -6 && l[1] < 9);
    // Bajo el rombo van nombre (y≈−0,5), código (y≈−2,6) y superficie (y≈−5,1). Circulaciones usan códigos como «CT.F.2-1».
    const codigo = propios.find(({t, l}) => CODIGO.test(t.text.trim()) && l[1] < 0)?.t || null;
    const etiqueta = codigo || propios.find(({l}) => l[1] < -2 && l[1] > -3.2)?.t;
    const valores = {};
    for (const {t, l} of propios) { const k = l[1] > 0.5 && campo(l); if (k) valores[k] = t.text.trim(); }
    if (!bloques.has(r.name)) continue;
    if (!salida.bloques[r.name]) salida.bloques[r.name] = bloques.get(r.name).entities.filter(e => e.type === 'LINE').map(e => [e.startPoint.x, e.startPoint.y, e.endPoint.x, e.endPoint.y]);
    leidos.push({etiqueta: etiqueta?.text.trim() || null, codigo: codigo?.text.trim(), codigoEn: codigo && [codigo.insertionPoint.x, codigo.insertionPoint.y], valores, p: [p.x, p.y], s, g, bloque: r.name,
      textos: propios.filter(({l}) => l[1] > 0.5 && campo(l)).map(({t}) => ({texto: t.text.trim(), p: [t.insertionPoint.x, t.insertionPoint.y], h: t.textHeight}))});
  }
  // Marco de la lámina: semejanza desde las etiquetas de código hacia la posición del recinto en plano.json (cm).
  const pares = leidos.filter(x => x.codigo && porCodigo.has(x.codigo)).map(x => ({a: x.codigoEn, b: porCodigo.get(x.codigo).p, codigo: x.codigo}));
  let T = semejanza(pares);
  for (let k = 0; k < 2; k++) { const err = pares.map(q => Math.hypot(...aplicar(T, q.a).map((v, i) => v - q.b[i]))); const lim = Math.max(40, [...err].sort((a, b) => a - b)[err.length >> 1] * 3); T = semejanza(pares.filter((q, i) => err[i] < lim)); }
  const err = pares.map(q => Math.hypot(...aplicar(T, q.a).map((v, i) => v - q.b[i]))).sort((a, b) => a - b);
  const escala = Math.hypot(T.c, T.s), giro = Math.atan2(T.s, T.c);
  salida.laminas.push({archivo, T, rombos: leidos.length, emparejados: pares.length, escalaCmPorUnidad: +escala.toFixed(4), giroGrados: +(giro * 180 / Math.PI).toFixed(3), errorCm: {mediana: +(err[err.length >> 1] || 0).toFixed(1), p90: +(err[Math.floor(err.length * .9)] || 0).toFixed(1)}});
  for (const x of leidos) if (Object.keys(x.valores).length) salida.rombos.push({codigo: x.codigo || null, etiqueta: x.etiqueta, lamina: archivo.slice(16, 21), valores: x.valores, p: aplicar(T, x.p).map(v => +v.toFixed(1)), escala: +(x.s * escala).toFixed(4), giro: +(x.g + giro).toFixed(5), bloque: x.bloque,
    textos: x.textos.map(t => ({texto: t.texto, p: aplicar(T, t.p).map(v => +v.toFixed(1)), h: +(t.h * escala).toFixed(2)}))});
  for (const e of ents.filter(e => e.layer === 'A-AREA' && e.type === 'LINE')) salida.limites.push({lamina: archivo.slice(16, 21), a: aplicar(T, [e.startPoint.x, e.startPoint.y]).map(v => +v.toFixed(1)), b: aplicar(T, [e.endPoint.x, e.endPoint.y]).map(v => +v.toFixed(1))});
}
// Comparación con la monografía ya cargada (plano.json).
const distintos = [], sinCodigo = salida.rombos.filter(r => !r.codigo).length;
for (const r of salida.rombos.filter(r => r.codigo && porCodigo.has(r.codigo))) for (const [k, v] of Object.entries(r.valores)) if (String(porCodigo.get(r.codigo).mono[k]) !== v) distintos.push(r.codigo + ' ' + k + ': DWG=' + v + ' plano.json=' + porCodigo.get(r.codigo).mono[k]);
const conRombo = new Set(salida.rombos.map(r => r.codigo));
salida.control = {rombos: salida.rombos.length, sinCodigo, incompletos: salida.rombos.filter(r => Object.keys(r.valores).length !== 6).length,
  recintosSinRombo: plano.recintos.filter(r => !conRombo.has(r.codigo)).map(r => r.codigo), valoresDistintos: distintos, limites: salida.limites.length};
fs.writeFileSync(path.join(repo, 'data/n02/rombos-dwg.json'), JSON.stringify(salida));
console.log(JSON.stringify({laminas: salida.laminas, ...salida.control, recintosSinRombo: salida.control.recintosSinRombo.length, valoresDistintos: distintos.slice(0, 15), totalDistintos: distintos.length}, null, 1));
