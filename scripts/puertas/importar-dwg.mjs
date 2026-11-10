// Puertas de un piso desde el plano de avance de instalación (DWG general de Revit, coordenadas del modelo en metros).
// Lee, en la capa A-DOOR-IDEN, el rótulo de cada puerta (modelo «PI09c», ancho «0,90 m» y código de partida «6.6.1.3.4»)
// y su llave («K2_N02_14»); y en las capas de avance, el contratista, el estado y el número de vano:
//   Teisa (madera):            «TEISA - INSTALADA» verde · «TEISA» rojo (no instalada) · «REVISAR TEISA» rojo (revisar)
//                              — el círculo rodea el rótulo de la puerta y no lleva número;
//   Protego (cortafuego/metal): «PROTEGO - INSTALADA» verde · «PROTEGO PUERTAS» rojo (no instalada) ·
//                              «PROTEGO - PLETINAS» magenta — el círculo lleva el número de vano.
// Los números de vano se conservan: Sacyr y los subcontratos los usan para ubicar los vanos.
// La ubicación pasa al plano de Atlas calzando los ejes de grilla del DWG (S-GRID-IDEN) con dist/<nivel>/ejes.json.
// Nada se inventa: lo que no se puede emparejar queda marcado «revisar» con su motivo.
// Uso: node scripts/puertas/importar-dwg.mjs <carpeta con node_modules del lector> "<archivo .dwg>" <nivel: n01|n02|n03|s01>
//   Lector LibreDWG en WebAssembly (GPL), fuera del repo: npm install --prefix <carpeta> @mlightcad/libredwg-web@0.7.17
//   -> dist/<nivel>/puertas.json
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [herramienta, archivo, nivel] = process.argv.slice(2);
if (!herramienta || !archivo || !/^(n0\d|s01)$/.test(nivel || '')) throw Error('Uso: importar-dwg.mjs <herramienta> <archivo.dwg> <n01|n02|n03|s01>');
const {Dwg_File_Type, LibreDwg} = await import(pathToFileURL(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js')).href);
const libredwg = await LibreDwg.create(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/wasm/') + path.sep);
const bytes = fs.readFileSync(archivo);
const dwg = libredwg.dwg_read_data(bytes, Dwg_File_Type.DWG), db = libredwg.convert(dwg); libredwg.dwg_free(dwg);
const bloques = new Map((db.tables.BLOCK_RECORD.entries || []).map(b => [b.name, b]));
const modelo = [...bloques.values()].find(b => /^\*model_space$/i.test(b.name));
const ents = db.entities.filter(e => !modelo || e.ownerBlockRecordSoftId == null || String(e.ownerBlockRecordSoftId) === String(modelo.handle));
const limpiar = s => String(s ?? '').replace(/\\P/g, ' ').replace(/\\S([^;^]*)\^([^;]*);/g, '$1/$2').replace(/\\[ACFHQTWfp][^;]*;/g, '').replace(/\\[LlOoKkX]/g, '').replace(/[{}]/g, '').trim();
const textos = ents.filter(e => (e.type === 'TEXT' || e.type === 'MTEXT') && e.insertionPoint).map(e => ({s: limpiar(e.text), capa: e.layer, x: e.insertionPoint.x, y: e.insertionPoint.y}));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- Calce con el plano por los ejes ----------
const ejesAtlas = JSON.parse(fs.readFileSync(path.join(repo, 'dist', nivel === 's01' ? '' : nivel, 'ejes.json'), 'utf8')).ejes;
const enAtlas = new Map(ejesAtlas.map(e => [e.id, e]));
const burbujas = textos.filter(t => t.capa === 'S-GRID-IDEN' && enAtlas.has(t.s));
// Ajuste lineal por eje: numerados (verticales) dan X; con letra (horizontales) dan Y. Mediana de las burbujas de cada eje.
const mediana = v => { const o = [...v].sort((a, b) => a - b); return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2; };
function ajustar(pares) {
  const n = pares.length, sx = pares.reduce((s, [d]) => s + d, 0), sy = pares.reduce((s, [, a]) => s + a, 0), sxx = pares.reduce((s, [d]) => s + d * d, 0), sxy = pares.reduce((s, [d, a]) => s + d * a, 0);
  const k = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - k * sx) / n;
  return {k, b, residuo: Math.max(...pares.map(([d, a]) => Math.abs(k * d + b - a)))};
}
const porEje = new Map();
for (const t of burbujas) { if (!porEje.has(t.s)) porEje.set(t.s, []); porEje.get(t.s).push(t); }
const paresX = [], paresY = [];
for (const [id, ts] of porEje) {
  const e = enAtlas.get(id);
  if (e.tipo === 'numero') paresX.push([mediana(ts.map(t => t.x)), (e.a[0] + e.b[0]) / 2]);
  else paresY.push([mediana(ts.map(t => t.y)), (e.a[1] + e.b[1]) / 2]);
}
if (paresX.length < 3 || paresY.length < 3) throw Error(`Muy pocos ejes para calzar (${paresX.length} numerados, ${paresY.length} con letra).`);
// Un eje mal rotulado arruina el calce: se descarta el peor si se aleja más de 50 unidades y se vuelve a ajustar.
const robusto = pares => { let a = ajustar(pares); while (pares.length > 3 && a.residuo > 50) { const peor = pares.reduce((m, p) => Math.abs(a.k * p[0] + a.b - p[1]) > Math.abs(a.k * m[0] + a.b - m[1]) ? p : m); pares = pares.filter(p => p !== peor); a = ajustar(pares); } return {...a, ejes: pares.length}; };
const fx = robusto(paresX), fy = robusto(paresY);
const aPlano = ({x, y}) => [Math.round((fx.k * x + fx.b) * 10) / 10, Math.round((fy.k * y + fy.b) * 10) / 10];

// ---------- Rótulos y llaves ----------
const RE_MODELO = /^P[A-Z]{1,3}\d{1,2}[A-Za-z]{0,2}$/, RE_ANCHO = /^\d+[,.]\d+\s*m$/, RE_PARTIDA = /^\d+(\.\d+){3,}$/, RE_LLAVE = /^[A-Z]\d?_[A-Z]\d{2}_\d+[A-Za-z]?$/;
const rotulo = textos.filter(t => t.capa === 'A-DOOR-IDEN');
const modelos = rotulo.filter(t => RE_MODELO.test(t.s)), anchos = rotulo.filter(t => RE_ANCHO.test(t.s)), partidas = rotulo.filter(t => RE_PARTIDA.test(t.s)), llaves = rotulo.filter(t => RE_LLAVE.test(t.s));
const cercano = (t, lista, max) => lista.map(o => ({o, d: dist(t, o)})).filter(x => x.d <= max).sort((a, b) => a.d - b.d)[0]?.o || null;
const pilas = modelos.map(m => ({modelo: m.s, ancho: cercano(m, anchos, 0.25)?.s.replace(/\s+/g, ' ') || null, partida: cercano(m, partidas, 0.3)?.s || null, x: m.x, y: m.y}));
// Emparejar cada llave con un rótulo: el par más cercano primero, hasta 1 m.
function emparejar(as, bs, max) {
  const pares = [];
  for (const [i, a] of as.entries()) for (const [j, b] of bs.entries()) { const d = dist(a, b); if (d <= max) pares.push([d, i, j]); }
  pares.sort((p, q) => p[0] - q[0]);
  const ua = new Map(), ub = new Set();
  for (const [d, i, j] of pares) if (!ua.has(i) && !ub.has(j)) { ua.set(i, j); ub.add(j); }
  return ua;
}
const llavePila = emparejar(llaves, pilas, 1.0), pilaUsada = new Set(llavePila.values());
const puertas = llaves.map((l, i) => {
  const p = llavePila.has(i) ? pilas[llavePila.get(i)] : null;
  return {llave: l.s, modelo: p?.modelo || null, ancho: p?.ancho || null, partida: p?.partida || null, ref: {x: l.x, y: l.y}, rotulo: p ? {x: p.x, y: p.y} : null};
});
pilas.forEach((p, j) => { if (!pilaUsada.has(j)) puertas.push({llave: null, modelo: p.modelo, ancho: p.ancho, partida: p.partida, ref: {x: p.x, y: p.y}, rotulo: {x: p.x, y: p.y}}); });

// ---------- Avance: contratista, estado y número de vano ----------
const CAPAS = {'TEISA - INSTALADA': ['Teisa', 'instalada'], 'TEISA': ['Teisa', 'no_instalada'], 'REVISAR TEISA': ['Teisa', 'revisar'],
  'PROTEGO - INSTALADA': ['Protego', 'instalada'], 'PROTEGO PUERTAS': ['Protego', 'no_instalada'], 'PROTEGO - PLETINAS': ['Protego', 'pletinas']};
const circulos = ents.filter(e => e.type === 'CIRCLE' && CAPAS[e.layer] && e.center).map(e => ({capa: e.layer, x: e.center.x, y: e.center.y, r: e.radius}));
const numeros = textos.filter(t => CAPAS[t.capa] && /^\d{1,4}[A-Za-z]?$/.test(t.s));
for (const c of circulos) c.vano = numeros.filter(t => t.capa === c.capa && dist(t, c) <= c.r * 1.1).sort((a, b) => dist(a, c) - dist(b, c))[0]?.s || null;
// Distancia de un círculo a una puerta: a su rótulo (Teisa lo rodea) o a su llave (Protego va junto a la hoja).
// Cada círculo va a la puerta más cercana (hasta 1,6 m). Una puerta puede tener dos: la puerta y sus pletinas (Protego).
// Un círculo sin puerta rotulada cerca queda como vano propio, con su estado y su número: no se pierde.
const distancia = (c, p) => Math.min(dist(c, p.ref), p.rotulo ? dist(c, p.rotulo) : Infinity);
const huerfanos = [];
for (const cir of circulos) {
  const m = puertas.map((p, j) => ({j, d: distancia(cir, p)})).sort((x, y) => x.d - y.d)[0];
  if (m && m.d <= 1.6) (puertas[m.j].marcas ||= []).push(cir); else huerfanos.push(cir);
}
for (const cir of huerfanos) puertas.push({llave: null, modelo: null, ancho: null, partida: null, ref: {x: cir.x, y: cir.y}, rotulo: null, marcas: [cir], soloVano: true});
// Estado de la puerta: instalada manda; luego pletinas, revisar y no instalada. Las pletinas se informan aparte.
const PRIORIDAD = ['instalada', 'pletinas', 'revisar', 'no_instalada'];
for (const p of puertas) {
  if (!p.marcas?.length) continue;
  const estados = p.marcas.map(m => CAPAS[m.capa]), principal = [...estados].sort((x, y) => PRIORIDAD.indexOf(x[1]) - PRIORIDAD.indexOf(y[1]))[0];
  p.contratista = principal[0]; p.estado = principal[1];
  p.pletinas = p.marcas.some(m => m.capa === 'PROTEGO - PLETINAS');
  p.vanos = [...new Set(p.marcas.map(m => m.vano).filter(Boolean))];
  p.capas = [...new Set(p.marcas.map(m => m.capa))];
}
// Marco del plano del piso: lo que cae fuera (otra zona del dibujo) se conserva, marcado, pero no se dibuja.
const marcoPiso = fs.existsSync(path.join(repo, 'data', nivel, 'marco.json')) ? JSON.parse(fs.readFileSync(path.join(repo, 'data', nivel, 'marco.json'), 'utf8')) : null;
const dentro = ([x, y]) => !marcoPiso || (x >= 0 && y >= 0 && x <= marcoPiso.width && y <= marcoPiso.height);
// ---------- Salida ----------
const salida = puertas.map((p, i) => {
  const revisar = [];
  if (!p.llave && !p.soloVano) revisar.push('Rótulo sin llave cercana');
  if (!p.modelo && !p.soloVano) revisar.push('Llave sin rótulo de modelo cercano');
  if (p.estado === 'revisar') revisar.push('Marcada «REVISAR TEISA» en el plano');
  if (p.soloVano) revisar.push('Círculo de avance sin puerta rotulada a menos de 1,6 m');
  if (p.marcas?.length > 1 && new Set(p.marcas.map(m => CAPAS[m.capa][0])).size > 1) revisar.push('Marcas de Teisa y de Protego en la misma puerta');
  const [x, y] = aPlano(p.ref), fuera = !dentro([x, y]);
  if (fuera) revisar.push('Fuera del plano del piso (otra zona del dibujo)');
  return {id: p.llave || (p.soloVano ? `vano-${p.vanos?.[0] || i + 1}-${i + 1}` : `sin-llave-${i + 1}`), llave: p.llave, modelo: p.modelo, ancho: p.ancho, partida: p.partida, vano: p.vanos?.join(' / ') || null,
    contratista: p.contratista || null, estado: p.estado || 'sin_registro', ...(p.pletinas ? {pletinas: true} : {}), ...(p.capas ? {capas: p.capas} : {}), ...(fuera ? {fuera: true} : {}), x, y, ...(revisar.length ? {revisar} : {})};
}).sort((a, b) => String(a.llave || a.id).localeCompare(String(b.llave || b.id), 'es', {numeric: true}));
const cuenta = (lista, f) => lista.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
const resultado = {
  schema: 1, nivel: nivel.toUpperCase(),
  fuente: {archivo: path.basename(archivo), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, modificado: new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(fs.statSync(archivo).mtime)},
  calce: {metodo: 'ejes de grilla S-GRID-IDEN contra ejes.json', x: {k: +fx.k.toFixed(6), b: +fx.b.toFixed(3), ejes: fx.ejes, residuo: +fx.residuo.toFixed(2)}, y: {k: +fy.k.toFixed(6), b: +fy.b.toFixed(3), ejes: fy.ejes, residuo: +fy.residuo.toFixed(2)}},
  capas: Object.fromEntries(Object.entries(CAPAS).map(([capa, [contratista, estado]]) => [capa, {contratista, estado}])),
  resumen: {puertas: salida.length, porEstado: cuenta(salida, p => p.estado), porContratista: cuenta(salida, p => p.contratista || 'sin contratista'), conVano: salida.filter(p => p.vano).length, conPletinas: salida.filter(p => p.pletinas).length, porRevisar: salida.filter(p => p.revisar).length, fueraDelPlano: salida.filter(p => p.fuera).length, vanosSinPuerta: huerfanos.length, circulos: circulos.length},
  puertas: salida
};
const destino = path.join(repo, 'dist', nivel, 'puertas.json');
fs.writeFileSync(destino, JSON.stringify(resultado) + '\n');
console.log(JSON.stringify({destino: path.relative(repo, destino), calce: resultado.calce, resumen: resultado.resumen}, null, 1));
