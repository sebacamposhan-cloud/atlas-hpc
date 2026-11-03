// Sesión de Atlas: cookie firmada (HMAC-SHA256 con ATLAS_SESSION_SECRET) que el servidor emite al entrar con la cuenta
// de Supabase y renueva en cada refresh. Abre la app y su API; la nube sigue usando el token de Supabase de cada persona.
// Sin ATLAS_SESSION_SECRET (solo en loopback, para desarrollo y pruebas) no hay inicio de sesión obligatorio.
import {createHmac, timingSafeEqual} from 'node:crypto';

export const COOKIE = 'atlas_sesion', VIVA = 'atlas_activa', SIN_LOGIN = 'atlas_sin_login';
const DIA = 86400000, RECORDADA = 30 * DIA, TEMPORAL = DIA / 2;
const firmar = (secreto, valor) => createHmac('sha256', secreto).update(valor).digest('base64url');

// Valor de la cookie: datos en base64url + firma. Lo usan el servidor y las pruebas.
export function cookieDeSesion(secreto, {usuario, rol, recordar = true}, ahora = Date.now()) {
  const datos = Buffer.from(JSON.stringify({u: usuario, r: rol, m: recordar ? 1 : 0, x: ahora + (recordar ? RECORDADA : TEMPORAL)})).toString('base64url');
  return datos + '.' + firmar(secreto, datos);
}

export function crearSesiones(env) {
  const secreto = env.ATLAS_SESSION_SECRET || '', activa = !!secreto;
  const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(([k, v]) => k && v != null).map(([k, ...v]) => [k, v.join('=')]));
  const segura = req => req.headers['x-forwarded-proto'] === 'https' || !!env.RENDER;
  const agregar = (res, valor) => { const previas = res.getHeader('Set-Cookie') || []; res.setHeader('Set-Cookie', [...[].concat(previas), valor]); };
  const atributos = (req, extra = '') => '; Path=/; SameSite=Lax' + (segura(req) ? '; Secure' : '') + extra;

  function leer(req) {
    if (!activa) return null;
    const valor = cookies(req)[COOKIE];
    if (!valor || valor.length > 2048) return null;
    const [datos, firma] = valor.split('.');
    if (!datos || !firma) return null;
    const esperada = Buffer.from(firmar(secreto, datos)), recibida = Buffer.from(firma);
    if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
    try {
      const s = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'));
      return Number(s.x) > Date.now() && typeof s.u === 'string' ? {usuario: s.u, rol: s.r, recordar: !!s.m} : null;
    } catch { return null; }
  }
  // Recordada: dura 30 días en el equipo. Sin recordar: cookie de navegador (se borra al cerrarlo) y una marca
  // legible por la página (VIVA) para que la copia sin conexión también cierre la sesión.
  function emitir(req, res, {usuario, rol, recordar}) {
    if (!activa) return;
    agregar(res, COOKIE + '=' + cookieDeSesion(secreto, {usuario, rol, recordar}) + atributos(req, '; HttpOnly' + (recordar ? '; Max-Age=' + RECORDADA / 1000 : '')));
    if (!recordar) agregar(res, VIVA + '=1' + atributos(req));
  }
  function borrar(req, res) {
    for (const nombre of [COOKIE, VIVA]) agregar(res, nombre + '=' + atributos(req, '; Max-Age=0'));
  }
  // Servidor de desarrollo sin sesión obligatoria: avisa a la página para que no mande al inicio de sesión.
  function marcarModo(req, res) {
    if (!activa) agregar(res, SIN_LOGIN + '=1' + atributos(req));
    else if (cookies(req)[SIN_LOGIN]) agregar(res, SIN_LOGIN + '=' + atributos(req, '; Max-Age=0'));
  }
  return {activa, leer, emitir, borrar, marcarModo};
}
