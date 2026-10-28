import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAtlasServer} from './server/groq-server.mjs';
import {protocolFloors,scopeProtocolCatalog,onProtocolFloor} from './dist/protocol-scope.mjs';
import {decodeMatrixRows} from './dist/protocol-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const catalog=JSON.parse(fs.readFileSync('dist/protocols/catalog.json')),records=new Map();
for(const type of catalog.types)for(const row of decodeMatrixRows(JSON.parse(fs.readFileSync('dist/protocols/'+type.file)),catalog,type))records.set(row.id,row);
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-floor-protocols'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const expectedCritical={'N-1':120,N01:134,N02:117,N03:101};
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',httpCredentials:{username:'atlas',password:'isolated-floor-protocols'}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(sha=>{localStorage.setItem('atlas-protocol-matrix-view-v1',JSON.stringify({sourceSha256:sha,filters:{state:'',level:'N08'}}));localStorage.setItem('atlas-protocol-critical-view-v1',JSON.stringify({sourceSha256:sha,filters:{level:'N08'}}));},catalog.source.sha256);
  for(const [floor,info] of Object.entries(protocolFloors)){
   const scope=scopeProtocolCatalog(catalog,floor,'ABIERTO');
   await page.goto(base+'/?nivel='+floor);await page.locator('#assistantOpen').waitFor();await page.locator(viewport.width<700?'.bottomNav [data-module=work]':'.navGroup [data-module=work]').click();await page.locator('[data-work-tab=matrix]').click();await page.locator('#matrixScopeState').waitFor();
   assert.equal(await page.locator('#matrixScopeState').inputValue(),'ABIERTO');assert((await page.locator('.matrixScope').innerText()).includes(info.code));
   assert((await page.locator('#matrixFloorCount').innerText()).startsWith(scope.matching+' registros'));
   const options=await page.locator('#matrixType option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean));assert.deepEqual(options,scope.types.map(t=>t.id));
   await page.locator('#matrixType').selectOption(scope.types[0].id);await page.locator('#matrixResultCount').waitFor();
   let ids=await page.locator('[data-matrix-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.matrixId));assert(ids.length);for(const id of ids){assert(onProtocolFloor(records.get(id).level,floor));assert.equal(records.get(id).state.trim(),'ABIERTO');}
   await page.locator('#matrixScopeState').selectOption('');if(!await page.locator('#matrixState').count()){await page.locator('#matrixType').selectOption(scope.types[0].id);await page.locator('#matrixResultCount').waitFor();}
   ids=await page.locator('[data-matrix-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.matrixId));for(const id of ids)assert(onProtocolFloor(records.get(id).level,floor));
   await page.locator('#matrixScopeState').selectOption('ABIERTO');
   if(process.env.ATLAS_SCREENSHOT_DIR){await page.locator('#workspacePanel').evaluate(e=>e.scrollTop=0);await page.screenshot({path:process.env.ATLAS_SCREENSHOT_DIR+'/protocol-floor-'+floor+'-'+viewport.width+'.png'});}
   await page.locator('[data-work-tab=critical]').click();await page.locator('#criticalAsOf').fill('2026-10-27');await page.locator('#criticalAsOf').dispatchEvent('change');assert.equal(await page.locator('#criticalTotal').innerText(),String(expectedCritical[floor]));assert.equal(await page.locator('#criticalOpen').innerText(),String(scope.matching));
   const criticalIds=await page.locator('[data-critical-row]').evaluateAll(nodes=>nodes.map(n=>n.dataset.criticalRow));for(const id of criticalIds)assert(onProtocolFloor(records.get(id).level,floor));
   if(!await page.locator('.criticalMore').evaluate(n=>n.open))await page.locator('.criticalMore>summary').click();const levelOptions=await page.locator('#criticalLevel option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean));assert(levelOptions.every(value=>onProtocolFloor(value,floor)));
   await page.locator('#criticalLevel').selectOption(info.code);await page.locator('#clearCriticalFilters').click();assert.equal(await page.locator('#criticalOpen').innerText(),String(scope.matching),'clearing filters must keep active floor');
  }
  // Revisiting floor -1 cannot restore the last floor's scope or a historical global filter.
  await page.goto(base+'/?nivel=N-1');await page.locator('#assistantOpen').waitFor();await page.locator(viewport.width<700?'.bottomNav [data-module=work]':'.navGroup [data-module=work]').click();await page.locator('[data-work-tab=matrix]').click();await page.locator('#matrixScopeState').waitFor();assert((await page.locator('#matrixFloorCount').innerText()).startsWith('324 registros'));
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Protocol floors browser: S01/N01/N02/N03 at desktop/mobile, open default, picker counts, table/source-row scope, critical graph, clear filters, and cross-floor storage isolation passed');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
