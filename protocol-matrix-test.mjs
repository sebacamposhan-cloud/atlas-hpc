import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createAtlasServer} from './server/groq-server.mjs';
import {decodeMatrixRows,selectTypes,selectMatrixRows,matrixDate,matrixPage,matrixFields} from './dist/protocol-model.mjs';
const catalog=JSON.parse(fs.readFileSync('dist/protocols/catalog.json'));
const original=fs.readFileSync('dist/source/'+catalog.source.filename),hash=createHash('sha256').update(original).digest('hex');
assert.equal(hash,'e8f7774c964166450ff9546abb1cabc92cb9d2344144e82ace424df6d2c6a9ef');assert.equal(catalog.source.sha256,hash);assert.equal(catalog.source.bytes,original.length);
assert.equal(catalog.totalRecords,20233);assert.equal(catalog.totalTypes,154);assert.equal(catalog.specialties.length,38);assert.equal(catalog.source.cutoff,'2026-10-26');
// Independent Excel reader: every original field of every registry row must survive the XML importer.
const XLSX=createRequire(import.meta.url)('./dist/vendor/xlsx.full.min.js');
const workbook=XLSX.read(original,{type:'buffer',sheets:[catalog.source.registrySheet,catalog.source.summarySheet],cellDates:false});
const sheet=workbook.Sheets[catalog.source.registrySheet],seen=new Set(),all=[];
for(const type of catalog.types){
 assert.match(type.file,/^registers\/protocol-[a-f0-9]{16}\.json$/);
 const chunk=JSON.parse(fs.readFileSync('dist/protocols/'+type.file)),rows=decodeMatrixRows(chunk,catalog,type);
 assert.equal(rows.length,type.count);assert.equal(Object.values(type.states).reduce((n,x)=>n+x,0),type.count);
 for(const record of rows){assert(!seen.has(record.sourceRow));seen.add(record.sourceRow);
  assert.deepEqual(matrixFields.slice(1).map(field=>record[field]),Array.from({length:16},(_,i)=>{const cell=sheet[XLSX.utils.encode_cell({r:record.sourceRow-1,c:i})];return cell?.v===undefined||cell?.v===null?null:String(cell.v);}),type.code+' row '+record.sourceRow);
 }
 all.push(...rows);
}
assert.equal(all.length,20233);assert.equal(seen.size,20233);assert(all.every(row=>row.sourceRow>=3&&row.sourceRow<=20235));
assert.equal(selectTypes(catalog,{query:'pintura asepsia baja'})[0].code,'APASB-TER');assert.equal(selectTypes(catalog,{query:'planchas RH'})[0].code,'IPCT2-TER');assert.equal(selectTypes(catalog,{query:'pintura asepsia media'})[0].count,44);
assert.equal(selectTypes(catalog,{query:'__no_such_protocol__'}).length,0);
const baja=catalog.types.find(type=>type.code==='APASB-TER'),bajaRows=all.filter(row=>row.code.trim()===baja.code);
assert.equal(bajaRows.length,97);assert.equal(selectMatrixRows(bajaRows,{state:'ABIERTO'}).length,54);assert.equal(selectMatrixRows(bajaRows,{state:'CERRADO'}).length,43);
assert.equal(selectMatrixRows(all,{state:'ABIERTO'}).length,5678);assert.equal(catalog.audit.declaredStates.ABIERTO,5675);assert.equal(catalog.audit.differences.ABIERTO,3);
assert.deepEqual(catalog.audit.statusWhitespace.map(x=>x.row),[20026,20033,20112]);assert.equal(all.filter(row=>row.state==='ABIERTO ').length,3);
assert.equal(catalog.audit.duplicateFolios.length,17);for(const duplicate of catalog.audit.duplicateFolios){const rows=all.filter(row=>duplicate.rows.includes(row.sourceRow));assert.equal(rows.length,duplicate.rows.length);assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);}
assert.equal(matrixPage(bajaRows,0).rows.length,25);assert.equal(matrixPage(bajaRows,99).page,3);assert.equal(matrixPage(bajaRows,3).rows.length,22);assert.equal(matrixPage([],5).page,0);
assert.equal(matrixDate('46321'),'2026-10-26');assert.equal(matrixDate(null),null);assert.equal(matrixDate('not a date'),'not a date');assert.equal(matrixDate('1',true),'1904-01-02');
const blankLevels=all.filter(row=>!row.level?.trim());assert.equal(selectMatrixRows(all,{level:'~'}).length,blankLevels.length);
assert(!catalog.sheets.filter(sheet=>sheet.state==='hidden').some(sheet=>sheet.imported));
const type=catalog.types[0],chunk=JSON.parse(fs.readFileSync('dist/protocols/'+type.file));
assert.throws(()=>decodeMatrixRows({...chunk,sourceSha256:'other'},catalog,type),/versión/);assert.throws(()=>decodeMatrixRows({...chunk,fields:['__proto__',...chunk.fields.slice(1)]},catalog,type),/versión/);
const manifest=JSON.parse(fs.readFileSync('dist/sw.js','utf8').match(/self\.ATLAS_OFFLINE = (.*);\n/)[1]);
for(const path of ['/protocol-catalog.mjs','/protocol-model.mjs','/protocols/catalog.json'])assert(manifest.files.some(file=>file.url===path&&file.core));
for(const type of catalog.types)assert(manifest.files.some(file=>file.url==='/protocols/'+type.file&&file.pack==='plan'&&!file.core));
assert(manifest.files.some(file=>file.url==='/source/'+catalog.source.filename&&file.pack==='documents'&&!file.core));
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-matrix-test'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Basic '+Buffer.from('atlas:isolated-matrix-test').toString('base64')};
try{for(const path of ['/protocols/catalog.json','/protocols/'+type.file,'/source/'+catalog.source.filename])assert.equal((await fetch(base+path)).status,401);const response=await fetch(base+'/source/'+catalog.source.filename,{headers});assert.equal(response.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),hash);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
console.log('Protocol matrix: 20,233 × 16 original cells independently compared to Excel; 154 codes/38 specialties; dates, raw values, duplicate folios, summary discrepancy, selection/pagination, schema/version checks, offline packs and protected original download passed');
