import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const server = await createAtlasServer({env: {}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});

// JSTS finds two valid interiors at this point in the published N02 geometry.
const overlap = {x: 2197.15, y: 1704.1};
const codes = ['8.2.3.2.4-1', 'CT.F.2-4'];
async function tapPlan(page, point) {
  const screen = await page.evaluate(async point => {
    const viewer = await import('./viewer.mjs');
    viewer.mapView([point.x - 180, point.y - 180, 360, 360]);
    viewer.flushView();
    const matrix = document.getElementById('svg').getScreenCTM();
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return {x: screen.x, y: screen.y};
  }, point);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(screen.x, screen.y);
  else await page.mouse.click(screen.x, screen.y);
}

try {
  for (const width of [320, 390, 1280]) {
    const mobile = width < 700;
    const context = await browser.newContext({
      viewport: {width, height: 844}, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      await page.goto(base + '/?nivel=N02&modulo=plano');
      await page.locator('body:not(.booting) #assistantOpen').waitFor();
      await page.waitForFunction(async point => (await import('./viewer.mjs')).hitRoomCandidates(point).length === 2, overlap);
      const dialog = page.getByRole('dialog', {name: 'Elige un recinto'});
      await tapPlan(page, overlap);
      await dialog.waitFor();
      const options = dialog.locator('[data-room-hit]');
      assert.equal(await options.count(), 2);
      for (const code of codes) {
        const option = options.filter({hasText: code});
        assert.equal(await option.count(), 1);
        assert.ok((await option.boundingBox()).height >= 44);
      }
      await page.keyboard.press('Escape');
      await dialog.waitFor({state: 'hidden'});
      assert.equal(await page.locator('#selectionHighlight path').count(), 0);

      await tapPlan(page, overlap);
      await options.filter({hasText: codes[1]}).click();
      await dialog.waitFor({state: 'hidden'});
      assert.equal(await page.locator('.detailCode').textContent(), codes[1]);
      assert.ok(await page.locator('#selectionHighlight path').count());
      console.log('Solape real N02 y elección explícita:', width, 'px');
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
