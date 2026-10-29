import {createObservationDetail} from './observacion-detail.mjs';
import {estadoObservacion,referenciaObservacion,filtrarObservaciones,facetasObservaciones} from './observaciones-query.mjs';
// Observaciones en terreno por recinto, con registro fotográfico: sección en la ficha del plano, formulario pensado para
// el celular (cámara del equipo), panel en Control de obra y capa del plano.
// Datos disponibles en el equipo; nube.mjs sincroniza observaciones, fotos e historial con una sesión autorizada.
import {nivel} from './level.mjs';
import {registerLayer} from './layers.mjs';
import * as M from './observaciones-model.mjs';
import {leerObservaciones, leerHistorial, leerFotos, guardarObservacion, espacio, pedirPersistencia, exportarObservaciones, importarObservaciones} from './observaciones-store.mjs';

export const COLORES_RECINTO = {'Con vencidas': '#c62f2f', 'Abiertas': '#e0882a', 'Corregidas por verificar': '#2f7fb5', 'Cerradas': '#2e9e5b', 'Sin observaciones': '#ffffff'};
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
  let urls = [], guardando = false, volverDesdeEditor=null;
  const url = (buf, mime = 'image/jpeg') => { const u = URL.createObjectURL(new Blob([buf], {type: mime})); urls.push(u); return u; };
  dialog.addEventListener('close', () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = [];const volver=volverDesdeEditor;volverDesdeEditor=null;volver?.(); });
  dialog.addEventListener('cancel', e => { if (guardando) e.preventDefault(); });
  const fila = (o, conRecinto, fotos = null, miniatura = null) => `<li><button type="button" data-obs="${esc(o.id)}" aria-haspopup="dialog" aria-controls="obsDetailDrawer"><i style="background:${COLOR_ESTADO[o.estado]}"></i><span><b>${conRecinto ? esc(o.room.code) + ' · ' : ''}${esc(o.descripcion)}</b>
    <small>${esc(estadoObservacion(o.estado))} · ${esc(o.categoria)} · ${esc(o.responsable || 'Sin responsable')} · ${M.vencida(o, hoy()) ? '<em>vencida ' + plazoTexto(o.plazo) + '</em>' : o.plazo ? 'plazo ' + plazoTexto(o.plazo) : 'sin plazo'}${o.fotos.length ? ' · ' + o.fotos.length + (o.fotos.length === 1 ? ' foto' : ' fotos') : ''} · ${esc(o.autor)}, ${fechaCorta(o.creada)}</small>
    ${fotos?.length ? `<span class="obsFotosFicha">${fotos.slice(0, 4).map(f => `<span>${miniatura(f)}</span>`).join('')}${fotos.length > 4 ? `<span class="obsMas">+${fotos.length - 4}</span>` : ''}</span>` : ''}</span></button></li>`;
  const recintoDe = o => ctx.rooms().find(r => r.id === o.room.id) || ctx.rooms().find(r => r.code === o.room.code);
  const detail=createObservationDetail({...ctx,level:nivel.id,room:recintoDe,processPhoto:procesarFoto,author:autorGuardado,rememberAuthor:recordarAutor,
    highlight:id=>{document.querySelectorAll('[data-obs-row]').forEach(row=>row.classList.toggle('obsSelectedRow',row.dataset.obsRow===id));document.querySelectorAll('[data-obs]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.obs===id)));},
    focusRecord:id=>[...document.querySelectorAll('[data-obs]')].find(b=>b.dataset.obs===id&&b.offsetParent)?.focus({preventScroll:true}),
    edit:async(obs,volver,changed)=>{volverDesdeEditor=volver;try{await editor(recintoDe(obs),obs,changed);if(!dialog.open){volverDesdeEditor=null;volver();}}catch(error){volverDesdeEditor=null;ctx.toast(error.message);volver();}}});

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
      root.querySelectorAll('[data-obs]').forEach(b => { b.onclick = () => detail.open(b.dataset.obs,volver); });
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
      <header><div><small>${esc(ctx.levelName)} · ${esc(source?.code?.split('-').at(-1) || '')}</small><h2>${esc(room.code)} · ${esc(room.name)}</h2>${obs ? `<span class="obsChip" style="--c:${COLOR_ESTADO[obs.estado]}">${esc(estadoObservacion(obs.estado))}</span>` : '<span class="obsNota">Nueva observación</span>'}</div><button type="button" class="obsCerrar" aria-label="Cerrar">×</button></header>
      <div class="obsCuerpo">
      <section class="obsFotos"><div class="obsBotonesFoto"><label class="obsCamara">Tomar foto<input type="file" accept="image/*" capture="environment"></label><label>Adjuntar fotos<input type="file" accept="image/*" multiple></label></div>
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
          if (!cambios.length && !fotosNuevas.length && !quitar.size && !estadoNuevo && !String(v.comentario||'').trim()) { dialog.close(); return; }
          if (cambios.length) hist.push(M.entrada(obs.id, autor, 'edicion', 'Editó ' + cambios.map(k => nombres[k]).join(', '), '', at));
          if (fotosNuevas.length) hist.push(M.entrada(obs.id, autor, 'foto', `Agregó ${fotosNuevas.length} foto${fotosNuevas.length === 1 ? '' : 's'}`, '', at));
          if (quitar.size) hist.push(M.entrada(obs.id, autor, 'foto', `Quitó ${quitar.size} foto${quitar.size === 1 ? '' : 's'}`, '', at));
          if (!estadoNuevo && String(v.comentario||'').trim()) hist.push(M.entrada(obs.id,autor,'comentario','Añadió un comentario',v.comentario,at));
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

  // ---------- Inventory: category navigation, state shortcuts and persistent observation detail ----------
  const filtros = {texto:'',estado:'Pendientes',responsable:'',categoria:'',prioridad:'',vencidas:false,foco:false,page:0};
  async function panel(root, opciones = {}) {
    if(!root.isConnected)return;const request=Number(root.dataset.obsPanelRequest||0)+1;root.dataset.obsPanelRequest=request;const vigente=()=>root.isConnected&&Number(root.dataset.obsPanelRequest)===request;root.innerHTML='<p class="obsNota">Cargando observaciones…</p>';
    let datos;try{datos=await cargarObservaciones(true);}catch(error){if(vigente())root.innerHTML=`<p class="obsError">No se pudieron leer las observaciones: ${esc(error.message)}</p>`;return;}
    const uso=await espacio();if(!vigente())return;
    const lista=datos.lista,h=hoy(),r=M.resumen(lista,h),facetas=facetasObservaciones(lista,filtros,h),filtrada=ordenar(filtrarObservaciones(lista,filtros,h)),pages=Math.max(1,Math.ceil(filtrada.length/30));filtros.page=Math.min(filtros.page,pages-1);
    const shown=filtrada.slice(filtros.page*30,filtros.page*30+30),responsables=[...new Set(lista.map(o=>o.responsable||'Sin responsable'))].sort();
    const opcion=(lista,actual,todas)=>`<option value="">${todas}</option>`+lista.map(v=>`<option ${v===actual?'selected':''}>${esc(v)}</option>`).join('');
    const row=o=>`<tr data-obs-row="${esc(o.id)}" class="${detail.active()===o.id?'obsSelectedRow':''}"><td data-label="Referencia"><small>${esc(referenciaObservacion(o))}</small></td><td data-label="Observación"><button type="button" class="obsOpenRecord" data-obs="${esc(o.id)}" aria-haspopup="dialog" aria-controls="obsDetailDrawer"><b>${esc(o.descripcion)}</b><small>${o.fotos.length} foto${o.fotos.length===1?'':'s'}</small></button></td><td data-label="Estado"><span class="obsChip" style="--c:${COLOR_ESTADO[o.estado]}">${esc(estadoObservacion(o.estado))}</span></td><td data-label="Categoría">${esc(o.categoria)}</td><td data-label="Recinto"><b>${esc(o.room.code)}</b><br>${esc(o.room.name)}</td><td data-label="Responsable / plazo">${esc(o.responsable||'Sin responsable')}<br>${M.vencida(o,h)?'<em class="obsOverdue">Vencida · </em>':''}${esc(plazoTexto(o.plazo))}</td><td data-label="Modificada">${esc(fechaHora(o.actualizada))}</td></tr>`;
    root.innerHTML=`<div class="documentaryIntro"><h2>Observaciones en terreno · ${esc(ctx.levelName)}</h2><p>Filtra por categoría, selecciona una fila y revisa fotos, estado y actividad en su ficha. Los registros de este piso están disponibles en el equipo${uso?' · '+mb(uso.usado)+' usados':''}; se comparten cuando la sesión Nube está sincronizada.</p></div>
      <div class="kpiGrid">${[[r.pendientes,'Pendientes',r.recintos+' recintos con pendientes','Pendientes'],[r.vencidas,'Vencidas','con plazo cumplido','vencidas'],[r.porVerificar,'Por validar','corregidas que esperan verificación','Corregida'],[r.porEstado.Cerrada,'Cerradas',r.diasCierre==null?'sin cierres aún':'cierre promedio en '+r.diasCierre.toLocaleString('es-CL',{maximumFractionDigits:1})+' días','Cerrada']].map(([n,t,small,key])=>`<button type="button" class="kpi obsKpi" data-obs-shortcut="${key}"><span>${t}</span><b>${n}</b><small>${small}</small></button>`).join('')}</div>
      <div class="obsAcciones"><details class="obsNew"><summary>+ Nueva observación</summary><label>Recinto<select id="obsNewRoom"><option value="">Selecciona un recinto del piso</option>${ctx.rooms().map(room=>`<option value="${esc(room.id)}">${esc(room.code+' · '+room.name)}</option>`).join('')}</select></label><button type="button" data-new-from-list>Crear observación</button></details><button type="button" data-obs-capa>Ver en el plano</button><button type="button" data-obs-respaldo ${lista.length?'':'disabled'}>Respaldo JSON</button><label class="obsImportar">Importar respaldo<input type="file" accept=".json,application/json"></label></div>
      <div class="obsWorkspace"><nav class="obsCategories" aria-label="Categorías de observaciones"><h3>Categorías</h3>${facetas.categorias.map(c=>`<button type="button" data-obs-category="${esc(c.value)}" aria-pressed="${filtros.categoria===c.value}"><span>${esc(c.label)}</span><b>${c.n}</b></button>`).join('')}</nav><div class="obsInventory">
      <div class="obsStateTabs" aria-label="Estados de observaciones">${facetas.estados.map(e=>`<button type="button" data-obs-state="${esc(e.value)}" aria-pressed="${filtros.estado===e.value}">${esc(e.label)} <b>${e.n}</b></button>`).join('')}</div>
      <div class="obsFiltros"><label>Buscar<input data-f="texto" value="${esc(filtros.texto)}" placeholder="Referencia, recinto, descripción o responsable"></label><label>Responsable<select data-f="responsable">${opcion(responsables,filtros.responsable,'Todos')}</select></label><label>Prioridad<select data-f="prioridad">${opcion(M.PRIORIDADES,filtros.prioridad,'Todas')}</select></label><label class="check"><input type="checkbox" data-f="vencidas" ${filtros.vencidas?'checked':''}> Solo vencidas</label><button type="button" data-clear-obs>Restablecer filtros</button></div>
      <h3 class="obsTitulo">${filtrada.length} observaci${filtrada.length===1?'ón':'ones'}${filtros.categoria?' · '+esc(filtros.categoria):''}</h3>
      ${shown.length?`<div class="obsTableScroll"><table class="obsInventoryTable"><thead><tr><th>Referencia</th><th>Observación</th><th>Estado</th><th>Categoría</th><th>Recinto</th><th>Responsable / plazo</th><th>Modificada</th></tr></thead><tbody>${shown.map(row).join('')}</tbody></table></div>`:`<p class="obsNota">${lista.length?'Sin observaciones con estos filtros.':'Aún no hay observaciones en este piso. Crea una desde el listado o desde la ficha del plano.'}</p>`}
      <div class="pagination"><button type="button" data-obs-page="prev" ${filtros.page===0?'disabled':''}>Anterior</button><span>Página ${filtros.page+1} de ${pages}</span><button type="button" data-obs-page="next" ${filtros.page+1===pages?'disabled':''}>Siguiente</button></div></div></div>
      ${r.porResponsable.length?`<details class="obsResponsables"><summary>Pendientes por responsable</summary><table class="avanceTabla"><thead><tr><th>Responsable</th><th>Pendientes</th><th>Vencidas</th></tr></thead><tbody>${r.porResponsable.map(([k,v])=>`<tr class="${v.vencidas?'alerta':''}"><td>${esc(k)}</td><td>${v.pendientes}</td><td>${v.vencidas}</td></tr>`).join('')}</tbody></table></details>`:''}`;
    const refrescar=()=>panel(root,opciones);
    root.querySelectorAll('[data-f]').forEach(c=>{const aplicar=()=>{filtros[c.dataset.f]=c.type==='checkbox'?c.checked:c.value;filtros.foco=c.dataset.f==='texto';filtros.page=0;refrescar();};if(c.dataset.f==='texto'){let espera;c.oninput=()=>{clearTimeout(espera);espera=setTimeout(aplicar,250);};}else c.onchange=aplicar;});
    if(filtros.foco){const text=root.querySelector('[data-f="texto"]');text.focus({preventScroll:true});text.setSelectionRange(text.value.length,text.value.length);}
    root.querySelectorAll('[data-obs-category]').forEach(b=>b.onclick=()=>{filtros.categoria=b.dataset.obsCategory;filtros.page=0;filtros.foco=false;refrescar();});
    root.querySelectorAll('[data-obs-state]').forEach(b=>b.onclick=()=>{filtros.estado=b.dataset.obsState;filtros.page=0;filtros.foco=false;refrescar();});
    root.querySelectorAll('[data-obs-shortcut]').forEach(b=>b.onclick=()=>{const key=b.dataset.obsShortcut;Object.assign(filtros,{texto:'',categoria:'',prioridad:'',responsable:'',vencidas:key==='vencidas',estado:key==='vencidas'?'Pendientes':key,page:0,foco:false});refrescar();});
    root.querySelector('[data-clear-obs]').onclick=()=>{Object.assign(filtros,{texto:'',estado:'Pendientes',categoria:'',prioridad:'',responsable:'',vencidas:false,page:0,foco:false});refrescar();};
    root.querySelectorAll('[data-obs-page]').forEach(b=>b.onclick=()=>{filtros.page+=b.dataset.obsPage==='prev'?-1:1;filtros.foco=false;refrescar();});
    root.querySelector('[data-new-from-list]').onclick=()=>{const room=ctx.rooms().find(r=>r.id===root.querySelector('#obsNewRoom').value);if(!room)return ctx.toast('Selecciona un recinto del piso.');if(!detail.close())return;editor(room,null,refrescar);};
    root.querySelector('[data-obs-capa]').onclick=()=>{if(detail.close())opciones.pintarCapa?.('observaciones');};
    root.querySelector('[data-obs-respaldo]').onclick=async()=>{try{ctx.download(new Blob([JSON.stringify(await exportarObservaciones(nivel.id))],{type:'application/json'}),`observaciones_${nivel.id}_${hoy()}.json`);}catch(error){ctx.toast(error.message);}};
    root.querySelector('.obsImportar input').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const n=await importarObservaciones(JSON.parse(await f.text()));ctx.toast(`Respaldo importado: ${n} observaciones nuevas.`);refrescar();}catch(error){ctx.toast(error.message);}};
    root.querySelectorAll('[data-obs]').forEach(b=>b.onclick=()=>detail.open(b.dataset.obs,refrescar));
  }

  return {ficha, panel, editor};
}
