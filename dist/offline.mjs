const $ = id => document.getElementById(id);
let registration, registrationPromise, status, failure = '', progress, poll, updating = false, checking = false, updateProgress = null, updateFailure = '';
// Actualización automática: una versión nueva ya descargada se aplica sola al abrir Atlas, si termina de bajar antes
// de que la persona toque la pantalla, o al volver a la app después de 30 minutos. Nunca con una edición o formulario
// abierto (los módulos cancelan «atlas-before-update»); lo guardado en el equipo no se pierde al recargar.
const AUTO = 'atlas-auto-update', AVISO = 'atlas-actualizada', AUSENCIA = 30 * 60000;
let interactuo = false, ocultaDesde = 0;
for (const tipo of ['pointerdown', 'keydown']) window.addEventListener(tipo, () => { interactuo = true; }, {capture: true, once: true, passive: true});
function aplicarSola() {
  // Solo actualizaciones: en la primera visita no hay versión activa que reemplazar.
  if (!registration?.waiting || !registration.active || updating) return;
  // Una sola vez por minuto: evita recargas en cadena si algo falla.
  try { if (Date.now() - Number(sessionStorage.getItem(AUTO) || 0) < 60000) return; } catch {}
  if (window.dispatchEvent?.(new Event('atlas-before-update', {cancelable: true})) === false) return;
  updating = true;
  try { sessionStorage.setItem(AUTO, String(Date.now())); sessionStorage.setItem(AVISO, '1'); } catch {}
  registration.waiting.postMessage({atlasOffline: true, type: 'ACTIVATE'});
}
const mb = bytes => (bytes / 1e6).toLocaleString('es-CL', {maximumFractionDigits: 1})+' MB';
// Pisos guardados solos: con señal, Atlas guarda en el teléfono la base de la app y cada piso que la persona abre, y
// los mantiene al día. Así, al bajar a un piso sin señal, el plano ya está. La lista de pisos usados se recuerda en
// este equipo (cuando existan pisos asignados por perfil, se suman aquí). Con «Ahorro de datos» activo no baja nada solo.
const USADOS = 'atlas-pisos-sin-conexion';
const pisos = () => (window.ATLAS_PISOS || [{id: 'N-1', nombre: 'Nivel −1', datos: ''}]).map(p => ({...p, pack: p.datos ? p.datos.replace(/\/$/, '') : 'n-1'}));
const pisoActual = () => { const a = window.ATLAS_PISO; return a ? pisos().find(p => p.id === a.id) : null; };
let pisoAbierto = false, autoPendiente = 0, avisoFalta = 0, avisoPendiente = false;
function usados() { try { const v = JSON.parse(localStorage.getItem(USADOS) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function recordar(pack) { const v = usados(); if (v.includes(pack)) return; try { localStorage.setItem(USADOS, JSON.stringify([...v, pack])); } catch {} }
const paquete = pack => status?.packs?.[pack];
// Sin el detalle por paquete (copia antigua del service worker), «plan» listo significa todo el edificio guardado.
const listo = pack => paquete(pack) ? paquete(pack).ready : !!status?.plan?.ready;
const pisoListo = () => { const p = pisoActual(); return !!status && listo('plan') && (!p || !pisoAbierto || listo(p.pack)); };
const todoListo = () => !!status && listo('plan') && pisos().every(p => listo(p.pack));
const ahorroDatos = () => !!navigator.connection?.saveData;
function pendientes(lista) { return lista.filter((p, i) => lista.indexOf(p) === i && !listo(p)); }
function autoGuardar() {
  clearTimeout(autoPendiente);
  // Espera unos segundos: primero se abre el plano, después se guarda en segundo plano.
  autoPendiente = setTimeout(() => {
    if (!registration?.active || !navigator.onLine || ahorroDatos() || !status || status.downloading || !status.packs) return;
    const faltan = pendientes(['plan', ...usados().filter(pack => pisos().some(p => p.pack === pack))]);
    if (faltan.length) { failure = ''; status.downloading = faltan[0]; paint(); request('DOWNLOAD', {packs: faltan}).catch(() => {}); }
  }, 3000);
}
function nombrePack(pack) { return pack === 'documents' ? 'documentos originales' : pack === 'plan' ? 'la base de Atlas' : (pisos().find(p => p.pack === pack)?.nombre || pack).toLowerCase(); }
function paintPisos() {
  const lista = $('offlinePisos');
  if (!lista || !status?.packs) { if (lista) lista.hidden = true; return; }
  lista.hidden = false;
  const actual = pisoAbierto ? pisoActual()?.id : null;
  lista.replaceChildren(...pisos().map(p => {
    const info = paquete(p.pack); if (!info) return document.createTextNode('');
    const fila = document.createElement('li'), nombre = document.createElement('span'), estado = document.createElement('button');
    nombre.textContent = p.nombre + (p.id === actual ? ' · abierto' : '');
    estado.type = 'button'; estado.dataset.pack = p.pack;
    const bajando = status.downloading === p.pack;
    estado.textContent = info.ready ? 'Guardado ✓' : bajando ? 'Guardando…' : (info.count ? 'Continuar' : 'Guardar') + ' · ' + mb(info.bytes - info.savedBytes);
    estado.disabled = info.ready || bajando || !navigator.onLine;
    estado.className = info.ready ? 'ready' : '';
    estado.onclick = () => { recordar(p.pack); download(['plan', p.pack]); };
    fila.append(nombre, estado); return fila;
  }));
}
function paint() {
  try { window.dispatchEvent?.(new Event('atlas-offline-estado')); } catch {}
  const online = navigator.onLine, busy = !!status?.downloading, ready = pisoListo(), actual = pisoAbierto ? pisoActual() : null;
  $('offlineLabel').textContent = busy ? 'Guardando…' : !online ? 'Sin señal' : ready ? 'Disponible offline' : 'Sin guardar';
  $('offlineOpen').classList.toggle('ready', ready);
  $('offlineStatus').classList.toggle('ready', ready && !failure && !busy);
  $('offlineStatus').textContent = failure || (busy ? 'Guardando '+nombrePack(status.downloading)+'… Puedes seguir usando Atlas.' : ready ? (actual ? actual.nombre+' está guardado: funciona sin señal.' : 'Listo para usar sin conexión.') : status ? (online ? (ahorroDatos() ? 'El ahorro de datos está activo: guarda tus pisos con los botones de abajo.' : 'Atlas guarda solo cada piso que abres, mientras tienes señal.') : (actual ? actual.nombre+' no está guardado en este equipo. Las fichas y la búsqueda funcionan; el plano se verá incompleto hasta que vuelva la señal.' : 'La descarga está incompleta. Conéctate para continuar.')) : 'Preparando el modo sin conexión…');
  const total = status?.packs ? Object.entries(status.packs).filter(([k]) => k !== 'documents').reduce((n, [, v]) => n + v.bytes - v.savedBytes, 0) : status?.plan.bytes || 0;
  $('offlineSave').disabled = !status || busy || todoListo() || !online;
  $('offlineSave').textContent = todoListo() ? 'Todos los pisos guardados' : (status?.plan.count > 20 && !status?.packs ? 'Continuar descarga' : 'Guardar todos los pisos')+(status ? ' · '+mb(total) : '');
  paintPisos();
  $('offlineSaveDocuments').disabled = !status?.plan.ready || busy || !!status?.documents.ready || !online;
  $('offlineSaveDocuments').textContent = status?.documents.ready ? 'Originales guardados' : 'Guardar originales'+(status ? ' · '+mb(status.documents.bytes) : '');
  $('offlineDocumentsInfo').textContent = status?.documents.ready ? 'Los documentos originales están disponibles sin internet.' : 'Opcional. Las fichas y el plano funcionan sin esta descarga.';
  $('offlineCancel').hidden = !busy;
  $('offlineProgress').hidden = !busy;
  if (busy && progress) {
    $('offlineProgress').value = Math.round(progress.done / progress.total * 100);
    $('offlineProgressText').textContent = `${nombrePack(progress.pack)}: ${progress.done} de ${progress.total} archivos · ${$('offlineProgress').value}%`;
  } else $('offlineProgressText').textContent = status && !listo('plan') ? `${status.plan.count} de ${status.plan.total} archivos de la base guardados` : '';
  const installing=!!registration?.installing,waiting=!!registration?.waiting;
  $('offlineUpdate').hidden = !waiting;
  $('offlineCheckUpdate').disabled=checking||installing||!online;
  $('offlineUpdateInfo').textContent=updateFailure||(waiting?'Nueva versión lista. Se aplica sola la próxima vez que abras Atlas, o ahora con este botón (recarga la página; guarda antes lo que estés editando).':installing?'Preparando actualización'+(updateProgress?' · '+updateProgress.done+' de '+updateProgress.total+' archivos':'…'):'Puedes buscar una versión más reciente sin borrar la copia guardada.');
  $('atlasUpdateNotice').hidden=!waiting&&!installing&&!updateFailure;
  $('atlasUpdateText').textContent=updateFailure||(waiting?'Hay una nueva versión de Atlas. Se aplicará sola la próxima vez que abras Atlas.':'Preparando una nueva versión de Atlas…');
  if (busy && !poll) poll = setInterval(() => refresh().catch(() => {}), 12000);
  if (!busy && poll) { clearInterval(poll); poll = null; }
}
function request(type, extra = {}, worker = registration?.active) {
  return new Promise((resolve, reject) => {
    if (!worker) return reject(new Error('El modo sin conexión aún se está preparando.'));
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('No se pudo comprobar la copia guardada. Vuelve a abrir este panel.')); }, 10000);
    channel.port1.onmessage = event => { clearTimeout(timer);channel.port1.close();event.data.error ? reject(new Error(event.data.error)) : resolve(event.data); };
    worker.postMessage({atlasOffline: true, type, ...extra}, [channel.port2]);
  });
}
async function refresh() { status = await request('STATUS'); paint(); if (avisoPendiente) avisarFalta(); }
async function setup() {
  if (registrationPromise) return registrationPromise;
  registrationPromise = (async () => {
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) throw new Error('Abre el sitio publicado en Safari o Chrome para guardar el plano sin conexión. Esta vista no permite hacerlo.');
    // Reopening a downloaded plan must not wait for a script request.
    const existing = await navigator.serviceWorker.getRegistration('./');
    registration = existing?.active ? existing : await navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'});
    const watch=worker=>{if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='redundant')updateFailure='La actualización no se completó. Tu copia anterior sigue disponible; puedes reintentar.';if(worker.state==='installed')setTimeout(()=>{if(!interactuo)aplicarSola();},0);setTimeout(paint,0);});};
    registration.addEventListener('updatefound', () => {updateFailure='';updateProgress=null;watch(registration.installing);paint();});watch(registration.installing);
    if (!registration.active) await new Promise((resolve, reject) => {
      const worker = registration.installing || registration.waiting;
      const timer = setTimeout(() => reject(new Error('La descarga inicial está tardando. Reintenta con conexión estable.')), 30000);
      const check = () => {
        if (worker?.state === 'activated' || registration.active) { clearTimeout(timer); resolve(); }
        else if (worker?.state === 'redundant') { clearTimeout(timer); reject(new Error('No se pudo preparar el modo sin conexión. Comprueba la conexión y reintenta.')); }
      };
      worker?.addEventListener('statechange', check);check();
    });
    failure = '';await refresh();
    if (registration.waiting) return aplicarSola();
    autoGuardar();
    if(existing?.active && navigator.onLine) registration.update().catch(() => {});
  })().catch(error => { registrationPromise = null;failure = error.message;paint(); });
  return registrationPromise;
}
async function download(pack) {
  failure = '';await setup();if (!registration?.active) return;
  if (!navigator.onLine) { failure = 'Conéctate para completar la descarga.';paint();return; }
  try {
    // Browsers can grant durable storage automatically; the app works if denied.
    navigator.storage?.persist?.().catch(() => {});
    status ||= await request('STATUS');
    // «plan» sin pisos guarda todo el edificio; con el detalle por paquete se piden la base y todos los pisos.
    const packs = Array.isArray(pack) ? pack : pack === 'plan' && status.packs ? ['plan', ...pisos().map(p => p.pack)] : [pack];
    if (pack === 'plan') for (const p of pisos()) recordar(p.pack);
    status.downloading = packs[0];progress = null;paint();
    await request('DOWNLOAD', Array.isArray(pack) || status.packs ? {packs} : {pack});
  } catch (error) { failure = error.message;await refresh().catch(() => {});paint(); }
}
const openOffline = async () => { $('offlineDialog').showModal();await setup();if (registration?.active) await refresh().catch(e => {failure=e.message;paint();}); };
$('offlineOpen').onclick = openOffline;
$('offlineClose').onclick = () => $('offlineDialog').close();
$('offlineDialog').addEventListener('click', event => {if(event.target === $('offlineDialog')) $('offlineDialog').close();});
$('offlineSave').onclick = () => download('plan');
$('offlineSaveDocuments').onclick = () => download('documents');
$('offlineCancel').onclick = () => request('PAUSE').catch(error => {failure=error.message;paint();});
$('offlineUpdate').onclick = () => { if (registration?.waiting) {if(window.dispatchEvent?.(new Event('atlas-before-update',{cancelable:true}))===false)return;updating = true;registration.waiting.postMessage({atlasOffline:true,type:'ACTIVATE'});} };
$('atlasUpdateReview').onclick=openOffline;
$('offlineCheckUpdate').onclick=async()=>{checking=true;updateFailure='';paint();try{await setup();await registration?.update();}catch{updateFailure='No se pudo buscar la actualización. Comprueba la conexión y reintenta.';}finally{checking=false;paint();}};
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    const message = event.data;if (!message?.atlasOffline) return;
    if(message.type==='UPDATE_PROGRESS')updateProgress=message;
    if(message.type==='UPDATE_ERROR')updateFailure=message.error;
    if (message.type === 'PROGRESS') { if(status) status.downloading=message.pack;progress=message; }
    if (message.status) status=message.status;
    if (message.type === 'ERROR') failure=message.error;
    if (message.type === 'PACK_DONE') progress=null;
    if (message.type === 'DONE') {failure='';progress=null;autoGuardar();}
    paint();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {if(updating) location.reload();else refresh().catch(() => {});});
}
window.addEventListener('online', () => {paint();if(registration?.active){refresh().then(autoGuardar).catch(() => {});registration.update().catch(() => {});}});
window.addEventListener('offline', paint);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { ocultaDesde = Date.now(); return; }
  if (registration?.active) refresh().then(autoGuardar).catch(() => {});
  if (ocultaDesde && Date.now() - ocultaDesde > AUSENCIA) aplicarSola();
  ocultaDesde = 0;
});
try { if (sessionStorage.getItem(AVISO)) { sessionStorage.removeItem(AVISO); const t = $('toast'); if (t) { t.textContent = 'Atlas se actualizó a la versión más reciente.'; t.style.display = 'block'; setTimeout(() => { t.style.display = 'none'; }, 4500); } } } catch {}
window.addEventListener('atlas-ready', () => setup(), {once:true});
// Un piso abierto pasa a la lista de este equipo y se guarda solo.
window.addEventListener('atlas-piso-visible', () => { const p = pisoActual(); pisoAbierto = true; if (p) recordar(p.pack); paint(); autoGuardar(); if (!navigator.onLine) { avisoPendiente = true; avisarFalta(); } });
window.addEventListener('atlas-floor-home', () => { pisoAbierto = false; paint(); });
// El plano pidió partes que no están guardadas y no hay red: se avisa una vez cada dos minutos, sin trabar nada.
function avisarFalta() {
  // Sin el estado de lo guardado aún, espera a que llegue (refresh vuelve a llamar).
  if (!status) return;
  avisoPendiente = false;
  if (Date.now() - avisoFalta < 120000 || pisoListo()) return;
  const p = pisoActual(), t = $('toast'); avisoFalta = Date.now(); if (!t) return;
  t.textContent = (p ? p.nombre : 'Este piso') + ' no está guardado en este equipo. Con señal, Atlas lo guarda solo.';
  t.style.display = 'block'; setTimeout(() => { t.style.display = 'none'; }, 6000);
}
window.addEventListener('atlas-teselas-faltan', avisarFalta);
window.addEventListener('atlas-shell-ready', () => setup(), {once:true});
paint();
// La hoja de tu cuenta (floor-explorer.mjs) muestra qué pisos están guardados y permite guardar uno.
window.atlasSinConexion = {estado: () => status, guardar: pack => { recordar(pack); download(['plan', pack]); }};
