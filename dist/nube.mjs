import {syncLastPlanner} from './lastplanner-sync.mjs';
// Nube: sincronización de proyectos, observaciones con fotos, avance por recinto y Last Planner entre equipos, con la cuenta personal con
// que se entró a Atlas (login.html). Sin conexión todo sigue guardándose en este equipo; se sincroniza al volver la
// señal, un segundo después de cada guardado, al salir de la app y cada 3 minutos con la app abierta.
// El botón de estado de la cabecera muestra cuántos cambios de este equipo faltan por subir («Todo subido» cuando no
// queda nada) y abre el detalle con «Subir ahora». Cerrar sesión con cambios sin subir pide confirmación.
import {crearSincronizador} from './nube-sync.mjs';
import {validateMarking} from './marking-model.mjs';
import {readMarkings, saveMarking, replaceMarking} from './marking-store.mjs';
import {leerParaNube, idsFotos, leerFoto, guardarDesdeNube, guardarFotoDesdeNube} from './observaciones-store.mjs';
import {leerAvanceParaNube, guardarAvanceDesdeNube} from './avance-store.mjs';
import {refrescarContornosNube} from './contornos-nube.mjs';
import {refrescarPlanillasNube} from './planilla-avance-nube.mjs';

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
  todos: () => metaPedir('registros', 'readonly', s => s.getAll()),
  fotosListas: () => metaPedir('fotos', 'readonly', s => s.getAllKeys()),
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
  // Avance por recinto: rombo, ficha y pincel de los proyectos de partida.
  avances: leerAvanceParaNube,
  escribirAvance: guardarAvanceDesdeNube,
  idsFotos, leerFoto,
  guardarFoto: async foto => guardarFotoDesdeNube({...foto, ...await medidas(foto.datos)}),
};

// Con señal débil un pedido puede quedar colgado y con él toda la sincronización: cada pedido tiene un límite.
function limite(ms) {
  if (AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal;
}
async function api(method, ruta, cuerpo, {tipo, binario} = {}) {
  const s = leerSesion(); if (!s) throw error('Inicia sesión en Atlas para usar la nube.', 401);
  const r = await fetch(ruta, {method, cache: 'no-store', signal: limite(binario || tipo ? 90000 : 30000), headers: {'X-Campo-Session': s.token, ...(cuerpo != null ? {'Content-Type': tipo || 'application/json'} : {})}, ...(cuerpo != null ? {body: tipo ? cuerpo : JSON.stringify(cuerpo)} : {})});
  if (r.ok) return binario ? r.arrayBuffer() : r.json();
  const data = await r.json().catch(() => null);
  throw error(data?.error || 'La nube respondió con error ' + r.status + '.', r.status, data);
}
// La sesión dura una hora; se renueva con el refresh token antes de vencer (o al recibir 401). La renovación también
// renueva la cookie de Atlas, con la misma duración que se eligió al entrar («Recordar mi sesión»).
async function renovar(forzar = false) {
  const s = leerSesion(); if (!s) throw error('Inicia sesión en Atlas para usar la nube.', 401);
  if (!forzar && s.expira - Date.now() > 120000) return;
  const r = await fetch('/api/campo/refresh', {method: 'POST', cache: 'no-store', signal: limite(30000), headers: {'Content-Type': 'application/json'}, body: JSON.stringify({refresh: s.refresh, recordar: s.recordar !== false})});
  const data = await r.json().catch(() => null);
  if (r.status === 401 || r.status === 403) throw error(data?.error || 'Tu sesión terminó. Vuelve a entrar.', 401);
  if (!r.ok) throw error(data?.error || 'No se pudo renovar la sesión.', r.status);
  guardarSesion({token: data.token, refresh: data.refresh, expira: Date.now() + data.expiraEn * 1000, user: data.user, recordar: s.recordar !== false});
}

function aviso(texto) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = texto; t.style.display = 'block'; clearTimeout(aviso.timer); aviso.timer = setTimeout(() => { t.style.display = 'none'; }, 5500);
}
const ICONO_NUBE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1-.5 8.5H7z"/><path d="M12 15V11"/><path d="m10 12.5 2-2 2 2"/></svg>';
const UNIDADES = [['avances', 'avance de recinto', 'avances de recintos'], ['observaciones', 'observación', 'observaciones'], ['proyectos', 'proyecto', 'proyectos'], ['fotos', 'foto', 'fotos']];
const ULTIMA = 'atlas-nube-ultima';
function haceCuanto(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.round(min / 60); if (h < 24) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
  return new Date(ms).toLocaleString('es-CL', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
}
const ICONO_SALIR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M21 12H10"/><path d="m17 8 4 4-4 4"/></svg>';

// Se inicia en la portada de pisos (floor-explorer.mjs) para que la sesión y la sincronización funcionen en toda la app.
export function iniciarNube({toast = aviso} = {}) {
  if (document.getElementById('logoutButton')) return;
  const motor = crearSincronizador({api, local, meta, avisar: toast, validarProyecto: doc => validateMarking({...doc, version: 1})});
  const s0 = leerSesion(), boton = document.createElement('button');
  boton.id = 'logoutButton'; boton.type = 'button'; boton.className = 'logoutButton';
  boton.innerHTML = ICONO_SALIR + '<span>Cerrar sesión</span>';
  boton.title = s0?.user ? 'Cerrar la sesión de ' + (s0.user.nombre || s0.user.username) : 'Cerrar sesión';
  boton.setAttribute('aria-label', boton.title);
  const ancla = document.getElementById('offlineOpen');
  if (ancla) ancla.after(boton); else document.querySelector('header')?.append(boton);

  // Estado de la nube: botón en la cabecera y su detalle.
  const estado = document.createElement('button');
  estado.id = 'nubeEstado'; estado.type = 'button'; estado.className = 'nubeEstado';
  estado.innerHTML = ICONO_NUBE + '<span class="nubeTexto"></span><b class="nubeCuenta" hidden></b>';
  boton.before(estado);
  const dialogo = document.createElement('dialog');
  dialogo.id = 'nubeDialog'; dialogo.className = 'nubeDialog'; dialogo.setAttribute('aria-labelledby', 'nubeTitulo');
  dialogo.innerHTML = '<button type="button" class="close" data-cerrar aria-label="Cerrar">×</button><div class="section-label">NUBE DE ATLAS</div>'
    + '<h2 id="nubeTitulo">Cambios de este equipo</h2><p id="nubeDetalle" role="status" aria-live="polite"></p><ul id="nubeLista"></ul>'
    + '<p id="nubeUltima" class="muted"></p><div class="nubeAcciones"><button type="button" id="nubeSubir" class="primary">Subir ahora</button></div>';
  document.body.append(dialogo);
  dialogo.querySelector('[data-cerrar]').onclick = () => dialogo.close();
  dialogo.addEventListener('click', e => { if (e.target === dialogo) dialogo.close(); });

  let enCurso = null, otraVez = false, temporizador = 0, ultimoAviso = '', subiendo = false, pend = null, errorNube = '', contando = 0;
  let ultima = Number((() => { try { return localStorage.getItem(ULTIMA); } catch { return 0; } })()) || 0;
  const esEditor = () => leerSesion()?.user?.role === 'editor';
  function pintar() {
    const s = leerSesion(); estado.hidden = !s; if (!s) return;
    const n = pend?.total || 0, lector = !esEditor(), online = navigator.onLine;
    const texto = subiendo ? 'Subiendo…' : lector ? 'Solo lectura' : n ? n + ' sin subir' : pend ? 'Todo subido' : 'Nube';
    estado.querySelector('.nubeTexto').textContent = texto;
    const cuenta = estado.querySelector('.nubeCuenta'); cuenta.hidden = !n || lector; cuenta.textContent = n > 99 ? '99+' : String(n);
    estado.classList.toggle('pendiente', !!n && !lector);
    estado.classList.toggle('listo', !!pend && !n && !lector && !subiendo);
    estado.classList.toggle('subiendo', subiendo);
    estado.title = texto + (ultima ? ' · última sincronización ' + haceCuanto(ultima) : '');
    estado.setAttribute('aria-label', 'Nube: ' + estado.title);
    if (!dialogo.open) return;
    const lista = UNIDADES.filter(([k]) => pend?.[k]).map(([k, uno, varios]) => { const li = document.createElement('li'); li.textContent = pend[k] + ' ' + (pend[k] === 1 ? uno : varios); return li; });
    dialogo.querySelector('#nubeLista').replaceChildren(...(lector ? [] : lista));
    dialogo.querySelector('#nubeDetalle').textContent = lector
      ? 'Tu cuenta es de solo lectura: ves lo que suben los demás, pero lo que marques aquí queda solo en este equipo.'
      : subiendo ? 'Subiendo los cambios de este equipo…'
      : !n ? (pend ? 'Todo lo marcado en este equipo ya está en la nube.' : 'Revisando los cambios de este equipo…')
      : !online ? 'Sin señal. Estos cambios están guardados en este equipo y se suben solos cuando vuelva la señal:'
      : (errorNube ? 'No se pudieron subir todos. ' + errorNube + ' Quedan:' : 'Estos cambios aún no están en la nube:');
    dialogo.querySelector('#nubeUltima').textContent = ultima ? 'Última sincronización: ' + haceCuanto(ultima) + '.' : 'Este equipo aún no se sincroniza con esta cuenta.';
    const subir = dialogo.querySelector('#nubeSubir');
    subir.disabled = subiendo || !online || lector; subir.textContent = subiendo ? 'Subiendo…' : 'Subir ahora';
    subir.hidden = lector;
  }
  // Se cuentan los pendientes después de cada cambio y de cada sincronización (agrupados, no en cada toque).
  function contar(ms = 300) {
    clearTimeout(contando);
    return new Promise(resolve => { contando = setTimeout(async () => { if (leerSesion()) { try { pend = await motor.pendientes(); } catch {} } pintar(); resolve(pend); }, ms); });
  }
  estado.onclick = () => { if (!dialogo.open) dialogo.showModal(); pintar(); contar(0); };
  dialogo.querySelector('#nubeSubir').onclick = async () => {
    await sincronizar(); const p = await contar(0);
    if (!errorNube) toast(p?.total ? (p.total === 1 ? 'Queda 1 cambio sin subir.' : 'Quedan ' + p.total + ' cambios sin subir.') : 'Listo: todo lo de este equipo está en la nube.');
  };
  setInterval(() => { if (document.visibilityState === 'visible') pintar(); }, 60000);
  const bloquear = fn => navigator.locks?.request ? navigator.locks.request('atlas-nube', fn) : fn();
  const sesionTerminada = () => { guardarSesion(null); irAlLogin('expirada'); };
  async function unaVez() {
    if (!leerSesion() || !navigator.onLine) return;
    subiendo = true; pintar();
    try {
      await bloquear(async () => {
        await renovar();
        const sincronizar = async () => {const resultado=await motor(leerSesion().user.role),lp=await syncLastPlanner(api,leerSesion().user.role);if(lp.conflictos)throw error('Last Planner tiene conflictos con otro equipo. Los datos locales se conservan; descarga un respaldo antes de resolverlos.',409);if(lp.avisos?.length)toast('Mis tareas: '+lp.avisos.at(-1));return {...resultado,lastPlanner:lp};};
        try { return await sincronizar(); }
        catch (e) { if (e.status !== 401) throw e; await renovar(true); return sincronizar(); }
      });
      ultimoAviso = ''; errorNube = ''; ultima = Date.now();
      try { localStorage.setItem(ULTIMA, String(ultima)); } catch {}
      refrescarContornosNube().catch(() => {}); // contornos corregidos desde el editor en otros equipos
      refrescarPlanillasNube().catch(() => {}); // planillas de avance cargadas desde el escritorio
    } catch (e) {
      if (e.status === 401) return sesionTerminada();
      // El error se avisa una vez (no cada 3 minutos) hasta que una vuelta salga bien; el detalle de la nube lo muestra.
      const texto = e.status ? e.message : '';
      errorNube = texto || 'La conexión con la nube no respondió; se reintenta sola.';
      if (texto && texto !== ultimoAviso) { ultimoAviso = texto; toast('Nube: ' + texto); }
    } finally { subiendo = false; contar(0); }
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
    // Lo que no alcanzó a subir sigue en el equipo, pero solo se sube cuando alguien vuelva a entrar aquí con señal.
    const quedan = esEditor() ? (await motor.pendientes().catch(() => null))?.total || 0 : 0;
    if (quedan && !confirm(`${quedan === 1 ? 'Queda 1 cambio' : 'Quedan ' + quedan + ' cambios'} de este equipo sin subir${navigator.onLine ? '' : ' (no hay señal)'}. `
      + 'Siguen guardados aquí y se subirán cuando alguien vuelva a entrar en este equipo con señal. ¿Cerrar sesión igual?')) {
      boton.disabled = false; boton.querySelector('span').textContent = 'Cerrar sesión'; contar(0); return;
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

  // Cada cambio de este equipo se sube al segundo (los toques seguidos se juntan en una sola subida).
  for (const nombre of ['atlas-observaciones-changed', 'atlas-markings-changed','atlas-lastplanner-changed','atlas-jerarquia-changed']) window.addEventListener(nombre, e => { if (e.detail?.origen !== 'nube' && leerSesion()) { contar(); programar(1000); } });
  // El avance también avisa al bajar una planilla o lo de otro equipo: solo lo marcado en este equipo se sube.
  window.addEventListener('atlas-avance-changed', e => { if (e.detail?.origen === 'equipo' && leerSesion()) { contar(); programar(1000); } });
  window.addEventListener('online', () => { pintar(); programar(1000); });
  window.addEventListener('offline', pintar);
  // Al salir de la app (cambiar de aplicación, bloquear el teléfono) se intenta subir lo pendiente en ese momento.
  document.addEventListener('visibilitychange', () => {
    if (!leerSesion()) return;
    if (document.visibilityState === 'visible') programar(1000);
    else if (pend?.total && navigator.onLine) { clearTimeout(temporizador); sincronizar(); }
  });
  // Una actualización espera a que termine la subida en curso (recargar no pierde nada, pero corta la subida).
  window.addEventListener('atlas-before-update', e => { if (subiendo) e.preventDefault(); });
  window.addEventListener('atlas-session-changed', () => { pend = null; pintar(); contar(0); });
  setInterval(() => { if (document.visibilityState === 'visible' && leerSesion()) sincronizar(); }, 180000);
  pintar(); contar(0);
  comprobarCookie().finally(() => { if (leerSesion()) programar(2000); });
  return {sincronizar};
}
