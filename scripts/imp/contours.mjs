// Same authority, aliases and floor scope as app.js; no source geometry is rewritten.
import fs from 'node:fs';
import {decodeRuntime} from '../../dist/runtime-loader.mjs';
import {resolveFootprints} from '../../dist/geometry-authority.mjs';
const rt=decodeRuntime(JSON.parse(fs.readFileSync(new URL('../../dist/runtime.json',import.meta.url)))),rooms=rt.data.rooms,offsets=new Map(rt.atlas.tiles.map(t=>[t.id,t.offset])),aliases=new Map(),placed=new Map();
const position=r=>r.position.map((v,i)=>v+offsets.get(r.document_id)[i]);
for(const r of [...rooms].sort((a,b)=>Number(b.has_polygon)-Number(a.has_polygon))){
 const p=position(r),key=r.code+'|'+r.name,candidates=placed.get(key)||[],same=candidates.find(v=>Math.hypot(...p.map((x,i)=>x-v.p[i]))<5);
 if(same)aliases.set(r.id,same.id);else{candidates.push({id:r.id,p});placed.set(key,candidates);}
}
const corrections=JSON.parse(fs.readFileSync(new URL('../../dist/contornos.json',import.meta.url))).recintos;
const fp=resolveFootprints(rt.atlas,rooms,aliases,rt.selection,corrections),[x,y,w,h]=rt.atlas.scope.bounds;
const ids=new Set(rooms.filter(r=>{const p=position(r);return p[0]>=x&&p[0]<=x+w&&p[1]>=y&&p[1]<=y+h;}).map(r=>aliases.get(r.id)||r.id));
process.stdout.write(JSON.stringify([...fp.values()].filter(g=>ids.has(g.id)).map(g=>({...g,room:rooms.find(r=>r.id===g.id)}))));
