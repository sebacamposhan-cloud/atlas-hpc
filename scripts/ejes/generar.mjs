// Genera dist/<nivel>/ejes.json: la grilla de ejes del edificio en coordenadas de Atlas de cada piso dibujado desde DWG.
// Uso: node scripts/ejes/generar.mjs   (necesita data/n0x/dibujo.json y marco.json, que salen de scripts/dwg-plano/extraer.mjs)
// La grilla se arma con las etiquetas de los tres pisos (cada lámina muestra solo parte de las burbujas) y se lleva
// a cada piso con su marco. N01 manda cuando un eje aparece en varios pisos.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {leerCapaEjes, grillaDeNivel} from './grilla.mjs';
import {aAtlas} from '../dwg-plano/marco.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NIVELES = ['n01', 'n03', 'n02'];
const grilla = new Map(), origen = new Map();
for (const nivel of NIVELES) for (const eje of grillaDeNivel(leerCapaEjes(repo, nivel))) {
  if (eje.id.includes('#') || grilla.has(eje.id)) continue;
  grilla.set(eje.id, eje); origen.set(eje.id, nivel);
}
// Solo ejes del edificio A (AA…AW, A0…A12 y variantes): los protocolos se registran con ellos.
const ejes = [...grilla.values()].filter(e => /^A/.test(e.id)).sort((a, b) => a.id.localeCompare(b.id, 'es', {numeric: true}));
for (const nivel of ['n01', 'n02', 'n03']) {
  const marco = JSON.parse(fs.readFileSync(path.join(repo, 'data', nivel, 'marco.json'), 'utf8'));
  const salida = {schema: 1, nivel, fuente: 'Capa S-GRID de las láminas DWG de arquitectura (N01, N02 y N03, coordenadas compartidas del modelo).',
    ejes: ejes.map(e => ({id: e.id, tipo: /^A\d/.test(e.id) ? 'numero' : 'letra', a: aAtlas(marco, e.a), b: aAtlas(marco, e.b), lamina: origen.get(e.id)}))};
  fs.writeFileSync(path.join(repo, 'dist', nivel, 'ejes.json'), JSON.stringify(salida) + '\n');
}
console.log(JSON.stringify({ejes: ejes.length, letras: ejes.filter(e => !/^A\d/.test(e.id)).map(e => e.id).join(' '), numeros: ejes.filter(e => /^A\d/.test(e.id)).map(e => e.id).join(' ')}, null, 1));
