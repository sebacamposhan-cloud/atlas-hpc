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
const completed = [];
const layoutFailures = [];
try {
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  for (const viewport of [{width:1440,height:1000}, {width:390,height:844}]) {
    const context = await browser.newContext({viewport, serviceWorkers:'block'});
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base+'/?nivel=N-1');await page.locator('#assistantOpen').waitFor();
    await page.locator('[data-plan-type="architecture"]').waitFor();
    const canonical = await page.locator('#results [data-id]').evaluateAll(nodes => nodes.map(n => ({id:n.dataset.id, code:n.querySelector('strong').textContent})));
    const duplicate = bundle.observations.find(r => bundle.observations.filter(o => o.code === r.code).length > 1 && canonical.filter(a => a.code === r.code).length === 1);
    assert(duplicate, 'need a real ambiguous CIE / unique ARQ fixture');
    const candidates = bundle.observations.filter(r => r.code === duplicate.code);

    // Start in ARQ to prove multiple CIE sources are not silently collapsed.
    await page.locator('#globalSearch').fill(duplicate.code);
    await page.waitForFunction(code => document.querySelector('#detail .detailCode')?.textContent === code, duplicate.code);
    await page.locator('[data-plan-type="ceilings"]').click();
    await page.locator('#specialtyDetail').waitFor();
    assert.equal(await page.locator('[data-ceiling-observation]').count(), candidates.length);
    assert.equal(await page.locator('[data-ceiling-observation][aria-pressed="true"]').count(), 0);
    assert.match(await page.locator('#specialtyDetail').innerText(), /Varias observaciones de Cielos/);
    assert.match(await page.locator('#specialtyDetail dl').innerText(), /Pendiente/);
    await page.locator('#specialtySearch').fill('');
    await page.locator(`[data-ceiling-observation="${candidates[0].id}"]`).click();
    assert.equal(await page.locator('#specialtySheet').inputValue(), candidates[0].sheetId);
    assert.equal(await page.locator('[data-ceiling-observation][aria-pressed="true"]').getAttribute('data-ceiling-observation'), candidates[0].id);
    const otherSheet = bundle.documents.find(d => d.specialty === 'ceilings' && !candidates.some(o => o.sheetId === d.id));
    assert(otherSheet);
    await page.locator('#specialtySheet').selectOption(otherSheet.id);
    assert.equal(await page.locator('[data-ceiling-observation][aria-pressed="true"]').count(), 0);
    assert.match(await page.locator('#specialtyDetail').innerText(), /Sin observación seleccionada/);
    assert.doesNotMatch(await page.locator('#specialtyDetail dl').innerText(), /Owa Opus/);
    await page.locator(`[data-ceiling-observation="${candidates.at(-1).id}"]`).click();
    assert.equal(await page.locator('#specialtySheet').inputValue(), candidates.at(-1).sheetId);

    // Search names, then select the one visually checked documentary record.
    await page.locator('#specialtySearch').fill('box consulta medica');
    assert(await page.locator(`#specialtyResults [data-observation="${verified.id}"]`).count());
    await page.locator(`#specialtyResults [data-observation="${verified.id}"]`).click();
    assert.equal(await page.locator('#specialtySheet').inputValue(), 'cie-504');
    const detail = await page.locator('#specialtyDetail').innerText();
    for (const value of ['12,45', '2,80', '213', 'Owa Opus', 'L19', 'Ficha cotejada visualmente']) assert(detail.includes(value), value);
    assert.equal(await page.locator('#specialtyDetail a').getAttribute('href'), 'source/cie-504.pdf');
    const layout = await page.evaluate(() => {
      const tools = document.querySelector('.disciplineTools').getBoundingClientRect();
      const canvas = document.querySelector('.specialtyCanvas').getBoundingClientRect();
      const detail = document.querySelector('#specialtyDetail');
      return {
        toolsBottom:tools.bottom, canvasTop:canvas.top,
        detailWidth:detail.clientWidth, detailScrollWidth:detail.scrollWidth,
        controls:[...document.querySelectorAll('.disciplineTools > *')].map(el => {
          const rect=el.getBoundingClientRect(); return {left:rect.left,right:rect.right};
        }),
      };
    });
    if (layout.canvasTop < layout.toolsBottom) layoutFailures.push(`${viewport.width}px: toolbar bottom ${layout.toolsBottom}, canvas top ${layout.canvasTop}`);
    assert(layout.detailScrollWidth <= layout.detailWidth, 'technical card must not overflow horizontally');
    for (const control of layout.controls) assert(control.left >= 0 && control.right <= viewport.width, 'toolbar controls fit viewport');
    await page.locator('#specialtyDetail summary').filter({hasText:'Texto extraído'}).click();
    assert((await page.locator('#specialtyDetail').innerText()).includes(verified.source.sha256));
    await page.locator('[data-architecture-room]').first().click();
    assert.equal(await page.locator('#discipline').inputValue(), 'architecture');
    assert.equal(await page.locator('#detail .detailCode').innerText(), verified.code);
    await page.locator('#globalSearch').fill('');
    if(await page.locator('#isolate').isVisible())await page.locator('#isolate').click();
    await page.locator('[data-plan-type="ceilings"]').click();
    await page.waitForFunction(id => document.querySelector('[data-ceiling-observation][aria-pressed="true"]')?.dataset.ceilingObservation === id, verified.id);
    assert.equal(await page.locator('#specialtySheet').inputValue(), verified.sheetId);

    // An unmatched CIE selection must survive a PAV round trip without reviving ARQ.
    await page.locator('#specialtySearch').fill(noArchitecture.code);
    await page.locator(`#specialtyResults [data-observation="${noArchitecture.id}"]`).click();
    assert.match(await page.locator('#specialtyDetail').innerText(), /Sin coincidencia en Arquitectura/);
    await page.locator('[data-plan-type="floors"]').click();
    await page.waitForFunction(code => document.querySelector('#specialtyDetail h2')?.textContent === code, noArchitecture.code);
    await page.locator('[data-plan-type="ceilings"]').click();
    await page.waitForFunction(id => document.querySelector('[data-ceiling-observation][aria-pressed="true"]')?.dataset.ceilingObservation === id, noArchitecture.id);
    assert.equal(await page.locator('#specialtyDetail h2').innerText(), noArchitecture.code);

    // Clearing an unmatched ARQ association must also remove the old card/actions.
    await page.locator('[data-plan-type="architecture"]').click();
    assert.match(await page.locator('#detail').textContent(), /Sin recinto seleccionado/);
    assert.equal(await page.locator('#editInfo').count(), 0);
    assert.equal(await page.locator('#background').evaluate(el => el.style.opacity), '1');
    await page.locator('#reset').click();
    await page.locator('[data-plan-type="ceilings"]').click();
    await page.waitForFunction(() => document.querySelector('#specialtyDetail h2')?.textContent === 'Cielos · Nivel −1');
    assert.equal(await page.locator('[data-ceiling-observation]').count(), 0);
    assert.deepEqual(errors, []);
    completed.push(`${viewport.width}px: ARQ/CIE navigation, ambiguous sources, sheet changes, name search, source attributes, unmatched-code round trip, stale card cleanup and reset`);
    await context.close();
  }

  // A transient bundle failure must expose a retry that restores the real viewer.
  {
    const context = await browser.newContext({serviceWorkers:'block'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let attempts = 0;
    await page.route('**/disciplines.json', route => ++attempts === 1
      ? route.fulfill({status:503, body:'temporary test failure'}) : route.continue());
    await page.goto(base+'/?nivel=N-1');await page.locator('#assistantOpen').waitFor();
    await page.locator('[data-plan-type="ceilings"]').click();
    await page.locator('#retrySpecialty').click();
    await page.locator('#specialtySheet').waitFor();
    assert.equal(attempts, 2);
    assert.equal(await page.locator('#specialtySheet option').count(), 8);
    assert.deepEqual(errors, []);
    completed.push('failed bundle request can be retried');
    await context.close();
  }

  // Resolve a delayed load after the user has already returned to Architecture.
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let release;
  let entered;
  const responseGate = new Promise(resolve => { release=resolve; });
  const requested = new Promise(resolve => { entered=resolve; });
  await page.route('**/disciplines.json', async route => { entered(); await responseGate; await route.continue(); });
  await page.goto(base+'/?nivel=N-1');await page.locator('#assistantOpen').waitFor();
  await page.locator('[data-plan-type="architecture"]').waitFor();
  await page.locator('[data-plan-type="ceilings"]').click();
  await requested;
  await page.locator('[data-plan-type="architecture"]').click();
  const response = page.waitForResponse('**/disciplines.json');
  release();
  await (await response).finished();
  // A subsequent animation frame lets the response callback settle without a sleep.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('main').getAttribute('data-discipline'), 'architecture');
  assert.equal(await page.locator('[data-plan-type="architecture"]').getAttribute('aria-pressed'),'true');
  assert(await page.locator('#disciplinePanel').isHidden());
  assert.deepEqual(errors, []);
  completed.push('delayed CIE response cannot overwrite Architecture');
  await context.close();
  assert.deepEqual(layoutFailures, [], 'toolbar must not cover the plan');
  console.log(JSON.stringify({checks:'passed', browser:'Chromium', completed}, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
