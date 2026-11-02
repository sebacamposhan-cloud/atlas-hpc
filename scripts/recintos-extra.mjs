// Ajustes de recintos sobre el plano publicado de cada piso:
// - Agrega los recintos que las láminas DWG rotulan y el plano no tiene: en el nivel 2, los que la extracción dejó sin
//   polilínea (circulaciones, recintos técnicos, «Disponible»); en el −1, los de las láminas A-511 y A-512, fuera del
//   juego PDF con que se armó ese plano. El contorno sale del relleno desde el rótulo entre muros (dwg-plano/contorno.mjs);
//   si no cierra, el recinto lleva una superficie auxiliar de selección en el rótulo.
// - Quita de los niveles 2 y 3 los recintos de triple altura del nivel 1 que esas láminas también rotulan.
// Lo calculado queda en data/<nivel>/recintos-extra.json (el relleno necesita barreras.json, que no está en git), así que
// se puede volver a aplicar sin los DWG. Correr después de import-n02, import-dwg o prepare-runtime, y antes de
// prepare-offline. Uso: node scripts/recintos-extra.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {crearContorno, numero} = await import(pathToFileURL(path.join(repo, 'scripts/dwg-plano/contorno.mjs')).href);
const {decodePma} = await import(pathToFileURL(path.join(repo, 'dist/pma-model.mjs')).href);
const pma = decodePma(JSON.parse(fs.readFileSync(path.join(repo, 'dist/pma/catalog.json'), 'utf8')));
const leer = f => fs.existsSync(path.join(repo, f)) ? JSON.parse(fs.readFileSync(path.join(repo, f), 'utf8')) : null;
const r1 = v => Math.round(v * 10) / 10;

const TRIPLE_ALTURA = ['4.1.1.1.1-1', '4.1.1.1.6-1', '4.1.1.1.7-1', '4.1.1.2.6-1'];
// marco(p): cm del DWG → unidades del plano. documento(rótulo): documento al que se cuelga el recinto (posición relativa a su lámina).
const s01 = leer('data/s01/ajuste.json')?.T, n02 = leer('data/n02/marco.json');
const PISOS = {
  s01: {runtime: 'dist/runtime.json', pma: 'A-S01', agregar: true, marco: ([x, y]) => [r1(s01.c * x + s01.s * y + s01.tx), r1(s01.s * x - s01.c * y + s01.ty)],
    // A-511 y A-512 no tienen lámina PDF en ese plano: se cuelgan de la A-501, cuyo desplazamiento es cero.
    documento: () => '501-5016771b', sector: rot => rot.lamina},
  n02: {runtime: 'dist/n02/runtime.json', pma: 'A-N02', agregar: true, excluir: TRIPLE_ALTURA, marco: ([x, y]) => [r1((x - n02.ox) * n02.escala), r1((n02.oy - y) * n02.escala)],
    documento: rot => 'n02-' + rot.lamina.toLowerCase().replace('-', ''), rombos: 'n02'},
  n03: {runtime: 'dist/n03/runtime.json', excluir: TRIPLE_ALTURA}
};
const CAMPOS = ['CIE', 'M1', 'M2', 'M4', 'M3', 'PAV'];
const dentroDe = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

const resumen = {};
for (const [nivel, piso] of Object.entries(PISOS)) {
  const bundle = JSON.parse(fs.readFileSync(path.join(repo, piso.runtime), 'utf8')), c = bundle.catalog, idx = k => c.fields.indexOf(k);
  const codigoDe = row => row[idx('code')], idDe = row => row[idx('id')];
  // Recintos a agregar: calculados con los DWG si están, o los ya guardados.
  let extra = [];
  if (piso.agregar) {
    const archivo = `data/${nivel}/recintos-extra.json`, lam = leer(`data/${nivel}/laminas.json`), barreras = leer(`data/${nivel}/barreras.json`);
    const excluir = new Set(piso.excluir || []), publicados = new Set(c.rows.map(codigoDe).filter(code => !excluir.has(code)));
    if (barreras && lam) {
      const contorno = crearContorno(barreras), porCodigo = new Map(pma.main.filter(r => r.level === piso.pma).map(r => [String(r.code).trim(), r]));
      const rombos = new Map(); for (const r of lam.rombos || []) { const k = r.codigo || r.etiqueta; if (k && !rombos.has(k)) rombos.set(k, r); }
      const vistos = new Set();
      for (const rot of lam.rotulos) {
        if (publicados.has(rot.codigo) || excluir.has(rot.codigo) || vistos.has(rot.codigo)) continue; vistos.add(rot.codigo);
        const fila = porCodigo.get(rot.codigo), superficie = rot.superficie || fila?.area?.replace(/\s*m(²|2)/, '').trim() || '';
        const valores = rombos.get(rot.codigo)?.valores || (fila ? {M1: fila.M1, M2: fila.M2, M3: fila.M3, M4: fila.M4, CIE: fila.CIE, PAV: fila.PAV} : {});
        extra.push({codigo: rot.codigo, nombre: fila?.name?.trim() || rot.nombre || 'Sin nombre en la lámina', superficie, lamina: rot.lamina, p: rot.p, valores, ...contorno(rot.p, numero(fila?.area) || numero(superficie))});
      }
      fs.writeFileSync(path.join(repo, archivo), JSON.stringify({nota: 'Recintos rotulados en las láminas DWG que el plano publicado no tenía; contorno por relleno desde el rótulo (cm del DWG). Lo aplica scripts/recintos-extra.mjs.', recintos: extra}));
    } else extra = leer(archivo)?.recintos || [];
  }
  const quitar = new Set([...(piso.excluir || []), ...extra.map(e => e.codigo)]);
  const quitados = c.rows.filter(row => (piso.excluir || []).includes(codigoDe(row))).map(codigoDe);
  const idsFuera = new Set(c.rows.filter(row => quitar.has(codigoDe(row))).map(idDe));
  c.rows = c.rows.filter(row => !quitar.has(codigoDe(row)));
  if (bundle.selection?.rooms) bundle.selection.rooms = bundle.selection.rooms.filter(s => !idsFuera.has(s.id));
  // Filas nuevas con el formato compacto del catálogo (mismos campos, textos y terminaciones compartidos).
  const plantilla = Object.fromEntries(c.fields.map((k, i) => [k, c.rows[0][i]])), texto = i => c.strings[i];
  const intern = v => { let i = c.strings.indexOf(v); if (i < 0) { i = c.strings.length; c.strings.push(v); } return i; };
  const materiales = new Map(c.base.materials.map(m => [m.code, m]));
  const terminacion = (field, valor) => { const code = valor == null || valor === '' ? 'N/A' : String(valor), m = materiales.get(code); return {field, code, description: m?.description || 'Sin descripción documentada', category: m?.category || 'Sin identificar', asepsis: m?.asepsis || null}; };
  const fin = t => { let i = c.finishes.findIndex(f => ['field', 'code', 'description', 'category', 'asepsis'].every(k => (f[k] ?? null) === (t[k] ?? null))); if (i < 0) { i = c.finishes.length; c.finishes.push(t); } return i; };
  const cajas = piso.rombos ? leer(`data/${piso.rombos}/rombos-plano.json`) || {} : {};
  let contornos = 0, auxiliares = 0;
  for (const e of extra) {
    const docId = piso.documento(e), doc = c.base.documents.find(d => d.id === docId), id = docId + ':' + e.codigo;
    const anillo = e.poly ? Array.from({length: e.poly.length / 2}, (_, i) => piso.marco([e.poly[2 * i], e.poly[2 * i + 1]])) : null;
    const pos = piso.marco(e.p), auxiliar = !anillo;
    const cuadrado = (() => { const m = Math.sqrt(numero(e.superficie) || 9) * 25, [x, y] = e.p; return [[x - m, y - m], [x + m, y - m], [x + m, y + m], [x - m, y + m]].map(piso.marco); })();
    if (auxiliar) { auxiliares++; (bundle.selection ||= {schema: 1, rooms: []}).rooms.push({id, rings: [{polygon: cuadrado, holes: []}], score: 1}); } else contornos++;
    const finishes = CAMPOS.map(k => terminacion(k, e.valores?.[k])), caja = cajas[e.codigo], imagen = caja && fs.existsSync(path.join(repo, 'dist', piso.rombos, 'rombos', e.codigo + '.png'));
    const conRombo = imagen && dentroDe([(caja[0] + caja[2]) / 2, (caja[1] + caja[3]) / 2], anillo || cuadrado);
    const room = {id, code: e.codigo, name: e.nombre, document_id: intern(docId), position: pos, label_bbox: null, diamond_bbox: conRombo ? caja : null,
      finishes: finishes.map(t => [fin(t), null]), declared_area: e.superficie ? e.superficie + ' m²' : '', polygon: anillo,
      geometry_status: intern('Pendiente de revisión'),
      geometry_method: intern(auxiliar ? 'Superficie auxiliar de selección: contorno no delimitado en los DWG' : e.estado === 'parcial' ? 'Contorno parcial por relleno desde el rótulo entre muros del DWG' : 'Contorno por relleno desde el rótulo entre muros del DWG'),
      status: intern('Pendiente de revisión'),
      notes: [intern(`Recinto agregado desde el rótulo de la lámina DWG ${e.lamina}: el plano publicado no lo tenía.`), ...(e.motivo ? [intern('Contorno: ' + e.motivo + '. Revisar.')] : [])],
      source_page: 1, level: plantilla.level, sector: intern(piso.sector ? piso.sector(e) : doc?.sector || texto(plantilla.sector)), holes: [], version: 1,
      asepsis: [...new Set(finishes.map(f => f.asepsis).filter(Boolean))], diamond_url: conRombo ? `${piso.rombos}/rombos/${encodeURIComponent(e.codigo)}.png` : null, history: [], has_polygon: !!anillo};
    c.rows.push(c.fields.map(k => room[k]));
  }
  fs.writeFileSync(path.join(repo, piso.runtime), JSON.stringify(bundle));
  resumen[nivel] = {quitados, agregados: extra.length, contornos, auxiliares, recintos: c.rows.length};
}
console.log(JSON.stringify(resumen));
