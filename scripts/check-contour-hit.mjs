import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildHitIndex} from '../dist/hit-index.mjs';

const [file, rawX, rawY, dependencyRoot] = process.argv.slice(2);
const x = Number(rawX), y = Number(rawY);
if (!file || !dependencyRoot || !rawX?.trim() || !rawY?.trim() || !Number.isFinite(x) || !Number.isFinite(y)) {
  console.error('Uso: node scripts/check-contour-hit.mjs <contornos.json> <x> <y> <directorio-con-node_modules>');
  process.exit(2);
}
const jsts = resolve(dependencyRoot, 'node_modules/jsts/org/locationtech/jts');
const [{default: GeoJSONReader}, {default: SimplePointInAreaLocator}, {default: Location}, {default: IsValidOp}] =
  await Promise.all([
    'io/GeoJSONReader.js', 'algorithm/locate/SimplePointInAreaLocator.js', 'geom/Location.js', 'operation/valid/IsValidOp.js',
  ].map(path => import(pathToFileURL(resolve(jsts, path)).href)));

const document = JSON.parse(await readFile(file, 'utf8'));
if (!Array.isArray(document.recintos)) throw new Error('Se requiere un catálogo con recintos y partes.');
const reader = new GeoJSONReader();
const coordinate = reader.read({type: 'Point', coordinates: [x, y]}).getCoordinate();
const close = ring => {
  const last = ring.at(-1);
  return ring[0][0] === last[0] && ring[0][1] === last[1] ? ring : [...ring, ring[0]];
};
const closeTo = ring => {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  return Math.min(...xs) <= x && x <= Math.max(...xs) && Math.min(...ys) <= y && y <= Math.max(...ys);
};
const entries = [], candidates = [];
for (const room of document.recintos) {
  const rings = room.parts ?? [];
  entries.push({id: room.id, rings: rings.map(part => ({...part, holes: part.holes ?? []}))});
  for (const [index, part] of rings.entries()) {
    if (!closeTo(part.polygon)) continue;
    const holes = (part.holes ?? []).map(close);
    const polygon = coordinates => reader.read({type: 'Polygon', coordinates});
    const geometry = polygon([close(part.polygon), ...holes]);
    const validation = new IsValidOp(geometry).getValidationError();
    const location = SimplePointInAreaLocator.locate(coordinate, geometry);
    const insideHole = location === Location.EXTERIOR &&
      holes.some(hole => SimplePointInAreaLocator.locate(coordinate, polygon([hole])) === Location.INTERIOR);
    candidates.push({
      id: room.id,
      code: room.code,
      part: index + 1,
      location: insideHole ? 'hole' : Location.toLocationSymbol(location),
      validation_error: validation?.toString() ?? null,
    });
  }
}
const interiors = new Set(candidates.filter(part => part.location === 'i' && !part.validation_error).map(part => part.id));
console.log(JSON.stringify({
  level: document.nivel,
  point: [x, y],
  catalog_hit: buildHitIndex(entries)({x, y}),
  overlapping_interiors: [...interiors].sort().length > 1 ? [...interiors].sort() : [],
  candidates,
}, null, 2));
