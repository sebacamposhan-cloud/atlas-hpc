// Jerarquía de obra (supabase/jerarquia.sql): perfiles y tareas que bajan por la cadena de mando de Last Planner.
// Como server/lastplanner.mjs, reenvía con la sesión personal de cada usuario y no usa la clave service_role:
// RLS decide qué ve cada persona y guardar_meta_atlas decide qué puede guardar. Antes, el modelo compartido
// (dist/jerarquia-model.mjs) revisa la operación para responder en español simple.
// Si el SQL aún no se ejecutó, la lectura responde «instalado: false» y Atlas sigue como hoy.
import {createHash} from 'node:crypto';
import * as J from '../dist/jerarquia-model.mjs';
import {canonical} from '../dist/lastplanner-cycle-model.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS = 'user_id,nombre,cargo,nivel,area,jefe,pisos,empresa,activo';
const PAGINA = 1000, MAX_JSON = 1500000;
const fallo = (status, message) => Object.assign(Error(message), {status});
// Respuestas de la regla de jerarquía o de permisos: 403. El resto de los errores del modelo: 400.
const AUTORIZACION = /permiso|perfil activo|no asigna|fuera de la cadena|directamente|Solo |jefatura|La confirma|La devuelve|La anula|no trabaja en ese piso/;
export const huellaMeta = (accion, meta) => createHash('sha256').update(canonical({accion, meta})).digest('hex');

// Perfil activo de una cuenta, leído con su propia sesión. null si no tiene o si falta el SQL: todo sigue como hoy.
export async function perfilDe(call, id) {
  if (!UUID.test(id || '')) return null;
  const r = await call('/rest/v1/atlas_personas?select=' + CAMPOS + '&user_id=eq.' + id).catch(() => null);
  if (!r?.ok || !Array.isArray(r.data)) return null;
  const p = J.perfilDesdeFila(r.data[0]);
  return J.perfilActivo(p) ? p : null;
}

export function createJerarquia(env, fetchImpl = fetch) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, ''), key = env.SUPABASE_ANON_KEY, configurada = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) && !!key;
  return async (req, res, url) => {
    const send = (status, data) => { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); };
    try {
      if (!configurada) throw fallo(503, 'La Nube de Atlas no está configurada. Lo guardado en este equipo se conserva.');
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw fallo(403, 'Origen no autorizado.');
      const token = req.headers['x-campo-session'];
      if (typeof token !== 'string' || !token || token.length > 8192) throw fallo(401, 'Entra con tu cuenta personal de Atlas.');
      const call = async (ruta, {method = 'GET', body} = {}) => {
        const r = await fetchImpl(base + ruta, {method, signal: AbortSignal.timeout(20000), headers: {apikey: key, Authorization: 'Bearer ' + token, ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
        const data = await r.json().catch(() => null);
        if (r.status === 401) throw fallo(401, 'La sesión terminó. Vuelve a entrar.');
        return {ok: r.ok, status: r.status, data};
      };
      const usuario = await call('/auth/v1/user');
      if (!usuario.ok) throw fallo(401, 'Sesión no válida.');
      const u = usuario.data, meta = u.app_metadata || {};
      const actor = {id: u.id, email: u.email, role: meta.campo_role, permissions: meta.lastplanner_permissions == null ? null : Array.isArray(meta.lastplanner_permissions) ? meta.lastplanner_permissions : []};
      if (!['editor', 'lector'].includes(actor.role)) throw fallo(403, 'La cuenta no tiene acceso a Atlas.');

      // Todo lo que esta cuenta puede ver según RLS. null = falta ejecutar supabase/jerarquia.sql.
      const leer = async () => {
        const p = await call('/rest/v1/atlas_personas?select=' + CAMPOS + '&order=user_id.asc&limit=5000');
        if (!p.ok || !Array.isArray(p.data)) return null;
        const personas = p.data.map(J.perfilDesdeFila).filter(Boolean), metas = [];
        for (let offset = 0; offset < 200000; offset += PAGINA) {
          const m = await call('/rest/v1/atlas_metas?select=id,version,data&order=id.asc&limit=' + PAGINA + '&offset=' + offset);
          if (!m.ok || !Array.isArray(m.data)) return null;
          for (const fila of m.data) if (fila?.data?.id === fila.id && fila.data.version === fila.version) metas.push(fila.data);
          if (m.data.length < PAGINA) break;
        }
        return {personas, metas, perfil: personas.find(x => x.id === actor.id && J.perfilActivo(x)) || null};
      };

      if (url.pathname === '/api/jerarquia/metas' && req.method === 'GET') {
        const datos = await leer();
        if (!datos) return send(200, {instalado: false, perfil: null, personas: [], metas: []});
        return send(200, {instalado: true, ...datos, permisos: J.permisosLastPlanner(datos.perfil, actor.permissions)});
      }
      if (url.pathname === '/api/jerarquia/metas' && req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw fallo(415, 'Se requiere JSON.');
        let body, size = 0; const partes = [];
        for await (const c of req) { size += c.length; if (size > MAX_JSON) throw fallo(413, 'Envío demasiado grande.'); partes.push(c); }
        try { body = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { throw fallo(400, 'JSON inválido.'); }
        if (!UUID.test(body?.id || '') || !J.ACCIONES.includes(body.accion) || !body.meta || typeof body.meta !== 'object' || Array.isArray(body.meta) || !Number.isSafeInteger(body.expected) || body.expected < 0) throw fallo(400, 'Operación no válida.');
        if (actor.role !== 'editor') throw fallo(403, 'Tu cuenta es de solo lectura.');
        const huella = huellaMeta(body.accion, body.meta);
        // Un reintento de algo ya guardado devuelve el mismo resultado, sin volver a aplicarlo.
        const hecho = await call('/rest/v1/atlas_metas_operaciones?id=eq.' + body.id + '&select=actor,huella,resultado');
        if (!hecho.ok) throw fallo(503, 'Falta ejecutar supabase/jerarquia.sql en Nube.');
        if (hecho.data?.length) { const previo = hecho.data[0]; if (previo.actor !== actor.id || previo.huella !== huella) throw fallo(409, 'La identidad de la operación ya se usó para otros datos.'); return send(200, previo.resultado); }
        const datos = await leer();
        if (!datos) throw fallo(503, 'Falta ejecutar supabase/jerarquia.sql en Nube.');
        if (!datos.perfil) throw fallo(403, 'Tu cuenta no tiene un perfil activo en la jerarquía de obra.');
        actor.permissions = J.permisosLastPlanner(datos.perfil, actor.permissions);
        const previa = datos.metas.find(m => m.id === body.meta.id) || null;
        if (!previa && body.accion !== 'asignar') throw fallo(404, 'La tarea no existe o tu cuenta no puede verla.');
        if ((previa?.version || 0) !== body.expected) throw fallo(409, 'La tarea cambió en otro equipo. Vuelve a abrirla.');
        let actividad = null;
        if (body.meta.actividadId && ['asignar', 'editar'].includes(body.accion)) {
          const a = await call('/rest/v1/atlas_lp_records?select=data&tipo=eq.actividades&id=eq.' + encodeURIComponent(body.meta.actividadId));
          actividad = a.ok ? a.data?.[0]?.data || null : null;
        }
        try { J.validarMutacion(previa, body.meta, body.accion, actor, datos.personas, {metas: datos.metas, actividad}); }
        catch (e) { throw fallo(AUTORIZACION.test(e.message) ? 403 : 400, e.message); }
        const r = await call('/rest/v1/rpc/guardar_meta_atlas', {method: 'POST', body: {p_id: body.id, p_accion: body.accion, p_huella: huella, p_meta: body.meta, p_expected: body.expected}});
        if (!r.ok) {
          if (r.data?.code === '40001' || r.data?.code === '23505') throw fallo(409, 'La tarea cambió en otro equipo. Vuelve a abrirla.');
          if (/Unauthorized|permission/i.test(r.data?.message || '')) throw fallo(403, 'Tu cuenta no tiene permiso para esta acción.');
          throw fallo(400, 'Nube rechazó la tarea: ' + (r.data?.message || 'error desconocido') + '.');
        }
        return send(200, r.data);
      }
      throw fallo(404, 'Ruta no disponible.');
    } catch (e) {
      return send(e.status || 503, {error: e.status ? e.message : 'No se pudo conectar con la nube. Reintenta con conexión.'});
    }
  };
}
