// Posición de cada recinto del piso en el plano de ATLAS (código → [[x, y]]) y su vista, para alinear-cie.py.
// Uso: node scripts/cielos/posiciones-recintos.mjs <carpeta-piso> > pos.json   («.» para el −1, «n01», «n02»…)
import {readFile} from 'node:fs/promises'; import {join, resolve, dirname} from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist'), carpeta = process.argv[2] || '.';
const {decodeRuntime} = await import(pathToFileURL(join(dist, 'runtime-loader.mjs')).href);
const {atlas, data} = decodeRuntime(JSON.parse(await readFile(join(dist, carpeta, 'runtime.json'), 'utf8')));
const off = new Map(atlas.tiles.map(t => [t.id, t.offset])), pos = {};
for (const r of data.rooms) { const o = off.get(r.document_id); if (o) (pos[r.code] ||= []).push([r.position[0] + o[0], r.position[1] + o[1]]); }
process.stdout.write(JSON.stringify({view: atlas.scope.view, pos}));
