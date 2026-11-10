// Contornos de los recintos del nivel 2 recalculados desde las láminas DWG, con el mismo cálculo de los otros pisos
// (scripts/dwg-plano/contorno.mjs): relleno de color del recinto o relleno desde el rótulo, con las puertas cerradas de
// jamba a jamba. Los contornos de data/n02/plano.json vienen de la planta general y quedan corridos unos 18 cm respecto
// de los muros de las láminas 1:50 con que se dibuja el plano; los recalculados calzan con esos muros.
// - Se guarda el contorno recalculado de cada recinto que cierra y calza con su superficie (estado «ok»).
// - Los que no cierran (recintos abiertos) conservan el contorno de plano.json. Para ellos se guarda el desfase medido
//   (mediana de la diferencia entre el contorno anterior y el recalculado), que scripts/import-n02.mjs les aplica.
// Requiere data/n02/barreras.json, vanos.json y zonas.json (scripts/dwg-plano/extraer.mjs).
// Uso: node scripts/n02-plano/recalcular-contornos.mjs  -> data/n02/contornos-recalculados.json
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {crearContorno, numero} from '../dwg-plano/contorno.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leer = f => JSON.parse(fs.readFileSync(path.join(repo, 'data/n02', f), 'utf8'));
const plano = leer('plano.json'), contorno = crearContorno(leer('barreras.json'), {vanos: leer('vanos.json').vanos, zonas: leer('zonas.json').zonas});
const caja = v => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (let i = 0; i < v.length; i += 2) { a = Math.min(a, v[i]); c = Math.max(c, v[i]); b = Math.min(b, v[i + 1]); d = Math.max(d, v[i + 1]); } return [a, b, c, d]; };
const mediana = v => { const o = [...v].sort((a, b) => a - b); return o[o.length >> 1]; };

const recintos = {}, dx = [], dy = [], motivos = {};
for (const rec of plano.recintos) {
  const c = contorno(rec.p, numero(rec.superficie));
  if (c.estado !== 'ok') { const k = c.estado === 'parcial' ? 'contorno parcial' : c.motivo.replace(/\(.*\)/, '').replace(/pasa de .*/, 'se une con otro recinto').trim(); motivos[k] = (motivos[k] || 0) + 1; continue; }
  recintos[rec.codigo] = {metodo: c.metodo, areaM2: c.areaM2, poly: c.poly, ...(c.huecos ? {huecos: c.huecos} : {})};
  // Desfase: solo con recintos cuyo contorno anterior mide lo mismo que el nuevo (mismo recinto, otra posición).
  const o = caja(rec.poly), n = caja(c.poly);
  if (!rec.aprox && Math.abs((o[2] - o[0]) - (n[2] - n[0])) <= 25 && Math.abs((o[3] - o[1]) - (n[3] - n[1])) <= 25) { dx.push((n[0] + n[2] - o[0] - o[2]) / 2); dy.push((n[1] + n[3] - o[1] - o[3]) / 2); }
}
if (dx.length < 50) throw Error('Muy pocos recintos para medir el desfase: ' + dx.length);
const desfase = [+mediana(dx).toFixed(1), +mediana(dy).toFixed(1)];
const resumen = {recintos: plano.recintos.length, recalculados: Object.keys(recintos).length, porRelleno: Object.values(recintos).filter(r => r.metodo === 'relleno').length, porZona: Object.values(recintos).filter(r => r.metodo === 'zona').length,
  conservados: plano.recintos.length - Object.keys(recintos).length, motivos, desfase, recintosDelDesfase: dx.length};
fs.writeFileSync(path.join(repo, 'data/n02/contornos-recalculados.json'), JSON.stringify({nota: 'Contornos del nivel 2 recalculados desde las láminas DWG (cm del marco de plano.json). desfase: corrimiento [x, y] que se aplica a los contornos de plano.json que se conservan. Lo usa scripts/import-n02.mjs.', resumen, desfase, recintos}));
console.log(JSON.stringify(resumen));
