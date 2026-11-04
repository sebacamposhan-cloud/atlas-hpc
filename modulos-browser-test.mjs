// Recorrido real de la entrada por módulos en Chromium, a 1366 × 768 y 375 × 812: módulo, piso, tarjetas y paneles.
// Usa un servidor estático de dist/, sin inicio de sesión ni service worker. No está en el build de Render (requiere Playwright).
//   CHROMIUM_PATH=…/chromium node modulos-browser-test.mjs [carpeta-de-capturas]
// Si Playwright no está en /opt/node-tools, se indica con PLAYWRIGHT_MODULE=…/playwright-core/index.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : require(require.resolve('playwright', {paths: [process.env.NODE_PATH || '', '/opt/node-tools/node_modules']}));
const capturas = process.argv[2] || null;
if (capturas) fs.mkdirSync(capturas, {recursive: true});
const raiz = path.resolve('dist');
const tipos = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const servidor = http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta === '/sw.js') { res.writeHead(404); res.end(); return; }
  let archivo = path.join(raiz, ruta);
  try { if (fs.statSync(archivo).isDirectory()) archivo = path.join(archivo, 'index.html'); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(archivo).pipe(res);
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
let pasos = 0;
const paso = async (texto, fn) => { await fn(); pasos++; console.log('✓ ' + texto); };
const foto = async (page, nombre) => { if (capturas) await page.screenshot({path: capturas + '/' + nombre + '.png'}); };
const cartas = page => page.$$eval('#ruedaObra .ruedaTarjeta', b => b.map(x => x.dataset.tarjeta));
const sinAncho = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const rotulo = page => page.$eval('#bottomObra', b => b.firstChild.textContent);
const listo = page => page.waitForFunction(() => !document.getElementById('bottomObra')?.disabled, null, {timeout: 60000});

async function abrir({movil = false, ruta = '/'} = {}) {
  const context = await browser.newContext(movil ? {viewport: {width: 375, height: 812}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block'} : {viewport: {width: 1366, height: 768}, serviceWorkers: 'block'});
  await context.addCookies([{name: 'atlas_sin_login', value: '1', url: base}]);
  const page = await context.newPage(), errores = [];
  page.on('pageerror', e => errores.push(e.message)); page.setDefaultTimeout(30000);
  await page.goto(base + ruta);
  return {context, page, errores};
}

try {
  for (const [nombre, movil] of [['computador', false], ['celular', true]]) {
    const {context, page, errores} = await abrir({movil});
    await paso(`${nombre}: parte en Módulos, con las tres tarjetas y Control marcado`, async () => {
      await page.waitForSelector('#moduloExplorer:not([hidden])');
      assert.equal(await page.isVisible('#floorExplorer'), false);
      assert.deepEqual(await page.$$eval('#moduloPista .ruedaTarjeta', b => b.map(x => x.dataset.modulo)), ['control', 'plano', 'protocolos']);
      assert.equal(await page.textContent('#moduloContinuar'), 'Continuar a Control →');
      assert.equal(await page.isVisible('#moduloVolver'), false, 'al entrar no hay a dónde volver');
      assert.ok(await sinAncho(page));
      await foto(page, nombre + '-modulos');
    });
    await paso(`${nombre}: Plano pide un piso con Continuar, sin doble clic`, async () => {
      await page.click('#moduloPista [data-modulo=plano]');
      assert.equal(await page.textContent('#moduloContinuar'), 'Continuar a Plano →');
      await page.click('#moduloContinuar');
      await page.waitForSelector('#floorExplorer:not([hidden])');
      assert.equal(await page.isVisible('#pisoContinuar'), true);
      assert.equal(await page.isVisible('#pisoVolver'), true);
      assert.equal(await page.textContent('#floorModulo'), 'Plano');
      await page.click('.pisoEtiqueta[data-floor="N-1"]');
      assert.equal(await page.textContent('#pisoContinuar'), 'Continuar a Piso −1 →');
      await foto(page, nombre + '-pisos');
      await page.click('#pisoContinuar');
      await listo(page);
      assert.equal(await page.evaluate(() => document.body.classList.contains('floorHome')), false);
      assert.equal(await rotulo(page), 'Plano');
      assert.equal(await page.isVisible('#ruedaObra'), false, 'Plano parte en el plano');
      await foto(page, nombre + '-plano');
    });
    await paso(`${nombre}: la barra lleva Módulos, Pisos y las tarjetas de Plano`, async () => {
      assert.deepEqual(await page.$$eval('.bottomNav button', b => b.map(x => x.id)), ['bottomModulos', 'bottomMap', 'bottomObra']);
      await page.click('#bottomObra');
      await page.waitForSelector('#ruedaObra:not([hidden])');
      assert.deepEqual(await cartas(page), ['recintos', 'capas']);
      await page.click('#ruedaCerrar');
    });
    await paso(`${nombre}: desde Módulos se cambia a Control, que parte en sus tarjetas`, async () => {
      await page.click('#bottomModulos');
      await page.waitForSelector('#moduloExplorer:not([hidden])');
      assert.equal(await page.isVisible('#moduloVolver'), true);
      await page.click('#moduloPista [data-modulo=control]');
      await page.click('#moduloContinuar');
      await page.waitForSelector('#floorExplorer:not([hidden])');
      await page.click('#pisoContinuar');
      await page.waitForSelector('body.ruedaPortada #ruedaObra:not([hidden])');
      assert.deepEqual(await cartas(page), ['lastplanner', 'resumen', 'herramientas']);
      assert.equal(await rotulo(page), 'Control');
      assert.equal(await page.isVisible('#ruedaCerrar'), false);
      assert.ok(await sinAncho(page));
      await foto(page, nombre + '-control');
    });
    await paso(`${nombre}: el resumen abre sin plano al que volver y regresa a las tarjetas`, async () => {
      await page.click('#ruedaObra [data-tarjeta=resumen]');
      await page.waitForSelector('#workContent');
      assert.equal(await page.locator('#workspacePanel [data-go-map]').count(), 0);
      assert.equal((await page.textContent('.panelBack')).trim(), '← Control');
      await page.click('.panelBack');
      await page.waitForSelector('body.ruedaPortada #ruedaObra:not([hidden])');
    });
    await paso(`${nombre}: Protocolos abre sus listas desde las tarjetas`, async () => {
      await page.click('#bottomModulos');
      await page.click('#moduloPista [data-modulo=protocolos]');
      await page.click('#moduloContinuar');
      await page.waitForSelector('#floorExplorer:not([hidden])');
      await page.click('#pisoContinuar');
      await page.waitForSelector('body.ruedaPortada #ruedaObra:not([hidden])');
      assert.deepEqual(await cartas(page), ['tipos', 'criticos', 'matriz']);
      await page.click('#ruedaObra [data-tarjeta=tipos]');
      await page.waitForSelector('#hojaFuncion:not([hidden]) .hojaLista');
      assert.deepEqual(await page.$$eval('#barraFunciones [data-funcion]', b => b.map(x => x.dataset.funcion)), ['tipos', 'criticos', 'resumen']);
      await foto(page, nombre + '-protocolos');
    });
    await paso(`${nombre}: al volver a abrir parte en Módulos con lo último marcado`, async () => {
      await page.goto(base + '/');
      await page.waitForSelector('#moduloExplorer:not([hidden])');
      assert.equal(await page.textContent('#moduloContinuar'), 'Continuar a Protocolos →');
      assert.equal(await page.getAttribute('#moduloPista [data-modulo=protocolos]', 'aria-pressed'), 'true');
    });
    await paso(`${nombre}: un enlace directo a un piso entra a Plano sin pasar por Módulos`, async () => {
      await page.goto(base + '/?nivel=N01');
      await listo(page);
      assert.equal(await page.isVisible('#moduloExplorer'), false);
      assert.equal(await rotulo(page), 'Plano');
    });
    assert.deepEqual(errores, []);
    await context.close();
  }
  console.log(`Módulos en navegador: ${pasos} recorridos aprobados.`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); servidor.close(); }
