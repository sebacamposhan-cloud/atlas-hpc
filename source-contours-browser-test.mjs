import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAtlasServer} from './server/groq-server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-source-test'}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const output=process.env.ATLAS_SCREENSHOT_DIR||await mkdtemp(path.join(os.tmpdir(),'atlas-source-contours-'));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',httpCredentials:{username:'atlas',password:'isolated-source-test'}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?nivel=N-1');await page.locator('#assistantOpen').waitFor();await page.locator('#globalSearch').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.roomshape').length===330);
  for(const target of [
   {id:'507-aa38cf6c:r0035',code:'3.1.1.2.2-1',point:[800,1960],excluded:[935,2100],view:[730,1905,250,270]},
   {id:'508-88399997:r0032',code:'3.1.1.5.1-1',point:[1550,695],excluded:[1600,500],view:[1060,230,660,630]},
  ]){
   const result=await page.evaluate(async target=>{
    const viewer=await import('./viewer.mjs');const {roomContourRepairs}=await import('./room-contour-repairs.mjs');
    const repair=roomContourRepairs.find(r=>r.id===target.id),[ox,oy]=repair.offset;
    const shape=document.querySelector(`.roomshape[data-id="${target.id}"]`);
    if(!shape)throw Error('Missing rendered source contour');
    const included={x:target.point[0]+ox,y:target.point[1]+oy},excluded=new DOMPoint(target.excluded[0]+ox,target.excluded[1]+oy);
    viewer.mapView([target.view[0]+ox,target.view[1]+oy,target.view[2],target.view[3]]);viewer.flushView();viewer.updateTiles();
    const screen=new DOMPoint(included.x,included.y).matrixTransform(document.querySelector('#svg').getScreenCTM());
    return {fill:shape.isPointInFill(new DOMPoint(included.x,included.y)),excluded:shape.isPointInFill(excluded),hit:viewer.hitRoom(included),pathMatches:shape.getAttribute('d')===viewer.footprintPath(target.id),screen:{x:screen.x,y:screen.y}};
   },target);
   assert.equal(result.fill,true);assert.equal(result.excluded,false);assert.equal(result.hit,target.id);assert(result.pathMatches);
   await page.mouse.click(result.screen.x,result.screen.y);
   await page.waitForFunction(code=>document.querySelector('#detail .detailCode')?.textContent===code,target.code);
   assert.match(await page.locator('#geometryAuthority').innerText(),/Perímetro corregido contra el PDF/);
   await page.locator('#closeDetail').click();
   // Render the same documentary Muros layer as the user's screenshots.
   if(target.id.startsWith('507')){
    await page.locator(viewport.width<700?'#bottomLayers':'button[data-module="layers"]:visible').first().click();
    await page.locator('#activeLayer').selectOption('walls');await page.locator('#paintEnabled').check();
    await page.locator('[data-go-map]').first().click();
   }
   await page.evaluate(async target=>{const viewer=await import('./viewer.mjs');const {roomContourRepairs}=await import('./room-contour-repairs.mjs');const [ox,oy]=roomContourRepairs.find(r=>r.id===target.id).offset;viewer.mapView([target.view[0]+ox,target.view[1]+oy,target.view[2],target.view[3]]);viewer.flushView();viewer.updateTiles();},target);
   const painted=page.locator(`.roomshape[data-id="${target.id}"]`);assert(Number(await painted.getAttribute('fill-opacity'))>0);assert.notEqual(await painted.getAttribute('fill'),'#425158');
   await page.evaluate(async()=>{for(const node of document.querySelectorAll('#background image,#detailImage image')){const img=new Image();img.src=node.getAttribute('href');await img.decode();}});
   await page.locator('#svg').screenshot({path:path.join(output,`${viewport.width}-${target.id.split(':').at(-1)}.png`)});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Actual protected browser desktop/mobile: restored screenshot areas are painted, clickable and exclude columns/bathrooms; source authority shown. Screenshots: '+output);
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
