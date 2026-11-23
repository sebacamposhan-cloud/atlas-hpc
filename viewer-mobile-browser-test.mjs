import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';

const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const server = await createAtlasServer({env: {}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const engine = process.env.ATLAS_BROWSER || 'chromium';
const browser = await playwright[engine].launch(engine === 'chromium'
  ? {executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']}
  : {});
const tileSelector = '#detailImage image[data-tile]';
const readers = {
  mobile: {viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true},
  desktop: {viewport: {width: 1440, height: 900}, deviceScaleFactor: 1},
};

async function open(context, level) {
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(url + '/?nivel=' + level);
  await page.waitForSelector('body:not(.booting) #svg .roomshape', {state: 'attached'});
  return page;
}

async function draw(page, view) {
  return page.evaluate(async ({view, tileSelector}) => {
    const viewer = await import('./viewer.mjs');
    viewer.mapView(view);
    viewer.updateTiles();
    return document.querySelectorAll(tileSelector).length;
  }, {view, tileSelector});
}

try {
  const mobile = await browser.newContext({...readers.mobile, serviceWorkers: 'block'});
  const imageRequests = [], errors = [];
  let health = 'online';
  await mobile.route('**/healthz', route => {
    if(health === 'captive') return route.fulfill({status: 200, contentType: 'text/html', body: '<p>Conecta tu red</p>'});
    return route.fulfill({status: health === 'online' ? 200 : 503, json: {status: health === 'online' ? 'ok' : 'unavailable'}});
  });

  mobile.on('request', request => {
    if (request.resourceType() === 'image') imageRequests.push(new URL(request.url()).pathname);
  });
  mobile.on('page', page => page.on('pageerror', error => errors.push(error.message)));

  const page = await open(mobile, 'N-1');
  await page.waitForFunction(() => document.getElementById('connectionLabel').textContent === 'En línea');
  const connection = page.locator('#offlineOpen');
  assert.ok(await connection.isVisible());
  await connection.click();
  const panel = page.getByRole('dialog', {name: 'Conexión y planos guardados'});
  assert.ok(await panel.isVisible());
  const retry = panel.getByRole('button', {name: 'Reintentar conexión'});
  health = 'unreachable';
  await retry.click();
  await page.waitForFunction(() => document.getElementById('connectionLabel').textContent === 'Sin respuesta');
  assert.ok(await page.evaluate(() => navigator.onLine));
  health = 'captive';
  await retry.click();
  await retry.waitFor();
  await page.waitForFunction(() => !document.getElementById('connectionRetry').disabled);
  assert.equal(await page.locator('#connectionLabel').textContent(), 'Sin respuesta');
  health = 'online';
  await retry.click();
  await page.waitForFunction(() => document.getElementById('connectionLabel').textContent === 'En línea');
  await panel.getByRole('button', {name: 'Cerrar modo sin conexión'}).click();
  await page.setViewportSize({width: 320, height: 700});
  assert.ok(await connection.isVisible());
  assert.ok(await page.evaluate(() => {
    const search = document.getElementById('globalSearch').getBoundingClientRect();
    const status = document.getElementById('offlineOpen').getBoundingClientRect();
    const label = document.getElementById('connectionLabel');
    return search.width >= 55 && status.right <= window.innerWidth &&
      getComputedStyle(label).display !== 'none' && label.scrollWidth <= label.clientWidth &&
      document.documentElement.scrollWidth <= window.innerWidth;
  }));
  await page.setViewportSize(readers.mobile.viewport);

  await page.waitForFunction(() => document.querySelectorAll('#background image[href$="overview-mobile.webp"]').length === 4);
  await page.waitForLoadState('networkidle');
  assert.equal(imageRequests.filter(path => path.endsWith('overview-mobile.webp')).length, 4);
  assert.equal(imageRequests.filter(path => /(?:^|\/)overview\.webp$/.test(path)&&path.startsWith('/map/')).length, 0);
  assert.equal(imageRequests.filter(path => path.startsWith('/pisos3d/')).length, 0);

  const peak = [];
  for (const zoom of [2550, 2050, 1550, 1140, 820, 460, 640, 1260]) {
    for (const x of [1800, 2300, 2900, 3500]) {
      peak.push(await draw(page, [x, 1200, zoom, zoom * 1.7]));
    }
  }
  assert.ok(Math.max(...peak) > 0 && Math.max(...peak) <= 24);
  await page.evaluate(async () => {
    const viewer = await import('./viewer.mjs');
    viewer.mostrarCapa('mobiliario', false);
  });
  assert.equal(await page.locator('#background [data-capa=mobiliario][href]').count(), 0);
  assert.equal(await page.locator('#detailImage [data-capa=mobiliario] image').count(), 0);
  await page.evaluate(async () => {
    const viewer = await import('./viewer.mjs');
    viewer.mostrarCapa('mobiliario', true);
  });
  assert.equal(await page.locator('#background [data-capa=mobiliario][href$="overview-mobile.webp"]').count(), 1);

  const view = [3000, 1600, 540, 900];
  assert.ok(await draw(page, view) > 0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, value: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator(tileSelector).count(), 0);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.ok(await page.locator(tileSelector).count() > 0);
  await page.evaluate(() => document.getElementById('floorHomeButton').click());
  await page.waitForFunction(() => document.querySelectorAll('#floorGrid img[src]').length > 0);
  assert.equal(await page.locator(tileSelector).count(), 0);
  await page.evaluate(() => document.getElementById('pisoVolver').click());
  await page.waitForFunction(() => !document.body.classList.contains('floorHome'));
  assert.equal(await page.locator('#floorGrid img[src]').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
  for (const floor of ['N01', 'N02', 'N03', 'N04']) {
    const other = await open(mobile, floor);
    await other.waitForFunction(() => document.querySelectorAll('#background image[href$="overview-mobile.webp"]').length === 4);
    await other.waitForLoadState('networkidle');
    assert.equal(await other.locator('#background image[href$="/overview.webp"]').count(), 0);
    await other.close();
  }
  assert.deepEqual(errors, []);
  await mobile.close();

  const desktop = await browser.newContext({...readers.desktop, serviceWorkers: 'block'});
  const full = await open(desktop, 'N-1');
  assert.equal(await full.locator('#background image[href$="/overview.webp"]').count(), 4);
  assert.equal(await full.locator('#background image[href$="overview-mobile.webp"]').count(), 0);
  await desktop.close();

  const offline = await browser.newContext(readers.mobile);
  // El piso se guarda solo con Wi-Fi (offline.mjs): este celular dice estar en Wi-Fi.
  await offline.addInitScript(() => Object.defineProperty(navigator, 'connection', {configurable: true, value: {type: 'wifi', saveData: false, addEventListener() {}, removeEventListener() {}}}));
  const saved = await open(offline, 'N-1');
  await saved.waitForFunction(() =>
    !!navigator.serviceWorker.controller &&
    document.getElementById('offlineLabel')?.textContent === 'Plano listo',
  undefined, {timeout: 60000});
  await offline.setOffline(true);
  await saved.goto(url + '/?nivel=N-1&modulo=plano');
  await saved.waitForSelector('body:not(.booting) #svg .roomshape', {state: 'attached'});
  await saved.waitForFunction(() =>
    document.getElementById('connectionLabel').textContent === 'Sin señal' &&
    document.getElementById('offlineLabel').textContent === 'Plano listo');

  const offlineAssets = await saved.locator('#background image[href$="overview-mobile.webp"]').evaluateAll(
    images => Promise.all(images.map(async image => {
      const check = new Image();
      check.src = image.getAttribute('href');
      await check.decode();
      return check.naturalWidth;
    }))
  );
  assert.equal(offlineAssets.length, 4);
  assert.ok(offlineAssets.every(width => width > 0 && width <= 1024));
  await offline.close();
  console.log(engine + ': 5 pisos, máximo ' + Math.max(...peak) + ' teselas móviles, ocultación y regreso, originales en escritorio, estado de conexión y reapertura offline');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
