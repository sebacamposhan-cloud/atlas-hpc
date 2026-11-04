// supabase/jerarquia.sql. Dos partes:
// 1. Revisión del archivo (siempre, también en Render): repetible, RLS, permisos y las mismas constantes que el modelo.
// 2. PostgreSQL real en PGlite, si está disponible (PGLITE_MODULE, como lastplanner-sql-test.mjs): cadena, RLS, RPC,
//    tope de permisos de Last Planner, recibos y el servidor de Atlas contra esa base. No toca ningún proyecto real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as J from './dist/jerarquia-model.mjs';
import * as C from './dist/lastplanner-cycle-model.mjs';

const sql = fs.readFileSync(new URL('./supabase/jerarquia.sql', import.meta.url), 'utf8');
const codigo = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
let estaticas = 0;
const e = (fn) => { fn(); estaticas++; };

e(() => assert.match(codigo, /^\s*begin;/m) && assert.match(codigo, /commit;\s*$/));
e(() => { for (const m of codigo.matchAll(/create\s+(table|index)\s+(?!if not exists)/gi)) assert.fail('Sin «if not exists»: ' + m[0]); });
e(() => { for (const m of codigo.matchAll(/create\s+function/gi)) assert.fail('Use «create or replace function»: ' + m[0]); });
e(() => { for (const [, nombre] of codigo.matchAll(/create policy (\w+) on/g)) assert.match(codigo, new RegExp('drop policy if exists ' + nombre + ' on'), nombre); });
e(() => { for (const tabla of ['atlas_personas', 'atlas_metas', 'atlas_metas_historial', 'atlas_metas_operaciones']) { assert.match(codigo, new RegExp('alter table public\\.' + tabla + ' enable row level security')); assert.match(codigo, new RegExp('create policy \\w+ on public\\.' + tabla + ' for select')); } });
e(() => assert.match(codigo, /revoke all on public\.atlas_personas,public\.atlas_metas,public\.atlas_metas_historial,public\.atlas_metas_operaciones from anon,authenticated;/));
e(() => assert.doesNotMatch(codigo, /grant (insert|update|delete|all)/i, 'las cuentas solo escriben por el RPC'));
e(() => { for (const m of codigo.matchAll(/create or replace function public\.(\w+)\([^)]*\)[^$]*?security definer([^$]*?)\$\$/g)) assert.match(m[2], /set search_path=''/, m[1]); });
e(() => { assert.match(codigo, /grant execute on function [^;]*public\.guardar_meta_atlas\(uuid,text,text,jsonb,integer\) to authenticated/); assert.match(codigo, /revoke all on function [^;]*public\.atlas_jer_cargar\([^;]*from public,anon,authenticated/); });
e(() => assert.match(codigo, /function public\.atlas_lp_can\(p_permission text\)[\s\S]*?public\.atlas_jer_tope\(p_permission\)/, 'atlas_lp_can conserva su regla y suma el tope'));
// Las mismas decisiones en SQL y en dist/jerarquia-model.mjs.
e(() => assert.equal(/atlas_jer_salta_niveles\(\) returns boolean[^$]*\$\$ select (true|false) \$\$/.exec(codigo)[1] === 'true', J.SALTAR_NIVELES));
e(() => assert.match(codigo, new RegExp('yo\\.nivel in \\(' + J.NIVELES_QUE_ASIGNAN.join(',') + '\\)')));
e(() => {
  const arr = expr => JSON.parse('[' + expr.replace(/'/g, '"') + ']');
  const permisos = /function public\.atlas_jer_permisos[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(codigo)[1];
  assert.deepEqual(arr(/p_area='planificacion' then array\[([^\]]*)\]/.exec(permisos)[1]).sort(), [...J.PERMISOS_AREA.planificacion].sort());
  assert.deepEqual(arr(/p_area='calidad' then array\[([^\]]*)\]/.exec(permisos)[1]).sort(), [...J.PERMISOS_AREA.calidad].sort());
  assert.deepEqual(arr(/p_nivel in \(1,2,3\) then array\[([^\]]*)\]/.exec(permisos)[1]).sort(), [...J.PERMISOS_NIVEL[1]].sort());
  assert.deepEqual(arr(/p_nivel=4 then array\[([^\]]*)\]/.exec(permisos)[1]).sort(), [...J.PERMISOS_NIVEL[4]].sort());
  assert.match(permisos, /else array\[\]::text\[\]/); assert.deepEqual(J.PERMISOS_NIVEL[0], []);
});
e(() => assert.ok(codigo.includes("estado in ('" + J.ESTADOS.join("','") + "')")));
e(() => assert.ok(codigo.includes("p_accion not in ('" + J.ACCIONES.join("','") + "')")));
e(() => { for (const [accion, campos] of Object.entries(J.CAMPOS_ACCION)) if (!['anular'].includes(accion)) assert.ok(codigo.includes("when '" + accion + "' then array['" + campos.join("','") + "']"), accion); assert.ok(codigo.includes("else array['" + J.CAMPOS_ACCION.anular.join("','") + "'] end")); });
e(() => { for (const [accion, permiso] of Object.entries(J.PERMISO_ACCION)) if (permiso !== 'draft') assert.ok(codigo.includes("when '" + accion + "' then '" + permiso + "'"), accion); });

let PGlite = null;
try { ({PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch {}
if (!PGlite) {
  console.log(`supabase/jerarquia.sql: ${estaticas} revisiones del archivo aprobadas. PGlite no está disponible: la prueba en PostgreSQL real se omite (ver docs/JERARQUIA.md).`);
} else {
  const {cloudFixture, requestFor} = await import('./test-support/lastplanner-cloud.mjs');
  const {createAtlasServer} = await import('./server/groq-server.mjs');
  const {huellaMeta} = await import('./server/jerarquia.mjs');
  const cloud = await cloudFixture();
  let pruebas = 0;
  try {
    await cloud.db.exec('create table auth.users(id uuid primary key, email text)');
    await cloud.db.exec(sql); await cloud.db.exec(sql); pruebas++; // repetible
    const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), correo = n => 'cuenta' + n + '@example.test';
    for (const n of [1, 2, 3, 4, 6, 7, 8, 11, 12, 20, 30, 31]) await cloud.db.query('insert into auth.users(id,email) values($1,$2)', [id(n), correo(n)]);
    const cargar = (n, cargo, nivel, area, jefe, pisos = []) => cloud.db.query('select public.atlas_jer_cargar($1,$2,$3,$4,$5,$6,$7)', [correo(n), 'Persona de ejemplo ' + n, cargo, nivel, area, jefe ? correo(jefe) : null, pisos]);
    await cargar(1, 'Gerente de contrato', 0, 'linea'); await cargar(2, 'Jefe general de terreno', 1, 'linea', 1);
    await cargar(3, 'Jefe de terreno', 2, 'linea', 2); await cargar(4, 'Jefe de terreno', 2, 'linea', 2);
    await cargar(6, 'Jefe de terreno B', 3, 'linea', 3); await cargar(7, 'Jefe de terreno B', 3, 'linea', 3); await cargar(8, 'Jefe de terreno B', 3, 'linea', 4);
    await cargar(11, 'Supervisor de piso', 4, 'linea', 6, ['N01', ' N01 ']); await cargar(12, 'Capataz de subcontrato', 4, 'linea', 6, ['N01']);
    await cargar(20, 'Planificación', null, 'planificacion', 1);
    assert.deepEqual((await cloud.db.query('select pisos from public.atlas_personas where user_id=$1', [id(11)])).rows[0].pisos, ['N01'], 'pisos sin duplicados'); pruebas++;
    await assert.rejects(() => cloud.db.query('update public.atlas_personas set jefe=$1 where user_id=$2', [id(6), id(3)]), /ciclo|nivel más alto/); pruebas++;
    await assert.rejects(() => cargar(30, 'Supervisor', 4, 'linea', 11), /nivel más alto/, 'un capataz no es jefe de otro capataz'); pruebas++;
    await assert.rejects(() => cargar(31, 'Jefe de terreno', null, 'linea', 2), /nivel_area/); pruebas++;
    await assert.rejects(() => cloud.db.query("select public.atlas_jer_cargar('nadie@example.test','x','x',2,'linea')"), /No existe la cuenta/); pruebas++;

    const actor = (n, extra = {}) => ({id: id(n), email: correo(n), role: 'editor', ...extra});
    const ver = async (n, tabla, columna) => (await cloud.authenticated(actor(n), `select ${columna} as id from public.${tabla} order by 1`)).rows.map(r => r.id);
    assert.deepEqual(await ver(11, 'atlas_personas', 'user_id'), [id(1), id(2), id(3), id(6), id(11)], 'el supervisor ve su perfil y sus jefes, no a sus pares');
    assert.deepEqual(await ver(3, 'atlas_personas', 'user_id'), [id(1), id(2), id(3), id(6), id(7), id(11), id(12)], 'el jefe ve a su equipo y a sus jefes');
    assert.equal((await ver(1, 'atlas_personas', 'user_id')).length, 10, 'gerencia ve a todos');
    assert.equal((await ver(20, 'atlas_personas', 'user_id')).length, 10, 'Planificación ve a todos');
    assert.deepEqual(await ver(30, 'atlas_personas', 'user_id'), [], 'sin perfil no ve la jerarquía'); pruebas++;
    await assert.rejects(() => cloud.authenticated(actor(2), "insert into public.atlas_personas(user_id,nivel) values('" + id(30) + "',1)"), /permission denied/); pruebas++;

    // Tareas por la cadena, con el mismo modelo que usa la app.
    const personas = (await cloud.db.query('select * from public.atlas_personas')).rows.map(J.perfilDesdeFila);
    const yo = n => ({...actor(n), permissions: J.permisosLastPlanner(personas.find(p => p.id === id(n)), null)});
    const rpc = async (n, accion, meta, expected = meta.version - 1, opId = crypto.randomUUID()) => (await cloud.authenticated(actor(n), 'select public.guardar_meta_atlas($1,$2,$3,$4::jsonb,$5) as r', [opId, accion, huellaMeta(accion, meta), JSON.stringify(meta), expected])).rows[0].r;
    const m1 = J.crearMeta({asignadaA: id(3), titulo: 'Terminaciones ala norte (ejemplo)', piso: 'N01'}, yo(2), personas);
    const op = crypto.randomUUID();
    assert.equal((await rpc(2, 'asignar', m1, 0, op)).version, 1);
    assert.deepEqual(await rpc(2, 'asignar', m1, 0, op), {id: m1.id, version: 1, estado: 'asignada'}, 'un reintento devuelve el mismo recibo'); pruebas++;
    await assert.rejects(() => rpc(2, 'asignar', m1, 0), /Version conflict/); pruebas++;
    const salto = J.cambiar(null, {...m1, id: crypto.randomUUID(), asignadaA: id(6)}, yo(2), 'Asignar tarea');
    await assert.rejects(() => rpc(2, 'asignar', salto), /outside the chain/, 'no salta niveles en la base'); pruebas++;
    const m2 = J.crearMeta({asignadaA: id(6), titulo: 'Pavimentos ala norte (ejemplo)', piso: 'N01', padre: m1.id}, yo(3), personas, [m1]); await rpc(3, 'asignar', m2);
    const frente = [{id: 'r1|pavimentos|1', roomId: 'r1', code: 'R-EJEMPLO', tipo: 'pavimentos', level: 'N01', geometry: {type: 'polygon', points: [[0, 0], [1, 0], [1, 1]]}}];
    const lp = C.createDraft({actividad: 'Pavimento de ejemplo', level: 'N01', responsable: 'Cuenta de ejemplo', inicioPlan: '2026-11-02', finPlan: '2026-11-06', cantidad: 10, unidad: 'm²', recintos: [{id: 'r1', code: 'R-EJEMPLO'}], alcances: frente}, yo(6));
    await cloud.rpc(requestFor('draft', [{table: 'actividades', id: lp.id, data: lp, expectedRemote: 0}]), actor(6));
    let m3 = J.crearMeta({asignadaA: id(11), titulo: 'Pavimento recinto de ejemplo', padre: m2.id, alcances: frente, actividadId: lp.id}, yo(6), personas, [m1, m2], {actividad: lp}); await rpc(6, 'asignar', m3);
    const fuera = J.cambiar(null, {...m3, id: crypto.randomUUID(), alcances: [{...frente[0], id: 'r9|pavimentos|9'}], padre: null}, yo(6), 'Asignar tarea');
    await assert.rejects(() => rpc(6, 'asignar', fuera), /outside the Last Planner activity/); pruebas++;
    const otroPiso = J.cambiar(null, {...m3, id: crypto.randomUUID(), piso: 'N02', alcances: [], actividadId: null, padre: null}, yo(6), 'Asignar tarea');
    await assert.rejects(() => rpc(6, 'asignar', otroPiso), /does not work on that floor/); pruebas++;
    const ajena = J.cambiar(null, {...m3, id: crypto.randomUUID(), asignadaA: id(12), asignadaPor: id(6), padre: m1.id, alcances: [], actividadId: null}, yo(6), 'Asignar tarea');
    await assert.rejects(() => rpc(6, 'asignar', ajena), /parent task/); pruebas++;

    assert.deepEqual(await ver(11, 'atlas_metas', 'id'), [m3.id], 'el supervisor ve solo su tarea');
    assert.deepEqual(await ver(12, 'atlas_metas', 'id'), [], 'el capataz de al lado no la ve');
    assert.deepEqual((await ver(3, 'atlas_metas', 'id')).sort(), [m1.id, m2.id, m3.id].sort(), 'el jefe de terreno ve lo suyo y lo de su equipo');
    assert.deepEqual(await ver(4, 'atlas_metas', 'id'), [], 'otro jefe de terreno no lo ve');
    assert.equal((await ver(1, 'atlas_metas', 'id')).length, 3); assert.equal((await ver(20, 'atlas_metas', 'id')).length, 3);
    assert.equal((await ver(30, 'atlas_metas', 'id')).length, 0); pruebas++;
    await assert.rejects(() => cloud.authenticated(actor(6), `update public.atlas_metas set estado='confirmada'`), /permission denied/); pruebas++;

    const avance = J.marcarAvance(m3, {marcas: {[frente[0].id]: 1}}, yo(11));
    await assert.rejects(() => rpc(12, 'avanzar', {...avance, historial: avance.historial.map((h, i) => i ? {...h, actor: id(12), autor: correo(12)} : h)}), /assignee/); pruebas++;
    await rpc(11, 'avanzar', avance); m3 = avance;
    const forzada = J.cambiar(m3, {...m3, estado: 'confirmada'}, yo(11), 'Marcar hecha');
    await assert.rejects(() => rpc(11, 'hecha', forzada), /assignee/); pruebas++;
    m3 = J.marcarHecha(m3, yo(11)); await rpc(11, 'hecha', m3);
    const propia = J.cambiar(m3, {...m3, estado: 'confirmada'}, yo(11), 'Confirmar tarea');
    await assert.rejects(() => rpc(11, 'confirmar', propia), /Unauthorized/, 'el nivel 4 no confirma'); pruebas++;
    const deOtro = J.cambiar(m3, {...m3, estado: 'confirmada'}, yo(4), 'Confirmar tarea');
    await assert.rejects(() => rpc(4, 'confirmar', deOtro), /Unauthorized review/); pruebas++;
    m3 = J.devolverMeta(m3, 'Falta el remate (ejemplo)', yo(6), personas); await rpc(6, 'devolver', m3);
    m3 = J.marcarHecha(m3, yo(11)); await rpc(11, 'hecha', m3);
    m3 = J.confirmarMeta(m3, yo(3), personas); await rpc(3, 'confirmar', m3);
    assert.equal((await cloud.db.query('select estado,version from public.atlas_metas where id=$1', [m3.id])).rows[0].estado, 'confirmada'); pruebas++;
    assert.equal((await cloud.authenticated(actor(11), 'select count(*)::int as n from public.atlas_metas_historial where meta=$1', [m3.id])).rows[0].n, 6, 'historial completo y visible para quien la recibió'); pruebas++;
    let m4 = J.crearMeta({asignadaA: id(11), titulo: 'Sello cortafuego (ejemplo)', piso: 'N01'}, yo(6), personas); await rpc(6, 'asignar', m4);
    const reasignada = J.reasignarMeta(m4, id(12), 'Persona ausente', yo(6), personas);
    assert.throws(() => J.reasignarMeta(m4, id(12), 'Persona ausente', yo(3), personas), /directamente/, 'reasigna el jefe directo de quien falta');
    await rpc(6, 'reasignar', reasignada); m4 = reasignada; pruebas++;
    await assert.rejects(() => rpc(7, 'anular', J.cambiar(m4, {...m4, estado: 'anulada', motivo: 'x'}, yo(7), 'Anular tarea')), /Unauthorized cancellation/); pruebas++;
    await rpc(3, 'anular', J.anularMeta(m4, 'Cambio de plan', yo(3), personas)); pruebas++;

    // Tope de permisos de Last Planner por nivel. Sin perfil, igual que antes.
    const borrador = n => { const a = C.createDraft({actividad: 'Borrador de ejemplo', level: 'N01', responsable: 'Cuenta de ejemplo', inicioPlan: '2026-11-09', finPlan: '2026-11-13', cantidad: 5, unidad: 'm²', recintos: [], alcances: []}, actor(n)); return requestFor('draft', [{table: 'actividades', id: a.id, data: a, expectedRemote: 0}]); };
    await assert.rejects(() => cloud.rpc(borrador(11), actor(11)), /Unauthorized/, 'el nivel 4 no crea borradores');
    await assert.rejects(() => cloud.rpc(borrador(1), actor(1)), /Unauthorized/, 'gerencia solo mira');
    assert.equal((await cloud.rpc(borrador(3), actor(3)))[0].version, 1, 'un jefe de terreno sigue planificando');
    assert.equal((await cloud.rpc(borrador(30), actor(30)))[0].version, 1, 'sin perfil, todo como hoy');
    await cloud.db.query('update public.atlas_personas set activo=false where user_id=$1', [id(11)]);
    assert.equal((await cloud.rpc(borrador(11), actor(11)))[0].version, 1, 'un perfil inactivo vuelve a sus permisos de cuenta');
    await cloud.db.query('update public.atlas_personas set activo=true where user_id=$1', [id(11)]); pruebas++;
    await cloud.db.exec(sql); assert.equal((await cloud.db.query('select count(*)::int as n from public.atlas_metas')).rows[0].n, 4, 'volver a ejecutar conserva las tareas'); pruebas++;

    // El servidor de Atlas contra esta base: lee con RLS y guarda por el RPC.
    const bajo = (n, query, params) => cloud.authenticated(n, query, params).then(r => r.rows);
    const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});
    const fetchImpl = async (url, options = {}) => {
      const u = new URL(url), token = options.headers?.Authorization?.slice(7) || '', claims = (() => { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); } catch { return null; } })();
      const quien = claims && {id: claims.sub, email: claims.email, role: claims.app_metadata?.campo_role};
      try {
        if (u.pathname === '/rest/v1/atlas_personas') return json(await bajo(quien, 'select user_id,nombre,cargo,nivel,area,jefe,pisos,empresa,activo from public.atlas_personas' + (u.searchParams.get('user_id') ? ' where user_id=$1' : ' order by user_id'), u.searchParams.get('user_id') ? [u.searchParams.get('user_id').slice(3)] : []));
        if (u.pathname === '/rest/v1/atlas_metas') return json(await bajo(quien, 'select id,version,data from public.atlas_metas order by id limit $1 offset $2', [Number(u.searchParams.get('limit')), Number(u.searchParams.get('offset'))]));
        if (u.pathname === '/rest/v1/atlas_metas_operaciones') return json(await bajo(quien, 'select actor,huella,resultado from public.atlas_metas_operaciones where id=$1', [u.searchParams.get('id').slice(3)]));
        if (u.pathname === '/rest/v1/atlas_lp_records' && u.searchParams.get('tipo')) return json(await bajo(quien, 'select data from public.atlas_lp_records where tipo=$1 and id=$2', [u.searchParams.get('tipo').slice(3), u.searchParams.get('id').slice(3)]));
        if (u.pathname === '/rest/v1/rpc/guardar_meta_atlas') { const b = JSON.parse(options.body); return json((await bajo(quien, 'select public.guardar_meta_atlas($1,$2,$3,$4::jsonb,$5) as r', [b.p_id, b.p_accion, b.p_huella, JSON.stringify(b.p_meta), b.p_expected]))[0].r); }
      } catch (error) { return json({message: error.message, code: error.code}, 400); }
      return cloud.fetchImpl(url, options);
    };
    const server = await createAtlasServer({env: cloud.env, fetchImpl});
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const {tokenFor} = await import('./test-support/lastplanner-cloud.mjs');
    const pedir = (n, metodo, ruta, cuerpo) => fetch('http://127.0.0.1:' + server.address().port + ruta, {method: metodo, headers: {'X-Campo-Session': tokenFor(actor(n)), ...(cuerpo ? {'Content-Type': 'application/json'} : {})}, ...(cuerpo ? {body: JSON.stringify(cuerpo)} : {})});
    try {
      const datos = await (await pedir(6, 'GET', '/api/jerarquia/metas')).json();
      assert.equal(datos.instalado, true); assert.equal(datos.perfil.nivel, 3); assert.ok(datos.metas.some(m => m.id === m3.id)); assert.ok(!datos.personas.some(p => p.id === id(8)), 'RLS también en el servidor');
      const m5 = J.crearMeta({asignadaA: id(12), titulo: 'Limpieza final (ejemplo)', piso: 'N01'}, {...yo(6)}, datos.personas, datos.metas);
      const r = await pedir(6, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'asignar', meta: m5, expected: 0});
      assert.equal(r.status, 200, await r.clone().text());
      const capataz = await (await pedir(12, 'GET', '/api/jerarquia/metas')).json();
      assert.deepEqual(capataz.metas.map(m => m.id).sort(), [m4.id, m5.id].sort(), 'el capataz recibe la tarea en su libreta');
      assert.deepEqual(capataz.permisos, ['execution', 'attendance', 'restriction', 'evidence']);
      const lps = await (await pedir(12, 'GET', '/api/lastplanner/session')).json();
      assert.deepEqual(lps.permissions, ['execution', 'attendance', 'restriction', 'evidence'], 'Last Planner aplica el tope del nivel');
      assert.equal((await (await pedir(30, 'GET', '/api/lastplanner/session')).json()).permissions.length, C.PERMISSIONS.length, 'sin perfil, permisos de siempre');
      const marca = J.marcarAvance(m5, {avanceManual: .5}, yo(12));
      assert.equal((await pedir(11, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'avanzar', meta: marca, expected: 1})).status, 404, 'otra cuenta ni siquiera ve la tarea');
      assert.equal((await pedir(12, 'POST', '/api/jerarquia/metas', {id: crypto.randomUUID(), accion: 'avanzar', meta: marca, expected: 1})).status, 200);
      pruebas++;
    } finally { server.close(); }
    console.log(`supabase/jerarquia.sql: ${estaticas} revisiones del archivo y ${pruebas} escenarios en PostgreSQL real (PGlite) aprobados: cadena, RLS, RPC, recibos, tope de Last Planner y servidor.`);
  } catch (error) { console.error(error.stack, error.where || ""); process.exitCode = 1; } finally { await cloud.close(); }
}
