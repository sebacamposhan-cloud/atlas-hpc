// Genera dist/<nivel>/ejes.json: la grilla de ejes del edificio en coordenadas de Atlas de cada piso dibujado desde DWG.
// Uso: node scripts/ejes/generar.mjs   (necesita data/n0x/dibujo.json y marco.json, que salen de scripts/dwg-plano/extraer.mjs)
// Cada lámina muestra solo parte de las burbujas, así que la grilla completa se arma con los tres pisos (N01 manda).
// Cada piso usa sus propios ejes donde los tiene; los que le faltan se toman de la grilla completa corridos lo que
// ese piso está desplazado (mediana de sus ejes en común): las láminas de N02 están ~19 cm en X y ~3 cm en Y respecto
// de N01 y N03, y así los recuadros quedan sobre los pilares del dibujo de cada piso.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {leerCapaEjes, grillaDeNivel} from './grilla.mjs';
import {aAtlas} from '../dwg-plano/marco.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const esNumero = id => /^A\d/.test(id), delEdificio = id => /^A/.test(id);
const propios = Object.fromEntries(['n01', 'n02', 'n03'].map(n => [n, new Map(grillaDeNivel(leerCapaEjes(repo, n)).filter(e => !e.id.includes('#') && delEdificio(e.id)).map(e => [e.id, e]))]));
const completa = new Map(), origen = new Map();
for (const nivel of ['n01', 'n03', 'n02']) for (const [id, e] of propios[nivel]) if (!completa.has(id)) { completa.set(id, e); origen.set(id, nivel); }
const ejes = [...completa.values()].sort((a, b) => a.id.localeCompare(b.id, 'es', {numeric: true}));
const mediana = v => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return !s.length ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const medio = e => [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
const resumen = {};
for (const nivel of ['n01', 'n02', 'n03']) {
  const marco = JSON.parse(fs.readFileSync(path.join(repo, 'data', nivel, 'marco.json'), 'utf8'));
  // Desplazamiento del piso: ejes numerados (verticales) dan X; ejes con letra (horizontales) dan Y.
  const comunes = ejes.filter(e => origen.get(e.id) !== nivel && propios[nivel].has(e.id));
  const dx = mediana(comunes.filter(e => esNumero(e.id)).map(e => medio(propios[nivel].get(e.id))[0] - medio(e)[0]));
  const dy = mediana(comunes.filter(e => !esNumero(e.id)).map(e => medio(propios[nivel].get(e.id))[1] - medio(e)[1]));
  const correr = p => [p[0] + dx, p[1] + dy];
  const salida = {schema: 1, nivel, fuente: 'Capa S-GRID de las láminas DWG de arquitectura (N01, N02 y N03, coordenadas del modelo).',
    // metrosPorUnidad: el marco usa unidades de Atlas por cm del modelo (escala 1:50 en puntos PDF).
    metrosPorUnidad: 1 / (marco.escala * 100),
    ajuste: {dxCm: Math.round(dx * 10) / 10, dyCm: Math.round(dy * 10) / 10, ejesPropios: [...propios[nivel].keys()].sort((a, b) => a.localeCompare(b, 'es', {numeric: true}))},
    // La grilla es ortogonal (numerados verticales, letras horizontales): de un eje propio se toma su posición y se
    // conserva el largo y la dirección de la grilla completa (algunas láminas lo traen inclinado ~1 cm o corto).
    ejes: ejes.map(e => { const propio = propios[nivel].get(e.id), c = propio && medio(propio);
      const linea = !propio ? [correr(e.a), correr(e.b)] : esNumero(e.id) ? [[c[0], e.a[1] + dy], [c[0], e.b[1] + dy]] : [[e.a[0] + dx, c[1]], [e.b[0] + dx, c[1]]];
      return {id: e.id, tipo: esNumero(e.id) ? 'numero' : 'letra', a: aAtlas(marco, linea[0]), b: aAtlas(marco, linea[1]), lamina: propio ? nivel : origen.get(e.id)}; })};
  fs.writeFileSync(path.join(repo, 'dist', nivel, 'ejes.json'), JSON.stringify(salida) + '\n');
  resumen[nivel] = {...salida.ajuste, ejesPropios: salida.ajuste.ejesPropios.length};
}
console.log(JSON.stringify({ejes: ejes.length, letras: ejes.filter(e => !esNumero(e.id)).map(e => e.id).join(' '), numeros: ejes.filter(e => esNumero(e.id)).map(e => e.id).join(' '), ajuste: resumen}, null, 1));
