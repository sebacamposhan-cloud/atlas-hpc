import {newMarking, validateMarking, addMarkedRoom, removeMarkedRoom, markingBackup, upgradeMarking, setEstados, addCut, removeCut, compareCuts, markingItems, actual, PLANTILLAS, CAMBIOS, MAX_ESTADOS} from './marking-model.mjs';
import {readMarkings, saveMarking, importMarkings} from './marking-store.mjs';

// Proyectos de marcado: se parte de un piso, se definen estados con leyenda (por ejemplo Pendiente / En ejecución / Terminado),
// se pintan recintos tocándolos y se guardan cortes con fecha para comparar el avance (plano de cambios y vista lado a lado).
export function createMarking(ctx) {
  const esc = ctx.esc;
  const panel = document.createElement('aside');
  panel.id = 'markingPanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Recintos del proyecto');
  document.querySelector('main').append(panel);
  const dialog = document.createElement('dialog');
  dialog.id = 'markingDialog'; dialog.setAttribute('aria-label', 'Proyectos de marcado'); document.body.append(dialog);
  const launch = document.createElement('button');
  launch.id = 'markingOpen'; launch.textContent = 'Proyectos'; launch.title = 'Proyectos: pintar recintos por estado y comparar cortes'; launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-controls', panel.id);
  document.querySelector('.toolbar').prepend(launch);
  let active = null, focused = null, pending = 0, queue = Promise.resolve(), error = '', pincel = null, comparando = null, borrar = null;
  const find = id => ctx.rooms().find(room => room.id === id);
  const redraw = () => {ctx.redraw(); requestAnimationFrame(ctx.resize);};
  const download = docs => ctx.download(new Blob([JSON.stringify(markingBackup(docs), null, 2)], {type: 'application/json'}), 'marcados-arquitectura.json');
  const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const fecha = f => f ? f.split('-').reverse().join('-') : '';
  const m2 = id => { const v = parseFloat(String(find(id)?.declared_area ?? '').replace(/m(²|2)/, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const formatoM2 = v => v ? v.toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' m²' : '—';
  const estadoDe = id => active?.estados?.find(e => e.id === id);
  // Comparación vigente: cortes elegidos y resultado (con m² de cada recinto).
  function comparacion() {
    if (!active || !comparando) return null;
    const vistas = [...active.cortes, actual(active)], antes = vistas.find(c => c.id === comparando.antes), despues = vistas.find(c => c.id === comparando.despues);
    if (!antes || !despues) return null;
    return {antes, despues, resultado: compareCuts(active.estados, antes, despues, m2)};
  }

  function close() {
    if (pending) {ctx.toast('Espera a que termine el guardado.'); return false;}
    active = null; comparando = null; panel.hidden = true;
    document.body.classList.remove('markingOpen'); launch.setAttribute('aria-expanded', 'false'); redraw();
    return true;
  }
  function open(doc) {
    validateMarking(doc);
    if (doc.level !== ctx.level) throw Error('El documento pertenece a otro piso.');
    ctx.enter(); active = upgradeMarking(doc); focused = null; error = ''; comparando = null; pincel = active.estados.at(-1).id;
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
    if (comparando) return ctx.toast('Estás comparando cortes. Vuelve a «Estados» para pintar.');
    focused = room.id;
    return change(doc => addMarkedRoom(doc, room, ctx.source(room), pincel));
  }

  function render() {
    if (!active) return;
    const comp = comparacion(), varios = active.estados.length > 1;
    if (!active.estados.some(e => e.id === pincel)) pincel = active.estados[0].id;
    const cuenta = id => active.rooms.filter(r => r.estado === id), suma = rooms => rooms.reduce((s, r) => s + (m2(r.id) || 0), 0);
    const cabecera = `<div class="markingHead"><div><small>ARQUITECTURA · ${esc(ctx.levelName)}</small><h2>${esc(active.name)}</h2></div><button id="closeMarking" data-wait-save aria-label="Cerrar proyecto">×</button></div>
      <div class="markingActions"><button id="markingDocuments" data-wait-save>Proyectos</button><button id="markingEdit" data-wait-save>Datos y leyenda</button>${comp ? '<button id="salirComparacion">Estados</button>' : ''}</div>`;
    const pie = `<div class="markingFooter"><span id="markingSaveStatus" role="status"></span><div><button id="markingBackup" data-wait-save>Respaldo JSON</button><button id="markingExport" data-wait-save>Exportar plano</button></div><small>Marcado de consulta sobre los contornos disponibles. Quitar un recinto conserva los números de los demás.</small></div>`;
    let cuerpo;
    if (comp) {
      const r = comp.resultado, opcion = (c, sel) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.fecha ? fecha(c.fecha) + ' · ' : '')}${esc(c.nombre)}</option>`;
      cuerpo = `<p class="markingInstruction">Comparación: el plano pinta lo que avanzó, siguió igual o retrocedió.</p>
        <div class="markingScroll"><div class="comparacionCortes"><label>Desde<select id="compAntes">${active.cortes.map(c => opcion(c, comparando.antes)).join('')}</select></label>
          <label>Hasta<select id="compDespues">${[...active.cortes, actual(active)].map(c => opcion(c, comparando.despues)).join('')}</select></label></div>
          <div class="cambiosResumen">${Object.entries(CAMBIOS).map(([k, c]) => `<span><i style="background:${c.color}"></i>${c.nombre}<b>${r.totales[k]}</b></span>`).join('')}</div>
          <table class="estadosTabla"><thead><tr><th>Estado</th><th>${esc(comp.antes.nombre)}</th><th>${esc(comp.despues.nombre)}</th></tr></thead><tbody>${r.porEstado.map(e => `<tr><td><i style="background:${e.color}"></i>${esc(e.nombre)}</td><td>${e.antes}<small>${formatoM2(e.m2Antes)}</small></td><td>${e.despues}<small>${formatoM2(e.m2Despues)}</small></td></tr>`).join('')}</tbody></table>
          <button id="ladoALado" class="primary">Ver lado a lado</button>
          <h3>${r.filas.filter(f => f.cambio !== 'igual').length} recintos con cambios</h3><ol class="markedRooms cambios">${r.filas.filter(f => f.cambio !== 'igual').map(f => `<li class="${focused === f.id ? 'focused' : ''}"><button data-marked-room="${esc(f.id)}" ${find(f.id) ? '' : 'disabled'}><b><i style="background:${CAMBIOS[f.cambio].color}"></i>${esc(f.code)}</b><span>${esc(f.name)} · ${esc(estadoDe(f.antes)?.nombre || 'sin marcar')} → ${esc(estadoDe(f.despues)?.nombre || 'sin marcar')}</span></button></li>`).join('')}</ol></div>`;
    } else {
      cuerpo = `${varios ? `<div class="pincel" role="radiogroup" aria-label="Pintar con">${active.estados.map(e => `<button role="radio" data-pincel="${esc(e.id)}" aria-checked="${pincel === e.id}"><i style="background:${e.color}"></i>${esc(e.nombre)}</button>`).join('')}</div>` : ''}
        <p class="markingInstruction">${varios ? 'Elige un estado y toca los recintos para pintarlos.' : 'Toca un recinto para pintarlo y numerarlo.'}</p>
        <div class="markingScroll"><details class="markingMetadata"><summary>${esc(active.author)} · Propósito</summary><p>${esc(active.purpose)}</p><small>Creado: ${esc(new Date(active.createdAt).toLocaleDateString('es-CL'))}</small></details>
        ${varios ? `<table class="estadosTabla"><tbody>${active.estados.map(e => `<tr><td><i style="background:${e.color}"></i>${esc(e.nombre)}</td><td>${cuenta(e.id).length}</td><td><small>${formatoM2(suma(cuenta(e.id)))}</small></td></tr>`).join('')}</tbody></table>` : ''}
        <section class="cortes"><div><h3>Cortes de avance</h3><button id="nuevoCorte" data-wait-save>Guardar corte</button></div><p>Guarda un corte al cierre de cada período (por ejemplo, cada mes) para compararlo después.</p>
          ${active.cortes.length ? `<ul>${[...active.cortes].reverse().map(c => `<li><span><b>${esc(fecha(c.fecha))} · ${esc(c.nombre)}</b><small>${c.rooms.length} recintos · ${esc(c.autor)}</small></span><button data-comparar-corte="${esc(c.id)}">Comparar</button><button data-borrar-corte="${esc(c.id)}" data-wait-save aria-label="Eliminar corte ${esc(c.nombre)}">${borrar === c.id ? '¿Eliminar?' : '×'}</button></li>`).join('')}</ul>` : ''}</section>
        <h3>${active.rooms.length} recintos marcados</h3><ol class="markedRooms">${active.rooms.map(mark => { const e = estadoDe(mark.estado); return `<li class="${focused === mark.id ? 'focused' : ''}" value="${mark.number}">
          <button data-marked-room="${esc(mark.id)}" ${find(mark.id) ? '' : 'disabled'}><b>${mark.number}. ${esc(mark.code)}</b><span>${esc(mark.name)}${varios && e ? ` · <em style="color:${e.color}">${esc(e.nombre)}</em>` : ''}</span>${find(mark.id) ? '' : '<small>No localizable en el plano actual</small>'}</button>
          <button data-remove-mark="${esc(mark.id)}" aria-label="Quitar marcado ${mark.number}">×</button></li>`; }).join('')}</ol>
        ${active.rooms.length ? '' : '<p>El primer recinto que toques será el número 1.</p>'}</div>`;
    }
    panel.innerHTML = cabecera + cuerpo + pie;
    panel.querySelector('#closeMarking').onclick = close;
    panel.querySelector('#markingDocuments').onclick = library;
    panel.querySelector('#markingEdit').onclick = () => editor(active);
    panel.querySelector('#markingBackup').onclick = () => download([active]);
    panel.querySelector('#markingExport').onclick = () => ctx.export(structuredClone(active), comp);
    panel.querySelectorAll('[data-marked-room]').forEach(button => {button.onclick = () => {
      focused = button.dataset.markedRoom; ctx.focus(find(focused)); render(); ctx.redraw();
    };});
    panel.querySelectorAll('[data-remove-mark]').forEach(button => {button.onclick = () => change(doc => removeMarkedRoom(doc, button.dataset.removeMark));});
    panel.querySelectorAll('[data-pincel]').forEach(button => {button.onclick = () => {pincel = button.dataset.pincel; render();};});
    panel.querySelector('#nuevoCorte')?.addEventListener('click', nuevoCorte);
    panel.querySelectorAll('[data-comparar-corte]').forEach(button => {button.onclick = () => {
      const i = active.cortes.findIndex(c => c.id === button.dataset.compararCorte), siguiente = active.cortes[i + 1];
      comparando = {antes: button.dataset.compararCorte, despues: siguiente ? siguiente.id : 'actual'}; focused = null; render(); ctx.redraw();
    };});
    panel.querySelectorAll('[data-borrar-corte]').forEach(button => {button.onclick = () => {
      if (borrar !== button.dataset.borrarCorte) {borrar = button.dataset.borrarCorte; render(); return;}
      borrar = null; change(doc => removeCut(doc, button.dataset.borrarCorte));
    };});
    panel.querySelector('#salirComparacion')?.addEventListener('click', () => {comparando = null; render(); ctx.redraw();});
    for (const [id, clave] of [['#compAntes', 'antes'], ['#compDespues', 'despues']]) panel.querySelector(id)?.addEventListener('change', e => {comparando = {...comparando, [clave]: e.target.value}; render(); ctx.redraw();});
    panel.querySelector('#ladoALado')?.addEventListener('click', () => ladoALado(comp));
    status();
  }
  function showDialog(content) {
    dialog.innerHTML = `<button class="close" aria-label="Cerrar">×</button>${content}<p id="markingError" role="alert"></p>`;
    dialog.querySelector('.close').onclick = () => dialog.close();
    if (!dialog.open) dialog.showModal();
  }
  async function library() {
    if (pending) return ctx.toast('Espera a que termine el guardado.');
    try {
      const docs = (await readMarkings()).filter(doc => doc.level === ctx.level && doc.specialty === 'architecture').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      showDialog(`<h2>Mis proyectos</h2><p>Arquitectura · ${esc(ctx.levelName)}. Un proyecto pinta recintos por estado (por ejemplo, pisos vinílicos instalados) y guarda cortes para comparar el avance.</p><button id="newMarking" class="primary">+ Nuevo proyecto</button>
        <div class="markingLibrary">${docs.map(doc => `<button data-open-marking="${esc(doc.id)}"><b>${esc(doc.name)}</b><span>${esc(doc.author)} · ${doc.rooms.length} recintos${doc.cortes?.length ? ` · ${doc.cortes.length} cortes` : ''}</span><small>${esc(doc.purpose)}</small></button>`).join('') || '<p>Aún no hay proyectos para este piso.</p>'}</div>
        <button id="markingBackupAll" ${docs.length ? '' : 'disabled'}>Respaldar proyectos de este piso</button><label>Restaurar respaldo JSON<input id="markingRestore" type="file" accept=".json,application/json"></label>
        <p>Guardado en este navegador. Usa el respaldo para llevar tus proyectos a otro equipo.</p>`);
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
    } catch (failure) {ctx.toast('No se pudieron abrir los proyectos: ' + failure.message);}
  }
  // Datos del proyecto y leyenda de estados (de menor a mayor avance). Con un solo estado funciona como el marcado de un color.
  function editor(doc) {
    let estados = structuredClone(doc ? upgradeMarking(doc).estados : [{...PLANTILLAS.marcado[0]}]);
    showDialog(`<h2>${doc ? 'Datos y leyenda del proyecto' : 'Nuevo proyecto'}</h2><p>Arquitectura · ${esc(ctx.levelName)}</p><form id="markingForm">
      <label>Nombre del proyecto *<input name="name" required maxlength="160" value="${esc(doc?.name || '')}" placeholder="Ej.: Pisos vinílicos instalados"></label>
      <label>Quién lo realizó *<input name="author" required maxlength="160" value="${esc(doc?.author || '')}"></label>
      <label>Para qué es el plano *<textarea name="purpose" required maxlength="2000" rows="3">${esc(doc?.purpose || '')}</textarea></label>
      <fieldset class="estadosEditor"><legend>Estados del proyecto <small>(de menor a mayor avance)</small></legend>
        <div class="plantillas"><span>Plantilla:</span><button type="button" data-plantilla="marcado">Un color</button><button type="button" data-plantilla="avance">Pendiente · En ejecución · Terminado</button></div>
        <ol class="estadosLista"></ol><button type="button" id="agregarEstado">+ Agregar estado</button></fieldset>
      <label class="colorUnico">Color del marcado<input name="color" type="color" value="${esc(doc?.color || '#2874c7')}"></label>
      <button type="submit" class="primary">${doc ? 'Guardar datos' : 'Crear y comenzar a pintar'}</button></form>`);
    const form = dialog.querySelector('form'), lista = form.querySelector('.estadosLista');
    const leer = () => { lista.querySelectorAll('li').forEach((li, i) => { estados[i].nombre = li.querySelector('[name=estadoNombre]').value; estados[i].color = li.querySelector('[name=estadoColor]').value; }); };
    function pintar() {
      lista.innerHTML = estados.map((e, i) => `<li><input type="color" name="estadoColor" value="${esc(e.color)}" aria-label="Color de ${esc(e.nombre)}"><input name="estadoNombre" maxlength="40" required value="${esc(e.nombre)}" aria-label="Nombre del estado ${i + 1}">
        <button type="button" data-subir="${i}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" data-quitar-estado="${i}" ${estados.length > 1 ? '' : 'disabled'} aria-label="Quitar estado">×</button></li>`).join('');
      form.querySelector('.colorUnico').hidden = estados.length > 1;
      form.querySelector('#agregarEstado').disabled = estados.length >= MAX_ESTADOS;
      lista.querySelectorAll('[data-subir]').forEach(b => {b.onclick = () => {leer(); const i = +b.dataset.subir; [estados[i - 1], estados[i]] = [estados[i], estados[i - 1]]; pintar();};});
      lista.querySelectorAll('[data-quitar-estado]').forEach(b => {b.onclick = () => {leer(); estados.splice(+b.dataset.quitarEstado, 1); pintar();};});
    }
    form.querySelectorAll('[data-plantilla]').forEach(b => {b.onclick = () => {estados = structuredClone(PLANTILLAS[b.dataset.plantilla]); if (b.dataset.plantilla === 'marcado') estados[0].color = form.color.value; pintar();};});
    form.querySelector('#agregarEstado').onclick = () => {leer(); estados.push({id: 'e' + crypto.randomUUID().slice(0, 8), nombre: 'Estado ' + (estados.length + 1), color: '#6f8291'}); pintar();};
    pintar();
    form.onsubmit = async event => {
      event.preventDefault(); leer(); const button = form.querySelector('[type=submit]');
      const values = Object.fromEntries(new FormData(form));
      for (const field of ['name', 'author', 'purpose']) values[field] = values[field].trim();
      const leyenda = estados.map(e => ({...e, nombre: e.nombre.trim(), ...(estados.length === 1 ? {color: values.color} : {})}));
      const datos = {name: values.name, author: values.author, purpose: values.purpose, color: estados.length === 1 ? values.color : leyenda[0].color};
      pending++; button.disabled = true;
      try {
        const next = doc ? {...setEstados(doc, leyenda), ...datos, version: doc.version + 1, updatedAt: new Date().toISOString()} : newMarking({...datos, estados: leyenda}, ctx.level, crypto.randomUUID());
        await saveMarking(validateMarking(next), doc?.version || 0); open(next);
      } catch (failure) {dialog.querySelector('#markingError').textContent = failure.message;}
      finally {pending--; button.disabled = false; status();}
    };
  }
  function nuevoCorte() {
    const mes = new Date().toLocaleDateString('es-CL', {month: 'long', year: 'numeric'});
    showDialog(`<h2>Guardar corte de avance</h2><p>Guarda los estados de hoy de los ${active.rooms.length} recintos marcados de «${esc(active.name)}». Después podrás compararlo con otro corte o con el estado actual.</p><form id="corteForm">
      <label>Nombre del corte *<input name="nombre" required maxlength="120" value="Cierre ${esc(mes)}"></label>
      <label>Fecha del corte *<input name="fecha" type="date" required value="${hoy()}"></label>
      <label>Quién lo registra *<input name="autor" required maxlength="160" value="${esc(active.author)}"></label>
      <button type="submit" class="primary">Guardar corte</button></form>`);
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const v = Object.fromEntries(new FormData(event.target));
      try { addCut(active, {id: 'validacion', nombre: v.nombre, fecha: v.fecha, autor: v.autor}); } catch (failure) { dialog.querySelector('#markingError').textContent = failure.message; return; }
      dialog.close(); await change(doc => addCut(doc, {id: crypto.randomUUID(), nombre: v.nombre, fecha: v.fecha, autor: v.autor})); ctx.toast('Corte guardado.');
    };
  }
  // Vista lado a lado: los dos cortes sobre la vista general del plano, recortada a los recintos del proyecto.
  async function ladoALado(comp) {
    if (!comp) return;
    showDialog(`<h2>Lado a lado</h2><p>${esc(active.name)} · ${esc(comp.antes.nombre)} y ${esc(comp.despues.nombre)}</p><div class="ladoALado"><figure><figcaption>${esc(comp.antes.fecha ? fecha(comp.antes.fecha) + ' · ' : '')}${esc(comp.antes.nombre)}</figcaption><canvas></canvas><div class="ladoLeyenda"></div></figure>
      <figure><figcaption>${esc(comp.despues.fecha ? fecha(comp.despues.fecha) + ' · ' : '')}${esc(comp.despues.nombre)}</figcaption><canvas></canvas><div class="ladoLeyenda"></div></figure></div>
      <div class="cambiosResumen">${Object.entries(CAMBIOS).map(([k, c]) => `<span><i style="background:${c.color}"></i>${c.nombre}<b>${comp.resultado.totales[k]}</b></span>`).join('')}</div>`);
    dialog.classList.add('ancho'); dialog.addEventListener('close', () => dialog.classList.remove('ancho'), {once: true});
    try {
      const fondo = ctx.fondo(), cargar = src => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(Error('No se pudo cargar el plano.')); im.src = src; });
      // La vista general basta en los pisos dibujados desde DWG; si es de baja resolución se usa la imagen de exportación.
      let img = await cargar(fondo.url); if (img.naturalWidth / fondo.width < .25 && fondo.export) img = await cargar(fondo.export);
      const posiciones = [...comp.antes.rooms, ...comp.despues.rooms].map(r => find(r.id)).filter(Boolean).map(r => ctx.position(r));
      let [x0, y0, x1, y1] = posiciones.length ? [Math.min(...posiciones.map(p => p[0])), Math.min(...posiciones.map(p => p[1])), Math.max(...posiciones.map(p => p[0])), Math.max(...posiciones.map(p => p[1]))] : [fondo.origin[0], fondo.origin[1], fondo.origin[0] + fondo.width, fondo.origin[1] + fondo.height];
      const margen = Math.max(400, (x1 - x0) * .12, (y1 - y0) * .12); x0 -= margen; y0 -= margen; x1 += margen; y1 += margen;
      // Proporción entre 4:5 y 16:9, para que ningún encuadre quede como una franja.
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let w = x1 - x0, h = y1 - y0; if (h > w * 1.25) w = h / 1.25; if (w > h * 16 / 9) h = w * 9 / 16;
      x0 = Math.max(fondo.origin[0], cx - w / 2); y0 = Math.max(fondo.origin[1], cy - h / 2); x1 = Math.min(fondo.origin[0] + fondo.width, cx + w / 2); y1 = Math.min(fondo.origin[1] + fondo.height, cy + h / 2);
      const colores = new Map(active.estados.map(e => [e.id, e.color])), k = img.naturalWidth / fondo.width;
      [comp.antes, comp.despues].forEach((corte, i) => {
        const canvas = dialog.querySelectorAll('canvas')[i], f = Math.min(900 / (x1 - x0), 1000 / (y1 - y0)); canvas.width = Math.round((x1 - x0) * f); canvas.height = Math.round((y1 - y0) * f);
        const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(img, (x0 - fondo.origin[0]) * k, (y0 - fondo.origin[1]) * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, canvas.width, canvas.height);
        g.setTransform(f, 0, 0, f, -x0 * f, -y0 * f);
        for (const r of corte.rooms) { const room = find(r.id), d = room && ctx.path(room.id); if (!d) continue; const c = colores.get(r.estado) || '#6f8291'; g.globalAlpha = .45; g.fillStyle = c; g.fill(new Path2D(d), 'evenodd'); g.globalAlpha = 1; g.strokeStyle = c; g.lineWidth = 1.5 / f; g.stroke(new Path2D(d)); }
        dialog.querySelectorAll('.ladoLeyenda')[i].innerHTML = active.estados.map(e => `<span><i style="background:${e.color}"></i>${esc(e.nombre)} <b>${corte.rooms.filter(r => r.estado === e.id).length}</b></span>`).join('');
      });
    } catch (failure) {dialog.querySelector('#markingError').textContent = failure.message;}
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
  return {active: () => active, focused: () => focused, choose, close, comparacion, items: () => active ? markingItems(active, comparacion()?.resultado) : []};
}
