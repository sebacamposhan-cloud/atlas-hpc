// Observaciones en terreno por recinto, con registro fotográfico: sección en la ficha del plano, formulario pensado para
// el celular (cámara del equipo), panel en Control de obra y capa del plano.
// Los datos quedan en este equipo (observaciones-store.mjs) hasta que exista la base compartida.
import {nivel} from './level.mjs';
import {registerLayer} from './layers.mjs';
import * as M from './observaciones-model.mjs';
import {leerObservaciones, leerHistorial, leerFotos, guardarObservacion, espacio, pedirPersistencia, exportarObservaciones, importarObservaciones} from './observaciones-store.mjs';

export const COLORES_RECINTO = {'Con vencidas': '#c62f2f', 'Abiertas': '#e0882a', 'Corregidas por verificar': '#2f7fb5', 'Cerradas': '#2e9e5b', 'Sin observaciones': '#cfd5da'};
const COLOR_ESTADO = {'Abierta': '#e0882a', 'En corrección': '#c9a21b', 'Corregida': '#2f7fb5', 'Cerrada': '#2e9e5b', 'Descartada': '#9aa3ad'};
const ACCION = {'En corrección': 'En corrección', 'Corregida': 'Marcar corregida', 'Cerrada': 'Verificar y cerrar', 'Abierta': 'Reabrir', 'Descartada': 'Descartar'};
const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const fechaCorta = iso => iso ? new Date(iso).toLocaleDateString('es-CL') : '—';
const fechaHora = iso => iso ? new Date(iso).toLocaleString('es-CL', {dateStyle: 'short', timeStyle: 'short'}) : '—';
const plazoTexto = p => p ? p.split('-').reverse().join('-') : 'sin plazo';
const categoriaDe = t => t === 'PAV' ? 'Pavimento' : t === 'CIE' ? 'Cielo' : /^M\d$/.test(t) ? 'Muros y tabiques' : 'Otro';
const CLAVE_AUTOR = 'atlas-autor';
const autorGuardado = () => { try { return localStorage.getItem(CLAVE_AUTOR) || ''; } catch { return ''; } };
const recordarAutor = v => { try { localStorage.setItem(CLAVE_AUTOR, v); } catch {} };
const ordenar = lista => [...lista].sort((a, b) => Number(M.PENDIENTES.has(b.estado)) - Number(M.PENDIENTES.has(a.estado)) || b.actualizada.localeCompare(a.actualizada));
const mb = v => (v / 1048576).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' MB';

// Estado compartido del piso activo para la capa del plano, la ficha y el panel.
let cache = null, cargando = null;
export function cargarObservaciones(forzar = false) {
  if (forzar) cargando = null;
  if (!cargando) cargando = leerObservaciones(nivel.id).then(lista => {
    const porCodigo = new Map();
    for (const o of lista) { if (!porCodigo.has(o.room.code)) porCodigo.set(o.room.code, []); porCodigo.get(o.room.code).push(o); }
    return cache = {lista, porCodigo};
  }).catch(e => { cargando = null; throw e; });
  return cargando;
}
registerLayer('observaciones', {nombre: 'Observaciones en terreno', categories: r => [M.estadoRecinto(cache?.porCodigo.get(String(r.code).trim()), hoy())], color: k => COLORES_RECINTO[k] || '#cfd5da', opacity: .55});
export function iniciarCapaObservaciones(alCambiar) {
  const recargar = () => cargarObservaciones(true).then(alCambiar).catch(() => {});
  recargar(); window.addEventListener('atlas-observaciones-changed', recargar);
}

// Foto reducida en el navegador: lado mayor 1600 px (JPEG 0,72) y miniatura de 320 px. Respeta la orientación EXIF.
export async function procesarFoto(archivo) {
  if (!/^image\//.test(archivo.type || 'image/')) throw Error('El archivo no es una imagen.');
  const bmp = await createImageBitmap(archivo, {imageOrientation: 'from-image'}).catch(() => createImageBitmap(archivo));
  const version = async (max, calidad) => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k), c = document.createElement('canvas');
    c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', calidad));
    return {buf: await blob.arrayBuffer(), w, h};
  };
  const grande = await version(1600, .72), mini = await version(320, .6); bmp.close?.();
  return {mime: 'image/jpeg', datos: grande.buf, mini: mini.buf, ancho: grande.w, alto: grande.h, bytes: grande.buf.byteLength};
}

export function createObservaciones(ctx) {
  const esc = ctx.esc;
  const dialog = document.createElement('dialog'); dialog.id = 'obsDialog'; dialog.className = 'obsDialog'; dialog.setAttribute('aria-label', 'Observación en terreno'); document.body.append(dialog);
  let urls = [], guardando = false;
  const url = (buf, mime = 'image/jpeg') => { const u = URL.createObjectURL(new Blob([buf], {type: mime})); urls.push(u); return u; };
  dialog.addEventListener('close', () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; });
  dialog.addEventListener('cancel', e => { if (guardando) e.preventDefault(); });
  const fila = (o, conRecinto, fotos = null, miniatura = null) => `<li><button type="button" data-obs="${esc(o.id)}"><i style="background:${COLOR_ESTADO[o.estado]}"></i><span><b>${conRecinto ? esc(o.room.code) + ' · ' : ''}${esc(o.descripcion)}</b>
    <small>${esc(o.estado)} · ${esc(o.categoria)} · ${esc(o.responsable || 'Sin responsable')} · ${M.vencida(o, hoy()) ? '<em>vencida ' + plazoTexto(o.plazo) + '</em>' : o.plazo ? 'plazo ' + plazoTexto(o.plazo) : 'sin plazo'}${o.fotos.length ? ' · ' + o.fotos.length + (o.fotos.length === 1 ? ' foto' : ' fotos') : ''} · ${esc(o.autor)}, ${fechaCorta(o.creada)}</small>
    ${fotos?.length ? `<span class="obsFotosFicha">${fotos.slice(0, 4).map(f => `<span>${miniatura(f)}</span>`).join('')}${fotos.length > 4 ? `<span class="obsMas">+${fotos.length - 4}</span>` : ''}</span>` : ''}</span></button></li>`;
  const recintoDe = o => ctx.rooms().find(r => r.id === o.room.id) || ctx.rooms().find(r => r.code === o.room.code);

  // ---------- Sección de la ficha del recinto: cada observación con sus fotos a la vista ----------
  let urlsFicha = [];
  async function ficha(root, room) {
    root.innerHTML = '<p class="obsNota">Cargando observaciones…</p>';
    try {
      const {porCodigo} = await cargarObservaciones(), lista = ordenar(porCodigo.get(room.code) || []);
      const pendientes = lista.filter(o => M.PENDIENTES.has(o.estado)).length, vencidas = lista.filter(o => M.vencida(o, hoy())).length;
      urlsFicha.forEach(u => URL.revokeObjectURL(u)); urlsFicha = [];
      const fotos = new Map(await Promise.all(lista.map(async o => [o.id, (await leerFotos(o.id)).sort((a, b) => a.at.localeCompare(b.at))])));
      const miniatura = f => { const u = URL.createObjectURL(new Blob([f.mini], {type: 'image/jpeg'})); urlsFicha.push(u); return `<img src="${u}" alt="Foto ${esc(M.TIPOS_FOTO[f.tipo])} del ${fechaCorta(f.at)}"><span>${esc(M.TIPOS_FOTO[f.tipo])}</span>`; };
      root.innerHTML = `<div class="obsFichaCabecera"><span>${pendientes ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'}${vencidas ? ` · <em>${vencidas} vencida${vencidas === 1 ? '' : 's'}</em>` : ''}` : lista.length ? 'Sin pendientes' : 'Sin observaciones registradas'}</span>
        <button type="button" class="primary" data-obs-nueva>+ Observación con foto</button></div>${lista.length ? `<ul class="obsLista">${lista.map(o => fila(o, false, fotos.get(o.id), miniatura)).join('')}</ul>` : ''}`;
      const volver = () => cargarObservaciones(true).then(() => ficha(root, room));
      root.querySelector('[data-obs-nueva]').onclick = () => editor(room, null, volver);
      root.querySelectorAll('[data-obs]').forEach(b => { b.onclick = () => editor(room, lista.find(o => o.id === b.dataset.obs), volver); });
    } catch (e) { root.innerHTML = `<p class="obsError">No se pudieron leer las observaciones: ${esc(e.message)}</p>`; }
  }

  // ---------- Formulario (nuevo o existente) ----------
  async function editor(room, obs, alGuardar) {
    if (!room) return ctx.toast('El recinto de esta observación ya no está en el plano.');
    const fotosGuardadas = obs ? await leerFotos(obs.id) : [], historial = obs ? await leerHistorial(obs.id) : [];
    const nuevas = [], quitar = new Set(), tipoInicial = obs && obs.estado !== 'Abierta' ? 'despues' : 'antes';
    const finishes = room.finishes || [], source = ctx.source(room);
    const opcionesTerminacion = Object.entries(M.TERMINACIONES).map(([k, nombre]) => { const f = finishes.find(f => f.field === k); return `<option value="${k}" ${(obs?.terminacion || 'GENERAL') === k ? 'selected' : ''}>${esc(nombre)}${f ? ' · ' + esc(f.code) + ' ' + esc(f.description || '') : ''}</option>`; }).join('');
    const responsables = [...new Set((cache?.lista || []).map(o => o.responsable).filter(Boolean))].sort();
    dialog.innerHTML = `<form class="obsForm" novalidate>
      <header><div><small>${esc(ctx.levelName)} · ${esc(source?.code?.split('-').at(-1) || '')}</small><h2>${esc(room.code)} · ${esc(room.name)}</h2>${obs ? `<span class="obsChip" style="--c:${COLOR_ESTADO[obs.estado]}">${esc(obs.estado)}</span>` : '<span class="obsNota">Nueva observación</span>'}</div><button type="button" class="obsCerrar" aria-label="Cerrar">×</button></header>
      <div class="obsCuerpo">
      <section class="obsFotos"><div class="obsBotonesFoto"><label class="obsCamara">Tomar foto<input type="file" accept="image/*" capture="environment"></label></div>
        <div class="obsMiniaturas"></div><small class="obsNota">Foto tomada con la cámara en el recinto. Se reduce y queda guardada en este equipo. Máximo ${M.MAX_FOTOS} por observación.</small></section>
      <label>Qué se observa *<textarea name="descripcion" rows="3" maxlength="2000" required placeholder="Ej.: sello perimetral incompleto junto a la puerta">${esc(obs?.descripcion || '')}</textarea></label>
      <div class="obsCampos">
        <label>Terminación<select name="terminacion">${opcionesTerminacion}</select></label>
        <label>Categoría<select name="categoria">${M.CATEGORIAS.map(c => `<option ${(obs?.categoria || 'Otro') === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <fieldset class="obsPrioridad"><legend>Prioridad</legend>${M.PRIORIDADES.map(p => `<label><input type="radio" name="prioridad" value="${p}" ${(obs?.prioridad || 'Media') === p ? 'checked' : ''}> ${p}</label>`).join('')}</fieldset>
        <label>Responsable<input name="responsable" list="obsResponsables" maxlength="160" value="${esc(obs?.responsable || '')}" placeholder="Subcontrato o persona"><datalist id="obsResponsables">${responsables.map(r => `<option value="${esc(r)}">`).join('')}</datalist></label>
        <label>Plazo<input type="date" name="plazo" value="${esc(obs?.plazo || '')}"></label>
        <label>${obs ? 'Quién hace este cambio' : 'Registrado por'} *<input name="autor" maxlength="160" required value="${esc(autorGuardado())}" autocomplete="name"></label>
      </div>
      ${obs ? `<section class="obsEstado"><h3>Estado</h3><p class="obsNota">Registrada por ${esc(obs.autor)} el ${fechaHora(obs.creada)}${obs.cerrada ? ' · cerrada el ' + fechaHora(obs.cerrada) : ''}.</p>
        <label>Comentario del cambio<textarea name="comentario" rows="2" maxlength="1000" placeholder="Obligatorio para descartar o reabrir"></textarea></label>
        <div class="obsTransiciones">${(M.TRANSICIONES[obs.estado] || []).map(e => `<button type="button" data-estado="${esc(e)}" style="--c:${COLOR_ESTADO[e]}">${esc(ACCION[e])}</button>`).join('')}</div></section>
        <details class="obsHistorial"><summary>Historial (${historial.length})</summary><ol>${historial.map(h => `<li><b>${fechaHora(h.at)}</b> · ${esc(h.autor)} · ${esc(h.detalle)}${h.comentario ? `<br><span>${esc(h.comentario)}</span>` : ''}</li>`).join('')}</ol></details>` : ''}
      </div>
      <footer><span class="obsMensaje" role="alert"></span><button type="submit" class="primary">${obs ? 'Guardar cambios' : 'Guardar observación'}</button></footer>
      <div class="obsVisor" hidden><img alt=""><button type="button" aria-label="Cerrar foto">×</button></div></form>`;
    const form = dialog.querySelector('form'), mensaje = form.querySelector('.obsMensaje'), visor = form.querySelector('.obsVisor');
    form.querySelector('.obsCerrar').onclick = () => { if (!guardando) dialog.close(); };
    visor.querySelector('button').onclick = () => { visor.hidden = true; };
    if (!obs) form.terminacion.onchange = () => { form.categoria.value = categoriaDe(form.terminacion.value); };
    const ver = buf => { visor.querySelector('img').src = url(buf); visor.hidden = false; };
    function miniaturas() {
      const guardadas = fotosGuardadas.filter(f => !quitar.has(f.id)).map(f => `<figure><button type="button" data-ver-guardada="${esc(f.id)}"><img src="${url(f.mini)}" alt="Foto ${esc(M.TIPOS_FOTO[f.tipo])}"></button><figcaption>${esc(M.TIPOS_FOTO[f.tipo])} · ${fechaCorta(f.at)}</figcaption><button type="button" class="obsQuitar" data-quitar-guardada="${esc(f.id)}" aria-label="Quitar foto">×</button></figure>`);
      const recientes = nuevas.map((f, i) => `<figure class="nueva"><button type="button" data-ver-nueva="${i}"><img src="${f.miniUrl}" alt="Foto nueva"></button><figcaption><button type="button" data-tipo="${i}">${esc(M.TIPOS_FOTO[f.tipo])} ⇄</button></figcaption><button type="button" class="obsQuitar" data-quitar-nueva="${i}" aria-label="Quitar foto">×</button></figure>`);
      const caja = form.querySelector('.obsMiniaturas'); caja.innerHTML = [...guardadas, ...recientes].join('') || '<p class="obsNota">Sin fotos todavía.</p>';
      caja.querySelectorAll('[data-ver-guardada]').forEach(b => { b.onclick = () => ver(fotosGuardadas.find(f => f.id === b.dataset.verGuardada).datos); });
      caja.querySelectorAll('[data-ver-nueva]').forEach(b => { b.onclick = () => ver(nuevas[+b.dataset.verNueva].datos); });
      caja.querySelectorAll('[data-quitar-guardada]').forEach(b => { b.onclick = () => { quitar.add(b.dataset.quitarGuardada); miniaturas(); }; });
      caja.querySelectorAll('[data-quitar-nueva]').forEach(b => { b.onclick = () => { nuevas.splice(+b.dataset.quitarNueva, 1); miniaturas(); }; });
      caja.querySelectorAll('[data-tipo]').forEach(b => { b.onclick = () => { const f = nuevas[+b.dataset.tipo]; f.tipo = f.tipo === 'antes' ? 'despues' : 'antes'; miniaturas(); }; });
    }
    // Las fotos se procesan en cola; guardar espera a que terminen para no perder ninguna.
    let procesando = Promise.resolve();
    for (const input of form.querySelectorAll('.obsBotonesFoto input')) input.onchange = () => {
      const archivos = [...input.files]; input.value = '';
      procesando = procesando.then(async () => {
        const total = fotosGuardadas.length - quitar.size + nuevas.length;
        if (total + archivos.length > M.MAX_FOTOS) mensaje.textContent = `Máximo ${M.MAX_FOTOS} fotos por observación.`;
        for (const archivo of archivos.slice(0, Math.max(0, M.MAX_FOTOS - total))) {
          try { mensaje.textContent = 'Procesando foto…'; const f = await procesarFoto(archivo); nuevas.push({...f, id: crypto.randomUUID(), tipo: tipoInicial, miniUrl: url(f.mini)}); mensaje.textContent = ''; }
          catch (e) { mensaje.textContent = 'No se pudo leer la foto: ' + e.message; }
        }
        if (nuevas.length === 1) pedirPersistencia();
        miniaturas();
      });
    };
    miniaturas();

    async function persistir(estadoNuevo = null) {
      if (guardando) return;
      if (mensaje.textContent === 'Procesando foto…') mensaje.textContent = 'Esperando que terminen las fotos…';
      await procesando;
      const v = Object.fromEntries(new FormData(form)), autor = String(v.autor || '').trim(), at = new Date().toISOString();
      if (!autor) { mensaje.textContent = 'Indica quién registra.'; form.autor.focus(); return; }
      const valores = {descripcion: String(v.descripcion || '').trim(), terminacion: v.terminacion, codigo: finishes.find(f => f.field === v.terminacion)?.code || null, categoria: v.categoria, prioridad: v.prioridad || 'Media', responsable: String(v.responsable || '').trim() || null, plazo: v.plazo || null};
      const fotosNuevas = nuevas.map(f => ({id: f.id, tipo: f.tipo, at, autor}));
      let o, versionEsperada = obs?.version || 0; const hist = [];
      try {
        if (!obs) {
          o = M.nuevaObservacion({...valores, autor}, room, source, nivel.id, crypto.randomUUID(), at);
          o = M.validarObservacion({...o, fotos: fotosNuevas});
          hist.push(M.entrada(o.id, autor, 'creada', 'Observación registrada' + (fotosNuevas.length ? ` con ${fotosNuevas.length} foto${fotosNuevas.length === 1 ? '' : 's'}` : ''), '', at));
        } else {
          const nombres = {descripcion: 'descripción', terminacion: 'terminación', categoria: 'categoría', prioridad: 'prioridad', responsable: 'responsable', plazo: 'plazo'};
          const cambios = Object.keys(nombres).filter(k => (obs[k] ?? null) !== (valores[k] ?? null));
          const base = {...obs, ...valores, fotos: [...obs.fotos.filter(f => !quitar.has(f.id)), ...fotosNuevas], actualizada: at};
          if (!cambios.length && !fotosNuevas.length && !quitar.size && !estadoNuevo) { dialog.close(); return; }
          if (cambios.length) hist.push(M.entrada(obs.id, autor, 'edicion', 'Editó ' + cambios.map(k => nombres[k]).join(', '), '', at));
          if (fotosNuevas.length) hist.push(M.entrada(obs.id, autor, 'foto', `Agregó ${fotosNuevas.length} foto${fotosNuevas.length === 1 ? '' : 's'}`, '', at));
          if (quitar.size) hist.push(M.entrada(obs.id, autor, 'foto', `Quitó ${quitar.size} foto${quitar.size === 1 ? '' : 's'}`, '', at));
          if (estadoNuevo) { const r = M.cambiarEstado(base, estadoNuevo, {autor, comentario: v.comentario, at}); o = r.observacion; hist.push(r.historial); }
          else o = M.validarObservacion({...base, version: obs.version + 1});
        }
      } catch (e) { mensaje.textContent = e.message; return; }
      guardando = true; form.querySelectorAll('button').forEach(b => { b.disabled = true; }); mensaje.textContent = 'Guardando…';
      try {
        await guardarObservacion(o, versionEsperada, {historial: hist, quitarFotos: [...quitar],
          fotos: nuevas.map(f => ({id: f.id, obsId: o.id, tipo: f.tipo, at, autor, mime: f.mime, ancho: f.ancho, alto: f.alto, bytes: f.bytes, datos: f.datos, mini: f.mini}))});
        recordarAutor(autor); pedirPersistencia(); guardando = false; dialog.close(); ctx.toast(estadoNuevo ? `Observación: ${estadoNuevo}.` : 'Observación guardada en este equipo.'); alGuardar?.();
      } catch (e) { guardando = false; form.querySelectorAll('button').forEach(b => { b.disabled = false; }); mensaje.textContent = 'No se guardó. ' + e.message; }
    }
    form.onsubmit = e => { e.preventDefault(); persistir(); };
    form.querySelectorAll('[data-estado]').forEach(b => { b.onclick = () => persistir(b.dataset.estado); });
    if (!dialog.open) dialog.showModal();
    if (!obs) setTimeout(() => form.descripcion.focus({preventScroll: true}), 50);
  }

  // ---------- Panel de Control de obra ----------
  const filtros = {texto: '', estado: 'Pendientes', responsable: '', categoria: '', prioridad: '', vencidas: false, foco: false};
  async function panel(root, opciones = {}) {
    root.innerHTML = '<p class="obsNota">Cargando observaciones…</p>';
    let datos; try { datos = await cargarObservaciones(true); } catch (e) { root.innerHTML = `<p class="obsError">No se pudieron leer las observaciones: ${esc(e.message)}</p>`; return; }
    const lista = datos.lista, h = hoy(), r = M.resumen(lista, h), uso = await espacio();
    const responsables = [...new Set(lista.map(o => o.responsable || 'Sin responsable'))].sort();
    const filtrada = ordenar(lista.filter(o => {
      if (filtros.estado === 'Pendientes' ? !M.PENDIENTES.has(o.estado) : filtros.estado && o.estado !== filtros.estado) return false;
      if (filtros.responsable && (o.responsable || 'Sin responsable') !== filtros.responsable) return false;
      if (filtros.categoria && o.categoria !== filtros.categoria) return false;
      if (filtros.prioridad && o.prioridad !== filtros.prioridad) return false;
      if (filtros.vencidas && !M.vencida(o, h)) return false;
      const t = filtros.texto.trim().toLowerCase();
      return !t || [o.room.code, o.room.name, o.descripcion, o.responsable || ''].some(s => s.toLowerCase().includes(t));
    }));
    const opcion = (lista, actual, todas) => `<option value="">${todas}</option>` + lista.map(v => `<option ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
    root.innerHTML = `<div class="documentaryIntro"><h2>Observaciones en terreno · ${esc(ctx.levelName)}</h2><p>Pendientes por recinto con fotos tomadas en terreno, responsable y plazo. Se registran y se revisan tocando el recinto en el plano. Guardadas en este equipo${uso ? ` · ${mb(uso.usado)} usados` : ''}; el respaldo JSON (con fotos) las lleva a otro equipo mientras no exista la base compartida.</p></div>
      <div class="kpiGrid">${[[r.pendientes, 'Pendientes', r.recintos + ' recintos con pendientes'], [r.vencidas, 'Vencidas', 'pendientes con plazo cumplido'], [r.porVerificar, 'Corregidas por verificar', 'esperan cierre en terreno'], [r.porEstado.Cerrada, 'Cerradas', r.diasCierre == null ? 'sin cierres aún' : 'cierre promedio en ' + r.diasCierre.toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' días']]
        .map(([n, t, s]) => `<article class="kpi"><span>${t}</span><b>${n}</b><small>${s}</small></article>`).join('')}</div>
      <div class="obsAcciones"><button type="button" data-obs-capa>Ver en el plano</button><button type="button" data-obs-respaldo ${lista.length ? '' : 'disabled'}>Respaldo JSON</button><label class="obsImportar">Importar respaldo<input type="file" accept=".json,application/json"></label></div>
      <div class="obsFiltros"><label>Buscar<input data-f="texto" value="${esc(filtros.texto)}" placeholder="Código, recinto, texto o responsable"></label>
        <label>Estado<select data-f="estado"><option ${filtros.estado === 'Pendientes' ? 'selected' : ''}>Pendientes</option><option value="" ${filtros.estado === '' ? 'selected' : ''}>Todos</option>${M.ESTADOS.map(e => `<option ${filtros.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
        <label>Responsable<select data-f="responsable">${opcion(responsables, filtros.responsable, 'Todos')}</select></label>
        <label>Categoría<select data-f="categoria">${opcion(M.CATEGORIAS, filtros.categoria, 'Todas')}</select></label>
        <label>Prioridad<select data-f="prioridad">${opcion(M.PRIORIDADES, filtros.prioridad, 'Todas')}</select></label>
        <label class="check"><input type="checkbox" data-f="vencidas" ${filtros.vencidas ? 'checked' : ''}> Solo vencidas</label></div>
      ${r.porResponsable.length ? `<details class="obsResponsables" ${r.porResponsable.length > 1 ? 'open' : ''}><summary>Pendientes por responsable</summary><table class="avanceTabla"><thead><tr><th>Responsable</th><th>Pendientes</th><th>Vencidas</th></tr></thead><tbody>${r.porResponsable.map(([k, v]) => `<tr class="${v.vencidas ? 'alerta' : ''}"><td>${esc(k)}</td><td>${v.pendientes}</td><td>${v.vencidas}</td></tr>`).join('')}</tbody></table></details>` : ''}
      <h3 class="obsTitulo">${filtrada.length} observaci${filtrada.length === 1 ? 'ón' : 'ones'}</h3>
      ${filtrada.length ? `<ul class="obsLista obsListaPanel">${filtrada.map(o => fila(o, true)).join('')}</ul>` : `<p class="obsNota">${lista.length ? 'Ninguna observación con estos filtros.' : 'Aún no hay observaciones en este piso. Abre un recinto en el plano y usa «+ Observación con foto».'}</p>`}`;
    const refrescar = () => panel(root, opciones);
    root.querySelectorAll('[data-f]').forEach(c => {
      const aplicar = () => { filtros[c.dataset.f] = c.type === 'checkbox' ? c.checked : c.value; filtros.foco = c.dataset.f === 'texto'; refrescar(); };
      if (c.dataset.f === 'texto') { let espera; c.oninput = () => { clearTimeout(espera); espera = setTimeout(aplicar, 350); }; } else c.onchange = aplicar;
    });
    if (filtros.foco) { const t = root.querySelector('[data-f="texto"]'); t.focus({preventScroll: true}); t.setSelectionRange(t.value.length, t.value.length); }
    root.querySelector('[data-obs-capa]').onclick = () => opciones.pintarCapa?.('observaciones');
    root.querySelector('[data-obs-respaldo]').onclick = async () => { try { ctx.download(new Blob([JSON.stringify(await exportarObservaciones(nivel.id))], {type: 'application/json'}), `observaciones_${nivel.id}_${hoy()}.json`); } catch (e) { ctx.toast(e.message); } };
    root.querySelector('.obsImportar input').onchange = async e => { try { const f = e.target.files[0]; if (!f) return; const n = await importarObservaciones(JSON.parse(await f.text())); ctx.toast(`Respaldo importado: ${n} observaciones nuevas.`); refrescar(); } catch (err) { ctx.toast(err.message); } };
    root.querySelectorAll('[data-obs]').forEach(b => { b.onclick = () => { const o = lista.find(x => x.id === b.dataset.obs); editor(recintoDe(o), o, refrescar); }; });
  }

  return {ficha, panel, editor};
}
