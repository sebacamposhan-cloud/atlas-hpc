// Compact source-backed identity index for legacy local work without a stored floor.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {decodeRuntime} from '../dist/runtime-loader.mjs';
import {progressFloor} from '../dist/progress-scope.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url)),sources={},rooms={},sheets={};
const read=name=>{const bytes=fs.readFileSync(root+name);sources[name]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes);};
for(const file of ['runtime.json','n01/runtime.json','n02/runtime.json','n03/runtime.json']){
 for(const room of decodeRuntime(read(file)).data.rooms){const floor=progressFloor(room.level),code=room.code?.trim();if(!floor||!code)continue;(rooms[code]??=[]);if(!rooms[code].includes(floor))rooms[code].push(floor);}
}
for(const doc of read('disciplines.json').documents){const floor=progressFloor(doc.level);if(floor)sheets[doc.id]=floor;}
const output=JSON.stringify({schema:1,sources,rooms,sheets})+'\n',file=root+'progress-room-levels.json';
if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==output)fs.writeFileSync(file,output);
