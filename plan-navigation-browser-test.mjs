import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const server = await createAtlasServer({env: {}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});

try {
  for (const width of [320, 390]) {
    const context = await browser.newContext({viewport:{width,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/?nivel=N-1', {waitUntil:'domcontentloaded'});
    await page.waitForSelector('body:not(.booting) #svg .roomshape', {state:'attached'});
    const picker = page.locator('#terrenoPlano');
    const toolbar = page.locator('#planViewTools');
    const exit = toolbar.getByRole('button', {name:'Volver a Arquitectura'});
    const legend = toolbar.getByRole('button', {name:'Simbología'});

    async function choose (type) {
      await picker.click();
      await page.locator(`[data-elegir-plano="${type}"]`).click();
    }
    async function seeLegend (name, text) {
      await legend.click();
      const modal = page.getByRole('dialog', {name:'Simbología general · ' + name});
      await modal.getByText(text, {exact:true}).waitFor();
      await page.locator('#closeModal').click();
    }

    await choose('waterproofing');
    await page.locator('#specialtySVG').waitFor();
    assert.equal(await page.locator('body.impFullscreen').count(), 0);
    assert.ok(await picker.isVisible());
    await seeLegend('Impermeabilización', 'Avance registrado en ATLAS');
    await choose('floors');
    await page.getByRole('img', {name:'Plano de Pavimentos'}).waitFor();
    await seeLegend('Pavimentos', 'Códigos de pavimentos de Arquitectura');
    assert.ok(await picker.isVisible());

    await choose('doors');
    await page.locator('#doorsSVG').waitFor();
    await seeLegend('Puertas', 'Abrir PDF unido de Puertas ↗');
    await exit.click();
    await toolbar.waitFor({state:'hidden'});

    await choose('walls');
    await toolbar.getByText('Muros', {exact:true}).waitFor();
    // Muros: la simbología es la lista con casillas de «Filtros y capas» (recintos y m² por tipo de muro).
    await legend.click();
    await page.locator('#planFilters [data-simbologia] .categoryControl').first().waitFor();
    await page.locator('#closePlanFilters').click();
    await exit.click();

    await choose('waterproofing');
    await page.locator('#impFullscreenToggle').click();
    await page.locator('body.impFullscreen').waitFor();
    await seeLegend('Impermeabilización', 'Instalación de artefactos por recinto');
    await exit.click();
    await toolbar.waitFor({state:'hidden'});
    assert.equal(await page.locator('body.impFullscreen').count(), 0);
    assert.ok(await picker.isVisible());
    assert.deepEqual(errors, []);
    console.log(`${width}px · IMP, Pavimentos, Puertas y Muros · simbología y regreso`);
    await context.close();
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
