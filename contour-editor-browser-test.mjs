import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Install playwright-core outside the checkout, then pass its index.mjs path via
// PLAYWRIGHT_MODULE. CHROMIUM_PATH selects an existing Chromium installation.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const bundle = JSON.parse(await readFile(path.join(root, 'disciplines.json')));
const data = JSON.parse(await readFile(path.join(root, 'data.json')));
const verified = bundle.observations.find(r => r.code === '7.1.2.1.2-1' && r.sheetId === 'cie-504');
const noArchitecture = bundle.observations.find(r => !data.rooms.some(a => a.code === r.code));
assert(verified && noArchitecture, 'real verification and unmatched-code fixtures are required');
const types = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.pdf':'application/pdf'};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'}).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#globalSearch').waitFor();await page.locator('#globalSearch').fill('RT.(-1)-1');
  await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='RT.(-1)-1');if(viewport.width<700)await page.locator('#expandDetail').click();await page.locator('#editGeometry').click();
  await page.waitForFunction(()=>document.querySelector('#contourStatus')?.textContent.includes('PDF original cargado'));
  assert(await page.locator('.leaflet-pane img.leaflet-image-layer').count());assert(await page.locator('.leaflet-pm-toolbar').count());
  await page.locator('.leaflet-pm-icon-edit').click();
  const marker=page.locator('#contourMap .leaflet-marker-icon:not(.marker-icon-middle)').first();await marker.waitFor();const mb=await marker.boundingBox();await page.mouse.move(mb.x+mb.width/2,mb.y+mb.height/2);await page.mouse.down();await page.mouse.move(mb.x+mb.width/2+30,mb.y+mb.height/2+30,{steps:4});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('#contourUndo')?.disabled===false);await page.locator('#contourUndo').click();await page.locator('#contourRedo').click();
  await page.locator('#contourForm [name="responsible"]').fill('Browser QA');await page.locator('#contourForm [name="reason"]').fill('Isolated source review in automated test');
  await page.locator('#contourSave').click();await page.waitForFunction(()=>document.querySelector('#contourStatus')?.textContent.includes('Corrección local guardada'));
  const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('atlas-hpc-web-v1')));const row=Object.values(records).find(r=>r.code==='RT.(-1)-1');assert(row.geometry_parts.length);assert.equal(row.geometry_status,'Pendiente de revisión');assert.equal(row.history.length,data.rooms.find(r=>r.id===row.id).history.length+1);assert.equal(row.geometry_method,'Edición manual en navegador');
  const download=page.waitForEvent('download');await page.locator('#contourExport').click();const file=await download;assert(file.suggestedFilename().endsWith('.json'));assert.equal(JSON.parse(await readFile(await file.path(),'utf8')).record.observation_id,row.id);
  await page.locator('#contourClose').click();await page.reload();await page.locator('#globalSearch').waitFor();await page.locator('#globalSearch').fill('RT.(-1)-1');await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='RT.(-1)-1');
  assert.match(await page.locator('#geometryAuthority').innerText(),/Corrección manual/);if(viewport.width<700)await page.locator('#expandDetail').click();await page.locator('#history').click();assert.match(await page.locator('#modalBody').innerText(),/Browser QA/);
  assert.deepEqual(errors,[]);console.log('Contour viewport passed',viewport.width);await context.close();
 }
 console.log('Leaflet + Geoman real browser: source PDF render, external toolbar, saved geometry parts/history/export/reload, desktop/mobile passed');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
