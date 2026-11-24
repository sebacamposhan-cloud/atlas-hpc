import { enterPlanning } from './test-support/planning-browser.mjs';
import assert from 'node:assert/strict';
import { createAtlasServer } from './server/groq-server.mjs';
import {
  cloudFixture,
  QA_ACTOR,
  tokenFor,
} from './test-support/lastplanner-cloud.mjs';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright-core'
);
const cloud = await cloudFixture(),
  fetchImpl = (url, options) =>
    new URL(url).pathname === '/rest/v1/atlas_campo'
      ? Promise.resolve(Response.json([]))
      : cloud.fetchImpl(url, options),
  server = await createAtlasServer({ env: cloud.env, fetchImpl });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  }),
  base = 'http://127.0.0.1:' + server.address().port;
const codes = ['3.1.1.2.3-1', '3.1.1.2.4-1'];
async function open(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(base + '/?nivel=N-1');
  await page.locator('#assistantOpen').waitFor();
  if (await page.locator('#terrenoMas').isVisible()) {
    await page.locator('#terrenoMas').click();
    await page.locator('.acceso').filter({ hasText: 'Last Planner' }).click();
  } else {
    const card = page.locator('[data-tarjeta=lastplanner]');
    if (!(await card.isVisible())) await page.locator('#bottomObra').click();
    await card.click();
  }
  await page
    .getByRole('button', { name: /Planificación semanal/ })
    .filter({ visible: true })
    .first()
    .click();
  await enterPlanning(page);
  return page;
}
// En Windows el Chrome de escritorio informa pantalla táctil aunque el contexto no la tenga: si no se puede tocar, se hace clic.
async function tocar(page, x, y) { try { await page.touchscreen.tap(x, y).catch(()=>page.mouse.click(x, y)); } catch { await page.mouse.click(x, y); } }
async function context(width) {
  const c = await browser.newContext({
    viewport: { width, height: width < 700 ? 844 : 950 },
    isMobile: width < 700,
    hasTouch: width < 700,
    serviceWorkers: 'block',
  });
  await c.addInitScript(
    ({ token, actor }) =>
      localStorage.setItem(
        'atlas-nube-sesion',
        JSON.stringify({
          token,
          refresh: 'isolated',
          expira: Date.now() + 3600000,
          user: { username: actor.email, role: actor.role },
        }),
      ),
    { token: tokenFor(), actor: QA_ACTOR },
  );
  return c;
}
async function mark(page, code) {
  const p = await page.evaluate(async (code) => {
    const V = await import('./viewer.mjs'),
      node = [...document.querySelectorAll('.roomshape')].find((el) =>
        el.textContent.startsWith(code + ' ·'),
      );
    if (!node) throw Error('Missing real room ' + code);
    const b = node.getBBox();
    V.mapView([b.x - 100, b.y - 100, b.width + 200, b.height + 200]);
    V.flushView();
    const matrix = document.getElementById('svg').getScreenCTM(),
      rect = document.getElementById('viewport').getBoundingClientRect();
    for (const fx of [0.5, 0.2, 0.8, 0.35, 0.65])
      for (const fy of [0.5, 0.2, 0.8, 0.35, 0.65]) {
        const world = { x: b.x + b.width * fx, y: b.y + b.height * fy },
          screen = new DOMPoint(world.x, world.y).matrixTransform(matrix);
        const candidates = V.hitRoomCandidates(world);
        if (
          candidates.length === 1 && candidates[0] === node.dataset.id &&
          screen.x > rect.left + 5 &&
          screen.x < rect.right - 5 &&
          screen.y > rect.top + 5 &&
          screen.y < rect.bottom - 5
        )
          return { x: screen.x, y: screen.y };
      }
    throw Error('No hit in ' + code);
  }, code);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0))
    await tocar(page, p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
try {
  for (const width of [320, 390, 1280]) {
    const ctx = await context(width);
    try {
      const page = await open(ctx);
      await page.locator('[data-cycle=new]').click();
      const form = page.locator('.lpCycleDialog form');
      await form.locator('[name=actividad]').fill('Corrección de selección QA');
      await form
        .locator('[name=responsable]')
        .fill('Quijote · Pintura');
      await form.locator('[data-wizard-next]').click();
      await form.locator('[data-select-plan]').click();
      await page.waitForFunction(() =>
        document
          .querySelector('.lpSpatialContext')
          ?.textContent.includes('Selecciona en el plano'),
      );
      await mark(page, codes[0]);
      if (width === 390) {
        // Interior común de 8.1.7.1.7-1 y 8.1.7.1.6-1 en el nivel −1.
        const screen = await page.evaluate(async () => {
          const viewer = await import('./viewer.mjs');
          const x = 3734.3277, y = 920.1838;
          viewer.mapView([x - 150, y - 150, 300, 300]);
          viewer.flushView();
          const hit = new DOMPoint(x, y).matrixTransform(document.getElementById('svg').getScreenCTM());
          return {x: hit.x, y: hit.y};
        });
        await tocar(page, screen.x, screen.y);
        const chooser = page.getByRole('dialog', {name: 'Elige un recinto'});
        await chooser.waitFor();
        await page.keyboard.press('Escape');
        await chooser.waitFor({state: 'hidden'});
        assert.ok(await page.locator('[data-pick-apply]').isVisible());
        assert.equal(await page.locator('.lpSpatialRoomCard').count(), 1);
      }
      await mark(page, codes[1]);
      await page.locator('[data-pick-mode=muros]').click();
      await mark(page, codes[0]);
      const edges = page.locator('[data-pick-edge]:visible');
      await edges.nth(0).click();
      await edges.nth(1).click();
      const remove = page.getByRole('button', {
        name: 'Quitar último tramo de ' + codes[0],
      });
      assert.ok(await remove.isVisible());
      const box = await remove.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      const highlighted = page.locator('#lpSpatialLayer path[fill=none]');
      const before = await highlighted.count();
      assert.ok(before >= 2);
      await remove.click();
      assert.equal(
        await page.locator('[data-pick-edge][aria-pressed=true]').count(),
        1,
      );
      assert.equal(await highlighted.count(), before - 1);
      assert.equal(
        await page
          .locator('.lpSpatialRoomCard')
          .filter({ hasText: codes[1] })
          .count(),
        1,
      );
      await page.locator('[data-pick-apply]').click();
      await form.locator('[data-select-plan]').waitFor();
      await form.locator('.lpWizardSelection summary').click();
      assert.equal(await form.locator('[data-room-edit]').count(), 2);
      console.log('Quitar tramo y confirmar ubicación:', width, 'px');
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await cloud.close();
}
