// Convierte un nivel dibujado desde sus láminas DWG (scripts/dwg-plano) al formato de Atlas.
// Entrada: data/<nivel>/laminas.json, recintos.json, marco.json y rombos-plano.json, y los mosaicos de dist/<nivel>/map.
// Salida: dist/<nivel>/runtime.json, geometry/ y laminas.svg (bordes de láminas, capa opcional).
// Uso: node scripts/import-dwg.mjs <nivel: n01|n03>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {aAtlas} from './dwg-plano/marco.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nivel = process.argv[2];
if (!/^n0[13]$/.test(nivel || '')) throw Error('Indica el nivel: n01 o n03 (el N02 se importa con scripts/import-n02.mjs).');
const dist = path.join(root, 'dist'), out = path.join(dist, nivel), numero = nivel.slice(-1), NIVEL = nivel.toUpperCase();
const leer = f => JSON.parse(fs.readFileSync(path.join(root, 'data', nivel, f), 'utf8'));
const laminas = leer('laminas.json'), {recintos} = leer('recintos.json'), marco = leer('marco.json');
const cajasRombo = fs.existsSync(path.join(root, 'data', nivel, 'rombos-plano.json')) ? leer('rombos-plano.json') : {};
const base = JSON.parse(fs.readFileSync(path.join(dist, 'data.json'), 'utf8'));
const W = marco.width, H = marco.height, pt = p => aAtlas(marco, p);
const caja = ([x0, y0, x1, y1]) => { const a = pt([x0, y1]), b = pt([x1, y0]); return [a[0], a[1], +(b[0] - a[0]).toFixed(1), +(b[1] - a[1]).toFixed(1)]; };

// Una lámina por documento. El sector sigue el número de lámina (501 → A … 510 → J) para no cambiar si se suma una lámina.
const documents = laminas.laminas.map(l => {
  const n = Number(l.lamina.slice(-3)), revision = (l.archivo.match(/Rev[^.]*/) || ['Sin revisión'])[0];
  return {id: nivel + '-' + l.lamina.toLowerCase().replace('-', ''), project_id: 'hpc', code: `HPC-ARQ-PLA-${NIVEL}-${l.lamina}`, revision,
    level: numero, sector: 'ABCDEFGHIJKL'[n - 501] || String(n), page: 1, width: W, height: H, rotation: 0, filename: null, sha256: l.sha256, kind: 'dwg', legend: null,
    metadata: {title: `PLANTA DE NIVEL ${numero} - LÁMINA ${l.lamina}`, specialty: 'ARQUITECTURA', pages: 1, vector: true, source_original_name: l.archivo}};
});
const docPorLamina = new Map(laminas.laminas.map((l, i) => [l.lamina, documents[i]]));

const materials = new Map(base.materials.map(m => [m.code, m]));
const CAMPOS = ['CIE', 'M1', 'M2', 'M4', 'M3', 'PAV'];
function terminacion(field, valor) {
  // Igual que en el nivel −1: un campo vacío o «N/A» es «No Aplica» del catálogo.
  const code = valor == null || valor === '' ? 'N/A' : String(valor).trim(), m = materials.get(code);
  return {field, code, bbox: null, description: m?.description || 'Sin descripción documentada', category: m?.category || 'Sin identificar', asepsis: m?.asepsis || null};
}
const dentroDe = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const numeroDe = s => { const v = parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };

const seleccion = []; // superficies auxiliares (mismo formato que dist/selection.json)
const METODO = {ok: 'Contorno del DWG: relleno desde el rótulo entre muros, puertas y ventanas', parcial: 'Contorno parcial del DWG: tabiques interiores o artefactos fijos dividen el recinto',
  auxiliar: 'Superficie auxiliar de selección: contorno no delimitado en los DWG'};
const rooms = recintos.map(rec => {
  const doc = docPorLamina.get(rec.lamina), id = doc.id + ':' + rec.codigo, finishes = CAMPOS.map(k => terminacion(k, rec.valores?.[k]));
  let polygon = null;
  if (rec.poly) { polygon = []; for (let i = 0; i < rec.poly.length; i += 2) polygon.push(pt([rec.poly[i], rec.poly[i + 1]])); }
  else {
    // Cuadrado de un cuarto de la superficie declarada centrado en el rótulo: permite tocar el recinto sin inventar un límite.
    const m = Math.sqrt(numeroDe(rec.superficie) || 4) * 25, [x, y] = rec.p;
    seleccion.push({id, rings: [{polygon: [[x - m, y + m], [x + m, y + m], [x + m, y - m], [x - m, y - m]].map(pt), holes: []}], score: 1});
  }
  const anillo = polygon || seleccion.at(-1).rings[0].polygon, cajaRombo = cajasRombo[rec.codigo];
  const imagen = cajaRombo && fs.existsSync(path.join(out, 'rombos', rec.codigo + '.png')) ? nivel + '/rombos/' + encodeURIComponent(rec.codigo) + '.png' : null;
  // La caja del rombo solo se declara si el rombo de la lámina cae dentro del contorno del recinto.
  const enContorno = cajaRombo && (([x0, y0, x1, y1]) => [[(x0 + x1) / 2, y0], [x1, (y0 + y1) / 2], [(x0 + x1) / 2, y1], [x0, (y0 + y1) / 2]].every(p => dentroDe(p, anillo)))(cajaRombo);
  const notas = [rec.monografia === 'rombo' ? `Monografía leída del rombo de la lámina DWG ${rec.lamina}.` : rec.monografia === 'pma' ? `La lámina ${rec.lamina} no trae rombo para este recinto: monografía del PMA RevB.` : `La lámina ${rec.lamina} no trae rombo y el recinto no está en el PMA.`,
    ...(rec.estado === 'parcial' ? ['Contorno parcial: el relleno desde el rótulo no cubre toda la superficie declarada. Revisar.'] : rec.estado === 'auxiliar' ? [`Sin contorno cerrado en los DWG (${rec.motivo}): se muestra un cuadrado de selección en el rótulo, no su contorno real.`] : [])];
  return {id, code: rec.codigo, name: rec.nombre, document_id: doc.id, position: pt(rec.p), label_bbox: null, diamond_bbox: imagen && enContorno ? cajaRombo : null, finishes,
    declared_area: rec.superficie, polygon, geometry_status: 'Pendiente de revisión', geometry_method: METODO[rec.estado], status: 'Pendiente de revisión', notes: notas,
    source_page: 1, level: numero, sector: doc.sector, holes: [], version: 1, asepsis: [...new Set(finishes.map(f => f.asepsis).filter(Boolean))], diamond_url: imagen, history: []};
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
if (!fs.existsSync(indice)) throw Error(`Falta dist/${nivel}/map/index.json: genera primero el plano con scripts/dwg-plano (ver LEEME.md).`);
const mosaicos = JSON.parse(fs.readFileSync(indice, 'utf8'));
if (Math.abs(mosaicos.width - W) > .5 || Math.abs(mosaicos.height - H) > .5) throw Error(`El plano de dist/${nivel}/map no corresponde al marco actual: vuelve a generarlo.`);
const nombres = laminas.laminas.map(l => l.lamina);
const bundle = {
  schema: 1,
  catalog: {fields, pooledFields, strings, finishes, rows, base: {project: base.project, documents, materials: base.materials, expected_documents: documents.length}},
  atlas: {width: W, height: H, tiles: documents.map((d, i) => ({id: d.id, offset: [0, 0], clip: caja(laminas.laminas[i].ventana)})),
    alignment: `Coordenadas del modelo compartidas por las láminas DWG del nivel ${numero}`, scope: {name: `${nombres.length} láminas · ${nombres.join(', ')}`, sourceLabels: nombres.join(', '), bounds: caja(marco.bounds), view: [0, 0, W, H]}},
  map: {...mosaicos, overlays: [{id: 'laminas', nombre: 'Bordes de láminas', href: nivel + '/laminas.svg', visible: false}]},
  selection: {schema: 1, rooms: seleccion}
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const bordes = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${laminas.laminas.map(l => { const [x, y, w, h] = caja(l.ventana); return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#386c84" stroke-width="2" stroke-dasharray="10 6"/><text x="${x + 8}" y="${y + 20}" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" fill="#386c84">${esc(l.lamina)}</text>`; }).join('')}</svg>`;

fs.mkdirSync(path.join(out, 'geometry'), {recursive: true});
fs.writeFileSync(path.join(out, 'runtime.json'), JSON.stringify(bundle));
fs.writeFileSync(path.join(out, 'laminas.svg'), bordes);
for (const doc of documents) fs.writeFileSync(path.join(out, 'geometry', doc.id + '.json'), JSON.stringify({rooms: rooms.filter(r => r.document_id === doc.id).map(({id, polygon, holes}) => ({id, polygon, holes}))}));
// Redirección de la dirección corta del nivel, como dist/n02/index.html.
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Atlas HPC · Nivel ${numero}</title>\n<!-- El nivel ${numero} vive dentro de Atlas. Se conservan los enlaces de un recinto (#código). -->\n<script>location.replace('../?nivel=${NIVEL}' + location.hash);</script>\n</head>\n<body>\n<p><a href="../?nivel=${NIVEL}">Abrir el nivel ${numero} en Atlas</a></p>\n</body>\n</html>\n`);
console.log(JSON.stringify({nivel, rooms: rooms.length, documents: documents.length, width: W, height: H, runtimeBytes: fs.statSync(path.join(out, 'runtime.json')).size,
  contornos: rooms.filter(r => r.polygon).length, auxiliares: seleccion.length, conImagenRombo: rooms.filter(r => r.diamond_url).length, romboDentro: rooms.filter(r => r.diamond_bbox).length}));
