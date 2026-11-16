import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';
import fs from 'node:fs';
import {canonico, huella, paqueteProyecto, paqueteObservacion, fusionarObservacion, copiaProyecto, crearSincronizador, idAvance, paqueteAvance, fusionarAvance} from './dist/nube-sync.mjs';
import {newMarking, validateMarking, addMarkedRoom} from './dist/marking-model.mjs';
import {nuevaObservacion, validarObservacion, cambiarEstado, entrada} from './dist/observaciones-model.mjs';

// Nube de proyectos y observaciones: servidor /api/campo contra un Supabase simulado en memoria y dos equipos que sincronizan.
// No ejercita el SQL real ni IndexedDB; sí el reenvío del servidor, los permisos, el control de versión y la sincronización.

// 1. Huellas: no dependen del orden de las claves (jsonb las reordena) ni de la versión local.
assert.equal(canonico({b: 1, a: [2, {d: undefined, c: 3}]}), '{"a":[2,{"c":3}],"b":1}');
const source = {code: 'HPC-ARQ-PLA-N01-A-501', revision: 'Rev01_V3'}, sala = {id: 'r1', code: '5.1-1', name: 'Sala 1'}, pasillo = {id: 'r2', code: '5.1-2', name: 'Pasillo'};
const proyecto = newMarking({name: 'Pisos vinílicos', author: 'Mauro', purpose: 'Levantamiento de vinílicos instalados'}, 'N01', 'proy-1', '2026-10-28T10:00:00.000Z');
assert.equal(huella(paqueteProyecto(proyecto)), huella(paqueteProyecto({...proyecto, version: 9})));
assert.notEqual(huella(paqueteProyecto(proyecto)), huella(paqueteProyecto({...proyecto, name: 'Otro'})));
const copia = validateMarking(copiaProyecto({...proyecto, name: 'x'.repeat(160)}, 'proy-2', '2026-10-28T11:00:00.000Z'));
assert(copia.name.endsWith(' (copia de este equipo)') && copia.name.length <= 160 && copia.version === 1);

// 2. Supabase simulado: Auth con roles, tabla con versión (40001 si cambió), Storage sin reemplazos y jsonb que reordena claves.
const cuentas = {'editor@hpc.test': {clave: 'clave-editor', rol: 'editor'}, 'otro@hpc.test': {clave: 'clave-otro', rol: 'editor'}, 'lector@hpc.test': {clave: 'clave-lector', rol: 'lector'}, 'pagos@hpc.test': {clave: 'clave-pagos'}};
const sesiones = new Map(), refrescos = new Map(), filas = new Map(), objetos = new Map();
let reloj = Date.parse('2026-10-28T12:00:00Z'), emitidos = 0;
const instante = () => new Date(reloj += 1000).toISOString().replace('Z', '+00:00');
const reordenar = v => Array.isArray(v) ? v.map(reordenar) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reordenar(v[k])])) : v;
const emitir = email => { const token = 'tok-' + ++emitidos, refresh = 'ref-' + emitidos; sesiones.set(token, email); refrescos.set(refresh, email); return Response.json({access_token: token, refresh_token: refresh, expires_in: 3600, user: {email, app_metadata: cuentas[email].rol ? {campo_role: cuentas[email].rol} : {}}}); };
const supabase = async (url, opts) => {
  const u = new URL(url), email = sesiones.get(opts.headers.Authorization.slice(7)), rol = cuentas[email]?.rol;
  assert.equal(opts.headers.apikey, 'anon-publica');
  if (u.pathname === '/auth/v1/token') {
    const b = JSON.parse(opts.body);
    if (u.searchParams.get('grant_type') === 'password') return cuentas[b.email]?.clave === b.password ? emitir(b.email) : Response.json({error: 'invalid_grant'}, {status: 400});
    const dueño = refrescos.get(b.refresh_token); refrescos.delete(b.refresh_token);
    return dueño ? emitir(dueño) : Response.json({error: 'invalid_grant'}, {status: 400});
  }
  if (u.pathname === '/auth/v1/logout') { sesiones.delete(opts.headers.Authorization.slice(7)); return new Response(null, {status: 204}); }
  if (!email) return Response.json({code: 'PGRST301', message: 'JWT expired', statusCode: '401', error: 'InvalidJWT'}, {status: u.pathname.startsWith('/storage') ? 400 : 401});
  if (u.pathname === '/rest/v1/atlas_campo') {
    const q = u.searchParams, desde = q.get('updated_at')?.replace('gte.', ''), tipo = q.get('tipo')?.replace('eq.', ''), id = q.get('id')?.replace('eq.', '');
    const lista = [...filas.values()].filter(f => (!desde || Date.parse(f.updated_at) >= Date.parse(desde)) && (!tipo || f.tipo === tipo) && (!id || f.id === id)).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    return Response.json(rol ? lista.slice(Number(q.get('offset') || 0), Number(q.get('offset') || 0) + Number(q.get('limit') || 1000)) : []);
  }
  if (u.pathname === '/rest/v1/rpc/guardar_atlas_campo') {
    const b = JSON.parse(opts.body), clave = b.p_tipo + ':' + b.p_id, previa = filas.get(clave);
    if (rol !== 'editor') return Response.json({code: 'P0001', message: 'Unauthorized'}, {status: 400});
    if ((previa?.version || 0) !== b.p_version) return Response.json({code: '40001', message: 'Version conflict'}, {status: 500});
    const fila = {tipo: b.p_tipo, id: b.p_id, version: (previa?.version || 0) + 1, data: reordenar(b.p_data), updated_at: instante(), updated_by: email};
    filas.set(clave, fila);
    return Response.json({tipo: fila.tipo, id: fila.id, version: fila.version, updated_at: fila.updated_at, updated_by: email});
  }
  const subir = u.pathname.match(/^\/storage\/v1\/object\/atlas-campo\/(fotos\/.+)$/), bajar = u.pathname.match(/^\/storage\/v1\/object\/authenticated\/atlas-campo\/(fotos\/.+)$/);
  if (subir) {
    assert.equal(opts.headers['Content-Type'], 'image/jpeg');
    if (rol !== 'editor') return Response.json({statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy'}, {status: 400});
    if (objetos.has(subir[1])) return Response.json({statusCode: '409', error: 'Duplicate', message: 'The resource already exists'}, {status: 400});
    objetos.set(subir[1], Buffer.from(opts.body)); return Response.json({Key: 'atlas-campo/' + subir[1]});
  }
  if (bajar) return objetos.has(bajar[1]) ? new Response(objetos.get(bajar[1]), {headers: {'Content-Type': 'image/jpeg'}}) : Response.json({statusCode: '404', error: 'not_found', message: 'Object not found'}, {status: 400});
  return Response.json({message: 'ruta simulada inexistente'}, {status: 404});
};

const server = await createAtlasServer({env: {SUPABASE_URL: 'https://demo-atlas.supabase.co', SUPABASE_ANON_KEY: 'anon-publica'}, fetchImpl: supabase});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const pedir = (ruta, {method = 'GET', body, token, tipo, origin} = {}) => fetch(base + ruta, {method, headers: {...(token ? {'X-Campo-Session': token} : {}), ...(body != null ? {'Content-Type': tipo || 'application/json'} : {}), ...(origin ? {Origin: origin} : {})}, ...(body != null ? {body: tipo ? body : JSON.stringify(body)} : {})});
const entrar = async (username, password) => pedir('/api/campo/login', {method: 'POST', body: {username, password}});
const jpeg = n => { const b = new Uint8Array(64 + n); b.set([0xff, 0xd8, 0xff, 0xe0]); for (let i = 4; i < b.length; i++) b[i] = (i * 31 + n) % 256; return b.buffer; };

// Equipo simulado: mismos adaptadores que nube.mjs pero en memoria (proyectos, observaciones, historial, fotos y lo sincronizado).
function equipo() {
  const proyectos = new Map(), observaciones = new Map(), historial = new Map(), fotos = new Map(), registros = new Map(), fotosListas = new Set(), avisos = [], avances = new Map();
  let desde = null, sesion = null;
  const local = {
    proyectos: async () => [...proyectos.values()].map(d => structuredClone(d)),
    escribirProyecto: async doc => { const next = validateMarking({...structuredClone(doc), version: (proyectos.get(doc.id)?.version || 0) + 1}); proyectos.set(doc.id, next); return structuredClone(next); },
    crearProyecto: async doc => { assert(!proyectos.has(doc.id)); proyectos.set(doc.id, validateMarking(structuredClone(doc))); return doc; },
    observaciones: async () => [...observaciones.values()].map(o => ({obs: structuredClone(o), historial: [...historial.values()].filter(h => h.obsId === o.id)})),
    escribirObservacion: async (obs, hist) => { const next = validarObservacion({...structuredClone(obs), version: (observaciones.get(obs.id)?.version || 0) + 1}); observaciones.set(obs.id, next); for (const h of hist) historial.set(h.id, structuredClone(h)); return structuredClone(next); },
    idsFotos: async () => new Set(fotos.keys()),
    leerFoto: async id => fotos.get(id),
    guardarFoto: async f => { fotos.set(f.id, f); },
    avances: async () => [...avances.values()].map(a => structuredClone(a)),
    escribirAvance: async a => { const next = {...structuredClone(a), version: (avances.get(a.key)?.version || 0) + 1}; avances.set(a.key, next); return structuredClone(next); },
  };
  const meta = {leer: async k => registros.get(k), escribir: async (k, v) => { registros.set(k, {...v}); }, fotoLista: async id => fotosListas.has(id), marcarFoto: async id => { fotosListas.add(id); }, desde: async () => desde, guardarDesde: async v => { desde = v; }};
  const api = async (method, ruta, cuerpo, {tipo, binario} = {}) => {
    const r = await pedir(ruta, {method, body: cuerpo, token: sesion.token, tipo});
    if (r.ok) return binario ? r.arrayBuffer() : r.json();
    const data = await r.json().catch(() => null);
    throw Object.assign(Error(data?.error), {status: r.status, data});
  };
  const sincronizar = crearSincronizador({api, local, meta, avisar: m => avisos.push(m), nuevoId: () => 'copia-' + Math.random().toString(36).slice(2, 10)});
  return {proyectos, observaciones, historial, fotos, avisos, avances,
    entrar: async (u, p) => { const r = await entrar(u, p); assert.equal(r.status, 200); sesion = await r.json(); },
    sync: () => sincronizar(sesion.user.role)};
}
const sinVersion = ({version, ...resto}) => resto;
const pintar = (doc, room) => ({...addMarkedRoom(doc, room, source, doc.estados[0].id), updatedAt: new Date(reloj += 1000).toISOString(), version: doc.version + 1});

try {
  // 3. Servidor: sesión obligatoria, origen propio, cuentas sin campo_role rechazadas, refresh que rota, validaciones.
  assert.equal((await pedir('/api/campo')).status, 401);
  assert.equal((await entrar('editor@hpc.test', 'equivocada')).status, 401);
  assert.equal((await entrar('pagos@hpc.test', 'clave-pagos')).status, 403);
  const login = await (await entrar('editor@hpc.test', 'clave-editor')).json();
  assert.deepEqual(login.user, {username: 'editor@hpc.test', role: 'editor'});
  assert(login.token && login.refresh && login.expiraEn === 3600);
  assert.equal((await pedir('/api/campo', {token: login.token, origin: 'https://otro.invalid'})).status, 403);
  assert.equal((await pedir('/api/campo?desde=ayer', {token: login.token})).status, 400);
  assert.equal((await pedir('/api/campo', {token: 'tok-vencido'})).status, 401);
  const renovada = await (await pedir('/api/campo/refresh', {method: 'POST', body: {refresh: login.refresh}})).json();
  assert(renovada.token !== login.token && renovada.user.role === 'editor');
  assert.equal((await pedir('/api/campo/refresh', {method: 'POST', body: {refresh: login.refresh}})).status, 401, 'el refresh token se usa una sola vez');
  assert.equal((await pedir('/api/campo', {method: 'POST', token: login.token, body: {tipo: 'otro', id: 'x', version: 0, data: {}}})).status, 400);
  assert.equal((await pedir('/api/campo', {method: 'POST', token: login.token, body: {tipo: 'proyecto', id: '../x', version: 0, data: {}}})).status, 400);
  const fotoId = '11111111-2222-4333-8444-555555555555';
  assert.equal((await pedir('/api/campo/fotos/' + fotoId, {method: 'PUT', token: login.token, body: new Uint8Array([1, 2, 3, 4]), tipo: 'image/jpeg'})).status, 400);
  assert.equal((await pedir('/api/campo/fotos/' + fotoId, {method: 'PUT', token: login.token, body: new Uint8Array(jpeg(1)), tipo: 'image/png'})).status, 415);
  assert.equal((await pedir('/api/campo/fotos/no-es-uuid', {token: login.token})).status, 404);
  assert.equal((await pedir('/api/campo/fotos/' + fotoId, {token: login.token})).status, 404);

  // 4. El equipo A sube un proyecto y una observación con foto; el equipo B (otra cuenta) los baja con la foto.
  const A = equipo(), B = equipo();
  await A.entrar('editor@hpc.test', 'clave-editor'); await B.entrar('otro@hpc.test', 'clave-otro');
  A.proyectos.set(proyecto.id, pintar(proyecto, sala));
  const obs = nuevaObservacion({descripcion: 'Vinílico levantado en el umbral', categoria: 'Pavimento', autor: 'Mauro'}, sala, source, 'N01', 'obs-1', '2026-10-28T10:05:00.000Z');
  const fotoA = {id: '0a0a0a0a-1111-4222-8333-444444444444', obsId: obs.id, tipo: 'antes', at: obs.creada, autor: 'Mauro', mime: 'image/jpeg', ancho: 1600, alto: 1200, bytes: 192, datos: jpeg(128), mini: jpeg(16)};
  A.observaciones.set(obs.id, {...obs, version: 2, fotos: [{id: fotoA.id, tipo: 'antes', at: fotoA.at, autor: 'Mauro'}]});
  A.fotos.set(fotoA.id, fotoA);
  const h1 = entrada(obs.id, 'Mauro', 'creada', 'Observación registrada', '', obs.creada, 'h-1'); A.historial.set(h1.id, h1);
  let r = await A.sync();
  assert.deepEqual([r.subidos, r.fotosSubidas, r.bajados, r.errores], [2, 1, 0, 0]);
  assert.equal(objetos.size, 2, 'foto grande y miniatura en Storage');
  r = await B.sync();
  assert.deepEqual([r.bajados, r.fotosBajadas, r.subidos, r.errores], [2, 1, 0, 0]);
  assert.deepEqual(sinVersion(B.proyectos.get(proyecto.id)), sinVersion(A.proyectos.get(proyecto.id)));
  assert.deepEqual(sinVersion(B.observaciones.get(obs.id)), sinVersion(A.observaciones.get(obs.id)));
  assert.deepEqual(new Uint8Array(B.fotos.get(fotoA.id).datos), new Uint8Array(fotoA.datos));
  assert.deepEqual(B.historial.get('h-1'), h1);
  r = await A.sync();
  assert.deepEqual([r.subidos, r.bajados, r.fotosSubidas], [0, 0, 0], 'lo propio que vuelve de la nube no se repite');

  // 5. B pinta otro recinto; A lo recibe.
  B.proyectos.set(proyecto.id, pintar(B.proyectos.get(proyecto.id), pasillo));
  assert.equal((await B.sync()).subidos, 1);
  assert.equal((await A.sync()).bajados, 1);
  assert.deepEqual(A.proyectos.get(proyecto.id).rooms.map(x => x.id), ['r1', 'r2']);

  // 6. El mismo proyecto cambia en los dos equipos: lo de B queda como copia y nada se pierde.
  A.proyectos.set(proyecto.id, {...A.proyectos.get(proyecto.id), purpose: 'Avance de vinílicos de octubre', version: A.proyectos.get(proyecto.id).version + 1});
  B.proyectos.set(proyecto.id, {...B.proyectos.get(proyecto.id), purpose: 'Avance de vinílicos según B', version: B.proyectos.get(proyecto.id).version + 1});
  assert.equal((await A.sync()).subidos, 1);
  r = await B.sync();
  assert.equal(r.conflictos, 1);
  const copiaB = [...B.proyectos.values()].find(d => d.name.endsWith('(copia de este equipo)'));
  assert.equal(copiaB.purpose, 'Avance de vinílicos según B');
  assert.equal(B.proyectos.get(proyecto.id).purpose, 'Avance de vinílicos de octubre');
  assert.match(B.avisos.at(-1), /quedó como «Pisos vinílicos \(copia de este equipo\)»/);
  assert.equal((await A.sync()).bajados, 1);
  assert.equal(A.proyectos.size, 2);

  // 7. La misma observación cambia en los dos equipos: se juntan historial y fotos; los datos son de la última actualización.
  const enA = cambiarEstado(A.observaciones.get(obs.id), 'En corrección', {autor: 'Mauro', comentario: 'Subcontrato avisado', at: '2026-10-28T13:00:00.000Z'});
  A.observaciones.set(obs.id, enA.observacion); A.historial.set(enA.historial.id, enA.historial);
  const fotoB = {...fotoA, id: '0b0b0b0b-1111-4222-8333-444444444444', tipo: 'despues', at: '2026-10-28T12:30:00.000Z', autor: 'Seba', datos: jpeg(200), mini: jpeg(20)};
  const previaB = B.observaciones.get(obs.id), hB = entrada(obs.id, 'Seba', 'fotos', '1 foto agregada', '', fotoB.at, 'h-b');
  B.observaciones.set(obs.id, {...previaB, fotos: [...previaB.fotos, {id: fotoB.id, tipo: 'despues', at: fotoB.at, autor: 'Seba'}], actualizada: fotoB.at, version: previaB.version + 1});
  B.fotos.set(fotoB.id, fotoB); B.historial.set(hB.id, hB);
  assert.equal((await A.sync()).subidos, 1);
  r = await B.sync();
  assert.equal(r.conflictos, 1);
  const unida = B.observaciones.get(obs.id);
  assert.equal(unida.estado, 'En corrección', 'gana la actualización más reciente (A, 13:00)');
  assert.deepEqual(unida.fotos.map(f => f.id), [fotoA.id, fotoB.id]);
  assert.deepEqual([...B.historial.values()].filter(h => h.obsId === obs.id).map(h => h.id).sort(), ['h-1', 'h-b', enA.historial.id].sort());
  r = await A.sync();
  assert.deepEqual([r.bajados, r.fotosBajadas], [1, 1]);
  assert.deepEqual(sinVersion(A.observaciones.get(obs.id)), sinVersion(unida));
  assert.deepEqual(new Uint8Array(A.fotos.get(fotoB.id).datos), new Uint8Array(fotoB.datos));
  assert.equal(huella(paqueteObservacion(A.observaciones.get(obs.id), [...A.historial.values()])), huella(paqueteObservacion(unida, [...B.historial.values()])));

  // 8. Cuenta de solo lectura: baja todo, no sube sus cambios y el servidor rechaza sus escrituras.
  const C = equipo(); await C.entrar('lector@hpc.test', 'clave-lector');
  r = await C.sync();
  assert.deepEqual([r.bajados, r.fotosBajadas, r.subidos], [3, 2, 0]);
  C.proyectos.set(proyecto.id, pintar(C.proyectos.get(proyecto.id), {id: 'r3', code: '5.1-3', name: 'Bodega'}));
  assert.equal((await C.sync()).subidos, 0);
  const lector = await (await entrar('lector@hpc.test', 'clave-lector')).json();
  assert.equal((await pedir('/api/campo', {method: 'POST', token: lector.token, body: {tipo: 'proyecto', id: proyecto.id, version: 99, data: {doc: {id: proyecto.id}}}})).status, 403);
  assert.equal((await pedir('/api/campo/fotos/' + fotoId, {method: 'PUT', token: lector.token, body: new Uint8Array(jpeg(3)), tipo: 'image/jpeg'})).status, 403);

  // 9. Fusión directa: el historial no se duplica y el máximo de fotos se respeta.
  const f = fusionarObservacion(paqueteObservacion(unida, [h1, hB]), paqueteObservacion(unida, [hB, h1]));
  assert.deepEqual(f.historial.map(h => h.id), ['h-1', 'h-b']);

  // 10. Avance por recinto (rombo, ficha y pincel de proyectos de partida): lo marcado en un equipo llega al otro.
  const clave = 'N02|5.1-1', idA = idAvance(clave);
  assert.match(idA, /^[A-Za-z0-9_-]{1,100}$/);
  assert.equal(idA, 'av_N02_007c5_002e1-1');
  assert.notEqual(idAvance('N02|5_1'), idAvance('N02|5.1'), 'el «_» también se codifica: no hay choques');
  const etapas = (a, b) => [{nombre: 'Estructura', pct: a}, {nombre: 'Tapado', pct: b}];
  const marca = (registro, id, partida, at) => ({...registro, at, version: registro.version + 1, partidas: {...registro.partidas, [id]: {...partida, at}}});
  const base10 = {key: clave, code: '5.1-1', level: 'N02', version: 1, at: '2026-11-16T10:00:00.000Z', responsable: 'Mauro', fecha: '2026-11-16', protocolos: {},
    partidas: {'5.1.1': {ejecucion: 'En ejecución', pct: 50, etapas: etapas(1, 0), at: '2026-11-16T10:00:00.000Z'}}};
  assert.equal(huella(paqueteAvance(base10)), huella(paqueteAvance({...base10, version: 7})));
  A.avances.set(clave, base10);
  r = await A.sync();
  assert.deepEqual([r.subidos, r.errores], [1, 0]);
  assert.equal(filas.get('avance:' + idA).data.registro.code, '5.1-1');
  r = await B.sync();
  assert.deepEqual([r.bajados, r.errores], [1, 0]);
  assert.deepEqual(sinVersion(B.avances.get(clave)), sinVersion(base10));
  assert.deepEqual([(await A.sync()).subidos, (await B.sync()).subidos], [0, 0], 'lo bajado no se vuelve a subir');

  // Partidas distintas del mismo recinto en los dos equipos: se juntan las dos.
  A.avances.set(clave, marca(A.avances.get(clave), '5.1.1', {ejecucion: 'Instalado', pct: 100, etapas: etapas(1, 1)}, '2026-11-16T11:00:00.000Z'));
  B.avances.set(clave, marca(B.avances.get(clave), '6.1.1', {ejecucion: 'En ejecución', pct: 30}, '2026-11-16T11:30:00.000Z'));
  assert.equal((await A.sync()).subidos, 1);
  r = await B.sync();
  assert.deepEqual([r.conflictos, r.subidos], [1, 1]);
  assert.match(B.avisos.at(-1), /avance de 5\.1-1 también cambió/);
  assert.deepEqual(Object.keys(B.avances.get(clave).partidas).sort(), ['5.1.1', '6.1.1']);
  assert.equal(B.avances.get(clave).partidas['5.1.1'].ejecucion, 'Instalado');
  assert.equal((await A.sync()).bajados, 1);
  assert.deepEqual(sinVersion(A.avances.get(clave)), sinVersion(B.avances.get(clave)));

  // La misma partida en los dos: queda la marcada más tarde, aunque ese equipo sincronice último o primero.
  B.avances.set(clave, marca(B.avances.get(clave), '6.1.1', {ejecucion: 'Instalado', pct: 100}, '2026-11-16T12:05:00.000Z'));
  A.avances.set(clave, marca(A.avances.get(clave), '6.1.1', {ejecucion: 'En ejecución', pct: 60}, '2026-11-16T12:00:00.000Z'));
  assert.equal((await B.sync()).subidos, 1);
  assert.equal((await A.sync()).conflictos, 1);
  assert.equal(A.avances.get(clave).partidas['6.1.1'].ejecucion, 'Instalado');
  await B.sync();
  assert.deepEqual(sinVersion(B.avances.get(clave)), sinVersion(A.avances.get(clave)));
  assert.deepEqual(fusionarAvance({...base10, protocolos: {P1: {estado: 'Liberado'}}}, {...base10, at: '2026-11-16T09:00:00.000Z'}).protocolos, {P1: {estado: 'Liberado'}});

  // Cuenta de solo lectura: ve el avance de los demás y no sube el suyo.
  r = await C.sync();
  assert.equal(C.avances.get(clave).partidas['6.1.1'].ejecucion, 'Instalado');
  C.avances.set(clave, marca(C.avances.get(clave), '5.3.1', {ejecucion: 'Instalado', pct: 100}, '2026-11-16T13:00:00.000Z'));
  assert.equal((await C.sync()).subidos, 0);
  assert.equal(filas.get('avance:' + idA).data.registro.partidas['5.3.1'], undefined);

  // Registro de la nube con id que no calza con su clave: no se aplica.
  const D = equipo(); await D.entrar('otro@hpc.test', 'clave-otro');
  const malo = await pedir('/api/campo', {method: 'POST', token: (await (await entrar('otro@hpc.test', 'clave-otro')).json()).token, body: {tipo: 'avance', id: 'av_otro', version: 0, data: {registro: base10}}});
  assert.equal(malo.status, 200, 'el Supabase simulado no valida; el real sí (avance-terreno.sql)');
  r = await D.sync();
  assert.equal(D.avances.size, 1, 'solo el registro bueno');
  assert.equal(r.errores, 1);
  console.log('Nube: sesión, permisos (editor/lector), versión con conflicto, fotos, fusión de observaciones, copia de proyectos y avance por recinto validados (Supabase simulado).');
} finally {
  server.closeAllConnections(); await new Promise(r => server.close(r));
}

// 11. supabase/avance-terreno.sql: reemplaza guardar_atlas_campo sin perder las validaciones anteriores.
const sqlAvance = fs.readFileSync(new URL('./supabase/avance-terreno.sql', import.meta.url), 'utf8');
assert.match(sqlAvance, /check \(tipo in \('proyecto','observacion','contorno','planilla','avance'\)\)/);
assert.match(sqlAvance, /p_tipo not in \('proyecto','observacion','contorno','planilla','avance'\)/);
for (const tipo of ['proyecto', 'observacion', 'contorno', 'planilla', 'avance']) assert.match(sqlAvance, new RegExp("if p_tipo = '" + tipo + "' and"), tipo);
assert.match(sqlAvance, /^begin;[\s\S]*commit;\s*$/m);

// SQL real en PGlite (opcional, PGLITE_MODULE como en lastplanner-sql-test.mjs): campo → contornos → planillas → avance.
if (process.env.PGLITE_MODULE) {
  const {PGlite} = await import(process.env.PGLITE_MODULE), db = new PGlite();
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema storage;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to authenticated,anon;`);
  for (const archivo of ['campo', 'contornos', 'planillas-avance', 'avance-terreno', 'avance-terreno']) await db.exec(fs.readFileSync(new URL(`./supabase/${archivo}.sql`, import.meta.url), 'utf8'));
  const guardar = (rol, tipo, id, version, data) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub: '11111111-1111-4111-8111-111111111111', email: 'editor@hpc.test', app_metadata: {campo_role: rol}})]);
    await tx.exec('set local role authenticated');
    return (await tx.query('select public.guardar_atlas_campo($1,$2,$3,$4::jsonb) as r', [tipo, id, version, JSON.stringify(data)])).rows[0].r;
  });
  const falla = async (args, motivo) => { await assert.rejects(guardar(...args), motivo); };
  const reg = {key: 'N04|5.1-1', code: '5.1-1', level: 'N04', at: '2026-11-16T10:00:00.000Z', responsable: 'Mauro', fecha: '2026-11-16', protocolos: {}, partidas: {}};
  assert.equal((await guardar('editor', 'avance', idAvance(reg.key), 0, {registro: reg})).version, 1);
  assert.equal((await guardar('editor', 'avance', idAvance(reg.key), 1, {registro: {...reg, at: '2026-11-16T11:00:00.000Z'}})).version, 2);
  await falla(['editor', 'avance', idAvance(reg.key), 1, {registro: reg}], /Version conflict/);
  await falla(['editor', 'avance', idAvance(reg.key), 2, {registro: {...reg, key: 'N04|otro'}}], /Invalid progress record/);
  await falla(['editor', 'avance', idAvance('N09|1'), 0, {registro: {...reg, key: 'N10|1', level: 'N10', code: '1'}}], /Invalid progress record/);
  await falla(['editor', 'avance', 'sin-prefijo', 0, {registro: reg}], /Invalid progress record/);
  await falla(['lector', 'avance', idAvance('N04|5.1-2'), 0, {registro: {...reg, key: 'N04|5.1-2', code: '5.1-2'}}], /Unauthorized/);
  await falla(['editor', 'contorno', 'N02-x', 0, {nivel: 'N02', code: ''}], /Invalid contour/);
  await falla(['editor', 'otro', 'x', 0, {}], /Invalid fields/);
  assert.equal((await guardar('editor', 'planilla', 'avance-N04', 0, {nivel: 'N04', recintos: {}, hojas: [], cargada: '2026-11-16', por: 'Mauro'})).version, 1, 'planilla de N04 aceptada');
  assert.equal((await db.query("select count(*)::int n from public.atlas_campo_historial where tipo = 'avance'")).rows[0].n, 2);
  await db.close();
  console.log('Nube: avance-terreno.sql ejecutado dos veces en PostgreSQL (PGlite): versión, validación, lector y pisos N04.');
}
