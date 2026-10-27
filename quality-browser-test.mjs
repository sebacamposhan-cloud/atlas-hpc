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
const completed=[];
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/?nivel=N-1');await page.locator('#assistantOpen').waitFor();await page.locator('[data-plan-type="architecture"]').waitFor();
  assert.equal(await page.locator('.roomshape[data-geometry-quality="validated"]').count(),2);
  assert.equal(await page.locator('.roomshape[data-geometry-quality="auxiliary_pending"]').count(),315);
  assert.equal(await page.locator('.roomshape[data-geometry-quality="source_pending"]').count(),13);
  assert.equal(await page.evaluate(async()=>{const {hitRoom}=await import('./viewer.mjs');return hitRoom({x:3339.3995,y:2543.3195});}),'502-41a89a7c:r0013');
  const clickPoint=await page.locator('#svg').evaluate(svg=>{const p=new DOMPoint(3339.3995,2543.3195).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};});
  await page.mouse.click(clickPoint.x,clickPoint.y);
  await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='RT.(-1)-10');
  const room=data.rooms.find(r=>r.code==='8.2.4.1.1-1');
  await page.locator('#globalSearch').fill(room.code);await page.locator('#globalSearch').press('Enter');
  await page.waitForFunction(code=>document.querySelector('#detail .detailCode')?.textContent===code,room.code);
  assert.match(await page.locator('#asepsisEvidence').innerText(),/Documentado, pendiente de revisión/);
  assert.match(await page.locator('#asepsisEvidence').innerText(),/M1=/);
  assert.match(await page.locator('#geometryAuthority').innerText(),/auxiliar/);
  // Clear the text query before the independent map category filter.
  await page.locator('#reset').click();
  await page.locator(viewport.width<700?'#bottomLayers':'button[data-module="layers"]:visible').first().click();
  assert.deepEqual(await page.locator('#activeLayer option').evaluateAll(nodes=>nodes.map(n=>n.value)),['CIE','PAV','walls','liberacion']);
  await page.locator('#paintEnabled').check();
  await page.locator('#asepsisAttribute').selectOption('media');
  await page.locator('[data-go-map]').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('#polygons path[fill]:not([fill="#425158"])').length===72);
  assert.match(await page.locator('#activeFilterCount').innerText(),/72 recintos/);
  await page.locator('#minimizeLegend').click();
  assert(await page.locator('#activeLegend').evaluate(el=>el.classList.contains('minimized')));
  assert.equal(await page.locator('#polygons path[fill]:not([fill="#425158"])').count(),72);
  await page.locator('#zoomIn').click();
  await page.locator(viewport.width<700?'#bottomSearch':'button[data-module="rooms"]:visible').first().click();
  await page.locator('[data-go-map]').first().click();
  assert.equal(await page.locator('#polygons path[fill]:not([fill="#425158"])').count(),72);
  assert.match(await page.locator('#activeFilterCount').innerText(),/72 recintos/);
  await page.locator('#minimizeLegend').click();
  await page.locator('#togglePaint').click();
  assert.equal(await page.locator('#polygons path[fill]:not([fill="#425158"])').count(),0);
  assert.match(await page.locator('#activeFilterCount').innerText(),/72 recintos/);
  await page.locator('#togglePaint').click();
  assert.equal(await page.locator('#polygons path[fill]:not([fill="#425158"])').count(),72);
  await page.locator('#clearMapFilters').click();
  await page.waitForFunction(()=>document.querySelector('#activeFilterCount')?.textContent.includes('330 recintos'));
  await page.locator('[data-plan-type="ceilings"]').click();await page.locator('#specialtySearch').waitFor();
  const unextracted=bundle.observations.find(r=>!r.ceilingCodes);
  await page.locator('#specialtySearch').fill(unextracted.code);
  await page.locator(`[data-observation="${unextracted.id}"]`).click();
  assert(await page.locator('#specialtyDetail [data-documentary-state="source_unextracted"]').count());
  assert.match(await page.locator('#specialtyDetail').innerText(),/Fuente disponible, dato aún no extraído/);
  await page.locator('#specialtySearch').fill('CT.F.(-1)-3');
  await page.locator('[data-observation="cie-504:789"]').click();
  assert.equal(await page.locator('#specialtySheet').inputValue(),'cie-504');
  assert.match(await page.locator('#specialtyDetail').innerText(),/Extraído; asociación pendiente de revisión/);
  assert.match(await page.locator('#specialtyDetail').innerText(),/Fuente disponible, dato aún no extraído/);
  await page.locator(viewport.width<700?'#bottomDocs':'button[data-module="docs"]:visible').first().click();
  const pdf=page.locator('a[href="source/cielos-s01-clearance.pdf"]');await pdf.waitFor();
  assert.equal((await page.request.get(base+'/source/cielos-s01-clearance.pdf')).status(),200);
  assert.match(await page.locator('#workspacePanel').innerText(),/No son identificadores ARQ/);
  assert.deepEqual(errors,[]);
  completed.push(`${viewport.width}px: geometry authority, documentary states, persistent map filters and clearance source`);
  await context.close();
 }
 console.log(JSON.stringify({checks:'passed',completed},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
