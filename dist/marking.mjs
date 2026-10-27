import {newMarking, validateMarking, addMarkedRoom, removeMarkedRoom, markingBackup} from './marking-model.mjs';
import {readMarkings, saveMarking, importMarkings} from './marking-store.mjs';

export function createMarking(ctx) {
  const esc = ctx.esc;
  const panel = document.createElement('aside');
  panel.id = 'markingPanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Recintos del documento de marcado');
  document.querySelector('main').append(panel);
  const dialog = document.createElement('dialog');
  dialog.id = 'markingDialog'; dialog.setAttribute('aria-label', 'Documentos de marcado'); document.body.append(dialog);
  const launch = document.createElement('button');
  launch.id = 'markingOpen'; launch.textContent = 'Marcados'; launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-controls', panel.id);
  document.querySelector('.toolbar').prepend(launch);
  let active = null, focused = null, pending = 0, queue = Promise.resolve(), error = '';
  const find = id => ctx.rooms().find(room => room.id === id);
  const redraw = () => {ctx.redraw(); requestAnimationFrame(ctx.resize);};
  const download = docs => ctx.download(new Blob([JSON.stringify(markingBackup(docs), null, 2)], {type: 'application/json'}), 'marcados-arquitectura.json');

  function close() {
    if (pending) {ctx.toast('Espera a que termine el guardado.'); return false;}
    active = null; panel.hidden = true;
    document.body.classList.remove('markingOpen'); launch.setAttribute('aria-expanded', 'false'); redraw();
    return true;
  }
  function open(doc) {
    validateMarking(doc);
    if (doc.level !== ctx.level) throw Error('El documento pertenece a otro piso.');
    ctx.enter(); active = doc; focused = null; error = '';
    panel.hidden = false; document.body.classList.add('markingOpen', 'hideLeft', 'hideRight');
    launch.setAttribute('aria-expanded', 'true'); dialog.close(); render(); redraw();
  }
  function status() {
    const label = panel.querySelector('#markingSaveStatus');
    if (label) label.textContent = pending ? 'Guardando…' : error || 'Guardado en este navegador';
    panel.querySelectorAll('[data-wait-save]').forEach(button => {button.disabled = !!pending;});
  }
  function change(update) {
    pending++; status();
    queue = queue.then(async () => {
      try {
        const next = update(active);
        if (next !== active) {
          const value = {...next, updatedAt: new Date().toISOString(), version: active.version + 1};
          await saveMarking(value, active.version);
          active = value; error = '';
        }
      } catch (failure) {error = 'Cambio no guardado. ' + failure.message; ctx.toast(error);}
      finally {pending--; render(); ctx.redraw();}
    });
    return queue;
  }
  function choose(room) {
    if (!active || !room || !find(room.id)) return;
    focused = room.id;
    return change(doc => addMarkedRoom(doc, room, ctx.source(room)));
  }
  function render() {
    if (!active) return;
    panel.innerHTML = `<div class="markingHead"><div><small>ARQUITECTURA · ${esc(ctx.levelName)}</small><h2>${esc(active.name)}</h2></div><button id="closeMarking" data-wait-save aria-label="Cerrar documento de marcado">×</button></div>
      <div class="markingActions"><button id="markingDocuments" data-wait-save>Documentos</button><button id="markingEdit" data-wait-save>Datos y color</button></div>
      <p class="markingInstruction">Toca un recinto para pintarlo y numerarlo.</p>
      <div class="markingScroll"><details class="markingMetadata"><summary>${esc(active.author)} · Propósito</summary><p>${esc(active.purpose)}</p><small>Creado: ${esc(new Date(active.createdAt).toLocaleDateString('es-CL'))}</small></details>
      <h3>${active.rooms.length} recintos marcados</h3><ol class="markedRooms">${active.rooms.map(mark => `<li class="${focused === mark.id ? 'focused' : ''}" value="${mark.number}">
        <button data-marked-room="${esc(mark.id)}" ${find(mark.id) ? '' : 'disabled'}><b>${mark.number}. ${esc(mark.code)}</b><span>${esc(mark.name)}</span>${find(mark.id) ? '' : '<small>No localizable en el plano actual</small>'}</button>
        <button data-remove-mark="${esc(mark.id)}" aria-label="Quitar marcado ${mark.number}">×</button></li>`).join('')}</ol>
      ${active.rooms.length ? '' : '<p>El primer recinto que toques será el número 1.</p>'}</div>
      <div class="markingFooter"><span id="markingSaveStatus" role="status"></span><div><button id="markingBackup" data-wait-save>Respaldo JSON</button><button id="markingExport" data-wait-save>Exportar plano</button></div><small>Marcado de consulta sobre los contornos disponibles. Quitar un recinto conserva los números de los demás.</small></div>`;
    panel.querySelector('#closeMarking').onclick = close;
    panel.querySelector('#markingDocuments').onclick = library;
    panel.querySelector('#markingEdit').onclick = () => editor(active);
    panel.querySelector('#markingBackup').onclick = () => download([active]);
    panel.querySelector('#markingExport').onclick = () => ctx.export(structuredClone(active));
    panel.querySelectorAll('[data-marked-room]').forEach(button => {button.onclick = () => {
      focused = button.dataset.markedRoom; ctx.focus(find(focused)); render(); ctx.redraw();
    };});
    panel.querySelectorAll('[data-remove-mark]').forEach(button => {button.onclick = () => change(doc => removeMarkedRoom(doc, button.dataset.removeMark));});
    status();
  }
  function showDialog(content) {
    dialog.innerHTML = `<button class="close" aria-label="Cerrar documentos">×</button>${content}<p id="markingError" role="alert"></p>`;
    dialog.querySelector('.close').onclick = () => dialog.close();
    if (!dialog.open) dialog.showModal();
  }
  async function library() {
    if (pending) return ctx.toast('Espera a que termine el guardado.');
    try {
      const docs = (await readMarkings()).filter(doc => doc.level === ctx.level && doc.specialty === 'architecture').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      showDialog(`<h2>Mis documentos de marcado</h2><p>Arquitectura · ${esc(ctx.levelName)}</p><button id="newMarking" class="primary">+ Nuevo documento</button>
        <div class="markingLibrary">${docs.map(doc => `<button data-open-marking="${esc(doc.id)}"><b>${esc(doc.name)}</b><span>${esc(doc.author)} · ${doc.rooms.length} recintos</span><small>${esc(doc.purpose)}</small></button>`).join('') || '<p>Aún no hay documentos para este piso.</p>'}</div>
        <button id="markingBackupAll" ${docs.length ? '' : 'disabled'}>Respaldar documentos de este piso</button><label>Restaurar respaldo JSON<input id="markingRestore" type="file" accept=".json,application/json"></label>
        <p>Guardado en este navegador. Usa el respaldo para llevar tus documentos a otro equipo.</p>`);
      dialog.querySelector('#newMarking').onclick = () => editor();
      dialog.querySelector('#markingBackupAll').onclick = () => download(docs);
      dialog.querySelectorAll('[data-open-marking]').forEach(button => {button.onclick = () => {
        try {open(docs.find(doc => doc.id === button.dataset.openMarking));} catch (failure) {dialog.querySelector('#markingError').textContent = failure.message;}
      };});
      dialog.querySelector('#markingRestore').onchange = async event => {
        try {
          const file = event.target.files[0]; if (!file) return;
          if (file.size > 10000000) throw Error('El respaldo supera 10 MB.');
          await importMarkings(JSON.parse(await file.text())); await library(); ctx.toast('Respaldo restaurado.');
        } catch (failure) {dialog.querySelector('#markingError').textContent = failure.message;}
      };
    } catch (failure) {ctx.toast('No se pudieron abrir los documentos: ' + failure.message);}
  }
  function editor(doc) {
    showDialog(`<h2>${doc ? 'Datos del documento' : 'Nuevo documento de marcado'}</h2><p>Arquitectura · ${esc(ctx.levelName)}</p><form id="markingForm">
      <label>Nombre del documento *<input name="name" required maxlength="160" value="${esc(doc?.name || '')}" placeholder="Ej.: Revisión de terminaciones"></label>
      <label>Quién lo realizó *<input name="author" required maxlength="160" value="${esc(doc?.author || '')}"></label>
      <label>Para qué es el plano *<textarea name="purpose" required maxlength="2000" rows="3">${esc(doc?.purpose || '')}</textarea></label>
      <label>Color del marcado<input name="color" type="color" value="${esc(doc?.color || '#2874c7')}"></label>
      <button type="submit" class="primary">${doc ? 'Guardar datos' : 'Crear y comenzar a marcar'}</button></form>`);
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const form = event.target, button = form.querySelector('[type=submit]');
      const values = Object.fromEntries(new FormData(form));
      for (const field of ['name', 'author', 'purpose']) values[field] = values[field].trim();
      pending++; button.disabled = true;
      try {
        const next = doc ? {...doc, ...values, version: doc.version + 1, updatedAt: new Date().toISOString()} : newMarking(values, ctx.level, crypto.randomUUID());
        await saveMarking(next, doc?.version || 0); open(next);
      } catch (failure) {dialog.querySelector('#markingError').textContent = failure.message;}
      finally {pending--; button.disabled = false; status();}
    };
  }
  launch.onclick = () => ctx.editing() ? ctx.toast('Guarda o cancela la edición del contorno antes de marcar.') : library();
  window.addEventListener('atlas-floor-home', close);
  for (const name of ['atlas-before-floor-change', 'atlas-before-update']) window.addEventListener(name, event => {
    if (pending) {event.preventDefault(); ctx.toast('Espera a que termine el guardado del documento.');}
  });
  window.addEventListener('beforeunload', event => {if (pending) {event.preventDefault(); event.returnValue = '';}});
  document.addEventListener('click', event => {
    if (active && event.target.closest('button[data-module],[data-plan-type],#planSettingsOpen') && !close()) {event.preventDefault(); event.stopImmediatePropagation();}
  }, true);
  return {active: () => active, focused: () => focused, choose, close};
}
