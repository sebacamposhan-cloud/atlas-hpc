// Recintos de un nivel dibujado desde DWG: código y posición del rótulo, monografía del rombo y contorno.
// El contorno lo calcula scripts/dwg-plano/contorno.mjs: relleno desde el rótulo entre muros, ventanales, pilares y escaleras
// (data/<nivel>/barreras.json), con cada puerta cerrada de jamba a jamba (vanos.json), o el relleno de color del recinto
// si las láminas lo traen (zonas.json). Se acepta si su área queda entre 80 % y 120 % de la superficie del PMA (o del
// rótulo); entre 60 % y 80 % queda como contorno parcial. Si no, el recinto lleva una superficie auxiliar de selección:
// la parte que rodea al rótulo, recortada por los muros (no se inventa un límite).
// Uso: node scripts/dwg-plano/recintos.mjs <nivel: n01|n03>  -> data/<nivel>/recintos.json
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nivel = process.argv[2];
if (!/^n0[13]$/.test(nivel || '')) throw Error('Indica el nivel: n01 o n03 (el N02 conserva sus contornos de data/n02/plano.json).');
const leer = f => JSON.parse(fs.readFileSync(path.join(repo, 'data', nivel, f), 'utf8'));
const {rotulos, rombos} = leer('laminas.json'), barreras = leer('barreras.json');
const opcional = f => fs.existsSync(path.join(repo, 'data', nivel, f)) ? leer(f) : {};
const {decodePma} = await import(pathToFileURL(path.join(repo, 'dist/pma-model.mjs')).href);
const {crearContorno, numero} = await import(pathToFileURL(path.join(repo, 'scripts/dwg-plano/contorno.mjs')).href);
const pma = decodePma(JSON.parse(fs.readFileSync(path.join(repo, 'dist/pma/catalog.json'), 'utf8')));
const nivelPma = 'A-' + nivel.toUpperCase(), porCodigo = new Map(pma.main.filter(r => r.level === nivelPma).map(r => [String(r.code).trim(), r]));
const contorno = crearContorno(barreras, {vanos: opcional('vanos.json').vanos, zonas: opcional('zonas.json').zonas});

// Un recinto por código: rótulo de la primera lámina donde aparece; rombo con código si lo hay.
const conRombo = new Map(); for (const r of rombos) if (r.codigo && !conRombo.has(r.codigo)) conRombo.set(r.codigo, r);
const unicos = new Map(); for (const r of rotulos) if (!unicos.has(r.codigo)) unicos.set(r.codigo, r);
const recintos = [], t0 = Date.now();
for (const [codigo, rot] of unicos) {
  const fila = porCodigo.get(codigo), rombo = conRombo.get(codigo);
  const superficie = fila?.area?.replace(/\s*m(²|2)/, '').trim() || rot.superficie || null, declarada = numero(superficie);
  const valores = rombo ? rombo.valores : fila ? {M1: fila.M1, M2: fila.M2, M3: fila.M3, M4: fila.M4, CIE: fila.CIE, PAV: fila.PAV} : {};
  const c = contorno(rot.p, declarada);
  recintos.push({codigo, nombre: fila?.name?.trim() || rot.nombre || 'Sin nombre en la lámina', superficie: superficie || '', lamina: rot.lamina, p: rot.p,
    valores, monografia: rombo ? 'rombo' : fila ? 'pma' : 'ninguna', enPma: !!fila, ...c});
}
const resumen = {recintos: recintos.length, contornos: recintos.filter(r => r.estado === 'ok').length, parciales: recintos.filter(r => r.estado === 'parcial').length, auxiliares: recintos.filter(r => r.estado === 'auxiliar').length,
  sinPma: recintos.filter(r => !r.enPma).map(r => r.codigo), pmaSinRotulo: [...porCodigo.keys()].filter(c => !unicos.has(c)).length, segundos: Math.round((Date.now() - t0) / 1000),
  motivos: Object.entries(recintos.filter(r => r.motivo).reduce((a, r) => { const k = r.motivo.replace(/\(.*\)/, '').replace(/pasa de .*/, 'se une con otro recinto').trim(); a[k] = (a[k] || 0) + 1; return a; }, {}))};
fs.writeFileSync(path.join(repo, 'data', nivel, 'recintos.json'), JSON.stringify({nota: 'Recintos del nivel leídos de las láminas DWG. Coordenadas en cm del modelo; contorno por relleno desde el rótulo con las puertas cerradas de jamba a jamba.', resumen, recintos}));
console.log(JSON.stringify(resumen));
