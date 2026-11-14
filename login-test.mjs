import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';
import {motivoClaveNueva} from './server/campo.mjs';

// Inicio de sesión de Atlas contra un Supabase simulado: usuario o correo, cookie firmada (recordada o de navegador),
// renovación, cierre, errores sin pistas, límite de intentos y modo de desarrollo sin sesión obligatoria.
const SECRETO = 'isolated-session-secret-0123456789abcdef';
const cuentas = {'mauro@hpc.test': {clave: 'clave-mauro', rol: 'editor', usuario: 'mauro'}, 'seba@hpc.test': {clave: 'clave-seba', rol: 'editor', usuario: 'seba'}, 'sinrol@hpc.test': {clave: 'clave-sinrol', usuario: 'sinrol'}, 'nuevo@hpc.test': {clave: 'temporal-hpc', rol: 'editor', usuario: 'nuevo'}};
const TEMPORAL = 'temporal-hpc', tokens = new Map();
const refrescos = new Map();
let emitidos = 0, rpcInstalada = true, consultasUsuario = 0;
const emitir = email => { const refresh = 'ref-' + ++emitidos; refrescos.set(refresh, email); tokens.set('tok-' + emitidos, email); return Response.json({access_token: 'tok-' + emitidos, refresh_token: refresh, expires_in: 3600, user: {email, app_metadata: cuentas[email].rol ? {campo_role: cuentas[email].rol} : {}, user_metadata: {}}}); };
const supabase = async (url, opts) => {
  const u = new URL(url), b = opts.body ? JSON.parse(opts.body) : {};
  if (u.pathname === '/rest/v1/rpc/atlas_correo_de_usuario') {
    consultasUsuario++;
    if (!rpcInstalada) return Response.json({code: 'PGRST202', message: 'Could not find the function'}, {status: 404});
    const fila = Object.entries(cuentas).find(([, c]) => c.rol && c.usuario === b.p_usuario.trim().toLowerCase());
    return Response.json(fila ? fila[0] : null);
  }
  if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') return cuentas[b.email]?.clave === b.password ? emitir(b.email) : Response.json({error: 'invalid_grant'}, {status: 400});
  if (u.pathname === '/auth/v1/token') { const email = refrescos.get(b.refresh_token); refrescos.delete(b.refresh_token); return email ? emitir(email) : Response.json({error: 'invalid_grant'}, {status: 400}); }
  if (u.pathname === '/auth/v1/logout') return new Response(null, {status: 204});
  if (u.pathname === '/auth/v1/user' && opts.method === 'PUT') {
    const email = tokens.get(String(opts.headers.Authorization).replace('Bearer ', ''));
    if (!email) return Response.json({error_code: 'bad_jwt'}, {status: 401});
    if (b.password === 'debil12345') return Response.json({error_code: 'weak_password', msg: 'Password is known to be weak'}, {status: 422});
    if (b.password === cuentas[email].clave) return Response.json({error_code: 'same_password'}, {status: 422});
    cuentas[email].clave = b.password; return Response.json({email});
  }
  return Response.json({message: 'ruta simulada inexistente'}, {status: 404});
};

const levantar = async env => { const s = await createAtlasServer({env, fetchImpl: supabase}); await new Promise(r => s.listen(0, '127.0.0.1', r)); return s; };
const server = await levantar({ATLAS_SESSION_SECRET: SECRETO, SUPABASE_URL: 'https://demo-atlas.supabase.co', SUPABASE_ANON_KEY: 'anon-servidor', ATLAS_CLAVE_TEMPORAL: TEMPORAL});
const base = 'http://127.0.0.1:' + server.address().port;
const post = (ruta, body, headers = {}) => fetch(base + ruta, {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body)});
const entrar = (username, password, extra = {}, headers) => post('/api/campo/login', {username, password, ...extra}, headers);
const cookies = r => r.headers.getSetCookie();
const sesionDe = r => cookies(r).find(c => c.startsWith('atlas_sesion='));
const comoCookie = r => cookies(r).map(c => c.split(';')[0]).filter(c => !c.endsWith('=')).join('; ');

try {
  // 1. Con usuario y con correo (sin importar mayúsculas ni espacios); la cookie es HttpOnly y recordada 30 días.
  let r = await entrar('  Mauro ', 'clave-mauro');
  assert.equal(r.status, 200);
  const login = await r.json();
  assert.equal(login.user.username, 'mauro@hpc.test');
  assert.equal(login.recordar, true);
  assert.match(sesionDe(r), /; HttpOnly/);
  assert.match(sesionDe(r), /; Max-Age=2592000/);
  assert.match(sesionDe(r), /; SameSite=Lax/);
  assert.doesNotMatch(sesionDe(r), /; Secure/, 'sin HTTPS local no se marca Secure');
  const galleta = comoCookie(r);
  assert.equal((await fetch(base + '/', {headers: {Cookie: galleta}})).status, 200);
  assert.deepEqual(await (await fetch(base + '/api/sesion', {headers: {Cookie: galleta}})).json(), {activa: true, usuario: 'mauro@hpc.test', rol: 'editor'});
  r = await entrar('SEBA@hpc.test', 'clave-seba');
  assert.equal(r.status, 200, 'el correo también sirve');
  const consultasAntes = consultasUsuario;
  await entrar('seba@hpc.test', 'clave-seba');
  assert.equal(consultasUsuario, consultasAntes, 'con correo no se consulta el usuario');

  // 2. Sin «Recordar»: cookie de navegador (sin Max-Age) y la marca atlas_activa que lee la página; detrás de HTTPS, Secure.
  r = await entrar('seba', 'clave-seba', {recordar: false}, {'X-Forwarded-Proto': 'https'});
  assert.equal(r.status, 200);
  assert.equal((await r.json()).recordar, false);
  assert.doesNotMatch(sesionDe(r), /Max-Age/);
  assert.match(sesionDe(r), /; Secure/);
  assert(cookies(r).some(c => /^atlas_activa=1;/.test(c) && !/HttpOnly/.test(c)));

  // 3. Errores: usuario inexistente y clave errónea responden igual; cuenta sin rol, 403; sin datos, 400.
  const malUsuario = await entrar('nadie', 'x'), malaClave = await entrar('mauro', 'equivocada');
  assert.equal(malUsuario.status, 401); assert.equal(malaClave.status, 401);
  assert.deepEqual(await malUsuario.json(), await malaClave.json());
  assert(!sesionDe(malaClave), 'sin sesión no hay cookie');
  assert.equal((await entrar('sinrol', 'clave-sinrol')).status, 401, 'la función solo traduce cuentas con rol');
  assert.equal((await entrar('sinrol@hpc.test', 'clave-sinrol')).status, 403);
  assert.equal((await entrar(' ', 'x')).status, 400);
  assert.equal((await entrar('mauro', '')).status, 400);

  // 4. Límite: 10 intentos fallidos por usuario en 15 minutos; otra persona sigue entrando.
  for (let i = 0; i < 10; i++) await entrar('intruso', 'x');
  assert.equal((await entrar('intruso', 'x')).status, 429);
  assert.equal((await entrar('mauro', 'clave-mauro')).status, 200);

  // 5. Renovar la sesión de Supabase renueva la cookie con la misma duración; cerrar sesión la borra.
  r = await post('/api/campo/refresh', {refresh: login.refresh, recordar: true});
  assert.equal(r.status, 200);
  assert.match(sesionDe(r), /Max-Age=2592000/);
  const renovada = await r.json();
  assert.equal((await post('/api/campo/refresh', {refresh: login.refresh})).status, 401, 'el refresh se usa una vez');
  r = await post('/api/campo/logout', {}, {Cookie: galleta, 'X-Campo-Session': renovada.token});
  assert.equal(r.status, 200);
  assert(cookies(r).some(c => /^atlas_sesion=;.*Max-Age=0/.test(c)));
  assert.equal((await post('/api/campo/logout', {})).status, 200, 'cerrar sesión sin sesión no falla');

  // 6. Sin la función SQL, el usuario avisa que falta; el correo sigue funcionando.
  rpcInstalada = false;
  r = await entrar('mauro', 'clave-mauro');
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /login-usuario\.sql/);
  assert.equal((await entrar('mauro@hpc.test', 'clave-mauro')).status, 200);
  rpcInstalada = true;

  // 7. La página de inicio de sesión vuelve a la dirección pedida; la portada sin sesión redirige.
  const pagina = await fetch(base + '/proyectos/?nivel=N02', {redirect: 'manual', headers: {Accept: 'text/html,application/xhtml+xml'}});
  assert.equal(pagina.status, 302);
  assert.equal(pagina.headers.get('location'), '/login.html?next=%2Fproyectos%2F%3Fnivel%3DN02');
  const html = await (await fetch(base + '/login.html')).text();
  assert(html.includes('autocomplete="username"') && html.includes('Recordar mi sesión') && html.includes('¿Olvidaste tu contraseña?'));
  const indice = await (await fetch(base + '/', {headers: {Cookie: galleta}})).text();
  assert(indice.indexOf('<script') > 0 && indice.indexOf('<script') === indice.indexOf('<script src="sesion-guardia.js"></script>'), 'la guardia es el primer script de la portada');
  assert(!indice.includes('nubeOpen'));
  assert(html.includes('id="cambio"') && html.includes('autocomplete="new-password"') && html.includes('Guardar contraseña'));

  // 9. Primer ingreso con la contraseña temporal: sin sesión ni cookie ni tokens hasta elegir una personal.
  r = await entrar('nuevo', TEMPORAL);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {cambiarClave: true});
  assert(!sesionDe(r), 'con la temporal no hay cookie');
  const cambiar = (username, password, nueva, extra = {}) => post('/api/campo/clave', {username, password, nueva, ...extra});
  assert.match((await (await cambiar('nuevo', TEMPORAL, 'corta')).json()).error, /al menos 8/);
  assert.match((await (await cambiar('nuevo', TEMPORAL, TEMPORAL)).json()).error, /distinta/);
  assert.equal((await cambiar('nuevo', 'otra-cosa-x', 'personal-2026')).status, 401);
  assert.match((await (await cambiar('nuevo', 'otra-cosa-x', 'personal-2026')).json()).error, /actual no es correcta/);
  r = await cambiar('nuevo', TEMPORAL, 'debil12345');
  assert.equal(r.status, 400); assert.match((await r.json()).error, /débil/);
  r = await cambiar('nuevo', TEMPORAL, 'personal-2026', {recordar: false});
  assert.equal(r.status, 200, 'la ruta es pública: no pide la cookie');
  const cambiada = await r.json();
  assert.equal(cambiada.user.username, 'nuevo@hpc.test'); assert.equal(cambiada.recordar, false); assert(cambiada.token);
  assert(sesionDe(r) && !/Max-Age/.test(sesionDe(r)), 'abre la sesión con la duración elegida');
  assert.equal((await entrar('nuevo', TEMPORAL)).status, 401, 'la temporal ya no sirve');
  r = await entrar('nuevo@hpc.test', 'personal-2026');
  assert.equal(r.status, 200); assert(!(await r.json()).cambiarClave); assert(sesionDe(r));

  // 10. Cambio voluntario desde la cabecera: pide la actual y devuelve una sesión nueva.
  r = await cambiar('seba', 'clave-seba', 'seba-nueva-2026');
  assert.equal(r.status, 200); assert.equal((await r.json()).recordar, true); assert.match(sesionDe(r), /Max-Age=2592000/);
  assert.equal((await entrar('seba', 'clave-seba')).status, 401);
  assert.equal((await entrar('seba', 'seba-nueva-2026')).status, 200);
  assert.equal((await cambiar('sinrol@hpc.test', 'clave-sinrol', 'otra-clave-123')).status, 403, 'sin rol no cambia nada');
  assert.equal(cuentas['sinrol@hpc.test'].clave, 'clave-sinrol');
  assert.equal((await post('/api/campo/clave', {username: 'seba', password: 'x'})).status, 400);
} finally {
  server.closeAllConnections(); await new Promise(r => server.close(r));
}

// 8. Desarrollo local sin ATLAS_SESSION_SECRET: sin sesión obligatoria y la página lo sabe (atlas_sin_login).
const local = await levantar({});
try {
  const r = await fetch('http://127.0.0.1:' + local.address().port + '/');
  assert.equal(r.status, 200);
  assert(r.headers.getSetCookie().some(c => c.startsWith('atlas_sin_login=1;')));
} finally {
  local.closeAllConnections(); await new Promise(r => local.close(r));
}
// 11. Reglas de la contraseña nueva.
assert.equal(motivoClaveNueva('buena-clave', 'otra'), '');
assert.match(motivoClaveNueva('1234567', 'x'), /al menos 8/);
assert.match(motivoClaveNueva('x'.repeat(73), 'y'), /larga/);
assert.match(motivoClaveNueva('ñ'.repeat(40), 'y'), /larga/, 'el límite es en bytes');
assert.match(motivoClaveNueva('igual-igual', 'igual-igual'), /distinta/);
assert.match(motivoClaveNueva('temporal-1', 'x', 'temporal-1'), /temporal/);
assert.match(motivoClaveNueva('         ', 'x'), /espacios/);
console.log('Login: usuario o correo, errores sin pistas, límite por usuario, cookie firmada recordada o de navegador, renovación, cierre, redirección, primer ingreso con contraseña temporal, cambio de contraseña y modo local validados (Supabase simulado; SQL real no ejercitado).');
