// Nube de proyectos y observaciones en terreno: mismo proyecto Supabase y cuentas que Estados de pago (supabase/campo.sql).
// El servidor solo reenvía con la sesión de cada usuario; Supabase aplica RLS y el control de versión. No usa la clave service_role.
const ID = /^[A-Za-z0-9_-]{1,100}$/, DESDE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const BUCKET = 'atlas-campo', MAX_JSON = 2500000, MAX_FOTO = 5242880, PAGINA = 500, CAMPOS = 'tipo,id,version,data,updated_at,updated_by';
const fallo = (status, message) => Object.assign(Error(message), {status});

export function createCampo(env, fetchImpl = fetch) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, ''), key = env.SUPABASE_ANON_KEY;
  const configurada = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) && !!key;
  const intentos = new Map();
  return async (req, res, url) => {
    const send = (status, body) => { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(body)); };
    if (!configurada) return send(503, {error: 'La nube de Atlas no está configurada en el servidor (SUPABASE_URL y SUPABASE_ANON_KEY).'});
    try {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403, {error: 'Origen no autorizado.'});
      const leer = async max => { const partes = []; let n = 0; for await (const c of req) { n += c.length; if (n > max) throw fallo(413, 'Envío demasiado grande.'); partes.push(c); } return Buffer.concat(partes); };
      const json = async () => {
        if (!req.headers['content-type']?.startsWith('application/json')) throw fallo(415, 'Se requiere JSON.');
        try { return JSON.parse((await leer(MAX_JSON)).toString('utf8')); } catch (e) { throw e.status ? e : fallo(400, 'JSON inválido.'); }
      };
      const call = async (ruta, token, {method, body, tipo, binario = false} = {}) => {
        const bytes = Buffer.isBuffer(body);
        const r = await fetchImpl(base + ruta, {method: method || (body ? 'POST' : 'GET'), signal: AbortSignal.timeout(20000),
          headers: {apikey: key, Authorization: 'Bearer ' + (token || key), ...(body ? {'Content-Type': tipo || 'application/json'} : {})},
          ...(body ? {body: bytes ? body : JSON.stringify(body)} : {})});
        const data = binario && r.ok ? Buffer.from(await r.arrayBuffer()) : await r.json().catch(() => null);
        return {status: r.status, ok: r.ok, data};
      };
      // Storage responde 400 con {statusCode} en el cuerpo; se traduce al código real.
      const codigo = r => Number(r.data?.statusCode) || r.status;
      const expirada = r => r.status === 401 || codigo(r) === 401 || /jwt|token/i.test(`${r.data?.message || ''} ${r.data?.error || ''}`);
      const sesion = data => {
        const role = data?.user?.app_metadata?.campo_role;
        if (!['editor', 'lector'].includes(role)) return null;
        return {token: data.access_token, refresh: data.refresh_token, expiraEn: Number(data.expires_in) || 3600, user: {username: data.user.email, role}};
      };
      const sinPermiso = 'Esta cuenta no tiene acceso a proyectos y observaciones. Pide que le asignen campo_role en Supabase.';

      if (url.pathname === '/api/campo/login' && req.method === 'POST') {
        const now = Date.now(); for (const [ip, v] of intentos) if (v.until < now) intentos.delete(ip);
        const ip = req.socket.remoteAddress, limite = intentos.get(ip) || {n: 0, until: now + 900000};
        if (limite.n >= 10) return send(429, {error: 'Demasiados intentos. Reintenta en 15 minutos.'});
        limite.n++; intentos.set(ip, limite);
        const b = await json();
        if (typeof b.username !== 'string' || typeof b.password !== 'string' || !b.username || b.username.length > 254 || b.password.length > 1024) return send(400, {error: 'Credenciales inválidas.'});
        const r = await call('/auth/v1/token?grant_type=password', null, {body: {email: b.username, password: b.password}});
        if (!r.ok) return send(401, {error: 'Correo o contraseña incorrectos.'});
        const s = sesion(r.data); if (!s) return send(403, {error: sinPermiso});
        intentos.delete(ip);
        return send(200, s);
      }
      if (url.pathname === '/api/campo/refresh' && req.method === 'POST') {
        const b = await json();
        if (typeof b.refresh !== 'string' || !b.refresh || b.refresh.length > 4096) return send(400, {error: 'Sesión inválida.'});
        const r = await call('/auth/v1/token?grant_type=refresh_token', null, {body: {refresh_token: b.refresh}});
        if (!r.ok) return send(401, {error: 'Tu sesión terminó. Vuelve a entrar.'});
        const s = sesion(r.data); return s ? send(200, s) : send(403, {error: sinPermiso});
      }
      const token = req.headers['x-campo-session'];
      if (typeof token !== 'string' || !token || token.length > 8192) return send(401, {error: 'Entra con tu cuenta para usar la nube.'});
      if (url.pathname === '/api/campo/logout' && req.method === 'POST') { await call('/auth/v1/logout', token, {method: 'POST', body: {}}); return send(200, {ok: true}); }
      if (url.pathname === '/api/campo' && req.method === 'GET') {
        const desde = url.searchParams.get('desde');
        if (desde && !DESDE.test(desde)) return send(400, {error: 'Fecha inválida.'});
        const registros = [];
        for (let offset = 0; offset < 100000; offset += PAGINA) {
          const r = await call(`/rest/v1/atlas_campo?select=${CAMPOS}&order=updated_at.asc,tipo.asc,id.asc&limit=${PAGINA}&offset=${offset}${desde ? '&updated_at=gte.' + encodeURIComponent(desde) : ''}`, token);
          if (expirada(r)) return send(401, {error: 'Tu sesión terminó. Vuelve a entrar.'});
          if (!r.ok) return send(503, {error: 'No se pudo leer la nube. Revisa que se haya ejecutado supabase/campo.sql.'});
          registros.push(...r.data); if (r.data.length < PAGINA) break;
        }
        return send(200, {registros});
      }
      if (url.pathname === '/api/campo' && req.method === 'POST') {
        const b = await json();
        if (!['proyecto', 'observacion'].includes(b.tipo) || !ID.test(b.id || '') || !Number.isSafeInteger(b.version) || b.version < 0 || !b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return send(400, {error: 'Registro inválido.'});
        const r = await call('/rest/v1/rpc/guardar_atlas_campo', token, {body: {p_tipo: b.tipo, p_id: b.id, p_version: b.version, p_data: b.data}});
        if (r.ok) return send(200, r.data);
        if (r.data?.code === '40001') {
          const actual = await call(`/rest/v1/atlas_campo?select=${CAMPOS}&tipo=eq.${b.tipo}&id=eq.${b.id}`, token);
          return send(409, {error: 'El registro cambió en otro equipo.', registro: actual.ok ? actual.data[0] || null : null});
        }
        if (expirada(r)) return send(401, {error: 'Tu sesión terminó. Vuelve a entrar.'});
        if (/Unauthorized/.test(r.data?.message || '')) return send(403, {error: 'Tu cuenta es de solo lectura.'});
        return send(400, {error: 'No se pudo guardar en la nube: revisa permisos y que se haya ejecutado supabase/campo.sql.'});
      }
      const foto = url.pathname.match(/^\/api\/campo\/fotos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.mini)?$/);
      if (foto && req.method === 'PUT') {
        if (req.headers['content-type'] !== 'image/jpeg') return send(415, {error: 'Se requiere una foto JPEG.'});
        const bytes = await leer(MAX_FOTO);
        if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return send(400, {error: 'La foto no es JPEG.'});
        const r = await call(`/storage/v1/object/${BUCKET}/fotos/${foto[1]}${foto[2] || ''}.jpg`, token, {body: bytes, tipo: 'image/jpeg'});
        // Ya subida antes (otro intento o el mismo equipo): las fotos no cambian, así que cuenta como lista.
        if (r.ok || codigo(r) === 409 || r.data?.error === 'Duplicate') return send(200, {ok: true});
        if (expirada(r)) return send(401, {error: 'Tu sesión terminó. Vuelve a entrar.'});
        if (codigo(r) === 403) return send(403, {error: 'Tu cuenta no puede subir fotos.'});
        return send(503, {error: 'No se pudo subir la foto. Revisa que se haya ejecutado supabase/campo.sql.'});
      }
      if (foto && req.method === 'GET') {
        const r = await call(`/storage/v1/object/authenticated/${BUCKET}/fotos/${foto[1]}${foto[2] || ''}.jpg`, token, {binario: true});
        if (!r.ok) return expirada(r) ? send(401, {error: 'Tu sesión terminó. Vuelve a entrar.'}) : send(404, {error: 'Foto aún no disponible en la nube.'});
        res.writeHead(200, {'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store'});
        return res.end(r.data);
      }
      return send(404, {error: 'Ruta no disponible.'});
    } catch (e) {
      return send(e.status || 503, {error: e.status ? e.message : 'No se pudo conectar con la nube. Reintenta con conexión.'});
    }
  };
}
