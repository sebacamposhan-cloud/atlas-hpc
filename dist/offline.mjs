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
function paint() {
  const online = navigator.onLine, busy = !!status?.downloading;
  $('offlineLabel').textContent = busy ? 'Guardando…' : !online ? 'Sin señal' : status?.plan.ready ? 'Disponible offline' : 'Sin conexión';
  $('offlineOpen').classList.toggle('ready', !!status?.plan.ready);
  $('offlineStatus').classList.toggle('ready', !!status?.plan.ready && !failure && !busy);
  $('offlineStatus').textContent = failure || (busy ? 'Guardando '+(status.downloading === 'documents' ? 'documentos originales' : 'plano y fichas')+'… Mantén Atlas abierto.' : status?.plan.ready ? 'Listo para usar sin conexión' : status ? (online ? 'Guarda el plano una vez y consúltalo aquí sin internet.' : 'La descarga del plano está incompleta. Conéctate para continuar.') : 'Preparando el modo sin conexión…');
  $('offlineSave').disabled = !status || busy || status.plan.ready || !online;
  $('offlineSave').textContent = status?.plan.ready ? 'Plano y fichas guardados' : (status?.plan.count > 20 ? 'Continuar descarga' : 'Guardar plano y fichas')+(status ? ' · '+mb(status.plan.bytes) : '');
  $('offlineSaveDocuments').disabled = !status?.plan.ready || busy || !!status?.documents.ready || !online;
  $('offlineSaveDocuments').textContent = status?.documents.ready ? 'Originales guardados' : 'Guardar originales'+(status ? ' · '+mb(status.documents.bytes) : '');
  $('offlineDocumentsInfo').textContent = status?.documents.ready ? 'Los documentos originales están disponibles sin internet.' : 'Opcional. Las fichas y el plano funcionan sin esta descarga.';
  $('offlineCancel').hidden = !busy;
  $('offlineProgress').hidden = !busy;
  if (busy && progress) {
    $('offlineProgress').value = Math.round(progress.done / progress.total * 100);
    $('offlineProgressText').textContent = `${progress.done} de ${progress.total} archivos · ${$('offlineProgress').value}%`;
  } else $('offlineProgressText').textContent = status && !status.plan.ready ? `${status.plan.count} de ${status.plan.total} archivos guardados` : status?.plan.ready ? 'Plano completo, búsqueda, rombos, fichas y exportaciones disponibles en este navegador.' : '';
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
async function refresh() { status = await request('STATUS'); paint(); }
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
    status ||= await request('STATUS');status.downloading = pack;progress = null;paint();
    await request('DOWNLOAD', {pack});
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
    if (message.type === 'DONE') {failure='';progress=null;}
    paint();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {if(updating) location.reload();else refresh().catch(() => {});});
}
window.addEventListener('online', () => {paint();if(registration?.active){refresh().catch(() => {});registration.update().catch(() => {});}});
window.addEventListener('offline', paint);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { ocultaDesde = Date.now(); return; }
  if (registration?.active) refresh().catch(() => {});
  if (ocultaDesde && Date.now() - ocultaDesde > AUSENCIA) aplicarSola();
  ocultaDesde = 0;
});
try { if (sessionStorage.getItem(AVISO)) { sessionStorage.removeItem(AVISO); const t = $('toast'); if (t) { t.textContent = 'Atlas se actualizó a la versión más reciente.'; t.style.display = 'block'; setTimeout(() => { t.style.display = 'none'; }, 4500); } } } catch {}
window.addEventListener('atlas-ready', () => setup(), {once:true});
window.addEventListener('atlas-shell-ready', () => setup(), {once:true});
paint();
