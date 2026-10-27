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
const atlas=JSON.parse(await readFile(path.join(root,'atlas.json')));
const [sx,sy,sw,sh]=atlas.scope.bounds;
const outside=data.rooms.find(r=>{const t=atlas.tiles.find(t=>t.id===r.document_id),x=r.position[0]+t.offset[0],y=r.position[1]+t.offset[1];return x<sx||x>sx+sw||y<sy||y>sy+sh;});assert(outside);
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?nivel=N-1');await page.locator('#assistantOpen').waitFor();await page.locator('#diamondCatalogOpen').click();
  assert.match(await page.locator('#diamondCount').innerText(),/443 observaciones/);assert.equal(await page.locator('[data-diamond-open]').count(),24);
  await page.locator('#diamondSearch').fill(outside.code);await page.locator(`[data-diamond-open="${outside.id}"]`).click();
  assert.equal(await page.locator('#diamondDetail tbody tr').count(),6);assert.match(await page.locator('#diamondDetail').innerText(),/fuera del recorte/);assert.equal(await page.locator('#diamondLocate').count(),0);
  assert.equal((await page.request.get(new URL(await page.locator('#diamondDetail img').getAttribute('src'),base).href)).status(),200);
  await page.locator('#diamondBack').click();await page.locator('#diamondSearch').fill('3.1.4.1.1-1');await page.locator('[data-diamond-open="501-5016771b:r0001"]').click();
  assert.match(await page.locator('#diamondDetail').innerText(),/HPL/);await page.locator('#diamondLocate').click();
  await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='3.1.4.1.1-1');
  await page.locator('#diamondCatalogOpen').click();await page.locator('#diamondMapToggle').click();
  assert.equal(await page.locator('.diamondHit').count(),330);
  const box=await page.locator('.diamondHit[data-diamond-id="501-5016771b:r0001"]').boundingBox();assert(box);await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  assert.equal(await page.locator('#detail .detailCode').innerText(),'3.1.4.1.1-1');
  const other=page.locator('.diamondHit:not([data-diamond-id="501-5016771b:r0001"])').first();const otherId=await other.getAttribute('data-diamond-id');await other.focus();await other.press('Enter');assert.equal(await page.locator('#detail .detailCode').innerText(),data.rooms.find(r=>r.id===otherId).code);
  await page.locator('#diamondCatalogOpen').click();await page.locator('#diamondSearch').fill('ZZZZ-NO-RESULTADOS');assert.match(await page.locator('#diamondCount').innerText(),/0 observaciones/);
  const bounds=await page.locator('#diamondCatalog').boundingBox();assert(bounds.width<=viewport.width&&bounds.x>=0);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Diamond Chromium desktop/mobile: all-observation catalogue, outside-scope sources, six fields, direct symbol selection, empty search and layout passed');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
