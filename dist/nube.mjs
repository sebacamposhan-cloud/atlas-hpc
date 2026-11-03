import {syncLastPlanner} from './lastplanner-sync.mjs';
// Nube: sincronización de proyectos, observaciones con fotos y Last Planner entre equipos, con la cuenta personal con
// que se entró a Atlas (login.html). Sin conexión todo sigue guardándose en este equipo; se sincroniza al volver la
// señal, después de cada guardado y cada 3 minutos con la app abierta. No tiene botón: sus avisos salen como toast.
import {crearSincronizador} from './nube-sync.mjs';
import {readMarkings, saveMarking, replaceMarking} from './marking-store.mjs';
import {leerParaNube, idsFotos, leerFoto, guardarDesdeNube, guardarFotoDesdeNube} from './observaciones-store.mjs';
import {refrescarContornosNube} from './contornos-nube.mjs';

const SESION = 'atlas-nube-sesion';
const leerSesion = () => { try { return JSON.parse(localStorage.getItem(SESION)); } catch { return null; } };
const guardarSesion = s => { try { if (s) localStorage.setItem(SESION, JSON.stringify(s)); else localStorage.removeItem(SESION);window.dispatchEvent(new Event('atlas-session-changed')); } catch {} };
const error = (mensaje, status, data) => Object.assign(Error(mensaje), {status, data});
const irAlLogin = motivo => location.replace('/login.html?' + new URLSearchParams({...(motivo ? {motivo} : {}), next: location.pathname + location.search + location.hash}));

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
  const s = leerSesion(); if (!s) throw error('Inicia sesión en Atlas para usar la nube.', 401);
  const r = await fetch(ruta, {method, cache: 'no-store', headers: {'X-Campo-Session': s.token, ...(cuerpo != null ? {'Content-Type': tipo || 'application/json'} : {})}, ...(cuerpo != null ? {body: tipo ? cuerpo : JSON.stringify(cuerpo)} : {})});
  if (r.ok) return binario ? r.arrayBuffer() : r.json();
  const data = await r.json().catch(() => null);
  throw error(data?.error || 'La nube respondió con error ' + r.status + '.', r.status, data);
}
// La sesión dura una hora; se renueva con el refresh token antes de vencer (o al recibir 401). La renovación también
// renueva la cookie de Atlas, con la misma duración que se eligió al entrar («Recordar mi sesión»).
async function renovar(forzar = false) {
  const s = leerSesion(); if (!s) throw error('Inicia sesión en Atlas para usar la nube.', 401);
  if (!forzar && s.expira - Date.now() > 120000) return;
  const r = await fetch('/api/campo/refresh', {method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({refresh: s.refresh, recordar: s.recordar !== false})});
  const data = await r.json().catch(() => null);
  if (r.status === 401 || r.status === 403) throw error(data?.error || 'Tu sesión terminó. Vuelve a entrar.', 401);
  if (!r.ok) throw error(data?.error || 'No se pudo renovar la sesión.', r.status);
  guardarSesion({token: data.token, refresh: data.refresh, expira: Date.now() + data.expiraEn * 1000, user: data.user, recordar: s.recordar !== false});
}

function aviso(texto) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = texto; t.style.display = 'block'; clearTimeout(aviso.timer); aviso.timer = setTimeout(() => { t.style.display = 'none'; }, 5500);
}
const ICONO_SALIR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M21 12H10"/><path d="m17 8 4 4-4 4"/></svg>';

// Se inicia en la portada de pisos (floor-explorer.mjs) para que la sesión y la sincronización funcionen en toda la app.
export function iniciarNube({toast = aviso} = {}) {
  if (document.getElementById('logoutButton')) return;
  const motor = crearSincronizador({api, local, meta, avisar: toast});
  const s0 = leerSesion(), boton = document.createElement('button');
  boton.id = 'logoutButton'; boton.type = 'button'; boton.className = 'logoutButton';
  boton.innerHTML = ICONO_SALIR + '<span>Cerrar sesión</span>';
  boton.title = s0?.user ? 'Cerrar la sesión de ' + (s0.user.nombre || s0.user.username) : 'Cerrar sesión';
  boton.setAttribute('aria-label', boton.title);
  const ancla = document.getElementById('offlineOpen');
  if (ancla) ancla.after(boton); else document.querySelector('header')?.append(boton);

  let enCurso = null, otraVez = false, temporizador = 0, ultimoAviso = '';
  const bloquear = fn => navigator.locks?.request ? navigator.locks.request('atlas-nube', fn) : fn();
  const sesionTerminada = () => { guardarSesion(null); irAlLogin('expirada'); };
  async function unaVez() {
    if (!leerSesion() || !navigator.onLine) return;
    try {
      await bloquear(async () => {
        await renovar();
        const sincronizar = async () => {const resultado=await motor(leerSesion().user.role),lp=await syncLastPlanner(api,leerSesion().user.role);if(lp.conflictos)throw error('Last Planner tiene conflictos con otro equipo. Los datos locales se conservan; descarga un respaldo antes de resolverlos.',409);return {...resultado,lastPlanner:lp};};
        try { return await sincronizar(); }
        catch (e) { if (e.status !== 401) throw e; await renovar(true); return sincronizar(); }
      });
      ultimoAviso = '';
      refrescarContornosNube().catch(() => {}); // contornos corregidos desde el editor en otros equipos
    } catch (e) {
      if (e.status === 401) return sesionTerminada();
      // Sin botón de estado, el error se avisa una vez (no cada 3 minutos) hasta que una vuelta salga bien.
      const texto = e.status ? e.message : '';
      if (texto && texto !== ultimoAviso) { ultimoAviso = texto; toast('Nube: ' + texto); }
    }
  }
  function sincronizar() {
    if (enCurso) { otraVez = true; return enCurso; }
    enCurso = (async () => { try { do { otraVez = false; await unaVez(); } while (otraVez); } finally { enCurso = null; } })();
    return enCurso;
  }
  const programar = (ms = 4000) => { clearTimeout(temporizador); temporizador = setTimeout(sincronizar, ms); };

  // Al abrir: si la cookie de Atlas venció (equipo mucho tiempo sin señal), se renueva con la sesión guardada.
  async function comprobarCookie() {
    if (!leerSesion() || !navigator.onLine) return;
    try {
      const r = await fetch('/api/sesion', {cache: 'no-store'});
      if (r.status === 401) await bloquear(() => renovar(true));
    } catch (e) { if (e.status === 401) sesionTerminada(); }
  }

  boton.onclick = async () => {
    if (!confirm('¿Cerrar la sesión en este equipo? Para volver a entrar necesitarás señal. Lo guardado sigue aquí.')) return;
    boton.disabled = true;
    if (navigator.onLine && leerSesion()) {
      boton.querySelector('span').textContent = 'Subiendo cambios…';
      await Promise.race([sincronizar(), new Promise(r => setTimeout(r, 15000))]).catch(() => {});
    }
    await api('POST', '/api/campo/logout', {}).catch(() => {});
    guardarSesion(null);
    location.replace('/login.html?motivo=salir');
  };
  // Pedidos de sesión de otros módulos (firma, Last Planner): sin sesión, al inicio de sesión; con sesión, falta permiso.
  window.addEventListener('atlas-nube-open', event => {
    event.preventDefault();
    if (!leerSesion()) return irAlLogin();
    toast(event.detail?.cambiarCuenta ? 'Para entrar con otra cuenta, usa «Cerrar sesión» y vuelve a entrar.' : 'Tu cuenta no tiene permiso para esta operación. Pide a la administración que te lo asigne.');
  });

  for (const nombre of ['atlas-observaciones-changed', 'atlas-markings-changed','atlas-lastplanner-changed']) window.addEventListener(nombre, e => { if (e.detail?.origen !== 'nube' && leerSesion()) programar(); });
  window.addEventListener('online', () => programar(1000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && leerSesion()) programar(1000); });
  setInterval(() => { if (document.visibilityState === 'visible' && leerSesion()) sincronizar(); }, 180000);
  comprobarCookie().finally(() => { if (leerSesion()) programar(2000); });
  return {sincronizar};
}
