import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {sectorObra, cortesSectores, asignarSectores, svgSectores, capaSectores, conCapaSectores, nombreSector, TRAMO_SECTOR_1} from './dist/sectores-model.mjs';
import {quitarObraComplementaria} from './dist/obra-complementaria.mjs';

// Grilla simple con los ejes que usa la regla (AA, AD, AE, AJ, AW), separados como en la obra.
const eje = (id, y) => ({id, tipo: 'letra', a: [0, y], b: [6000, y]});
const ejes = {ejes: [eje('AA', 400), eje('AD', 1800), eje('AE', 2265), eje('AJ', 4588), eje('AW', 7835)]};
const cortes = cortesSectores(ejes), linea1 = 1800 + TRAMO_SECTOR_1 * 465;
assert.ok(Math.abs(TRAMO_SECTOR_1 - 0.7376) < 1e-4);
assert.equal(sectorObra([100, linea1 - 1], cortes), '1');
assert.equal(sectorObra([100, linea1 + 1], cortes), '2');
assert.equal(sectorObra([100, 4587], cortes), '2');
assert.equal(sectorObra([100, 4588], cortes), '3', 'el eje AJ ya es sector 3');
assert.equal(sectorObra([100, 7950], cortes), '3', 'lo que sobresale después del AW sigue en el sector 3');
assert.equal(sectorObra([100, 0], cortes), '1');
// Grilla dibujada al revés (AW con y menor): la regla se orienta sola.
const alReves = cortesSectores({ejes: ejes.ejes.map(e => ({...e, a: [0, -e.a[1]], b: [6000, -e.b[1]]}))});
assert.equal(sectorObra([5, -(linea1 - 1)], alReves), '1');
assert.equal(sectorObra([5, -5000], alReves), '3');
// Sin grilla o sin los ejes de la regla no se inventa un sector.
assert.equal(cortesSectores(null), null);
assert.equal(cortesSectores({ejes: ejes.ejes.filter(e => e.id !== 'AD')}), null);
assert.equal(sectorObra([1, 1], null), '');
assert.equal(nombreSector('2'), 'Sector 2');
assert.equal(nombreSector(''), 'Sin sector');

// Datos reales: cada piso se corta con sus propios ejes.
function piso(carpeta) {
  const runtime = decodeRuntime(JSON.parse(fs.readFileSync('dist/' + carpeta + 'runtime.json', 'utf8')));
  quitarObraComplementaria(runtime.data, carpeta ? carpeta.slice(0, 3).toUpperCase() : 'N-1');
  const grilla = JSON.parse(fs.readFileSync('dist/' + carpeta + 'ejes.json', 'utf8')), tiles = new Map(runtime.atlas.tiles.map(t => [t.id, t.offset || [0, 0]]));
  const alPlano = r => { const [x, y] = tiles.get(r.document_id) || [0, 0]; return {...r, position: [r.position[0] + x, r.position[1] + y]}; };
  return {runtime, grilla, rooms: asignarSectores(runtime.data.rooms, alPlano, grilla)};
}
const cuenta = (rooms, s) => rooms.filter(r => r.sector === s).length;
for (const carpeta of ['', 'n01/', 'n02/', 'n03/']) {
  const {rooms} = piso(carpeta);
  assert.ok(rooms.every(r => ['1', '2', '3'].includes(r.sector)), (carpeta || 's01') + ': solo tres sectores');
  for (const s of ['1', '2', '3']) assert.ok(cuenta(rooms, s) > 30, (carpeta || 's01') + ': sector ' + s);
}
// En el piso 2 la regla por ejes coincide recinto a recinto con las láminas: 501 y 505 son exactamente el sector 1.
const n02 = piso('n02/').rooms, porLamina = r => /-a50[15]$/.test(r.document_id);
assert.deepEqual(n02.filter(r => r.sector === '1').map(r => r.id).sort(), n02.filter(porLamina).map(r => r.id).sort());
assert.equal(cuenta(n02, '1'), 115);
// La línea del sector 1 queda en el borde inferior de las láminas 501 y 505 del piso 2.
const {runtime: rt2, grilla: g2} = piso('n02/'), borde = Math.max(...rt2.atlas.tiles.filter(t => /a50[15]$/.test(t.id)).map(t => t.clip[1] + t.clip[3]));
assert.ok(Math.abs(cortesSectores(g2).sector1 + g2.ejes.find(e => e.id === 'AA').a[1] - borde) < 0.5);

// Capa del plano: tres franjas cortadas en las mismas líneas de la regla, dentro del ámbito del edificio.
const svg = svgSectores({origen: [0, 0], ancho: 6000, alto: 8000, limites: [100, 200, 5800, 7700], ejes});
for (const s of ['Sector 1', 'Sector 2', 'Sector 3']) assert.ok(svg.includes(s), s);
assert.ok(svg.includes('y="' + Math.round(linea1 * 10) / 10 + '"') && svg.includes('y="4588"') && svg.includes('x="100"'));
assert.equal((svg.match(/<rect/g) || []).length, 3);
assert.ok(svgSectores({origen: [10, 20], ancho: 50, alto: 60, limites: null, ejes}).includes('viewBox="10 20 50 60"'));
// En todos los pisos: la app agrega la capa al cargar el piso, con el marco de su plano y sus ejes.
for (const carpeta of ['', 'n01/', 'n02/', 'n03/']) {
  const {runtime, grilla} = piso(carpeta), mapa = structuredClone(runtime.map);
  conCapaSectores(mapa, runtime.atlas.scope, grilla);
  const capas = mapa.overlays.filter(o => o.id === 'sectores');
  assert.equal(capas.length, 1, (carpeta || 's01') + ': una sola capa de sectores');
  const dibujo = decodeURIComponent(capas[0].href.slice('data:image/svg+xml;charset=utf-8,'.length));
  assert.ok(dibujo.includes('Sector 1') && dibujo.includes('Sector 3') && dibujo.includes(`viewBox="${runtime.map.origin.map(v => Math.round(v * 10) / 10).join(' ')} `), (carpeta || 's01') + ': capa con el marco del plano');
  assert.equal(capas[0].nombre, 'Bordes de sectores');
  assert.equal(capas[0].visible, false);
  assert.ok((mapa.overlays || []).length >= 1 && (runtime.map.overlays || []).every(o => o.id === 'sectores' || mapa.overlays.some(m => m.id === o.id)), 'conserva las demás capas (bordes de láminas)');
}
assert.equal(capaSectores({map: {origin: [0, 0], width: 1, height: 1}, scope: {bounds: [0, 0, 1, 1]}, ejes: null}), null, 'sin ejes no hay capa');
const capa = fs.readFileSync('dist/n02/sectores.svg', 'utf8');
assert.ok(capa.includes('Sector 3') && capa.includes('y="2141.9"') && !capa.includes('Sector 8'), 'el archivo de N02 está regenerado (node scripts/sectores-obra.mjs)');

// La app asigna los sectores al cargar cada piso y los muestra como «Sector N».
const app = fs.readFileSync('dist/app.js', 'utf8');
assert.ok(app.includes("await sectorizar(datos('ejes.json'),runtime)") && app.includes('asignarSectores(data.rooms,world,spatialScale)') && app.includes('conCapaSectores(runtime.map,atlas.scope,spatialScale)') && app.includes('conCapaSectores(runtime.map,atlas.scope,ejes)'));
assert.ok(fs.readFileSync('dist/workspace.mjs', 'utf8').includes("if(type==='sector')return key?'Sector '+key:'Sin sector'"));
assert.ok(fs.readFileSync('scripts/prepare-offline.mjs', 'utf8').includes("'sectores-model.mjs'"));
console.log('sectores-test: ok');
