import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeMatrixRows,selectMatrixRows,matrixDate} from './dist/protocol-model.mjs';
import {anniversary,criticalAge,chileToday,decodeAgingIndex,analyzeCritical,inDateRange,isoDay} from './dist/protocol-aging.mjs';
const serial=day=>String((Date.parse(day+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000),row=(day,state='ABIERTO',closedDate=null)=>({issued:day===null?null:serial(day),state,closedDate});
assert.equal(criticalAge(row('2025-10-27'),'2026-10-27').critical,false,'exact anniversary is not more than one year');
assert.equal(criticalAge(row('2025-10-26'),'2026-10-27').critical,true);
assert.equal(criticalAge(row('2025-10-28'),'2026-10-27').critical,false);
assert.equal(anniversary('2024-02-29'),'2025-02-28');assert.equal(criticalAge(row('2024-02-29'),'2025-02-28').critical,false);assert.equal(criticalAge(row('2024-02-29'),'2025-03-01').critical,true);
assert.equal(criticalAge(row('2027-01-01'),'2026-10-27').critical,false);
for(const state of ['CERRADO','CERRADO POR AUTOCONTROL','NULO'])assert.equal(criticalAge(row('2022-01-01',state),'2026-10-27').critical,false);
assert.equal(criticalAge(row('2022-01-01','ABIERTO',serial('2023-01-01')),'2026-10-27').critical,false);assert.equal(criticalAge(row('2022-01-01','ABIERTO',serial('2023-01-01')),'2026-10-27').conflict,true);
for(const issued of [null,'','    ','invalid']){const result=criticalAge({issued,state:'ABIERTO'},'2026-10-27');assert.equal(result.critical,false);assert.equal(result.unknown,true);}
assert.equal(isoDay('2026-02-30'),null);assert.equal(criticalAge(row('2022-01-01'),'').critical,false);assert.equal(chileToday(new Date('2026-10-28T01:00:00Z')),'2026-10-27');
assert.equal(inDateRange(serial('2025-01-01'),'2025-01-01','2025-01-01'),true);assert.equal(inDateRange(null,'2025-01-01','2025-12-31'),false);assert.equal(inDateRange(serial('2025-06-01'),'2025-12-31','2025-01-01'),false);
const source=JSON.parse(fs.readFileSync('dist/protocols/catalog.json')),index=JSON.parse(fs.readFileSync('dist/protocols/open-aging.json')),rows=decodeAgingIndex(index,source);
const originals=[];for(const type of source.types)originals.push(...decodeMatrixRows(JSON.parse(fs.readFileSync('dist/protocols/'+type.file)),source,type).map(row=>({...row,typeId:type.id})));
const open=originals.filter(row=>['ABIERTO','PENDIENTE'].includes(row.state?.trim()));assert.equal(rows.length,5678);assert.equal(open.length,5678);
for(const indexed of rows){const original=open.find(row=>row.sourceRow===indexed.sourceRow);for(const field of ['sourceRow','typeId','code','folio','level','receiver','issued','closedDate','state'])assert.equal(indexed[field],original[field]);}
const report=analyzeCritical(rows,source,{asOf:'2026-10-27'});assert.equal(report.critical.length,2045);assert.equal(report.missing,1495);assert.equal(report.conflicts,0);assert.deepEqual(report.bands.map(item=>item.n),[1758,286,1]);assert.equal(report.types.reduce((n,type)=>n+type.n,0),2045);
assert.equal(selectMatrixRows(originals,{state:'PENDING_CLOSURE'}).length,5678);assert.equal(selectMatrixRows(originals,{state:'CLOSED_ALL'}).length,14531);assert.equal(selectMatrixRows(originals,{criticalOnly:true,asOf:'2026-10-27'}).length,2045);
assert.equal(selectMatrixRows(originals,{dateField:'issued',dateFrom:'2026-10-26',dateTo:'2026-10-26'}).length,originals.filter(row=>matrixDate(row.issued)==='2026-10-26').length);
assert.equal(selectMatrixRows(originals,{dateField:'closedDate',dateFrom:'2026-01-01',dateTo:'2026-10-27'}).length,originals.filter(row=>{const day=matrixDate(row.closedDate);return day&&day>='2026-01-01'&&day<='2026-10-27';}).length);
assert.equal(selectMatrixRows(originals,{dateFrom:'2026-12-31',dateTo:'2026-01-01'}).length,0);assert.equal(analyzeCritical(rows,source,{asOf:'2026-02-30'}).valid,false);
const level='S01',scoped=analyzeCritical(rows,source,{asOf:'2026-10-27',level,query:'asepsia'});assert(scoped.critical.every(row=>row.level===level));assert(scoped.critical.every(row=>source.types.find(type=>type.id===row.typeId).name.toLowerCase().includes('asepsia')));
assert.throws(()=>decodeAgingIndex({...index,sourceSha256:'old'},source),/versión/);assert.throws(()=>decodeAgingIndex({...index,rows:[index.rows[0],...index.rows.slice(0,-1)]},source),/Fila/);
const manifest=JSON.parse(fs.readFileSync('dist/sw.js','utf8').match(/self\.ATLAS_OFFLINE = (.*);\n/)[1]);for(const file of ['protocol-aging.mjs','protocol-values.mjs','protocol-critical.mjs'])assert(manifest.files.some(asset=>asset.url==='/'+file&&asset.core));assert(manifest.files.some(asset=>asset.url==='/protocols/open-aging.json'&&asset.pack==='plan'&&!asset.core));
console.log('Critical protocols: strict calendar anniversary/leap year, Chile date, missing/whitespace dates, closed and conflicting records excluded, inclusive date filters, exact open index, source snapshot 2,045 critical/1,495 undated, chart totals and offline assets passed');
