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
const rooms = plano.recintos.map(rec => {
  const doc = docBySector.get(rec.sector), polygon = pares(rec.poly);
  const finishes = CAMPOS.map(k => terminacion(k, rec.mono[k]));
  return {id: doc.id + ':' + rec.codigo, code: rec.codigo, name: rec.nombre, document_id: doc.id, position: pt(rec.p[0], rec.p[1]),
    label_bbox: null, diamond_bbox: null, finishes, declared_area: rec.superficie, polygon,
    geometry_status: 'Pendiente de revisión',
    geometry_method: rec.aprox ? 'Contorno aproximado desde el DWG' : 'Contorno vectorial del DWG',
    status: 'Pendiente de revisión',
    notes: ['Recinto y monografía tomados de la planta DWG del nivel 2 (Rev01_V1).', ...(rec.aprox ? ['Contorno aproximado: revisar contra el DWG.'] : [])],
    source_page: 1, level: '2', sector: doc.sector, holes: [], version: 1,
    asepsis: [...new Set(finishes.map(f => f.asepsis).filter(Boolean))], diamond_url: null, history: []};
});

// Catálogo compacto con el mismo formato que scripts/prepare-runtime.mjs.
const strings = [], stringIndex = new Map(), finishes = [], finishIndex = new Map();
const intern = v => { if (!stringIndex.has(v)) { stringIndex.set(v, strings.length); strings.push(v); } return stringIndex.get(v); };
const pooledFields = ['document_id', 'geometry_status', 'geometry_method', 'status', 'level', 'sector'];
const fields = [...Object.keys(rooms[0]), 'has_polygon'];
const rows = rooms.map(source => {
  const r = {...source, has_polygon: true};
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
  // Plano de fondo: mosaicos monocromáticos de la planta PDF (scripts/n02-plano). Bordes de sectores como capa opcional.
  map: {...mosaicos, overlays: [{id: 'sectores', nombre: 'Bordes de sectores', href: 'n02/sectores.svg', visible: false}]},
  selection: {schema: 1, rooms: []}
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
  runtimeBytes: fs.statSync(path.join(out, 'runtime.json')).size, mosaicos: mosaicos.levels.map(l => l.columns * l.rows).reduce((a, b) => a + b),
  pdf: fs.existsSync(path.join(dist, 'source', PDF)) ? PDF : 'no copiado (falta la carpeta Planos N02)'}));
