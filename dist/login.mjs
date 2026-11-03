// Inicio de sesión de Atlas: entra con la cuenta de Supabase (usuario o correo) y vuelve a la dirección pedida.
// La sesión queda en el equipo con la misma clave que usa la nube (atlas-nube-sesion), así la sincronización arranca
// sola; el servidor deja además la cookie de Atlas que abre la app y su API.
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

function mostrar(texto, tipo = '') { estado.textContent = texto; if (tipo) estado.dataset.tipo = tipo; else delete estado.dataset.tipo; }
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
  try {
    localStorage.setItem(SESION, JSON.stringify({token: data.token, refresh: data.refresh, expira: Date.now() + data.expiraEn * 1000, user: data.user, recordar}));
  } catch {
    boton.disabled = false; return mostrar('Este navegador no permite guardar la sesión (¿modo privado?). Ábrelo en una ventana normal.', 'error');
  }
  location.replace(destino);
});
