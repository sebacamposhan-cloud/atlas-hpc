// Rutas /api/jerarquia y tope de permisos en /api/lastplanner, con un Supabase simulado en memoria (sin red ni datos
// reales). La base real (RLS y RPC) la prueba jerarquia-sql-test.mjs con PGlite.
import assert from 'node:assert/strict';
import * as J from './dist/jerarquia-model.mjs';
import * as C from './dist/lastplanner-cycle-model.mjs';
import {createAtlasServer} from './server/groq-server.mjs';
import {huellaMeta} from './server/jerarquia.mjs';

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const fila = (n, nivel, jefe, extra = {}) => ({user_id: id(n), nombre: 'Persona de ejemplo ' + n, cargo: '', nivel, area: 'linea', jefe: jefe ? id(jefe) : null, pisos: [], empresa: null, activo: true, ...extra});
const filas = [fila(2, 1), fila(3, 2, 2), fila(6, 3, 3), fila(11, 4, 6, {pisos: ['N01']}), fila(12, 4, 6)];
const cuentas = {[id(2)]: 'editor', [id(3)]: 'editor', [id(6)]: 'editor', [id(11)]: 'editor', [id(12)]: 'editor', [id(30)]: 'editor', [id(31)]: 'lector'};
const token = n => 'token-' + n;
// Supabase simulado: cuentas, filas de la jerarquía, tareas, recibos y llamadas al RPC.
const nube = {instalado: true, metas: new Map(), recibos: new Map(), llamadas: [], fallaRpc: null};
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});
const fetchImpl = async (url, options = {}) => {
  const u = new URL(url), n = Number((options.headers?.Authorization || '').replace('Bearer token-', '')), quien = id(n);
  if (u.pathname === '/auth/v1/user') return cuentas[quien] ? json({id: quien, email: 'cuenta' + n + '@example.test', app_metadata: {campo_role: cuentas[quien]}}) : json({msg: 'invalid'}, 401);
  if (u.pathname === '/rest/v1/atlas_personas') {
    if (!nube.instalado) return json({code: 'PGRST205', message: 'Could not find the table'}, 404);
    const uno = u.searchParams.get('user_id');
    return json(uno ? filas.filter(f => 'eq.' + f.user_id === uno) : filas);
  }
  if (u.pathname === '/rest/v1/atlas_metas') return nube.instalado ? json(Number(u.searchParams.get('offset')) ? [] : [...nube.metas.values()].map(data => ({id: data.id, version: data.version, data}))) : json({code: 'PGRST205'}, 404);
  if (u.pathname === '/rest/v1/atlas_metas_operaciones') { const r = nube.recibos.get(u.searchParams.get('id').slice(3)); return json(r ? [r] : []); }
  if (u.pathname === '/rest/v1/rpc/guardar_meta_atlas') {
    const b = JSON.parse(options.body); nube.llamadas.push(b);
    if (nube.fallaRpc) return json(nube.fallaRpc, 400);
    nube.metas.set(b.p_meta.id, b.p_meta); const resultado = {id: b.p_meta.id, version: b.p_meta.version, estado: b.p_meta.estado};
    nube.recibos.set(b.p_id, {actor: quien, huella: b.p_huella, resultado}); return json(resultado);
  }
  if (u.pathname === '/rest/v1/atlas_lp_records') return json([]);
  return json({error: 'ruta simulada inexistente ' + u.pathname}, 404);
};
const env = {SUPABASE_URL: 'https://isolated-jer.supabase.co', SUPABASE_ANON_KEY: 'isolated-test-key'};
const server = await createAtlasServer({env, fetchImpl});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const pedir = (n, metodo, ruta, cuerpo, extra = {}) => fetch(base + ruta, {method: metodo, headers: {'X-Campo-Session': token(n), ...(cuerpo ? {'Content-Type': 'application/json'} : {}), ...extra}, ...(cuerpo ? {body: JSON.stringify(cuerpo)} : {})});
const personas = filas.map(J.perfilDesdeFila), actor = n => ({id: id(n), email: 'cuenta' + n + '@example.test', role: 'editor', permissions: J.permisosLastPlanner(personas.find(p => p.id === id(n)), null)});
let pruebas = 0;
try {
  // Sin el SQL de jerarquía todo sigue como hoy: la lectura no falla y Last Planner conserva sus permisos.
  nube.instalado = false;
  assert.deepEqual(await (await pedir(11, 'GET', '/api/jerarquia/metas')).json(), {instalado: false, perfil: null, personas: [], metas: []});
  assert.equal((await (await pedir(11, 'GET', '/api/lastplanner/session')).json()).permissions.length, C.PERMISSIONS.length); pruebas++;
  const m0 = J.crearMeta({asignadaA: id(11), titulo: 'Tarea sin SQL', piso: 'N01'}, actor(6), personas);
  assert.equal((await pedir(6, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'asignar', meta: m0, expected: 0})).status, 503); pruebas++;
  nube.instalado = true;

  const datos = await (await pedir(6, 'GET', '/api/jerarquia/metas')).json();
  assert.equal(datos.instalado, true); assert.equal(datos.perfil.id, id(6)); assert.equal(datos.personas.length, 5); assert.deepEqual(datos.permisos, C.PERMISSIONS); pruebas++;
  assert.deepEqual((await (await pedir(11, 'GET', '/api/lastplanner/session')).json()).permissions, ['execution', 'attendance', 'restriction', 'evidence'], 'tope del nivel 4'); pruebas++;
  assert.equal((await (await pedir(30, 'GET', '/api/lastplanner/session')).json()).permissions.length, C.PERMISSIONS.length, 'sin perfil, como hoy'); pruebas++;
  // El nivel 4 no crea borradores de Last Planner aunque su cuenta sea editora.
  const draft = C.createDraft({actividad: 'Borrador de ejemplo', level: 'N01', responsable: 'Cuenta de ejemplo', inicioPlan: '2026-11-09', finPlan: '2026-11-13', cantidad: 5, unidad: 'm²', recintos: [], alcances: []}, {...actor(11), permissions: null});
  assert.equal((await pedir(11, 'POST', '/api/lastplanner/records', {id: crypto.randomUUID(), action: 'draft', ops: [{table: 'actividades', id: draft.id, data: draft, expectedRemote: 0}]})).status, 403); pruebas++;

  const meta = J.crearMeta({asignadaA: id(11), titulo: 'Pavimento recinto de ejemplo', piso: 'N01'}, actor(6), personas);
  const op = crypto.randomUUID(), cuerpo = {id: op, accion: 'asignar', meta, expected: 0};
  const r = await pedir(6, 'POST', '/api/jerarquia/metas', cuerpo);
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual(nube.llamadas.at(-1), {p_id: op, p_accion: 'asignar', p_huella: huellaMeta('asignar', meta), p_meta: meta, p_expected: 0}); pruebas++;
  assert.equal((await pedir(6, 'POST', '/api/jerarquia/metas', cuerpo)).status, 200); assert.equal(nube.llamadas.length, 1, 'un reintento no vuelve a guardar'); pruebas++;
  assert.equal((await pedir(6, 'POST', '/api/jerarquia/metas', {...cuerpo, meta: {...meta, titulo: 'Otra cosa'}})).status, 409, 'el mismo recibo con otros datos'); pruebas++;

  // El servidor revisa la regla antes de llamar a la base.
  const salto = J.cambiar(null, {...meta, id: crypto.randomUUID(), asignadaA: id(6), asignadaPor: id(2)}, actor(2), 'Asignar tarea');
  const r2 = await pedir(2, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'asignar', meta: salto, expected: 0});
  assert.equal(r2.status, 403); assert.match((await r2.json()).error, /directamente/); pruebas++;
  const piso = J.cambiar(null, {...meta, id: crypto.randomUUID(), piso: 'N02'}, actor(6), 'Asignar tarea');
  assert.equal((await pedir(6, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'asignar', meta: piso, expected: 0})).status, 403); pruebas++;
  const avance = J.marcarAvance(meta, {avanceManual: .5}, actor(11));
  assert.equal((await pedir(11, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'avanzar', meta: avance, expected: 0})).status, 409, 'versión desactualizada'); pruebas++;
  const ajena = {...avance, historial: avance.historial.map((h, i) => i ? {...h, actor: id(12), autor: 'cuenta12@example.test'} : h)};
  assert.equal((await pedir(12, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'avanzar', meta: ajena, expected: 1})).status, 403, 'otra cuenta no marca'); pruebas++;
  const sinPermiso = J.cambiar(meta, {...meta, estado: 'confirmada'}, actor(11), 'Confirmar tarea');
  assert.equal((await pedir(11, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'confirmar', meta: sinPermiso, expected: 1})).status, 403, 'el nivel 4 no confirma'); pruebas++;
  assert.equal((await pedir(11, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'avanzar', meta: avance, expected: 1})).status, 200); pruebas++;
  assert.equal((await pedir(31, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'avanzar', meta: avance, expected: 1})).status, 403, 'cuenta lectora'); pruebas++;
  assert.equal((await pedir(30, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'asignar', meta: J.cambiar(null, {...meta, id: crypto.randomUUID()}, {...actor(30), permissions: null}, 'Asignar tarea'), expected: 0})).status, 403, 'sin perfil no asigna'); pruebas++;
  assert.equal((await pedir(6, 'POST', '/api/jerarquia/metas', {id: 'x', accion: 'asignar', meta, expected: 0})).status, 400); pruebas++;
  assert.equal((await pedir(6, 'POST', '/api/jerarquia/metas', cuerpo, {Origin: 'https://otro.example'})).status, 403); pruebas++;
  assert.equal((await fetch(base + '/api/jerarquia/metas')).status, 401, 'sin sesión'); pruebas++;
  // Errores de la base: conflicto de versión y rechazo de permisos.
  const hecha = J.marcarHecha(avance, actor(11));
  nube.fallaRpc = {code: '40001', message: 'Version conflict'};
  assert.equal((await pedir(11, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'hecha', meta: hecha, expected: 2})).status, 409);
  nube.fallaRpc = {code: 'P0001', message: 'Unauthorized'};
  assert.equal((await pedir(11, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'hecha', meta: hecha, expected: 2})).status, 403); pruebas++;
  nube.fallaRpc = null;
  const sinNube = await createAtlasServer({env: {}, fetchImpl});
  await new Promise(r => sinNube.listen(0, '127.0.0.1', r));
  try { assert.equal((await fetch('http://127.0.0.1:' + sinNube.address().port + '/api/jerarquia/metas', {headers: {'X-Campo-Session': token(6)}})).status, 503); pruebas++; }
  finally { sinNube.close(); }
  console.log(`Jerarquía API: ${pruebas} comprobaciones aprobadas (sin SQL, lectura, tope de Last Planner, recibos, reglas, permisos y errores de la base).`);
} finally { server.close(); }
