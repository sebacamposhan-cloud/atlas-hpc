// Convierte el plano vectorial del nivel 2 (extraído de los DWG) al formato de Atlas.
// Entrada: data/n02/plano.json y data/n02/fuentes.json. Salida: dist/n02/.
// Uso: node scripts/import-n02.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist'), out = path.join(dist, 'n02');
const plano = JSON.parse(fs.readFileSync(path.join(root, 'data/n02/plano.json'), 'utf8'));
const fuentes = JSON.parse(fs.readFileSync(path.join(root, 'data/n02/fuentes.json'), 'utf8')).fuentes;
const base = JSON.parse(fs.readFileSync(path.join(dist, 'data.json'), 'utf8'));

// Misma escala que el nivel −1: puntos PDF de una lámina 1:50 (1 cm = 72/2,54/50 unidades).
const ESCALA = 72 / 2.54 / 50, MARGEN = 500;
const [bx0, by0, bx1, by1] = plano.bounds;
const ox = bx0 - MARGEN, oy = by1 + MARGEN;
const W = r1((bx1 - bx0 + 2 * MARGEN) * ESCALA), H = r1((by1 - by0 + 2 * MARGEN) * ESCALA);
function r1(v) { return Math.round(v * 10) / 10; }
const pt = (x, y) => [r1((x - ox) * ESCALA), r1((oy - y) * ESCALA)]; // eje Y hacia abajo, como en Atlas
const pares = arr => { const p = []; for (let i = 0; i < arr.length; i += 2) p.push(pt(arr[i], arr[i + 1])); return p; };
const caja = ([x0, y0, x1, y1]) => { const a = pt(x0, y1), b = pt(x1, y0); return [a[0], a[1], r1(b[0] - a[0]), r1(b[1] - a[1])]; };

const PDF = 'n02-planta-arquitectura.pdf';
const pdf = fuentes.find(f => /planta arquitectura/i.test(f.archivo));
const letra = id => 'ABCDEFGH'[Number(id.slice(-1)) - 1];
const documents = plano.sectores.map(s => {
  const dwg = fuentes.find(f => f.archivo.startsWith('HPC-ARQ-PLA-N02-' + s.id));
  return {id: 'n02-' + s.id.toLowerCase().replace('-', ''), project_id: 'hpc', code: 'HPC-ARQ-PLA-N02-' + s.id, revision: 'Rev01_V1',
    level: '2', sector: letra(s.id), page: 1, width: W, height: H, rotation: 0, filename: PDF, sha256: dwg?.sha256 || null,
    kind: 'dwg', legend: null,
    metadata: {title: 'PLANTA DE NIVEL 2 - ' + s.nombre.toUpperCase(), specialty: 'ARQUITECTURA', pages: 1, vector: true,
      source_original_name: dwg?.archivo || 'HPC-ARQ-PLA-N02-' + s.id + '.dwg'}};
});
const docBySector = new Map(plano.sectores.map((s, i) => [s.id, documents[i]]));

const materials = new Map(base.materials.map(m => [m.code, m]));
const CAMPOS = ['CIE', 'M1', 'M2', 'M4', 'M3', 'PAV'];
function terminacion(field, valor) {
  // Igual que en el nivel −1: un campo vacío o «N/A» es «No Aplica» del catálogo.
  const code = valor == null || valor === '' ? 'N/A' : String(valor), m = materials.get(code);
  return {field, code, bbox: null, description: m?.description || 'Sin descripción documentada', category: m?.category || 'Sin identificar', asepsis: m?.asepsis || null};
}
// Rombos leídos de las láminas DWG 1:50 (scripts/n02-plano/dwg-rombos.mjs) y su imagen y caja en el plano (scripts/dwg-plano/render.html).
const leer = f => fs.existsSync(path.join(root, f)) ? JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')) : null;
const rombosDwg = new Map(); for (const r of leer('data/n02/rombos-dwg.json')?.rombos || []) if (r.codigo && !rombosDwg.has(r.codigo)) rombosDwg.set(r.codigo, r);
const rombosPlano = leer('data/n02/rombos-plano.json') || {};

// Recintos abiertos: la app original cerraba sus lados sin muros con arcos inventados para igualar la superficie.
// Ni el PDF ni los DWG delimitan esos lados, así que cada arco se reemplaza por tramos rectos alineados con los ejes
// (esquina del lado hacia donde se curvaba el arco). El contorno sigue marcado como aproximado.
function sinArcos(ring) {
  const n = ring.length, len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const curva = ring.map((b, i) => { const a = ring[(i - 1 + n) % n], c = ring[(i + 1) % n], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    const giro = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])); return len(a, b) < 90 && len(b, c) < 90 && giro > .03 && giro < .7; });
  const inicio = curva.indexOf(false); if (inicio < 0) return ring;
  const r = [...ring.slice(inicio), ...ring.slice(0, inicio)], c = [...curva.slice(inicio), ...curva.slice(0, inicio)], out = [];
  for (let i = 0; i < n;) {
    if (!c[i]) { out.push(r[i]); i++; continue; }
    let j = i; while (j < n && c[j]) j++;
    if (j - i < 3) { for (let k = i; k < j; k++) out.push(r[k]); i = j; continue; }
    const A = r[i - 1], B = r[j % n], medio = r[(i + j) >> 1], lado = p => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    const esquina = Math.abs(B[0] - A[0]) > 15 && Math.abs(B[1] - A[1]) > 15 && [[A[0], B[1]], [B[0], A[1]]].find(q => Math.sign(lado(q)) === Math.sign(lado(medio)));
    if (esquina) out.push(esquina);
    i = j;
  }
  return out;
}
const dentroDe = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const areaM2 = ring => { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2e4; };
const sinCruces = p => { const x = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) { if (i === 0 && j === p.length - 1) continue; const a = p[i], b = p[(i + 1) % p.length], c = p[j], d = p[(j + 1) % p.length]; if (x(a, b, c) * x(a, b, d) < 0 && x(c, d, a) * x(c, d, b) < 0) return false; } return true; };
// Si el contorno era casi todo arco (no queda forma válida), se usa una superficie auxiliar de selección: un cuadrado
// de un cuarto de la superficie declarada centrado en el rótulo. Permite tocar el recinto sin inventar un límite.
let rectificados = 0, auxiliares = 0; const seleccion = []; // superficies auxiliares (mismo formato que dist/selection.json)
function contornoAbierto(rec, cm) {
  const r = sinArcos(cm), declarada = parseFloat(rec.superficie.replace(',', '.'));
  if (r.length >= 4 && sinCruces(r) && areaM2(r) >= .5 * declarada && areaM2(r) <= 1.25 * declarada) { if (r.length !== cm.length) rectificados++; return {ring: r, auxiliar: false}; }
  auxiliares++; const m = Math.sqrt(declarada) * 25, [x, y] = rec.p; // medio lado en cm: cuadrado de ¼ de la superficie
  return {ring: [[x - m, y - m], [x + m, y - m], [x + m, y + m], [x - m, y + m]], auxiliar: true};
}
const rooms = plano.recintos.map(rec => {
  const doc = docBySector.get(rec.sector), cm = []; for (let i = 0; i < rec.poly.length; i += 2) cm.push([rec.poly[i], rec.poly[i + 1]]);
  const abierto = rec.aprox ? contornoAbierto(rec, cm) : null, contorno = abierto?.ring || cm;
  const polygon = contorno.map(([x, y]) => pt(x, y));
  const dwg = rombosDwg.get(rec.codigo), valores = dwg?.valores || rec.mono, caja = rombosPlano[rec.codigo];
  const finishes = CAMPOS.map(k => terminacion(k, valores[k]));
  if (abierto?.auxiliar) seleccion.push({id: doc.id + ':' + rec.codigo, rings: [{polygon, holes: []}], score: 1});
  const imagen = caja && fs.existsSync(path.join(out, 'rombos', rec.codigo + '.png')) ? 'n02/rombos/' + encodeURIComponent(rec.codigo) + '.png' : null;
  // El plano se dibuja desde los DWG (scripts/dwg-plano): la caja del rombo solo se declara si el rombo de la lámina cae dentro del contorno.
  const anillo = abierto?.auxiliar ? seleccion.at(-1).rings[0].polygon : polygon;
  const enContorno = caja && [[(caja[0] + caja[2]) / 2, caja[1]], [caja[2], (caja[1] + caja[3]) / 2], [(caja[0] + caja[2]) / 2, caja[3]], [caja[0], (caja[1] + caja[3]) / 2]].every(p => dentroDe(p, anillo));
  return {id: doc.id + ':' + rec.codigo, code: rec.codigo, name: rec.nombre, document_id: doc.id, position: pt(rec.p[0], rec.p[1]),
    label_bbox: null, diamond_bbox: imagen && enContorno ? caja : null, finishes, declared_area: rec.superficie, polygon: abierto?.auxiliar ? null : polygon,
    geometry_status: 'Pendiente de revisión',
    geometry_method: abierto?.auxiliar ? 'Superficie auxiliar de selección: contorno no delimitado en los DWG' : rec.aprox ? 'Contorno aproximado: lados abiertos cerrados con tramos rectos' : 'Contorno vectorial del DWG',
    status: 'Pendiente de revisión',
    notes: [dwg ? `Monografía leída del rombo de la lámina DWG ${dwg.lamina} (Rev01_V1).` : 'Monografía de la planta DWG del nivel 2 (Rev01_V1); la lámina no dibuja rombo para este recinto.',
      ...(abierto?.auxiliar ? ['Recinto abierto sin límites dibujados en los DWG: se muestra un cuadrado de selección en el rótulo, no su contorno real.'] : rec.aprox ? ['Recinto abierto: los DWG no delimitan todos sus lados. Contorno aproximado, revisar.'] : [])],
    source_page: 1, level: '2', sector: doc.sector, holes: [], version: 1,
    asepsis: [...new Set(finishes.map(f => f.asepsis).filter(Boolean))], diamond_url: imagen, history: []};
});

// Catálogo compacto con el mismo formato que scripts/prepare-runtime.mjs.
const strings = [], stringIndex = new Map(), finishes = [], finishIndex = new Map();
const intern = v => { if (!stringIndex.has(v)) { stringIndex.set(v, strings.length); strings.push(v); } return stringIndex.get(v); };
const pooledFields = ['document_id', 'geometry_status', 'geometry_method', 'status', 'level', 'sector'];
const fields = [...Object.keys(rooms[0]), 'has_polygon'];
const rows = rooms.map(source => {
  const r = {...source, has_polygon: !!source.polygon};
  for (const key of pooledFields) r[key] = intern(r[key]);
  r.notes = r.notes.map(intern);
  r.finishes = r.finishes.map(({bbox, ...d}) => { const key = JSON.stringify(d); if (!finishIndex.has(key)) { finishIndex.set(key, finishes.length); finishes.push(d); } return [finishIndex.get(key), bbox]; });
  return fields.map(key => r[key]);
});
const indice = path.join(out, 'map', 'index.json');
if (!fs.existsSync(indice)) throw Error('Falta dist/n02/map/index.json: genera primero el plano con scripts/n02-plano (ver LEEME.md).');
const mosaicos = JSON.parse(fs.readFileSync(indice, 'utf8'));
if (Math.abs(mosaicos.width - W) > .5 || Math.abs(mosaicos.height - H) > .5) throw Error('El plano de dist/n02/map no corresponde al marco actual: vuelve a generarlo.');
// La vista completa coincide con el plano de fondo: la exportación PDF/PNG lo supone.
const ambito = caja(plano.bounds), vista = [0, 0, W, H];
const bundle = {
  schema: 1,
  catalog: {fields, pooledFields, strings, finishes, rows, base: {project: base.project, documents, materials: base.materials, expected_documents: documents.length}},
  atlas: {width: W, height: H, tiles: documents.map((d, i) => ({id: d.id, offset: [0, 0], clip: caja(plano.sectores[i].r)})),
    alignment: 'Coordenadas comunes de la planta DWG del nivel 2', scope: {name: 'Sectores A–H · 8 láminas', sourceLabels: 'A-501 a A-508', bounds: ambito, view: vista}},
  // Plano de fondo: mosaicos por capas dibujados desde las láminas DWG (scripts/dwg-plano). Bordes de sectores como capa opcional.
  map: {...mosaicos, overlays: [{id: 'sectores', nombre: 'Bordes de sectores', href: 'n02/sectores.svg', visible: false}]},
  selection: {schema: 1, rooms: seleccion}
};

// Bordes de sectores (capa opcional sobre el plano monocromático).
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const sectores = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${plano.sectores.map(s => { const [x, y, w, h] = caja(s.r); return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#386c84" stroke-width="2" stroke-dasharray="10 6"/><text x="${x + 8}" y="${y + 20}" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" fill="#386c84">${esc(s.nombre)} · ${esc(s.id)}</text>`; }).join('')}</svg>`;

fs.mkdirSync(path.join(out, 'geometry'), {recursive: true});
fs.writeFileSync(path.join(out, 'runtime.json'), JSON.stringify(bundle));
fs.writeFileSync(path.join(out, 'sectores.svg'), sectores);
// El dibujo simplificado anterior se reemplazó por los mosaicos del PDF.
for (const viejo of ['plano.svg', 'ejes.svg']) fs.rmSync(path.join(out, viejo), {force: true});
for (const doc of documents) fs.writeFileSync(path.join(out, 'geometry', doc.id + '.json'), JSON.stringify({rooms: rooms.filter(r => r.document_id === doc.id).map(({id, polygon, holes}) => ({id, polygon, holes}))}));
const original = path.join(root, '..', 'Planos N02', pdf?.archivo || '');
if (pdf && fs.existsSync(original)) fs.copyFileSync(original, path.join(dist, 'source', PDF));
console.log(JSON.stringify({rooms: rooms.length, documents: documents.length, width: W, height: H,
  runtimeBytes: fs.statSync(path.join(out, 'runtime.json')).size, conRombo: rooms.filter(r => r.diamond_url).length, contornosSinArcos: rectificados, superficiesAuxiliares: auxiliares, mosaicos: mosaicos.levels.map(l => l.columns * l.rows).reduce((a, b) => a + b),
  pdf: fs.existsSync(path.join(dist, 'source', PDF)) ? PDF : 'no copiado (falta la carpeta Planos N02)'}));
