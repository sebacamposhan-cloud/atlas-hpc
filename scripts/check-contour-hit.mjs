import {readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildHitIndex} from '../dist/hit-index.mjs';
import {resolveFootprints, roomAliases} from '../dist/geometry-authority.mjs';
import {decodeRuntime} from '../dist/runtime-loader.mjs';
import {quitarObraComplementaria} from '../dist/obra-complementaria.mjs';

const [file, first, second, fourth] = process.argv.slice(2);
const scan = first === '--scan', dependencyRoot = scan ? second : fourth;
const x = Number(first), y = Number(second);
if (!file || !dependencyRoot || (!scan && (!first?.trim() || !second?.trim() || !Number.isFinite(x) || !Number.isFinite(y)))) {
  console.error('Uso: node scripts/check-contour-hit.mjs <runtime.json|contornos.json> <x y|--scan> <directorio-con-node_modules>');
  process.exit(2);
}

const root = resolve(dependencyRoot, 'node_modules/jsts/org/locationtech/jts');
const load = async path => (await import(pathToFileURL(resolve(root, path + '.js')).href)).default;
const [GeoJSONReader, PointLocator, Location, IsValidOp] = await Promise.all([
  'io/GeoJSONReader', 'algorithm/locate/SimplePointInAreaLocator', 'geom/Location', 'operation/valid/IsValidOp',
].map(load));
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const document = await readJSON(file);

async function publishedGeometry(bundle) {
  const {atlas, data, selection} = decodeRuntime(bundle);
  const floor = data.rooms[0]?.level;
  const level = floor === '-1' ? 'N-1' : 'N' + floor.padStart(2, '0');
  quitarObraComplementaria(data, level, atlas);
  const offsets = new Map(atlas.tiles.map(tile => [tile.id, tile.offset]));
  const position = room => room.position.map((value, axis) => value + offsets.get(room.document_id)[axis]);
  const aliases = roomAliases(data.rooms, position);
  const [left, top, width, height] = atlas.scope.bounds;
  const byId = new Map(data.rooms.map(room => [room.id, room]));
  const selected = new Map();
  for (const room of data.rooms) {
    const [x, y] = position(room);
    if (x >= left && x <= left + width && y >= top && y <= top + height) {
      const id = aliases.get(room.id) ?? room.id;
      selected.set(id, byId.get(id));
    }
  }
  const contours = await readJSON(join(dirname(file), 'contornos.json')).catch(error => {
    if (error.code === 'ENOENT') return {recintos: []};
    throw error;
  });
  const geometry = resolveFootprints(atlas, [...selected.values()], aliases, selection, contours.recintos ?? []);
  return {level, basis: 'published_runtime', entries: [...geometry.values()].map(entry => ({
    ...entry, code: selected.get(entry.id).code,
  }))};
}

function correctionGeometry(catalog) {
  if (!Array.isArray(catalog.recintos)) throw new Error('Se requiere un runtime de ATLAS o un catálogo de contornos.');
  return {
    level: catalog.nivel,
    basis: 'contour_catalog',
    entries: catalog.recintos.map(room => ({
      id: room.id, code: room.code, rings: (room.parts ?? []).map(part => ({...part, holes: part.holes ?? []})),
    })),
  };
}

const {level, basis, entries} = document.catalog ? await publishedGeometry(document) : correctionGeometry(document);
const reader = new GeoJSONReader();
const polygon = coordinates => reader.read({type: 'Polygon', coordinates});
const close = ring => {
  const last = ring.at(-1);
  return ring[0][0] === last[0] && ring[0][1] === last[1] ? ring : [...ring, ring[0]];
};

const parts = [], invalid = [];
for (const {id, code, rings} of entries) {
  for (const [index, ring] of rings.entries()) {
    const reference = {id, code, part: index + 1};
    if ([ring.polygon, ...ring.holes].some(points => !Array.isArray(points) || points.length < 3)) {
      invalid.push({...reference, validation_error: 'Insufficient polygon vertices'});
      continue;
    }
    const holes = ring.holes.map(close);
    const geometry = polygon([close(ring.polygon), ...holes]);
    const validation = new IsValidOp(geometry).getValidationError()?.toString() ?? null;
    const part = {...reference, geometry, holes, envelope: geometry.getEnvelopeInternal(), validation_error: validation};
    parts.push(part);
    if (validation) invalid.push({...reference, validation_error: validation});
  }
}
const index = buildHitIndex(entries);
const ref = ({id, code, part}) => ({id, code, part});
const result = {level, basis, rooms: entries.length};

if (scan) {
  const [Overlay, InteriorPoint] = await Promise.all([
    'operation/overlay/snap/SnapIfNeededOverlayOp', 'algorithm/InteriorPointArea',
  ].map(load));
  const overlaps = [], comparisonErrors = [];
  const valid = parts.filter(part => !part.validation_error);
  for (const [i, a] of valid.entries()) {
    for (let j = i + 1; j < valid.length; j++) {
      const b = valid[j];
      if (a.id === b.id || !a.envelope.intersects(b.envelope)) continue;
      try {
        const intersection = Overlay.intersection(a.geometry, b.geometry);
        const area = intersection.getArea();
        if (area <= 0) continue;
        const point = InteriorPoint.getInteriorPoint(intersection);
        overlaps.push({rooms: [ref(a), ref(b)], area, point: [point.x, point.y], first_hit: index(point)});
      } catch (error) {
        comparisonErrors.push({rooms: [ref(a), ref(b)], error: String(error)});
      }
    }
  }
  console.log(JSON.stringify({...result, units: 'plan_coordinates', overlaps: overlaps.sort((a, b) => b.area - a.area), invalid, comparison_errors: comparisonErrors}, null, 2));
} else {
  const coordinate = reader.read({type: 'Point', coordinates: [x, y]}).getCoordinate();
  const candidates = parts.filter(part => part.envelope.intersects(coordinate)).map(part => {
    const location = PointLocator.locate(coordinate, part.geometry);
    const insideHole = location === Location.EXTERIOR &&
      part.holes.some(hole => PointLocator.locate(coordinate, polygon([hole])) === Location.INTERIOR);
    return {...ref(part), location: insideHole ? 'hole' : Location.toLocationSymbol(location), validation_error: part.validation_error};
  });
  const interiors = [...new Set(candidates.filter(part => part.location === 'i' && !part.validation_error).map(part => part.id))].sort();
  console.log(JSON.stringify({
    ...result,
    point: [x, y],
    catalog_hit: index({x, y}),
    atlas_candidates: index.candidates({x, y}),
    overlapping_interiors: interiors.length > 1 ? interiors : [],
    candidates,
  }, null, 2));
}
