// Incorpora al nivel −1 el plano dibujado desde sus láminas DWG (dist/map, ver scripts/s01-plano/LEEME.md): mismas teselas
// y ventana que el plano anterior, más las capas que se pueden apagar (relleno, mobiliario, ejes). No toca recintos,
// contornos, rombos ni láminas PDF del −1: el dibujo DWG cae en su mismo marco (scripts/s01-plano/ajuste.mjs).
// Uso: node scripts/s01-plano/importar.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const archivo = path.join(repo, 'dist/runtime.json'), runtime = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const indice = JSON.parse(fs.readFileSync(path.join(repo, 'dist/map/index.json'), 'utf8')), mapa = runtime.map;
const igual = (a, b) => Math.abs(a - b) < .01;
if (!igual(indice.origin[0], mapa.origin[0]) || !igual(indice.origin[1], mapa.origin[1]) || !igual(indice.width, mapa.width) || !igual(indice.height, mapa.height))
  throw Error('dist/map/index.json no corresponde a la ventana del plano del −1: vuelve a dibujarlo con data/s01/marco.json.');
if (JSON.stringify(indice.levels) !== JSON.stringify(mapa.levels)) throw Error('Las teselas no tienen la misma grilla que el plano del −1.');
runtime.map = {...mapa, capas: indice.capas};
fs.writeFileSync(archivo, JSON.stringify(runtime));
console.log(JSON.stringify({capas: indice.capas.map(c => c.id + ': ' + Object.values(c.teselas).reduce((n, t) => n + t.length, 0) + ' teselas')}));
