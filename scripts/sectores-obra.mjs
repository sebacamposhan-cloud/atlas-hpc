// Regenera el archivo de la capa «Bordes de sectores» (dist/<piso>/sectores.svg) con los tres sectores de obra de jefatura de producción.
// La app arma la misma capa al cargar cualquier piso (conCapaSectores en app.js); el archivo queda para el piso 2, que la trae en runtime.json
// (dist/sectores-model.mjs). Solo los pisos que ya tienen esa capa. Uso: node scripts/sectores-obra.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const dist = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist');
const {decodeRuntime} = await import(pathToFileURL(path.join(dist, 'runtime-loader.mjs')));
const {svgSectores} = await import(pathToFileURL(path.join(dist, 'sectores-model.mjs')));
for (const piso of fs.readdirSync(dist)) {
  const capa = path.join(dist, piso, 'sectores.svg');
  if (!fs.existsSync(capa)) continue;
  const runtime = decodeRuntime(JSON.parse(fs.readFileSync(path.join(dist, piso, 'runtime.json'), 'utf8')));
  const ejesArchivo = path.join(dist, piso, 'ejes.json'), ejes = fs.existsSync(ejesArchivo) ? JSON.parse(fs.readFileSync(ejesArchivo, 'utf8')) : null;
  fs.writeFileSync(capa, svgSectores({origen: runtime.map.origin, ancho: runtime.map.width, alto: runtime.map.height, limites: runtime.atlas.scope.bounds, ejes}));
  console.log('Sectores de obra:', path.relative(dist, capa));
}
