// Inicio de sesión de Atlas: entra con la cuenta de Supabase (usuario o correo) y vuelve a la dirección pedida.
// La sesión queda en el equipo con la misma clave que usa la nube (atlas-nube-sesion), así la sincronización arranca
// sola; el servidor deja además la cookie de Atlas que abre la app y su API.
// Con ?cambiar=1 (botón «Contraseña» de la cabecera) o al entrar con la contraseña temporal, muestra el cambio de
// contraseña; el primer ingreso no abre Atlas hasta elegir una personal.
const SESION = 'atlas-nube-sesion';
const form = document.getElementById('acceso'), estado = document.getElementById('estado'), boton = form.querySelector('.entrar');
const params = new URLSearchParams(location.search);
// Solo direcciones de esta misma app, para no redirigir a otro sitio.
const siguiente = params.get('next') || '/';
const destino = /^\/(?![/\\])/.test(siguiente) && !siguiente.includes('\\') && !/^\/login(\.html)?(?:[?#]|$)/.test(siguiente) ? siguiente : '/';
const MOTIVOS = {
  salir: 'Sesión cerrada. Lo guardado sigue en este equipo.',
  expirada: 'Tu sesión terminó. Vuelve a iniciar sesión.',
};

function mostrar(texto, tipo = '', donde = estado) { donde.textContent = texto; if (tipo) donde.dataset.tipo = tipo; else delete donde.dataset.tipo; }
const sinRed = () => mostrar('Sin conexión: necesitas señal para iniciar sesión.', 'error');
if (MOTIVOS[params.get('motivo')]) mostrar(MOTIVOS[params.get('motivo')]);
if (!navigator.onLine) sinRed();
addEventListener('offline', sinRed);
addEventListener('online', () => { if (estado.dataset.tipo === 'error') mostrar(''); });

const ver = form.querySelector('.ver');
ver.addEventListener('click', () => {
  const visible = ver.getAttribute('aria-pressed') !== 'true';
  form.clave.type = visible ? 'text' : 'password';
  ver.setAttribute('aria-pressed', String(visible));
  ver.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
});
const olvido = form.querySelector('.olvido'), aviso = document.getElementById('olvidoAviso');
olvido.addEventListener('click', () => { aviso.hidden = !aviso.hidden; olvido.setAttribute('aria-expanded', String(!aviso.hidden)); });

// Guarda la sesión que devuelve el servidor y vuelve a la dirección pedida. Falso si el navegador no deja guardarla.
function abrirAtlas(data, recordar) {
  try {
    localStorage.setItem(SESION, JSON.stringify({token: data.token, refresh: data.refresh, expira: Date.now() + data.expiraEn * 1000, user: data.user, recordar}));
  } catch { return false; }
  location.replace(destino);
  return true;
}
const SIN_GUARDAR = 'Este navegador no permite guardar la sesión (¿modo privado?). Ábrelo en una ventana normal.';

const cambio = document.getElementById('cambio'), estadoCambio = document.getElementById('estadoCambio'), botonCambio = cambio.querySelector('.entrar');
const campoActual = document.getElementById('campoActual'), volver = document.getElementById('volver');
let pendiente = null;
function abrirCambio({usuario, actual = '', recordar = true, primerIngreso = false}) {
  pendiente = {usuario, recordar, primerIngreso};
  form.hidden = true; cambio.hidden = false;
  document.querySelector('h1').textContent = primerIngreso ? 'Crea tu contraseña' : 'Cambiar contraseña';
  document.querySelector('.bajada').textContent = primerIngreso
    ? 'Es tu primer ingreso. Reemplaza la contraseña temporal por una personal: solo tú la conocerás.'
    : 'Escribe tu contraseña actual y la nueva.';
  document.title = 'Atlas HPC · ' + (primerIngreso ? 'Crea tu contraseña' : 'Cambiar contraseña');
  cambio.usuario.value = usuario; cambio.actual.value = actual;
  campoActual.hidden = primerIngreso; volver.hidden = primerIngreso; volver.href = destino;
  (primerIngreso ? cambio.nueva : cambio.actual).focus();
}
cambio.mostrar.addEventListener('change', () => { for (const c of [cambio.actual, cambio.nueva, cambio.repetir]) c.type = cambio.mostrar.checked ? 'text' : 'password'; });
cambio.addEventListener('submit', async event => {
  event.preventDefault();
  const actual = cambio.actual.value, nueva = cambio.nueva.value, error = texto => mostrar(texto, 'error', estadoCambio);
  if (!actual) { cambio.actual.focus(); return error('Escribe tu contraseña actual.'); }
  if (nueva.length < 8) { cambio.nueva.focus(); return error('La nueva contraseña debe tener al menos 8 caracteres.'); }
  if (nueva !== cambio.repetir.value) { cambio.repetir.select(); return error('Las dos contraseñas nuevas no coinciden.'); }
  if (nueva === actual) { cambio.nueva.select(); return error('La nueva contraseña debe ser distinta de la actual.'); }
  if (!navigator.onLine) return error('Sin conexión: necesitas señal para cambiar la contraseña.');
  botonCambio.disabled = true; mostrar('Guardando…', '', estadoCambio);
  let r, data;
  try {
    r = await fetch('/api/campo/clave', {method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: pendiente.usuario, password: actual, nueva, recordar: pendiente.recordar})});
    data = await r.json().catch(() => null);
  } catch {
    botonCambio.disabled = false; return error('Sin conexión con Atlas. Revisa la señal y reintenta.');
  }
  if (!r.ok) {
    botonCambio.disabled = false;
    if (r.status === 401 && pendiente.primerIngreso) { campoActual.hidden = false; cambio.actual.value = ''; cambio.actual.focus(); }
    return error(data?.error || 'No se pudo cambiar la contraseña.');
  }
  mostrar('Contraseña guardada. Entrando…', '', estadoCambio);
  if (!abrirAtlas(data, pendiente.recordar)) { botonCambio.disabled = false; error(SIN_GUARDAR); }
});
if (params.get('cambiar') === '1') {
  let s = null; try { s = JSON.parse(localStorage.getItem(SESION) || 'null'); } catch {}
  if (s?.user?.username) abrirCambio({usuario: s.user.username, recordar: s.recordar !== false});
  else mostrar('Inicia sesión; después podrás cambiar tu contraseña desde Atlas.');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const usuario = form.usuario.value.trim(), clave = form.clave.value, recordar = form.recordar.checked;
  if (!usuario || !clave) { mostrar('Escribe tu usuario o correo y tu contraseña.', 'error'); (usuario ? form.clave : form.usuario).focus(); return; }
  if (!navigator.onLine) return sinRed();
  boton.disabled = true; mostrar('Entrando…');
  let r, data;
  try {
    r = await fetch('/api/campo/login', {method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: usuario, password: clave, recordar})});
    data = await r.json().catch(() => null);
  } catch {
    boton.disabled = false; return mostrar('Sin conexión con Atlas. Revisa la señal y reintenta.', 'error');
  }
  if (!r.ok) {
    boton.disabled = false; form.clave.select();
    return mostrar(data?.error || 'No se pudo iniciar sesión.', 'error');
  }
  if (data?.cambiarClave) { boton.disabled = false; mostrar(''); return abrirCambio({usuario, actual: clave, recordar, primerIngreso: true}); }
  if (!abrirAtlas(data, recordar)) { boton.disabled = false; mostrar(SIN_GUARDAR, 'error'); }
});
