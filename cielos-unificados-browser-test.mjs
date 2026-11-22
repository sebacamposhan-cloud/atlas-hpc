import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const server = await createAtlasServer({env: {}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});

async function open(page, level) {
  await page.goto(base + '/?nivel=' + level, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('body:not(.booting) #svg .roomshape', {state: 'attached'});
}
async function ceilings(page) {
  const more = page.locator('#terrenoMas');
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole('button', {name: 'Filtros y capas', exact: true}).click();
  } else {
    await page.locator('button[data-tarjeta=herramientas]').click();
    await page.locator('button[data-funcion=filtros]').click();
  }
  await page.locator('#planFilters [data-tipo-plano=ceilings]').click();
}
async function tapRoom(page, code, mobile) {
  const point = await page.evaluate(async code => {
    const viewer = await import('./viewer.mjs');
    const path = [...document.querySelectorAll('#polygons .roomshape')].find(el => el.textContent.startsWith(code + ' ·'));
    if (!path) throw new Error('Sin geometría para ' + code);
    const box = path.getBBox();
    viewer.mapView([box.x - 190, box.y - 190, box.width + 380, box.height + 380]);
    viewer.flushView();
    const svg = document.getElementById('svg');
    for (const fx of [.5, .3, .7]) for (const fy of [.5, .3, .7]) {
      const x = box.x + fx * box.width, y = box.y + fy * box.height;
      if (viewer.hitRoom({x, y}) === path.dataset.id) {
        const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
        if (document.elementFromPoint(p.x, p.y)?.closest('#svg')) return {x: p.x, y: p.y};
      }
    }
    throw new Error('No se encontró un toque dentro de ' + code);
  }, code);
  if (mobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

try {
  for (const width of [320, 390, 1440]) {
    const mobile = width < 700;
    const context = await browser.newContext({viewport: {width, height: 844}, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block'});
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(35000);
      const images = [], errors = [];
      page.on('request', request => { if (request.resourceType() === 'image') images.push(request.url()); });
      page.on('pageerror', error => errors.push(error.message));
      await open(page, 'N-1');
      await ceilings(page);
      const toolbar = page.locator('#ceilingMapTools');
      await toolbar.waitFor();
      assert.equal(await page.locator('#specialtySheet').count(), 0);
      assert.equal(await page.locator('#disciplinePanel').isHidden(), true);
      assert.match(await page.locator('#background image').first().getAttribute('href'), /^map\/overview/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

      await tapRoom(page, '7.1.2.1.2-1', mobile);
      const ficha = page.getByRole('region', {name: 'Ficha de Cielos'});
      await ficha.waitFor();
      await ficha.getByText('Lectura cotejada en la lámina').waitFor();
      assert.match(await ficha.innerText(), /Box Consulta Médica/);
      assert.match(await ficha.innerText(), /213/);
      assert.match(await ficha.innerText(), /2,80 m/);
      assert.match(await ficha.innerText(), /L19/);
      assert.equal(await ficha.getByRole('link', {name: /CIE-504/}).getAttribute('href'), 'source/cie-504.pdf#page=1');
      assert.equal(await page.locator('#selectionHighlight path').count(), 2);
      assert.equal(await page.locator('#polygons .roomshape', {hasText: /^7\.1\.2\.1\.2-1 ·/}).getAttribute('fill-opacity'), '0.18');
      assert.ok(images.every(url => !new URL(url).pathname.startsWith('/disciplines/cie-')));

      // Closing the room sheet leaves the continuous plan open.
      await page.locator('#closeDetail').click();
      await toolbar.getByRole('button', {name: 'Simbología'}).click();
      const legend = page.locator('#modal .ceilingLegendContent');
      await legend.waitFor();
      assert.equal(await legend.locator('.ceilingDocumentList a').count(), 8);
      await legend.locator('img').evaluate(image => image.decode());
      if (width === 390) {
        await legend.getByRole('button', {name: 'Láminas originales y registros'}).click();
        await page.locator('#specialtySheet').waitFor();
        assert.equal(await page.locator('#specialtySheet option').count(), 8);
        await page.locator('[data-ceilings-unified]').click();
        await toolbar.waitFor();
      } else {
        await page.locator('#closeModal').click();
      }
      await toolbar.getByRole('button', {name: 'Volver a Arquitectura'}).click();
      assert.ok(await toolbar.isHidden());
      assert.equal(await page.locator('#svg').getAttribute('aria-label'), 'Plano arquitectónico interactivo');
      assert.deepEqual(errors, []);
      console.log('Cielos S01 unificado, ficha y simbología:', width, 'px');
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
