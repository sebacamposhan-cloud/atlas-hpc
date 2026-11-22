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
    const context = await browser.newContext({viewport: {width, height: 844}, deviceScaleFactor: mobile ? 3 : 1,
      isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block'});
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(35000);
      const images = [], errors = [];
      page.on('request', request => { if (request.resourceType() === 'image') images.push(request.url()); });
      page.on('pageerror', error => errors.push(error.message));
      await open(page, 'N-1');
      const drawing = page.waitForResponse(response => /\/cie-s01-map\/overview(?:-mobile)?\.webp$/.test(response.url()) && response.ok());
      if (mobile) {
        const selector = page.locator('#terrenoPlano');
        await selector.click();
        const sheet = page.getByRole('dialog', {name: 'Cambiar plano'});
        await sheet.waitFor();
        assert.equal(await sheet.getByRole('button', {name: 'Arquitectura'}).getAttribute('aria-pressed'), 'true');
        assert.equal(await sheet.locator('[data-elegir-plano]').count(), 6);
        await sheet.getByRole('button', {name: 'Cielos'}).click();
        await sheet.waitFor({state:'hidden'});
        await page.getByRole('button', {name: 'Cielos · Cambiar plano'}).waitFor();
      } else {
        await ceilings(page);
      }
      const toolbar = page.locator('#ceilingMapTools');
      await toolbar.waitFor();
      await (await drawing).finished();
      assert.equal(await page.locator('#specialtySheet').count(), 0);
      assert.equal(await page.locator('#disciplinePanel').isHidden(), true);
      assert.equal(await page.locator('#background image').first().getAttribute('href'),
        mobile ? 'cie-s01-map/overview-mobile.webp' : 'cie-s01-map/overview.webp');
      assert.ok(await page.locator('#barraFunciones').isHidden());
      assert.equal(await page.locator('#polygons').evaluate(el => getComputedStyle(el).visibility), 'hidden');
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
      await page.waitForFunction(() => document.querySelector('#detailImage image[href^="cie-s01-map/"]'));
      const tiles = await page.locator('#detailImage image').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
      assert.ok(tiles.length && tiles.every(url => url.startsWith('cie-s01-map/')));
      if (mobile) assert.ok(tiles.length <= 24);
      assert.ok(images.every(url => !new URL(url).pathname.startsWith('/disciplines/cie-')));

      // Closing the room sheet leaves the continuous plan open.
      await page.locator('#closeDetail').click({delay:500});
      await ficha.waitFor({state:'hidden'});
      if (width === 390) {
        await tapRoom(page, '2.1.4.1.5-1', mobile);
        assert.match(await ficha.innerText(), /Servicio Higiénico Público/);
        assert.equal(await ficha.getByRole('link', {name: /CIE-508/}).getAttribute('href'), 'source/cie-508.pdf#page=1');
        await page.locator('#closeDetail').click({delay:500});
        await ficha.waitFor({state:'hidden'});
      }
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
      if (mobile) {
        await page.getByRole('button', {name: 'Cielos · Cambiar plano'}).click();
        const sheet = page.getByRole('dialog', {name: 'Cambiar plano'});
        assert.equal(await sheet.getByRole('button', {name: 'Cielos'}).getAttribute('aria-pressed'), 'true');
        await sheet.getByRole('button', {name: 'Arquitectura'}).click();
        await page.getByRole('button', {name: 'Arquitectura · Cambiar plano'}).waitFor();
      } else {
        await toolbar.getByRole('button', {name: 'Volver a Arquitectura'}).click();
      }
      assert.ok(await toolbar.isHidden());
      assert.equal(await page.locator('#svg').getAttribute('aria-label'), 'Plano arquitectónico interactivo');
      assert.match(await page.locator('#background image').first().getAttribute('href'), /^map\/overview/);
      assert.deepEqual(errors, []);
      console.log('Cielos S01 unificado, ficha y simbología:', width, 'px');
    } finally {
      await context.close();
    }
  }
  const context = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block'});
  try {
    const page = await context.newPage();
    await open(page, 'N02');
    const selector = page.locator('#terrenoPlano');
    const sheet = page.getByRole('dialog', {name:'Cambiar plano'});
    await selector.click();
    assert.equal(await sheet.getByRole('button', {name:'Pavimentos'}).count(), 0);
    await sheet.getByRole('button', {name:'Muros'}).click();
    await page.getByRole('button', {name:'Muros · Cambiar plano'}).waitFor();
    await selector.click();
    await sheet.getByRole('button', {name:'Puertas'}).click();
    await page.getByRole('button', {name:'Puertas · Cambiar plano'}).waitFor();
    await selector.click();
    await sheet.getByRole('button', {name:'Arquitectura'}).click();
    await page.getByRole('button', {name:'Arquitectura · Cambiar plano'}).waitFor();
    assert.equal(await page.locator('body.puertasOpen').count(), 0);
    console.log('Selector móvil N02: opciones del piso y cambio entre Muros, Puertas y Arquitectura');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
