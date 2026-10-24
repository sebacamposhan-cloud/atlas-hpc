import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const read = name => JSON.parse(fs.readFileSync(path.join(dist, name), 'utf8'));
const data = read('data.json');
const strings = [], stringIndex = new Map(), finishes = [], finishIndex = new Map();
function intern(value) {
  if (!stringIndex.has(value)) { stringIndex.set(value, strings.length); strings.push(value); }
  return stringIndex.get(value);
}
const pooledFields = ['document_id', 'geometry_status', 'geometry_method', 'status', 'level', 'sector'];
const fields = [...Object.keys(data.rooms[0]), 'has_polygon'];
const rows = data.rooms.map(source => {
  const r = {...source, has_polygon: !!source.polygon};
  // Technical contours stay intact in separate, on-demand files.
  if (!(r.version > 1 || r.status === 'Validado')) { r.polygon = null; r.holes = []; }
  for (const key of pooledFields) r[key] = intern(r[key]);
  r.notes = r.notes.map(intern);
  r.finishes = r.finishes.map(({bbox, ...description}) => {
    const key = JSON.stringify(description);
    if (!finishIndex.has(key)) { finishIndex.set(key, finishes.length); finishes.push(description); }
    return [finishIndex.get(key), bbox];
  });
  return fields.map(key => r[key]);
});
const {rooms, ...base} = data;
const selection = read('selection.json');
const bundle = {
  schema: 1,
  catalog: {fields, pooledFields, strings, finishes, rows, base},
  atlas: read('atlas.json'), map: read('map/index.json'),
  selection: {schema: selection.schema, rooms: selection.rooms.map(({id, rings, score}) => ({id, rings, score}))}
};
fs.writeFileSync(path.join(dist, 'runtime.json'), JSON.stringify(bundle));
fs.mkdirSync(path.join(dist, 'geometry'), {recursive: true});
for (const doc of data.documents) fs.writeFileSync(path.join(dist, 'geometry', doc.id+'.json'), JSON.stringify({rooms: rooms.filter(r => r.document_id === doc.id).map(({id, polygon, holes}) => ({id, polygon, holes}))}));
console.log(JSON.stringify({originalDataBytes: fs.statSync(path.join(dist, 'data.json')).size, runtimeBytes: fs.statSync(path.join(dist, 'runtime.json')).size, rooms: rooms.length}));
