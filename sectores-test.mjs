import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {sectorObra, lineaSector3, asignarSectores, enLaminaSector1, puntoRecinto, svgSectores, nombreSector} from './dist/sectores-model.mjs';

// Láminas del sector 1: A-501 y A-505 en el −1 (501-…) y en los pisos (n02-a501).
for (const id of ['501-5016771b', '505-49eb24e4', 'n01-a501', 'n02-a505']) assert.ok(enLaminaSector1(id), id);
for (const id of ['502-41a89a7c', 'n02-a503', 'n03-a201', 'n02-a5010', '']) assert.ok(!enLaminaSector1(id), id);

// Línea del eje AJ con la normal hacia el AW: lo que está desde AJ hacia AW es sector 3; lo de antes, sector 2.
const ejes = {ejes: [{id: 'AJ', tipo: 'letra', a: [0, 4588], b: [6000, 4588]}, {id: 'AW', tipo: 'letra', a: [0, 7835], b: [2800, 7835]}]};
const linea = lineaSector3(ejes);
assert.equal(sectorObra('n02-a503', [100, 4600], linea), '3');
assert.equal(sectorObra('n02-a503', [100, 4500], linea), '2');
assert.equal(sectorObra('n02-a504', [100, 7900], linea), '3', 'lo que sobresale después del AW sigue en el sector 3');
assert.equal(sectorObra('n02-a501', [100, 9000], linea), '1', 'la lámina manda para el sector 1');
assert.equal(sectorObra('n02-a502', [100, 9000], null), '2', 'sin grilla no se inventa el sector 3');
// Grilla dibujada al revés (AW antes que AJ): la normal se orienta sola.
const invertida = lineaSector3({ejes: [{id: 'AJ', a: [6000, 4588], b: [0, 4588]}, {id: 'AW', a: [0, 1000], b: [10, 1000]}]});
assert.equal(sectorObra('x', [5, 900], invertida), '3');
assert.equal(sectorObra('x', [5, 5000], invertida), '2');
assert.equal(lineaSector3({ejes: [{id: 'AJ', a: [0, 0], b: [0, 0]}, {id: 'AW', a: [1, 1], b: [2, 2]}]}), null);
assert.equal(lineaSector3(null), null);

// Centro del contorno, o el rótulo si no hay contorno.
assert.deepEqual(puntoRecinto({position: [1, 2], polygon: [[0, 0], [10, 0], [10, 20], [0, 20]]}), [5, 10]);
assert.deepEqual(puntoRecinto({position: [1, 2]}), [1, 2]);
assert.equal(nombreSector('2'), 'Sector 2');
assert.equal(nombreSector(''), 'Sin sector');

// Datos reales de cada piso: solo 1, 2 y 3, y los tres presentes donde la planta los tiene.
for (const piso of ['', 'n01/', 'n02/', 'n03/']) {
  const runtime = decodeRuntime(JSON.parse(fs.readFileSync('dist/' + piso + 'runtime.json', 'utf8')));
  const grilla = JSON.parse(fs.readFileSync('dist/' + piso + 'ejes.json', 'utf8')), tiles = new Map(runtime.atlas.tiles.map(t => [t.id, t.offset || [0, 0]]));
  const alPlano = r => { const [x, y] = tiles.get(r.document_id) || [0, 0], mover = p => [p[0] + x, p[1] + y]; return {...r, position: mover(r.position), polygon: r.polygon?.map(mover)}; };
  const rooms = asignarSectores(runtime.data.rooms, alPlano, grilla), cuenta = s => rooms.filter(r => r.sector === s).length;
  assert.ok(rooms.every(r => ['1', '2', '3'].includes(r.sector)), piso + ': solo tres sectores');
  assert.ok(cuenta('2') > 0 && cuenta('3') > 0, piso + ': sectores 2 y 3');
  if (piso !== 'n03/') assert.ok(cuenta('1') > 0, piso + ': sector 1');
  assert.ok(rooms.filter(r => enLaminaSector1(r.document_id)).every(r => r.sector === '1'));
}

// Capa del plano: tres franjas con su nombre, cortadas en el borde de las láminas 501/505 y en el eje AJ.
const svg = svgSectores({ancho: 6000, alto: 8000, laminas: [{id: 'n02-a501', clip: [0, 0, 3000, 2000]}, {id: 'n02-a505', clip: [3000, 0, 3000, 2000]}, {id: 'n02-a504', clip: [0, 2000, 6000, 6000]}], ejes});
for (const s of ['Sector 1', 'Sector 2', 'Sector 3']) assert.ok(svg.includes(s), s);
assert.ok(svg.includes('y="2000"') && svg.includes('y="4588"'));
assert.equal((svg.match(/<rect/g) || []).length, 3);
assert.ok(!svg.includes('A-502'), 'ya no se dibujan las láminas como sectores');
const capa = fs.readFileSync('dist/n02/sectores.svg', 'utf8');
assert.ok(capa.includes('Sector 3') && !capa.includes('Sector 8'), 'la capa de N02 está regenerada (node scripts/sectores-obra.mjs)');

// La app asigna los sectores al cargar cada piso y los muestra como «Sector N».
const app = fs.readFileSync('dist/app.js', 'utf8');
assert.ok(app.includes("await sectorizar(datos('ejes.json'))") && app.includes('asignarSectores(data.rooms,world,spatialScale)'));
assert.ok(fs.readFileSync('dist/workspace.mjs', 'utf8').includes("if(type==='sector')return key?'Sector '+key:'Sin sector'"));
assert.ok(fs.readFileSync('scripts/prepare-offline.mjs', 'utf8').includes("'sectores-model.mjs'"));
console.log('sectores-test: ok');
