// Nube: sesión con la cuenta personal de Atlas (Supabase) y sincronización de proyectos y observaciones
// con fotos entre equipos. Sin conexión todo sigue guardándose en este equipo; se sincroniza al volver la señal,
// después de cada guardado y cada 3 minutos con la app abierta.
import {crearSincronizador} from './nube-sync.mjs';
import {readMarkings, saveMarking, replaceMarking} from './marking-store.mjs';
import {leerParaNube, idsFotos, leerFoto, guardarDesdeNube, guardarFotoDesdeNube} from './observaciones-store.mjs';

const SESION = 'atlas-nube-sesion';
const leerSesion = () => { try { return JSON.parse(localStorage.getItem(SESION)); } catch { return null; } };
const guardarSesion = s => { try { if (s) localStorage.setItem(SESION, JSON.stringify(s)); else localStorage.removeItem(SESION); } catch {} };
const error = (mensaje, status, data) => Object.assign(Error(mensaje), {status, data});

// Lo último sincronizado: versión y huella de cada registro, fotos ya en la nube y desde cuándo pedir cambios.
function abrirMeta() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('atlas-nube', 1);
    r.onupgradeneeded = () => { for (const [tabla, keyPath] of [['registros', 'clave'], ['fotos', 'id'], ['estado', 'clave']]) r.result.createObjectStore(tabla, {keyPath}); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function metaPedir(tabla, modo, hacer) {
  const db = await abrirMeta();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(tabla, modo), req = hacer(tx.objectStore(tabla));
      tx.oncomplete = () => resolve(req.result); tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
const meta = {
  leer: clave => metaPedir('registros', 'readonly', s => s.get(clave)),
  escribir: (clave, valor) => metaPedir('registros', 'readwrite', s => s.put({clave, ...valor})),
  fotoLista: async id => !!await metaPedir('fotos', 'readonly', s => s.get(id)),
  marcarFoto: id => metaPedir('fotos', 'readwrite', s => s.put({id})),
  desde: async () => (await metaPedir('estado', 'readonly', s => s.get('desde')))?.valor || null,
  guardarDesde: valor => metaPedir('estado', 'readwrite', s => s.put({clave: 'desde', valor})),
};

async function medidas(datos) {
  try { const b = await createImageBitmap(new Blob([datos], {type: 'image/jpeg'})), m = {ancho: b.width, alto: b.height}; b.close?.(); return m; } catch { return {}; }
}
const local = {
  proyectos: readMarkings,
  escribirProyecto: replaceMarking,
  crearProyecto: doc => saveMarking(doc, 0),
  observaciones: leerParaNube,
  escribirObservacion: guardarDesdeNube,
  idsFotos, leerFoto,
  guardarFoto: async foto => guardarFotoDesdeNube({...foto, ...await medidas(foto.datos)}),
};

async function api(method, ruta, cuerpo, {tipo, binario} = {}) {
  const s = leerSesion(); if (!s) throw error('Entra con tu cuenta para usar la nube.', 401);
  const r = await fetch(ruta, {method, cache: 'no-store', headers: {'X-Campo-Session': s.token, ...(cuerpo != null ? {'Content-Type': tipo || 'application/json'} : {})}, ...(cuerpo != null ? {body: tipo ? cuerpo : JSON.stringify(cuerpo)} : {})});
  if (r.ok) return binario ? r.arrayBuffer() : r.json();
  const data = await r.json().catch(() => null);
  throw error(data?.error || 'La nube respondió con error ' + r.status + '.', r.status, data);
}
async function entrar(username, password) {
  const r = await fetch('/api/campo/login', {method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password})});
  const data = await r.json().catch(() => null);
  if (!r.ok) throw error(data?.error || 'No se pudo entrar.', r.status);
  guardarSesion({token: data.token, refresh: data.refresh, expira: Date.now() + data.expiraEn * 1000, user: data.user});
}
// La sesión dura una hora; se renueva con el refresh token antes de vencer (o al recibir 401).
async function renovar(forzar = false) {
  const s = leerSesion(); if (!s) throw error('Entra con tu cuenta para usar la nube.', 401);
  if (!forzar && s.expira - Date.now() > 120000) return;
  const r = await fetch('/api/campo/refresh', {method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({refresh: s.refresh})});
  const data = await r.json().catch(() => null);
  if (r.status === 401 || r.status === 403) throw error(data?.error || 'Tu sesión terminó. Vuelve a entrar.', 401);
  if (!r.ok) throw error(data?.error || 'No se pudo renovar la sesión.', r.status);
  guardarSesion({token: data.token, refresh: data.refresh, expira: Date.now() + data.expiraEn * 1000, user: data.user});
}

const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function aviso(texto) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = texto; t.style.display = 'block'; clearTimeout(aviso.timer); aviso.timer = setTimeout(() => { t.style.display = 'none'; }, 5500);
}

// Se inicia en la portada de pisos (floor-explorer.mjs) para que la sesión y la sincronización funcionen en toda la app.
export function iniciarNube({toast = aviso, esc = escapar} = {}) {
  if (document.getElementById('nubeOpen')) return;
  const motor = crearSincronizador({api, local, meta, avisar: toast});
  const boton = document.createElement('button');
  boton.id = 'nubeOpen'; boton.className = 'nubeButton'; boton.setAttribute('aria-haspopup', 'dialog');
  boton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.5 4.5 0 0 0 7 18z"/></svg><i aria-hidden="true"></i><span>Nube</span>';
  const ancla = document.getElementById('offlineOpen');
  if (ancla) ancla.after(boton); else document.querySelector('header')?.append(boton);
  const dialog = document.createElement('dialog');
  dialog.id = 'nubeDialog'; dialog.setAttribute('aria-label', 'Guardado en la nube'); document.body.append(dialog);

  let estado = {fase: !leerSesion() ? 'sin-sesion' : navigator.onLine ? 'listo' : 'sin-conexion'}, enCurso = null, otraVez = false, temporizador = 0;
  const hora = d => d.toLocaleTimeString('es-CL', {hour: '2-digit', minute: '2-digit'});
  const TEXTOS = {
    'sin-sesion': ['Nube', 'Entra para guardar proyectos y observaciones en la nube compartida'],
    sincronizando: ['Sincronizando…', 'Subiendo y bajando cambios'],
    listo: ['En la nube', 'Sincronizado'],
    'sin-conexion': ['Sin red', 'Sin conexión: se guarda en este equipo y se sube al volver la señal'],
    error: ['Nube', 'No se pudo sincronizar'],
  };
  function mostrar(nuevo) {
    estado = {...estado, ...nuevo};
    const [texto, titulo] = TEXTOS[estado.fase];
    boton.dataset.fase = estado.fase;
    boton.querySelector('span').textContent = texto;
    boton.title = estado.fase === 'listo' ? (estado.ultimo ? 'Sincronizado a las ' + hora(estado.ultimo) : 'Sesión iniciada') : estado.fase === 'error' ? titulo + ': ' + estado.mensaje : titulo;
    boton.setAttribute('aria-label', 'Nube: ' + boton.title);
    if (dialog.open) panel();
  }

  const bloquear = fn => navigator.locks?.request ? navigator.locks.request('atlas-nube', fn) : fn();
  async function unaVez() {
    const s = leerSesion();
    if (!s) return mostrar({fase: 'sin-sesion'});
    if (!navigator.onLine) return mostrar({fase: 'sin-conexion'});
    mostrar({fase: 'sincronizando', mensaje: ''});
    try {
      const resumen = await bloquear(async () => {
        await renovar();
        try { return await motor(leerSesion().user.role); }
        catch (e) { if (e.status !== 401) throw e; await renovar(true); return motor(leerSesion().user.role); }
      });
      mostrar({fase: 'listo', ultimo: new Date(), resumen});
    } catch (e) {
      if (e.status === 401) { guardarSesion(null); mostrar({fase: 'sin-sesion', mensaje: e.message}); toast('Nube: ' + e.message); }
      else mostrar({fase: navigator.onLine ? 'error' : 'sin-conexion', mensaje: e.status ? e.message : 'Sin conexión con la nube; se reintentará.'});
    }
  }
  function sincronizar() {
    if (enCurso) { otraVez = true; return enCurso; }
    enCurso = (async () => { try { do { otraVez = false; await unaVez(); } while (otraVez); } finally { enCurso = null; } })();
    return enCurso;
  }
  const programar = (ms = 4000) => { clearTimeout(temporizador); temporizador = setTimeout(sincronizar, ms); };

  function resumenTexto(r) {
    if (!r) return '';
    const partes = [[r.subidos, 'subidos'], [r.bajados, 'bajados'], [r.fotosSubidas, 'fotos subidas'], [r.fotosBajadas, 'fotos bajadas'], [r.conflictos, 'cruzados con otro equipo'], [r.fotosEsperando, 'fotos aún no subidas por otro equipo'], [r.errores, 'con error']].filter(([n]) => n).map(([n, t]) => n + ' ' + t);
    return partes.length ? ' · ' + partes.join(', ') : ' · sin cambios';
  }
  function panel() {
    const s = leerSesion();
    if (!s) {
      dialog.innerHTML = `<h2>Guardar en la nube</h2>
        <p>Entra con tu cuenta de Atlas para que los proyectos y las observaciones con fotos queden en la nube y se vean en los demás equipos. Sin conexión todo se sigue guardando en este equipo y se sube al volver la señal.</p>
        <form id="nubeLogin"><label>Correo<input type="email" name="username" autocomplete="username" required></label>
        <label>Contraseña<input type="password" name="password" autocomplete="current-password" required></label>
        <p id="nubeError" role="alert">${esc(estado.mensaje || '')}</p>
        <div class="nubeAcciones"><button type="button" data-cerrar>Cerrar</button><button class="primary">Entrar</button></div></form>`;
      dialog.querySelector('#nubeLogin').onsubmit = async e => {
        e.preventDefault();
        const form = e.target, datos = new FormData(form), enviar = form.querySelector('.primary');
        enviar.disabled = true; dialog.querySelector('#nubeError').textContent = 'Entrando…';
        try { await entrar(String(datos.get('username')).trim(), String(datos.get('password'))); form.reset(); estado.mensaje = ''; panel(); toast('Sesión iniciada. Sincronizando proyectos y observaciones…'); await sincronizar(); }
        catch (failure) { enviar.disabled = false; dialog.querySelector('#nubeError').textContent = failure.status ? failure.message : 'Sin conexión: inténtalo con señal.'; }
      };
    } else {
      const fase = {sincronizando: 'Sincronizando…', listo: estado.ultimo ? 'Sincronizado a las ' + hora(estado.ultimo) + resumenTexto(estado.resumen) : 'Pendiente de sincronizar', 'sin-conexion': 'Sin conexión: los cambios quedan en este equipo y se suben al volver la señal.', error: 'No se pudo sincronizar: ' + (estado.mensaje || ''), 'sin-sesion': ''}[estado.fase];
      dialog.innerHTML = `<h2>Nube</h2>
        <p>Conectado como <b>${esc(s.user.username)}</b> · ${s.user.role === 'editor' ? 'puede editar' : 'solo lectura (tus cambios quedan en este equipo)'}.</p>
        <p class="nubeEstado" role="status">${esc(fase)}</p>
        <p class="nubeNota">Proyectos y observaciones se guardan primero en este equipo y se sincronizan solos después de cada cambio, al volver la conexión y cada 3 minutos. Las fotos se suben a la nube y también quedan aquí.</p>
        <div class="nubeAcciones"><button type="button" data-salir>Cerrar sesión</button><button type="button" data-cerrar>Cerrar</button><button type="button" class="primary" data-ahora ${estado.fase === 'sincronizando' ? 'disabled' : ''}>Sincronizar ahora</button></div>`;
      dialog.querySelector('[data-ahora]').onclick = () => sincronizar();
      dialog.querySelector('[data-salir]').onclick = async () => {
        await api('POST', '/api/campo/logout', {}).catch(() => {});
        guardarSesion(null); mostrar({fase: 'sin-sesion', mensaje: ''}); toast('Sesión cerrada. Lo guardado sigue en este equipo.');
      };
    }
    dialog.querySelector('[data-cerrar]').onclick = () => dialog.close();
  }
  boton.onclick = () => { panel(); if (!dialog.open) dialog.showModal(); };

  for (const nombre of ['atlas-observaciones-changed', 'atlas-markings-changed']) window.addEventListener(nombre, e => { if (e.detail?.origen !== 'nube' && leerSesion()) programar(); });
  window.addEventListener('online', () => programar(1000));
  window.addEventListener('offline', () => { if (leerSesion()) mostrar({fase: 'sin-conexion'}); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && leerSesion()) programar(1000); });
  setInterval(() => { if (document.visibilityState === 'visible' && leerSesion()) sincronizar(); }, 180000);
  mostrar({});
  if (leerSesion()) programar(2000);
  return {sincronizar};
}
