import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-navigation-test'}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',httpCredentials:{username:'atlas',password:'isolated-navigation-test'}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#globalSearch').waitFor();
 const tap=async id=>{
  const point=await page.evaluate(async id=>{const rt=await(await import('./runtime-loader.mjs')).loadRuntime(),r=rt.data.rooms.find(r=>r.id===id),[ox,oy]=rt.atlas.tiles.find(t=>t.id===r.document_id).offset;const v=await import('./viewer.mjs');if(!document.querySelector('#detail .detailCode')){v.mapView([400+ox,300+oy,2300,1100]);v.flushView();v.updateTiles();}const p=new DOMPoint(r.position[0]+ox,r.position[1]+oy).matrixTransform(document.querySelector('#svg').getScreenCTM());return {x:p.x,y:p.y};},id);
  assert(point.y<(await page.locator('.right').boundingBox())?.y||await page.locator('.right').isHidden());
  await page.touchscreen.tap(point.x,point.y);
 };
 await tap('505-49eb24e4:r0004');await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='8.1.7.1.6-1');
 assert((await page.locator('.right').boundingBox()).height<=150);assert.equal(await page.locator('#expandDetail').getAttribute('aria-expanded'),'false');
 const view=await page.locator('#svg').getAttribute('viewBox');
 await tap('505-49eb24e4:r0007');await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='8.1.7.1.10-1');
 assert.equal(await page.locator('#svg').getAttribute('viewBox'),view,'adjacent selection must preserve map position');
 await page.locator('#expandDetail').click();assert.equal(await page.locator('#expandDetail').getAttribute('aria-expanded'),'true');assert(await page.locator('#editGeometry').isVisible());
 await page.locator('#expandDetail').click();await page.waitForFunction(()=>document.querySelector('.right').getBoundingClientRect().height<=150);
 await tap('505-49eb24e4:r0004');await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='8.1.7.1.6-1');
 assert.deepEqual(errors,[]);await context.close();console.log('Mobile touch: compact 145px sheet, adjacent room selection without closing, unchanged viewport, expand/collapse and corrected warehouse passed');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
