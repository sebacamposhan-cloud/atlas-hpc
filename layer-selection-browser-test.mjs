import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createAtlasServer} from './server/groq-server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const data=JSON.parse(await fs.readFile('dist/data.json')),selection=JSON.parse(await fs.readFile('dist/selection.json'));
const ids=new Set(selection.rooms.map(r=>r.id));
const rooms=data.rooms.filter(r=>ids.has(r.id)&&r.finishes.some(f=>f.field==='CIE'&&f.code==='201'));
const target=rooms.find(r=>r.code==='7.1.2.1.2-2')||rooms[0],other=rooms.find(r=>r.code!==target.code);
assert(target&&other);
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-layer-test'}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',httpCredentials:{username:'atlas',password:'isolated-layer-test'}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  const layers=()=>page.locator(viewport.width<700?'#bottomLayers':'button[data-module="layers"]:visible').first().click();
  await layers();await page.locator('#activeLayer').selectOption('CIE');
  assert.equal(await page.locator('[data-color="201"]').inputValue(),'#ffcccc');assert.match(await page.locator('#layerColorNote').innerText(),/ocho leyendas/);
  await page.locator('[data-go-map]').first().click();
  const select=async room=>{await page.locator('#globalSearch').fill(room.code);await page.waitForFunction(code=>document.querySelector('#detail .detailCode')?.textContent===code,room.code);};
  // Select directly on the fully colored map, without a search dimming neighbors.
  await page.locator('#minimizeLegend').click();
  const point=await page.evaluate(async target=>{const viewer=await import('./viewer.mjs');const entry=viewer.footprint(target.id),points=entry.rings.flatMap(r=>r.polygon),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const runtime=await (await import('./runtime-loader.mjs')).loadRuntime();const [ox,oy]=runtime.atlas.tiles.find(t=>t.id===target.document_id).offset;viewer.mapView([Math.min(...xs)-35,Math.min(...ys)-35,Math.max(...xs)-Math.min(...xs)+70,Math.max(...ys)-Math.min(...ys)+70]);viewer.flushView();viewer.updateTiles();const screen=new DOMPoint(target.position[0]+ox,target.position[1]+oy).matrixTransform(document.querySelector('#svg').getScreenCTM());return {x:screen.x,y:screen.y};},target);
  await page.mouse.click(point.x,point.y);await page.waitForFunction(code=>document.querySelector('#detail .detailCode')?.textContent===code,target.code);
  assert.equal(await page.locator(`.roomshape[data-id="${other.id}"]`).getAttribute('fill-opacity'),'1','same-color neighbor remains painted while selection is distinct');
  const shape=page.locator(`.roomshape[data-id="${target.id}"]`);
  assert.equal(await shape.getAttribute('fill'),'#ffcccc');assert.equal(await shape.getAttribute('fill-opacity'),'1');
  const style=await shape.evaluate(e=>({width:getComputedStyle(e).strokeWidth,blend:getComputedStyle(e).mixBlendMode}));assert(Number.parseFloat(style.width)<=1);assert.equal(style.blend,'multiply');
  const outline=page.locator('.selectionOutline');assert.equal(await outline.count(),1);
  const selectedStyle=await outline.evaluate(e=>({width:getComputedStyle(e).strokeWidth,color:getComputedStyle(e).stroke,dash:getComputedStyle(e).strokeDasharray,effect:getComputedStyle(e).vectorEffect}));
  assert.equal(selectedStyle.width,'3px');assert.equal(selectedStyle.color,'rgb(0, 95, 204)');assert.equal(selectedStyle.dash,'none');assert.equal(selectedStyle.effect,'non-scaling-stroke');
  assert.match(await page.locator('#selectedRoomBadge').innerText(),new RegExp(target.code.replaceAll('.','\\.')));
  const firstPath=await outline.getAttribute('d');await page.locator('#closeDetail').click();assert(await outline.isVisible());
  await page.evaluate(async()=>{for(const node of document.querySelectorAll('#background image,#detailImage image')){const img=new Image();img.src=node.getAttribute('href');await img.decode();}});
  const b=await shape.boundingBox(),clip={x:b.x+10,y:b.y+10,width:b.width-20,height:b.height-20};
  const painted=(await page.screenshot({clip})).toString('base64');
  await page.locator('#polygons').evaluate(e=>e.style.visibility='hidden');const original=(await page.screenshot({clip})).toString('base64');await page.locator('#polygons').evaluate(e=>e.style.visibility='');
  const pixels=await page.evaluate(async({painted,original})=>{const read=async value=>{const image=new Image();image.src='data:image/png;base64,'+value;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);return c.getImageData(0,0,canvas.width,canvas.height).data;};const a=await read(original),b=await read(painted);let ink=0,retained=0,white=0,matched=0;for(let i=0;i<a.length;i+=4){if(Math.max(a[i],a[i+1],a[i+2])<100){ink++;if(Math.max(b[i],b[i+1],b[i+2])<100)retained++;}if(Math.min(a[i],a[i+1],a[i+2])>250){white++;if(Math.abs(b[i]-255)<5&&Math.abs(b[i+1]-204)<5&&Math.abs(b[i+2]-204)<5)matched++;}}return{ink,retained,white,matched};},{painted,original});
  assert(pixels.ink>40);assert(pixels.retained/pixels.ink>.9,'source text and drawing ink must remain visible through the color');assert(pixels.matched/pixels.white>.8,'rendered color on white paper must match source RGB');
  if(process.env.ATLAS_SCREENSHOT_DIR)await page.locator('#svg').screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR,`selection-${viewport.width}.png`)});
  if(viewport.width===1440){
   await page.locator('#exportPlan').click();const download=page.waitForEvent('download');await page.locator('#exportPNG').click();const file=await download;
   const bytes=await fs.readFile(await file.path());assert(bytes.length>1000);assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);if(await page.locator('#closeModal').isVisible())await page.locator('#closeModal').click();
  }
  await select(other);assert.notEqual(await outline.getAttribute('d'),firstPath);assert.match(await page.locator('#selectedRoomBadge').innerText(),/Seleccionado/);
  await layers();await page.locator('[data-color="201"]').evaluate(e=>{e.value='#123456';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.match(await page.locator('[data-color="201"]').locator('..').innerText(),/Personalizado/);
  await page.locator('[data-go-map]').first().click();const otherShape=page.locator(`.roomshape[data-id="${other.id}"]`);assert.equal(await otherShape.getAttribute('fill'),'#123456');assert.equal(await otherShape.getAttribute('fill-opacity'),'0.32');
  await layers();await page.locator('#resetLayerColors').click();assert.equal(await page.locator('[data-color="201"]').inputValue(),'#ffcccc');
  await page.locator('#activeLayer').selectOption('walls');assert.match(await page.locator('#layerColorNote').innerText(),/no asigna colores/);
  assert.deepEqual(errors,[]);await context.close();console.log('Source palette and independent selection passed',viewport.width);
 }
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
