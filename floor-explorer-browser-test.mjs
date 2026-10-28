import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAtlasServer} from './server/groq-server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-floors'}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:640}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',httpCredentials:{username:'atlas',password:'isolated-floors'}}),page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(new URL(r.url()).pathname));
  await page.goto(base);await page.locator('.floorCard').last().waitFor();
  assert.equal(await page.locator('.floorCard').count(),4);assert.equal(await page.locator('.floorCard a').count(),2);
  assert.equal(await page.locator('select.selectorPiso').count(),0);
  assert.equal(await page.locator('#floorGrid').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  const boxes=await page.locator('.floorCard').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  assert.equal(boxes[0].y,boxes[1].y);assert.equal(boxes[2].y,boxes[3].y);assert(boxes[0].y<boxes[2].y);assert.equal(boxes[0].x,boxes[2].x);assert.equal(boxes[1].x,boxes[3].x);assert(boxes[0].w>120);
  assert.equal(requests.filter(p=>/runtime\.json|\/map\/\d+\//.test(p)).length,0,'entry must not initialize either heavy viewer');
  assert(!requests.includes('/app.js'),'viewer code is deferred until floor choice');
  await page.locator('.floorPreview img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  assert.deepEqual(await page.locator('.floorPreview img').evaluateAll(images=>images.map(img=>img.getAttribute('src'))),['map/overview.webp','n01/map/overview.webp','n02/map/overview.webp','n03/map/overview.webp'],'each floor shows its own plan');
  if(process.env.ATLAS_SCREENSHOT_DIR)await page.screenshot({path:process.env.ATLAS_SCREENSHOT_DIR+'/floor-cards-'+viewport.width+'.png'});
  await page.locator('[data-floor="N-1"] a').click();await page.locator('#assistantOpen').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.roomshape').length===330);
  assert.match(page.url(),/nivel=N-1/);
  await page.locator('#globalSearch').fill('7.1.2.1.2-2');await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='7.1.2.1.2-2');
  await page.locator('#editInfo').click();assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('atlas-before-floor-change',{cancelable:true}))),false);await page.locator('#floorHomeButton').evaluate(b=>b.click());
  assert.equal(await page.locator('#floorExplorer').isVisible(),false,'pending room form must block navigation');
  await page.locator('#closeModal').click();await page.locator('#closeDetail').click();
  const oldView=await page.locator('#svg').getAttribute('viewBox'),runtimeCount=requests.filter(p=>p.endsWith('/runtime.json')).length;
  await page.locator('#floorHomeButton').click();assert(await page.locator('#floorExplorer').isVisible());
  await page.locator('[data-floor="N-1"] a').click();await page.locator('#floorExplorer').waitFor({state:'hidden'});
  assert.equal(await page.locator('#svg').getAttribute('viewBox'),oldView,'returning to the same floor preserves zoom and pan');
  assert.equal(requests.filter(p=>p.endsWith('/runtime.json')).length,runtimeCount,'same floor must reuse its loaded data');
  assert.equal(await page.locator('.selectionOutline').count(),1,'room selection is retained');
  await page.locator('[data-plan-type="walls"]').click();await page.waitForFunction(()=>document.querySelector('#activeLegend')?.textContent.includes('Muros'));
  assert.equal(await page.locator('[data-plan-type="walls"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-plan-type="architecture"]').click();
  assert.equal(await page.locator('#discipline').inputValue(),'architecture');
  if(viewport.width===1440){
   await page.locator('#reset').click();
   await page.locator('[data-plan-type="ceilings"]').click();await page.locator('#specialtySearch').fill('7.1.2.1.2-2');
   await page.locator('#specialtyResults [data-observation]').first().click();await page.locator('#protocolForm [name="number"]').fill('UNSAVED-TEST');
   assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('atlas-before-floor-change',{cancelable:true}))),false,'specialty inputs are protected');
   await page.locator('#protocolForm [data-discard]').click();assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('atlas-before-floor-change',{cancelable:true}))),true);
   await page.locator('[data-plan-type="architecture"]').click();
  }
  await page.locator('#floorHomeButton').click();await page.goBack();assert(await page.locator('#floorExplorer').isHidden());await page.goForward();assert(await page.locator('#floorExplorer').isVisible());
  await page.locator('[data-floor="N02"] a').click();await page.waitForFunction(()=>document.querySelectorAll('.roomshape').length===311);
  assert.match(page.url(),/nivel=N02/);await page.locator('#assistantOpen').waitFor();
  assert(await page.locator('[data-plan-type="ceilings"]').isDisabled());assert(await page.locator('[data-plan-type="floors"]').isDisabled());
  assert.equal(await page.locator('#diamondCatalogOpen').count(),0,'level-specific capabilities remain isolated');
  if(process.env.ATLAS_SCREENSHOT_DIR)await page.screenshot({path:process.env.ATLAS_SCREENSHOT_DIR+'/floor-viewer-'+viewport.width+'.png'});
  await page.locator(viewport.width<700?'#bottomMap':'button[data-module="map"]').first().click();assert(await page.locator('#floorExplorer').isVisible());
  await page.goto(base+'/?nivel=N-1#r=7.1.2.1.2-2');await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='7.1.2.1.2-2');
  assert(await page.locator('#floorExplorer').isHidden(),'existing room links bypass the cards');
  await page.goto(base);await page.locator('.floorCard').first().waitFor();await page.evaluate(()=>location.hash='r=7.1.2.1.2-2');await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='7.1.2.1.2-2');assert(await page.locator('#floorExplorer').isHidden());
  assert.deepEqual(errors,[]);await context.close();
 }
 const manifest=JSON.parse(fs.readFileSync('dist/sw.js','utf8').match(/self\.ATLAS_OFFLINE = (.*);\n/)[1]);
 assert(manifest.files.some(f=>f.url==='/floor-explorer.mjs'&&f.core),'entry must work offline');
 console.log('Visual floors: 2 × 2 at 1440/390/320px; real previews; no hidden runtime or viewer boot; N-1/N02 selection; same-floor state/data reuse; unsaved form protection; history and room links; offline manifest. No browser errors.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
