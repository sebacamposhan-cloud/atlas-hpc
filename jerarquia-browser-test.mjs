// Recorrido real de la jerarquía de obra en Chromium: servidor de Atlas, PostgreSQL en PGlite con supabase/jerarquia.sql
// y personas de ejemplo (sin nombres reales). Jefe B en computador (1366 × 768) asigna con el selector de superficies;
// el supervisor en celular (375 × 812) recibe la tarea, la marca sin señal tocando el plano y la sube al volver la señal;
// el jefe la confirma. Una cuenta sin perfil ve la rueda de siempre. No está en el build de Render (requiere PGlite).
//   PGLITE_MODULE=…/pglite/dist/index.js CHROMIUM_PATH=…/chromium node jerarquia-browser-test.mjs [carpeta-de-capturas]
// Si Playwright no está en /opt/node-tools, se indica con PLAYWRIGHT_MODULE=…/playwright-core/index.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createAtlasServer} from './server/groq-server.mjs';
import {cloudFixture, tokenFor} from './test-support/lastplanner-cloud.mjs';

const require = createRequire(import.meta.url);
const {chromium} = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : require(require.resolve('playwright', {paths: [process.env.NODE_PATH || '', '/opt/node-tools/node_modules']}));
const capturas = process.argv[2] || null;
if (capturas) fs.mkdirSync(capturas, {recursive: true});
const cloud = await cloudFixture();
await cloud.db.exec('create table auth.users(id uuid primary key, email text)');
await cloud.db.exec(fs.readFileSync('supabase/jerarquia.sql', 'utf8'));
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), correo = n => 'cuenta' + n + '@example.test';
for (const n of [1, 2, 3, 6, 11, 12, 30]) await cloud.db.query('insert into auth.users(id,email) values($1,$2)', [id(n), correo(n)]);
const cargar = (n, nombre, cargo, nivel, jefe, pisos = [], empresa = null) => cloud.db.query('select public.atlas_jer_cargar($1,$2,$3,$4,$5,$6,$7,$8)', [correo(n), nombre, cargo, nivel, 'linea', jefe ? correo(jefe) : null, pisos, empresa]);
await cargar(1, 'Gerencia (ejemplo)', 'Gerente de contrato', 0); await cargar(2, 'Jefatura general (ejemplo)', 'Jefe general de terreno', 1, 1);
await cargar(3, 'Jefe de terreno A (ejemplo)', 'Jefe de terreno', 2, 2); await cargar(6, 'Jefe B norte (ejemplo)', 'Jefe de terreno B', 3, 3);
await cargar(11, 'Supervisor piso −1 (ejemplo)', 'Supervisor de piso', 4, 6, ['N-1']); await cargar(12, 'Capataz subcontrato (ejemplo)', 'Capataz', 4, 6, ['N-1'], 'Subcontrato de ejemplo');
const actor = n => ({id: id(n), email: correo(n), role: 'editor'});

// Supabase aislado: RLS y RPC reales en PGlite con la sesión de cada cuenta.
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});
const fetchImpl = async (url, options = {}) => {
  const u = new URL(url), token = options.headers?.Authorization?.slice(7) || '';
  let claims = null; try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); } catch {}
  const quien = claims && {id: claims.sub, email: claims.email, role: claims.app_metadata?.campo_role};
  const q = async (sql, params = []) => (await cloud.authenticated(quien, sql, params)).rows;
  try {
    if (u.pathname === '/rest/v1/atlas_personas') return json(await q('select user_id,nombre,cargo,nivel,area,jefe,pisos,empresa,activo from public.atlas_personas' + (u.searchParams.get('user_id') ? ' where user_id=$1' : ' order by user_id'), u.searchParams.get('user_id') ? [u.searchParams.get('user_id').slice(3)] : []));
    if (u.pathname === '/rest/v1/atlas_metas') return json(await q('select id,version,data from public.atlas_metas order by id limit $1 offset $2', [Number(u.searchParams.get('limit')), Number(u.searchParams.get('offset'))]));
    if (u.pathname === '/rest/v1/atlas_metas_operaciones') return json(await q('select actor,huella,resultado from public.atlas_metas_operaciones where id=$1', [u.searchParams.get('id').slice(3)]));
    if (u.pathname === '/rest/v1/atlas_lp_records' && u.searchParams.get('tipo')) return json(await q('select data from public.atlas_lp_records where tipo=$1 and id=$2', [u.searchParams.get('tipo').slice(3), u.searchParams.get('id').slice(3)]));
    if (u.pathname === '/rest/v1/rpc/guardar_meta_atlas') { const b = JSON.parse(options.body); return json((await q('select public.guardar_meta_atlas($1,$2,$3,$4::jsonb,$5) as r', [b.p_id, b.p_accion, b.p_huella, JSON.stringify(b.p_meta), b.p_expected]))[0].r); }
    if (u.pathname === '/rest/v1/atlas_campo') return json([]);
  } catch (error) { return json({message: error.message, code: error.code}, 400); }
  return cloud.fetchImpl(url, options);
};
const server = await createAtlasServer({env: cloud.env, fetchImpl});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
const metas = async () => (await cloud.db.query('select id,estado,data from public.atlas_metas order by updated_at')).rows;
let pasos = 0;
const paso = async (texto, fn) => { await fn(); pasos++; console.log('✓ ' + texto); };

async function abrir(n, {movil = false} = {}) {
  const context = await browser.newContext(movil ? {viewport: {width: 375, height: 812}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block'} : {viewport: {width: 1366, height: 768}, serviceWorkers: 'block'});
  await context.addInitScript(([token, email]) => { if (!localStorage.getItem('atlas-nube-sesion')) localStorage.setItem('atlas-nube-sesion', JSON.stringify({token, refresh: 'aislado', expira: Date.now() + 36e5, user: {username: email, role: 'editor'}, recordar: true})); }, [tokenFor(actor(n)), correo(n)]);
  const page = await context.newPage(), errores = [];
  page.on('pageerror', e => errores.push(e.message)); page.setDefaultTimeout(20000);
  await page.goto(base + '/?nivel=N-1');
  await page.waitForFunction(() => !document.getElementById('bottomObra')?.disabled);
  return {context, page, errores};
}
const foto = async (page, nombre) => { if (capturas) await page.screenshot({path: capturas + '/' + nombre + '.png'}); };
const conPerfil = page => page.waitForFunction(() => { try { return !!JSON.parse(localStorage.getItem('atlas-jerarquia-perfil'))?.perfil; } catch { return false; } });
const sincronizar = page => page.evaluate(() => window.dispatchEvent(new Event('online')));
const sinAncho = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
// Botones de la libreta y de la barra de marcado que midan menos de 44 px de alto (debe quedar vacío).
const botonesBajos = page => page.$$eval('#hojaFuncion button, #jerMarcado button', b => b.filter(x => x.offsetParent && x.getBoundingClientRect().height < 44).map(x => x.textContent.trim()));
// La barra de marcado va pegada sobre la barra inferior, nada tapa «Listo» y los botones flotantes no están.
const barraDespejada = page => page.evaluate(() => {
  const barra = document.getElementById('jerMarcado').getBoundingClientRect(), inferior = document.querySelector('.bottomNav').getBoundingClientRect();
  const listo = document.querySelector('[data-jer-listo]'), c = listo.getBoundingClientRect();
  return Math.abs(barra.bottom - inferior.top) <= 1 && document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2) === listo && !document.getElementById('barraFunciones').offsetParent;
});
// Centro de un recinto en pantalla, desde el mismo plano que usa Atlas.
const tocarRecinto = async (page, codigo) => {
  const punto = await page.evaluate(codigo => { const p = [...document.querySelectorAll('#polygons path.roomshape')].find(e => e.querySelector('title')?.textContent?.includes(codigo) || e.dataset.code === codigo); if (!p) return null; const b = p.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, codigo);
  assert.ok(punto, 'recinto ' + codigo + ' en el plano');
  await page.mouse.click(punto[0], punto[1]);
};

try {
  // Una cuenta sin perfil: la rueda de siempre, sin libreta.
  await paso('Sin perfil todo sigue igual', async () => {
    const {context, page, errores} = await abrir(30);
    await sincronizar(page); await page.waitForTimeout(2500);
    await page.click('#bottomObra');
    assert.deepEqual(await page.$$eval('.ruedaTarjeta', b => b.map(x => x.dataset.tarjeta)), ['lastplanner', 'recintos', 'protocolos', 'herramientas']);
    assert.equal(await page.locator('.obraContador:not([hidden])').count(), 0);
    assert.deepEqual(errores, []); await context.close();
  });

  const jefe = await abrir(6);
  let codigos;
  await paso('El jefe B recibe su perfil y la libreta en la rueda', async () => {
    await sincronizar(jefe.page); await conPerfil(jefe.page);
    await jefe.page.click('#bottomObra');
    await jefe.page.waitForSelector('.ruedaTarjeta[data-tarjeta=tareas]');
    assert.deepEqual(await jefe.page.$$eval('.ruedaTarjeta', b => b.map(x => x.dataset.tarjeta)), ['tareas', 'lastplanner', 'recintos', 'protocolos', 'herramientas']);
    await foto(jefe.page, 'computador-rueda');
    await jefe.page.click('.ruedaTarjeta[data-tarjeta=tareas]');
    assert.deepEqual(await jefe.page.$$eval('#barraFunciones [data-funcion]', b => b.map(x => x.dataset.funcion)), ['mias', 'asignar', 'equipo']);
  });
  await paso('Asigna al supervisor eligiendo el frente con el selector de superficies', async () => {
    const page = jefe.page;
    await page.click('#barraFunciones [data-funcion=asignar]');
    await page.waitForSelector('.jerPersona');
    assert.deepEqual(await page.$$eval('.jerPersona b', b => b.map(x => x.textContent)), ['Capataz subcontrato (ejemplo)', 'Supervisor piso −1 (ejemplo)'], 'solo sus reportes directos, por nivel y nombre');
    await foto(page, 'computador-asignar-persona');
    await page.click('.jerPersona:has-text("Supervisor piso")');
    await page.fill('[data-jer-campo=titulo]', 'Pavimento de pasillo (ejemplo)');
    await page.click('[data-jer=frente]');
    await page.waitForFunction(() => document.body.classList.contains('lpPicking'));
    await page.waitForFunction(() => !document.querySelector('[data-pick-apply]')?.disabled);
    codigos = await page.evaluate(() => { const vistos = new Set(); return [...document.querySelectorAll('#polygons path.roomshape')].map(p => { const b = p.getBoundingClientRect(); return {b, t: p.querySelector('title')?.textContent || ''}; }).filter(x => x.b.width > 30 && x.b.height > 30 && x.b.x > 300 && x.b.y > 120 && x.b.right < innerWidth - 80 && x.b.bottom < innerHeight - 240 && x.t && !vistos.has(x.t) && vistos.add(x.t)).slice(0, 6).map(x => x.t); });
    let elegidos = 0;
    for (const c of codigos) { if (elegidos >= 2) break; const antes = await page.evaluate(() => document.querySelectorAll('#lpSpatialLayer path').length); await tocarRecinto(page, c); await page.waitForTimeout(150); if (await page.evaluate(() => document.querySelectorAll('#lpSpatialLayer path').length) > antes) elegidos++; }
    assert.equal(elegidos, 2, 'dos recintos reales del piso −1');
    await page.click('[data-pick-apply]');
    await page.waitForFunction(() => !document.body.classList.contains('lpPicking'));
    await page.waitForSelector('.jerFrente small:has-text("2 recintos")');
    await page.fill('[data-jer-campo=fechaLimite]', new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10));
    await foto(page, 'computador-asignar-detalle');
    await page.click('[data-jer=asignar]');
    await page.waitForSelector('.jerListo');
    await sincronizar(page);
    await page.waitForFunction(() => !document.querySelector('.jerCola'), null, {timeout: 30000}).catch(() => {});
    for (let i = 0; i < 40 && !(await metas()).length; i++) await page.waitForTimeout(500);
    const [m] = await metas();
    assert.equal(m.estado, 'asignada'); assert.equal(m.data.asignadaA, id(11)); assert.equal(new Set(m.data.alcances.map(s => s.roomId)).size, 2);
  });

  const sup = await abrir(11, {movil: true});
  await paso('El supervisor ve el contador y abre su libreta con un toque', async () => {
    const page = sup.page;
    await sincronizar(page); await conPerfil(page);
    await page.waitForSelector('.obraContador:not([hidden])');
    assert.equal(await page.textContent('.obraContador'), '1');
    await page.click('#bottomObra');
    assert.deepEqual(await page.$$eval('.ruedaTarjeta', b => b.map(x => x.dataset.tarjeta)), ['tareas', 'recintos', 'protocolos', 'herramientas'], 'sin Last Planner para el nivel 4');
    await foto(page, 'celular-rueda');
    await page.click('.ruedaTarjeta[data-tarjeta=tareas]');
    await page.waitForSelector('.jerTarea');
    assert.match(await page.textContent('.jerTarea'), /Pavimento de pasillo \(ejemplo\)/);
    assert.ok(await sinAncho(page), 'sin desplazamiento horizontal');
    assert.deepEqual(await botonesBajos(page), []);
    await foto(page, 'celular-libreta');
  });
  await paso('En computador la barra de marcado también queda abajo y despejada', async () => {
    const {context, page, errores} = await abrir(11);
    await sincronizar(page); await conPerfil(page);
    await page.click('#bottomObra'); await page.click('.ruedaTarjeta[data-tarjeta=tareas]');
    await page.click('.jerTareaAbrir'); await page.click('[data-jer=marcar]');
    await page.waitForSelector('#jerMarcado:not([hidden])');
    assert.ok(await barraDespejada(page));
    await foto(page, 'computador-marcar-plano');
    await page.click('[data-jer-listo]'); await page.waitForSelector('[data-jer=hecha]');
    assert.deepEqual(errores, []); await context.close();
  });
  await paso('Sin señal marca los recintos en el plano y termina la tarea', async () => {
    const page = sup.page;
    await page.click('.jerTareaAbrir'); await page.waitForSelector('[data-jer=marcar]');
    assert.deepEqual(await botonesBajos(page), []);
    await foto(page, 'celular-tarea');
    await sup.context.setOffline(true);
    await page.click('[data-jer=marcar]');
    await page.waitForSelector('#jerMarcado:not([hidden])');
    assert.ok(await barraDespejada(page));
    assert.equal(await page.locator('#jerTareasLayer path').count(), 2, 'el frente asignado se ve en el plano');
    const m = (await metas())[0];
    for (const roomId of [...new Set(m.data.alcances.map(s => s.roomId))]) {
      const codigo = m.data.alcances.find(s => s.roomId === roomId).code;
      const antes = await page.textContent('.jerMarcadoCuenta b');
      await tocarRecinto(page, codigo);
      await page.waitForFunction(a => document.querySelector('.jerMarcadoCuenta b')?.textContent !== a, antes);
    }
    assert.equal(await page.textContent('.jerMarcadoCuenta b'), '2');
    await foto(page, 'celular-marcar-plano');
    await page.click('[data-jer-listo]');
    await page.waitForSelector('[data-jer=hecha]');
    assert.match(await page.textContent('.jerAvanceGrande b'), /100 %/);
    await page.click('[data-jer=hecha]');
    await page.waitForSelector('.jerCola');
    assert.match(await page.textContent('.jerCola'), /guardados en este equipo/);
    await foto(page, 'celular-sin-senal');
    assert.equal((await metas())[0].estado, 'asignada', 'sin señal no sube nada');
    await sup.context.setOffline(false); await sincronizar(page);
    for (let i = 0; i < 60 && (await metas())[0].estado !== 'hecha'; i++) await page.waitForTimeout(500);
    assert.equal((await metas())[0].estado, 'hecha');
    assert.deepEqual(sup.errores, []);
  });
  await paso('El jefe ve el avance de su equipo y confirma', async () => {
    const page = jefe.page;
    await page.reload(); await page.waitForFunction(() => !document.getElementById('bottomObra')?.disabled);
    await sincronizar(page); await page.waitForSelector('.obraContador:not([hidden])');
    await page.click('#bottomObra'); await page.click('.ruedaTarjeta[data-tarjeta=tareas]');
    await page.click('#barraFunciones [data-funcion=equipo]');
    await page.waitForSelector('[data-jer=confirmar]');
    await foto(page, 'computador-equipo');
    await page.click('[data-jer=pedir][data-tipo=devolver]'); await page.waitForSelector('.jerFormAccion');
    await foto(page, 'computador-devolver');
    await page.click('[data-jer=cancelar]');
    await page.click('[data-jer=confirmar]');
    await page.waitForFunction(() => !document.querySelector('[data-jer=confirmar]'));
    assert.match(await page.textContent('.jerTotal b'), /100 %/);
    await sincronizar(page);
    for (let i = 0; i < 60 && (await metas())[0].estado !== 'confirmada'; i++) await page.waitForTimeout(500);
    assert.equal((await metas())[0].estado, 'confirmada');
    assert.deepEqual(jefe.errores, []);
  });
  await paso('Vista del equipo en celular', async () => {
    const page = (await abrir(6, {movil: true})).page;
    await sincronizar(page); await conPerfil(page);
    await page.click('#bottomObra');
    // Con cinco tarjetas, «Mis tareas» queda a dos giros de Recintos: se gira como al deslizar con el dedo.
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await page.click('.ruedaTarjeta[data-tarjeta=tareas]');
    await page.click('#barraFunciones [data-funcion=equipo]'); await page.waitForSelector('.jerEquipo li');
    assert.ok(await sinAncho(page));
    assert.deepEqual(await botonesBajos(page), []);
    await foto(page, 'celular-equipo');
    // En celular la hoja tapa los botones flotantes: se cierra para cambiar de función.
    await page.click('#hojaCerrar');
    await page.click('#barraFunciones [data-funcion=asignar]'); await page.waitForSelector('.jerPersona');
    await foto(page, 'celular-asignar');
  });
  console.log(`Jerarquía en navegador: ${pasos} recorridos aprobados en 1366 × 768 y 375 × 812.`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); server.close(); await cloud.close(); }
