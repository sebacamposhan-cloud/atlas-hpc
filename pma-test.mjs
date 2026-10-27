import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {decodePma,matchPma,pmaDifferences,pmaReview,pmaWarnings,selectPma} from './dist/pma-model.mjs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {createAtlasServer} from './server/groq-server.mjs';
const raw=JSON.parse(fs.readFileSync('dist/pma/catalog.json')),model=decodePma(raw),original=fs.readFileSync('dist/source/'+model.source.filename),hash=createHash('sha256').update(original).digest('hex');
assert.equal(hash,'0c9b9e20a2c1257b2390ce1cba74dc756f0e45ef036043c5f084d228715c7ea9');assert.equal(model.source.sha256,hash);assert.equal(model.source.bytes,original.length);assert.equal(model.main.length,3107);assert.equal(model.audit.eliminated,133);
// Independent SheetJS reading of all 177,099 cells (3,107 × 57), including cached formulas/blanks.
const XLSX=createRequire(import.meta.url)('./dist/vendor/xlsx.full.min.js'),book=XLSX.read(original,{type:'buffer',cellDates:false});
let cells=0;
for(const [name,rows] of Object.entries(model.datasets)){
 const definition=raw.datasets[name],sheet=book.Sheets[name];assert.equal(rows.length,3107);
 for(const row of rows)for(let i=0;i<definition.fields.length;i++){
  const cell=sheet[definition.columns[i]+row.sourceRow],expected=cell?.v===null||cell?.v===undefined?null:cell.t==='e'?cell.w:String(cell.v);
  assert.equal(row[definition.fields[i]],typeof expected==='string'?expected.replace(/\r\n?/g,'\n'):expected,`${name}:${definition.columns[i]}${row.sourceRow}`);cells++;
 }
}
assert.equal(cells,177099);assert(model.byCode.has('10.2.1'));assert(model.byCode.has('11.1.1'));assert(model.byCode.has('11.1.2'));
for(const legend of model.legends)for(const [col,value] of Object.entries(legend.cells)){const cell=book.Sheets[legend.sheet][col+legend.sourceRow];assert.equal(value,String(cell?.v));}
assert.equal(selectPma(model,{visibility:'eliminated'}).length,133);assert.equal(selectPma(model,{visibility:'active'}).length,2974);assert.equal(selectPma(model,{changes:true}).length,1513);assert.equal(selectPma(model,{level:'A-S01'}).length,414);assert.equal(selectPma(model,{level:'A-N02'}).length,357);assert.equal(selectPma(model,{level:'C-N02'}).length,23);assert.equal(selectPma(model,{query:'__nonexistent_pma__'}).length,0);assert.equal(selectPma(model,{family:'CIE',state:'Observado'}).length,2);assert.equal(selectPma(model,{conflicts:true}).length,4);
assert(selectPma(model,{query:'sala espera'}).length>0);assert(selectPma(model,{query:'porcelanato tecnico'}).length>0);assert(selectPma(model,{query:'cielo modular acustico owa flexo'}).some(r=>r.CIE==='209'));assert.equal(selectPma(model,{query:'8.1.7.1.15-1'})[0].code,'8.1.7.1.15-1');
const decode=file=>decodeRuntime(JSON.parse(fs.readFileSync(file))).data.rooms,n1=decode('dist/runtime.json'),n2=decode('dist/n02/runtime.json');
assert.equal(n1.filter(r=>matchPma(model,r,'N-1').state==='matched').length,443);assert.equal(n1.filter(r=>pmaDifferences(r,matchPma(model,r,'N-1').row).length).length,32);
assert.equal(n2.filter(r=>matchPma(model,r,'N02').state==='matched').length,307);const mismatches=n2.filter(r=>matchPma(model,r,'N02').state==='level-mismatch');assert.equal(mismatches.length,4);assert(mismatches.every(r=>matchPma(model,r,'N02').row.level==='A-N01'));
assert.equal(matchPma(model,{code:'unknown'},'N-1').state,'missing');assert.equal(matchPma(model,{code:model.main.find(r=>r.level==='Recintos Eliminados').code},'N-1').state,'eliminated');assert.equal(matchPma(model,n1[0],'unmapped-floor').state,'level-mismatch');
assert.equal(pmaReview(model,model.byCode.get('8.2.4.3.6-3'),'CIE'),'Recinto Eliminado');assert.equal(pmaWarnings(model,model.byCode.get('8.2.4.3.6-3')).length,1);
const orientation=book.Sheets['CODIFICACIÓN MUROS'];assert.deepEqual(['E','F','G','H'].map(col=>orientation[col+'1'].v),['MURO NORTE','MURO ORIENTE','MURO SUR','MURO PONIENTE']);assert.deepEqual(['E','F','G','H'].map(col=>orientation[col+'2'].v),['M1','M2','M3','M4']);
assert.throws(()=>decodePma({...raw,schema:9}));const bad=structuredClone(raw);bad.datasets[raw.source.mainSheet].rows[0][1]=raw.strings.length;assert.throws(()=>decodePma(bad));const dup=structuredClone(raw);dup.datasets[raw.source.mainSheet].rows[1][1]=dup.datasets[raw.source.mainSheet].rows[0][1];assert.throws(()=>decodePma(dup),/ambigua/);
const manifest=JSON.parse(fs.readFileSync('dist/sw.js','utf8').match(/self.ATLAS_OFFLINE = (.*);\n/)[1]);for(const path of ['/pma-model.mjs','/pma.mjs'])assert(manifest.files.find(f=>f.url===path)?.core);assert.equal(manifest.files.find(f=>f.url==='/pma/catalog.json')?.pack,'plan');assert.equal(manifest.files.find(f=>f.url==='/source/'+model.source.filename)?.pack,'documents');
let providerBody;const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-pma',GROQ_API_KEY:'isolated-key',GROQ_MODEL:'test-model'},fetchImpl:async(url,options)=>{providerBody=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'Test source'}}]})};}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Basic '+Buffer.from('atlas:isolated-pma').toString('base64')};
try{
 for(const path of ['/pma/catalog.json','/source/'+model.source.filename])assert.equal((await fetch(base+path)).status,401);
 const download=await fetch(base+'/source/'+model.source.filename,{headers});assert.equal(download.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),hash);
 for(const room of [n1[0],mismatches[0]]){const response=await fetch(base+'/api/groq/chat',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({roomId:room.id,messages:[{role:'user',content:'Resume el PMA'}],pma:{code:'invented-client-value'}})});assert.equal(response.status,200);const context=providerBody.messages[0].content;assert(context.includes(hash));assert(context.includes(model.source.mainSheet));assert(!context.includes('invented-client-value'));assert(context.includes(matchPma(model,room,room.level==='-1'?'N-1':'N02').state));assert(context.includes('no ejecución'));}
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
console.log('PMA RevB: 3,107 × 57 saved cells independently compared; legends/orientations, eliminated and contradictory records, exact floor matching, plan differences, filters, invalid schemas, trusted Groq source, protected download and offline packs passed');
