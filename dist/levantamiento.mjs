// Levantamiento en Proyectos (levantamiento-model.mjs): panel lateral con la vista del plano y su leyenda, la ficha del
// recinto tocado (una botonera por columna) y la lista del piso; tabla completa con filtros como Excel; editor de
// columnas; importación de planillas (Excel o CSV) con una propuesta ajustable, y exportación a Excel con los mismos
// encabezados. Las columnas enlazadas toman el estado del rombo (avance por partida) de cada piso.
import * as L from './levantamiento-model.mjs';
import {crearFiltrosColumna} from './column-filters.mjs';
import {loadVendor} from './web-store.mjs';
import {loadPma} from './pma.mjs';
import {leerAvance} from './avance-store.mjs';
import {planillaDe} from './planilla-avance-nube.mjs';
import {avanceFamilia} from './planilla-avance-model.mjs';
import {reporteAvance, partidasDeTerminacion, partidasDeMuros, estadoTerminacion} from './avance-model.mjs';
import {readMarkings, saveMarking} from './marking-store.mjs';
import {marcarRecinto, deshacerRecinto} from './avance-marcar.mjs';
import {exigirFirma, firmante} from './firma.mjs';
import {propositoHTML, conectarProposito, leerProposito} from './proyecto-datos.mjs';

const NOMBRE_PISO = {'N-1': 'Nivel −1', N01: 'Nivel 1', N02: 'Nivel 2', N03: 'Nivel 3'};
// Filtro de la tabla de cada levantamiento (por documento): se recuerda en el equipo y acota tabla, plano y exportación.
const CLAVE_FILTROS = 'atlas-levantamiento-filtros', filtros = new Map();
const leerFiltros = () => { try { return JSON.parse(localStorage.getItem(CLAVE_FILTROS) || '{}') || {}; } catch { return {}; } };
export function filtroLevantamiento(docId) {
  if (!filtros.has(docId)) { const g = leerFiltros()[docId]; filtros.set(docId, {filtros: g?.filtros || {}, orden: g?.orden || null}); }
  return filtros.get(docId);
}
function guardarFiltro(docId) {
  const todos = leerFiltros(), e = filtroLevantamiento(docId);
  if (L.filtroActivo(e) || e.orden) todos[docId] = {filtros: e.filtros, orden: e.orden}; else delete todos[docId];
  try { localStorage.setItem(CLAVE_FILTROS, JSON.stringify(todos)); } catch {}
}
// Plantilla como la planilla de artefactos: tipo de cielo y los estatus de cada terminación.
const ESTADO = () => [{id: 'o01', nombre: 'Instalado', color: '#2e9e5b', final: true}, {id: 'o02', nombre: 'No instalado', color: '#c26a00'}, {id: 'o03', nombre: 'No aplica', color: '#9aa3ad', noAplica: true}];
export const PLANTILLA_ARTEFACTOS = () => [
  {id: 'c01', nombre: 'Tipo de cielo', tipo: 'lista', enlace: null, opciones: [{id: 'o01', nombre: 'Modular estructurado', color: '#2f6db5'}, {id: 'o02', nombre: 'Duro estructurado', color: '#e07b00'}, {id: 'o03', nombre: 'Duro tapado', color: '#7a4fa3'}]},
  {id: 'c02', nombre: 'Estatus de cielo', tipo: 'estado', enlace: 'CIE', opciones: ESTADO()}, {id: 'c03', nombre: 'Estatus de pavimento', tipo: 'estado', enlace: 'PAV', opciones: ESTADO()},
  {id: 'c04', nombre: 'Estatus de puerta', tipo: 'estado', enlace: null, opciones: ESTADO()}, {id: 'c05', nombre: 'Estatus de pintura', tipo: 'estado', enlace: 'MUROS', opciones: ESTADO()},
  {id: 'c06', nombre: 'Estatus de ventana', tipo: 'estado', enlace: null, opciones: ESTADO()}, {id: 'c07', nombre: 'Observaciones', tipo: 'texto', enlace: null}];

// Estado del rombo por piso para las columnas enlazadas (se recalcula cuando cambia el avance).
const enlaces = new Map();
if (typeof window !== 'undefined') window.addEventListener('atlas-avance-changed', () => enlaces.clear());
export function enlacePiso(level) {
  if (!enlaces.has(level)) enlaces.set(level, (async () => {
    const [pma, av] = await Promise.all([loadPma(), leerAvance()]);
    const planilla = planillaDe(level), por = new Map(reporteAvance(pma, new Map(), av.registros, level, planilla).filas.map(f => [f.code, f]));
    // Columnas enlazadas a una partida de la planilla («P:cieloDuro»): estado vigente de cada recinto y su lugar en la
    // lista de estados de la partida (el enlace va por ese orden).
    const familias = new Map(), deFamilia = fam => {
      if (!familias.has(fam)) { const a = avanceFamilia(planilla, fam, por); familias.set(fam, {a, filas: new Map(a.filas.map(x => [x.code, {...x, indice: a.categorias.indexOf(x.categoria), total: a.categorias.length}]))}); }
      return familias.get(fam);
    };
    const enlazado = (code, enlace) => {
      if (L.esEnlacePlanilla(enlace)) return deFamilia(enlace.slice(2)).filas.get(String(code).trim()) || null;
      const f = por.get(String(code).trim()); return f ? estadoTerminacion(enlace === 'MUROS' ? partidasDeMuros(f.nodos, f.row) : partidasDeTerminacion(f.nodos, enlace, f.row)) : null;
    };
    // Estados de la partida enlazada ({familia, categorias, colores}), o null sin planilla de esa partida en el piso.
    enlazado.partida = enlace => L.esEnlacePlanilla(enlace) && planilla ? deFamilia(enlace.slice(2)).a : null;
    return enlazado;
  })().catch(() => () => null));
  return enlaces.get(level);
}

// ctx: {esc, toast, level, levelName, rooms, find, enfocar(roomId), change(update), showDialog(html), dialog, abrir(doc),
//       cerrar(), biblioteca(), respaldo(), exportarPlano(), download(blob, nombre), alCambiarEnlace()}
export function createLevantamiento(ctx) {
  const esc = ctx.esc;
  let enlazado = null;
  // Pincel: un estado de la simbología con que se pintan los recintos tocados ({docId, col, op, n}). «marcas» guarda lo
  // necesario para deshacer cada toque; «cola» ordena los guardados de toques seguidos.
  let pincel = null, marcas = [], cola = Promise.resolve(), docVigente = null;
  const roomDe = code => ctx.rooms().find(r => r.code === code);
  const chip = c => c ? `<span class="levChip" style="--c:${c.color}">${esc(c.nombre)}</span>` : '<span class="levChip vacio">Sin dato</span>';
  // Al abrir, los estados de las columnas enlazadas a una partida toman los nombres y colores vigentes (por su orden).
  async function abrir(doc) {
    enlazado = await enlacePiso(doc.level); pincel = null; marcas = [];
    if (enlazado.partida && L.alinearPartidas(doc, enlazado.partida) !== doc) await ctx.change(d => L.alinearPartidas(d, enlazado.partida));
    ctx.alCambiarEnlace();
  }
  if (typeof window !== 'undefined') window.addEventListener('atlas-avance-changed', async () => { if (!enlazado) return; enlazado = await enlacePiso(ctx.level); ctx.alCambiarEnlace(); });
  // Partida de la planilla que alimenta una columna (null si es manual o el piso no tiene esa planilla).
  const partidaDe = c => (c && L.esEnlacePlanilla(c.enlace) && enlazado?.partida?.(c.enlace)) || null;
  const enRombo = (c, code) => { const a = partidaDe(c); return a && enlazado(code, c.enlace) ? a : null; };
  // Fija un estado: en el rombo si la columna sigue a una partida y el recinto está en su planilla; si no, en el proyecto.
  // Devuelve lo necesario para deshacer, o null si ya estaba en ese estado.
  async function asignar(doc, room, c, op) {
    const a = enRombo(c, room.code);
    if (a) {
      const i = L.indiceDeOpcion(c, op, a.categorias); if (i < 0) throw Error('Ese estado no corresponde a la partida.');
      if (enlazado(room.code, c.enlace).indice === i) return null;
      return {rombo: await marcarRecinto(room.code, a.familia, i)};
    }
    const fila = doc.filas.find(f => f.code === room.code), previo = fila?.valores[c.id] ?? null;
    if (previo === op) return null;
    await ctx.change(d => L.fijarValor(d, room, c.id, op));
    return {room, col: c.id, previo, existia: !!fila};
  }
  async function deshacer(m) {
    if (m.rombo) await deshacerRecinto(m.rombo);
    else await ctx.change(d => m.existia ? L.fijarValor(d, m.room, m.col, m.previo) : L.quitarFila(d, m.room.code));
  }
  // Columna que se puede pintar: la que colorea el plano, si no es texto ni sigue al pavimento, cielo o muros del rombo.
  const pintable = doc => { const c = doc.columnas.find(x => x.id === doc.vista); return c && c.tipo !== 'texto' && (!c.enlace || L.esEnlacePlanilla(c.enlace)) ? c : null; };
  // Toque en el plano con el pincel activo: pinta y devuelve true (la ficha no se abre).
  function pintar(room) {
    const doc = docVigente, c = doc && pintable(doc);
    if (!pincel || !c || pincel.docId !== doc.id || pincel.col !== c.id) return false;
    const op = pincel.op, docId = doc.id;
    cola = cola.then(async () => {
      try {
        const m = await asignar(docVigente, room, c, op);
        if (m && pincel?.docId === docId) { marcas.push(m); pincel.n++; }
      } catch (e) { ctx.toast(room.code + ': ' + e.message); }
      ctx.alCambiarEnlace();
    });
    return true;
  }
  const nombrePlano = code => roomDe(code)?.name || '';
  const filtradas = doc => L.filasFiltradas(doc, filtroLevantamiento(doc.id), enlazado, nombrePlano);
  // Con filtro, el plano pinta solo los recintos que pasan el filtro.
  function items(doc) {
    return filtradas(doc).map(f => { const r = roomDe(f.code), c = r && L.categoria(doc, f, enlazado); return c ? {id: r.id, color: c.color, number: null, opacity: .45} : null; }).filter(Boolean);
  }

  // ---------- Panel lateral ----------
  function render(panel, doc, focusedId) {
    const room = focusedId && ctx.find(focusedId), fila = room && doc.filas.find(f => f.code === room.code);
    const conFiltro = L.filtroActivo(filtroLevantamiento(doc.id)), visibles = filtradas(doc);
    const ley = L.leyenda(doc, visibles, enlazado), fuera = doc.filas.filter(f => !roomDe(f.code)).length;
    const vistas = [[L.VISTA_LISTO, 'Listo para instalar'], ...doc.columnas.filter(c => c.tipo !== 'texto').map(c => [c.id, c.nombre])];
    const campo = c => {
      const v = fila ? L.valor(c, fila, enlazado) : {id: null, rombo: false};
      if (c.tipo === 'texto') return `<label class="levCampo"><span>${esc(c.nombre)}</span><input data-lev-texto="${esc(c.id)}" maxlength="2000" value="${esc(fila?.valores[c.id] || '')}"></label>`;
      // Una partida de la planilla se marca aquí y queda en el rombo; pavimento, cielo y muros del rombo solo se muestran.
      const bloqueo = v.rombo && !L.esEnlacePlanilla(c.enlace) ? 'disabled title="Se toma del avance del rombo"' : v.rombo ? 'title="Se guarda en el rombo del recinto"' : '';
      return `<div class="levCampo"><span>${esc(c.nombre)}${v.rombo ? ' <small>· del rombo</small>' : ''}</span><div class="levOpciones">${c.opciones.map(o => `<button type="button" data-lev-col="${esc(c.id)}" data-lev-op="${esc(o.id)}" aria-pressed="${v.id === o.id}" style="--c:${o.color}" ${bloqueo}>${esc(o.nombre)}</button>`).join('')}</div></div>`;
    };
    // Simbología: con una columna pintable, cada estado es un pincel.
    const colPincel = pintable(doc);
    if (pincel && (pincel.docId !== doc.id || pincel.col !== colPincel?.id || !colPincel.opciones.some(o => o.id === pincel.op))) pincel = null;
    if (!pincel) marcas = [];
    docVigente = doc;
    const estadoPincel = colPincel && pincel ? colPincel.opciones.find(o => o.id === pincel.op) : null;
    const filaLeyenda = e => { const activo = pincel && e.id === pincel.op, nombre = `<i style="background:${e.color};${e.id ? '' : 'border:1px solid #8c8c8c'}"></i>${esc(e.nombre)}`;
      return `<tr class="${activo ? 'levPincelActivo' : ''}"><td>${colPincel && e.id ? `<button type="button" class="levPincelBoton" data-lev-pincel="${esc(e.id)}" aria-pressed="${!!activo}">${nombre}</button>` : nombre}</td><td>${e.n}</td></tr>`; };
    panel.innerHTML = `<div class="markingHead"><div><small>LEVANTAMIENTO · ${esc(ctx.levelName)}</small><h2>${esc(doc.name)}</h2></div><button id="closeMarking" data-wait-save aria-label="Cerrar proyecto">×</button></div>
      <div class="markingActions"><button id="markingDocuments" data-wait-save>Proyectos</button><button id="levColumnas" data-wait-save>Datos y columnas</button><button id="levTabla">Tabla</button><button id="levExcel" data-wait-save>Excel</button></div>
      <div class="markingScroll">
        ${conFiltro ? `<p class="levFiltro"><span><b>Filtro de la tabla:</b> ${esc(L.textoFiltro(doc, filtroLevantamiento(doc.id)))}. El plano y la exportación muestran ${visibles.length} de ${doc.filas.length} recintos.</span><button type="button" id="levQuitarFiltro">Quitar filtro</button></p>` : ''}
        <label class="levVista">Colorear plano por<select id="levVista">${vistas.map(([k, t]) => `<option value="${esc(k)}" ${doc.vista === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        ${estadoPincel ? `<div class="levPincel" role="status"><span>Pintando con <b style="--c:${estadoPincel.color}">${esc(estadoPincel.nombre)}</b> · ${pincel.n} ${pincel.n === 1 ? 'recinto' : 'recintos'}. Toca los recintos en el plano.</span>
          <div><button type="button" id="levDeshacer" ${marcas.length ? '' : 'disabled'}>Deshacer</button><button type="button" id="levPincelListo">Listo</button></div></div>`
          : colPincel ? `<p class="markingInstruction">Para marcar varios recintos, toca un estado y luego los recintos en el plano.${partidaDe(colPincel) ? ' Se guarda en el rombo de cada recinto.' : ''}</p>` : ''}
        <table class="estadosTabla"><tbody>${ley.filter(e => e.n || e.id).map(filaLeyenda).join('')}</tbody></table>
        ${room && !estadoPincel ?`<section class="levFicha"><h3>${esc(room.code)} · ${esc(room.name)}</h3>${fila ? '' : '<p class="markingInstruction">Aún no está en el levantamiento: se agrega al marcar una columna.</p>'}
          ${doc.columnas.map(campo).join('')}${fila ? '<button type="button" data-lev-quitar class="levQuitar">Quitar del levantamiento</button>' : ''}</section>`
          : estadoPincel ? '' : '<p class="markingInstruction">Toca un recinto en el plano para ver y marcar sus columnas.</p>'}
        <h3>${conFiltro ? `${visibles.length} de ${doc.filas.length} recintos (filtro)` : `${doc.filas.length} recintos en este piso`}${fuera ? ` · ${fuera} no están en el plano` : ''}</h3>
        <ol class="levFilas">${visibles.map(f => { const r = roomDe(f.code); return `<li class="${room && r?.id === room.id ? 'focused' : ''}"><button type="button" data-lev-fila="${esc(f.code)}" ${r ? '' : 'disabled'}><b>${esc(f.code)}</b><span>${esc(f.name || r?.name || '')}${r ? '' : ' · no está en el plano de este piso'}</span>${chip(L.categoria(doc, f, enlazado))}</button></li>`; }).join('')}</ol></div>
      <div class="markingFooter"><span id="markingSaveStatus" role="status"></span><div><button id="markingBackup" data-wait-save>Respaldo JSON</button><button id="markingExport" data-wait-save>Exportar plano</button></div><small>Las columnas enlazadas toman el estado del rombo cuando tiene registro.</small></div>`;
    panel.querySelector('#closeMarking').onclick = ctx.cerrar;
    panel.querySelector('#markingDocuments').onclick = ctx.biblioteca;
    panel.querySelector('#markingBackup').onclick = ctx.respaldo;
    panel.querySelector('#markingExport').onclick = ctx.exportarPlano;
    panel.querySelector('#levColumnas').onclick = () => editor(doc);
    panel.querySelector('#levTabla').onclick = () => verTabla(doc);
    panel.querySelector('#levQuitarFiltro')?.addEventListener('click', () => { const e = filtroLevantamiento(doc.id); e.filtros = {}; guardarFiltro(doc.id); ctx.alCambiarEnlace(); });
    panel.querySelector('#levExcel').onclick = () => exportarExcel(doc);
    panel.querySelector('#levVista').onchange = e => ctx.change(d => L.validarLevantamiento({...d, vista: e.target.value}));
    panel.querySelectorAll('[data-lev-fila]').forEach(b => b.onclick = () => { const r = roomDe(b.dataset.levFila); if (r) ctx.enfocar(r.id); });
    // Pincel: tocar un estado lo toma (o lo suelta si ya estaba); «Listo» lo suelta y «Deshacer» revierte el último toque.
    panel.querySelectorAll('[data-lev-pincel]').forEach(b => b.onclick = () => {
      pincel = pincel?.op === b.dataset.levPincel ? null : {docId: doc.id, col: colPincel.id, op: b.dataset.levPincel, n: pincel?.n || 0};
      ctx.alCambiarEnlace();
    });
    panel.querySelector('#levPincelListo')?.addEventListener('click', () => { pincel = null; ctx.alCambiarEnlace(); });
    panel.querySelector('#levDeshacer')?.addEventListener('click', () => {
      const m = marcas.pop(); if (!m) return;
      cola = cola.then(async () => { try { await deshacer(m); if (pincel) pincel.n = Math.max(0, pincel.n - 1); } catch (e) { ctx.toast('No se pudo deshacer: ' + e.message); } ctx.alCambiarEnlace(); });
    });
    if (!room) return;
    // Un estado de partida se guarda en el rombo (tocar el marcado no lo borra); los demás se marcan y desmarcan aquí.
    panel.querySelectorAll('[data-lev-op]').forEach(b => b.onclick = () => {
      const c = doc.columnas.find(x => x.id === b.dataset.levCol);
      if (c && enRombo(c, room.code)) { cola = cola.then(async () => { try { await asignar(doc, room, c, b.dataset.levOp); } catch (e) { ctx.toast(e.message); } ctx.alCambiarEnlace(); }); return; }
      ctx.change(d => L.fijarValor(d, room, b.dataset.levCol, b.getAttribute('aria-pressed') === 'true' ? null : b.dataset.levOp));
    });
    panel.querySelectorAll('[data-lev-texto]').forEach(i => i.onchange = () => ctx.change(d => L.fijarValor(d, room, i.dataset.levTexto, i.value.trim())));
    panel.querySelector('[data-lev-quitar]')?.addEventListener('click', () => ctx.change(d => L.quitarFila(d, room.code)));
  }

  // ---------- Tabla completa con filtros como Excel ----------
  function verTabla(doc) {
    const columnas = L.columnasTabla(doc, enlazado, nombrePlano), tabla = filtroLevantamiento(doc.id);
    const celda = (c, f) => { if (c.tipo === 'texto') return esc(f.valores[c.id] || ''); const v = L.valor(c, f, enlazado); return chip(L.opcion(c, v.id)) + (v.rombo ? '<small> rombo</small>' : ''); };
    const dibujar = () => {
      const filas = cf.aplicar(doc.filas);
      ctx.showDialog(`<h2>${esc(doc.name)} · ${esc(ctx.levelName)}</h2><p>${filas.length} de ${doc.filas.length} recintos. Toca un encabezado para filtrar u ordenar; toca un código para verlo en el plano. ${cf.activos() ? '<b>El plano y la exportación (PDF o PNG) muestran solo los recintos filtrados.</b> <button type="button" id="levVerPlano">Ver en el plano</button>' : 'Al filtrar, el plano y la exportación muestran solo los recintos filtrados.'}</p>${cf.limpiar()}
        <div class="tableScroll levTablaScroll"><table class="masterTable levTabla"><thead><tr>${cf.cabecera()}</tr></thead><tbody>${filas.map(f => `<tr><td><button type="button" class="codeLink" data-lev-ver="${esc(f.code)}" ${roomDe(f.code) ? '' : 'disabled'}>${esc(f.code)}</button></td><td>${esc(f.name || roomDe(f.code)?.name || '')}</td>${doc.columnas.map(c => `<td>${celda(c, f)}</td>`).join('')}<td>${chip(L.categoria({...doc, vista: L.VISTA_LISTO}, f, enlazado))}</td></tr>`).join('') || `<tr><td colspan="${columnas.length}">Sin recintos con estos filtros.</td></tr>`}</tbody></table></div>`);
      ctx.dialog.classList.add('ancho'); ctx.dialog.addEventListener('close', () => ctx.dialog.classList.remove('ancho'), {once: true});
      cf.conectar(ctx.dialog, doc.filas);
      ctx.dialog.querySelectorAll('[data-lev-ver]').forEach(b => b.onclick = () => { const r = roomDe(b.dataset.levVer); ctx.dialog.close(); if (r) ctx.enfocar(r.id); });
      ctx.dialog.querySelector('#levVerPlano')?.addEventListener('click', () => ctx.dialog.close());
    };
    // Cada cambio de filtro se recuerda y repinta el plano y el panel (que quedan detrás de la tabla).
    const cf = crearFiltrosColumna({id: 'levantamiento', columnas, estado: tabla, esc, alCambiar: () => { guardarFiltro(doc.id); ctx.alCambiarEnlace(); dibujar(); }});
    dibujar();
  }

  // ---------- Columnas (editor compartido por crear, importar y editar) ----------
  function columnasHTML(cols) {
    return `<ol class="levColumnas">${cols.map((c, i) => `<li data-col="${i}"><div class="levColCab"><input name="nombre" maxlength="80" required value="${esc(c.nombre)}" aria-label="Nombre de la columna ${i + 1}">
        <select name="tipo" aria-label="Tipo">${Object.entries(L.TIPOS_COLUMNA).map(([k, t]) => `<option value="${k}" ${c.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select name="enlace" aria-label="Enlace al rombo" ${c.tipo === 'estado' ? '' : 'hidden'}><option value="">Manual</option>${Object.entries(L.ENLACES).map(([k, t]) => `<option value="${k}" ${c.enlace === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button type="button" data-col-subir="${i}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" data-col-quitar="${i}" aria-label="Quitar columna">×</button></div>
      ${c.tipo === 'texto' ? '' : `<ul class="levOps">${(c.opciones || []).map((o, j) => `<li data-op="${j}"><input type="color" name="color" value="${esc(o.color)}" aria-label="Color"><input name="op" maxlength="80" required value="${esc(o.nombre)}" aria-label="Opción">
        ${c.tipo === 'estado' ? `<label title="Estado final (cuenta para «Listo»)"><input type="radio" name="final${i}" ${o.final ? 'checked' : ''}> Final</label><label title="No bloquea el «Listo»"><input type="checkbox" name="na" ${o.noAplica ? 'checked' : ''}> No aplica</label>` : ''}
        <button type="button" data-op-quitar="${i}.${j}" aria-label="Quitar opción">×</button></li>`).join('')}<li><button type="button" data-op-agregar="${i}">+ Opción</button></li></ul>`}</li>`).join('')}</ol>
      <button type="button" data-col-agregar>+ Agregar columna</button>`;
  }
  // Lee el formulario sobre las columnas de partida (conserva ids, orígenes y claves de importación).
  function leerColumnas(root, cols) {
    return [...root.querySelectorAll('.levColumnas > li')].map((li, i) => {
      const c = cols[i], tipo = li.querySelector('[name=tipo]').value, out = {...c, nombre: li.querySelector('[name=nombre]').value.trim(), tipo, enlace: tipo === 'estado' ? li.querySelector('[name=enlace]').value || null : tipo === 'lista' && L.esEnlacePlanilla(c?.enlace) ? c.enlace : null};
      if (tipo === 'texto') { delete out.opciones; return out; }
      const ops = [...li.querySelectorAll('.levOps > li[data-op]')];
      out.opciones = ops.length ? ops.map((o, j) => ({...(c.opciones?.[j] || {}), id: c.opciones?.[j]?.id || 'o' + crypto.randomUUID().slice(0, 6), nombre: o.querySelector('[name=op]').value.trim(), color: o.querySelector('[name=color]').value,
        final: tipo === 'estado' && !!o.querySelector(`[name=final${i}]`)?.checked, noAplica: tipo === 'estado' && !!o.querySelector('[name=na]')?.checked})).map(({final, noAplica, ...o}) => ({...o, ...(final ? {final} : {}), ...(noAplica ? {noAplica} : {})}))
        : [{id: 'o01', nombre: 'Instalado', color: '#2e9e5b', ...(tipo === 'estado' ? {final: true} : {})}];
      return out;
    });
  }
  // Conecta la botonera del editor; redibuja con «pintar(cols)» al agregar o quitar.
  function conectarColumnas(root, cols, pintar) {
    const leer = () => leerColumnas(root, cols);
    root.querySelector('[data-col-agregar]').onclick = () => { const v = leer(); v.push({id: 'c' + crypto.randomUUID().slice(0, 6), nombre: 'Columna ' + (v.length + 1), tipo: 'estado', enlace: null, opciones: ESTADO()}); pintar(v); };
    root.querySelectorAll('[data-col-quitar]').forEach(b => b.onclick = () => { const v = leer(); v.splice(+b.dataset.colQuitar, 1); pintar(v); });
    root.querySelectorAll('[data-col-subir]').forEach(b => b.onclick = () => { const v = leer(), i = +b.dataset.colSubir; [v[i - 1], v[i]] = [v[i], v[i - 1]]; pintar(v); });
    root.querySelectorAll('[name=tipo]').forEach(s => s.onchange = () => { const v = leer(); const i = +s.closest('[data-col]').dataset.col; if (v[i].tipo !== 'texto' && !v[i].opciones?.length) v[i].opciones = v[i].tipo === 'estado' ? ESTADO() : [{id: 'o01', nombre: 'Opción 1', color: '#2f6db5'}]; pintar(v); });
    root.querySelectorAll('[data-op-agregar]').forEach(b => b.onclick = () => { const v = leer(), c = v[+b.dataset.opAgregar]; c.opciones = [...(c.opciones || []), {id: 'o' + crypto.randomUUID().slice(0, 6), nombre: 'Opción ' + ((c.opciones?.length || 0) + 1), color: '#5f6b7a'}]; pintar(v); });
    root.querySelectorAll('[data-op-quitar]').forEach(b => b.onclick = () => { const v = leer(), [i, j] = b.dataset.opQuitar.split('.').map(Number); v[i].opciones.splice(j, 1); pintar(v); });
    return leer;
  }

  // Nuevo levantamiento (con la plantilla de artefactos) o datos y columnas de uno existente. Las columnas cambian en todos los
  // pisos del mismo levantamiento, igual que el nombre y el propósito. El autor es quien inició sesión.
  function editor(doc = null) {
    let cols = structuredClone(doc ? doc.columnas : PLANTILLA_ARTEFACTOS()), leer;
    const pintar = v => { cols = v; const caja = ctx.dialog.querySelector('#levCols'); caja.innerHTML = columnasHTML(cols); leer = conectarColumnas(caja, cols, pintar); };
    ctx.showDialog(`<h2>${doc ? 'Datos y columnas del proyecto' : 'Nuevo levantamiento'}</h2><p>${doc ? 'Los cambios se aplican en todos los pisos de este proyecto. Quitar una columna u opción borra sus valores.' : 'Arquitectura · ' + esc(ctx.levelName) + '. Parte con las columnas de un levantamiento de artefactos; cámbialas a gusto.'}</p>
      <form id="markingForm"><label>Nombre del proyecto *<input name="name" required maxlength="160" value="${esc(doc?.name || '')}" placeholder="Ej.: Recintos listos para artefactos"></label>${propositoHTML(doc?.purpose, esc, 'Levantamiento')}<p class="propositoAutor">${doc ? 'Creado por ' + esc(doc.author) : 'Queda registrado a nombre de quien inició sesión' + (firmante() ? ': ' + esc(firmante()) : '')}.</p>
      <fieldset class="estadosEditor"><legend>Columnas <small>(el código y el nombre del recinto van siempre)</small></legend><div id="levCols"></div></fieldset>
      <button type="submit" class="primary">${doc ? 'Guardar columnas' : 'Crear y comenzar'}</button></form>`);
    pintar(cols); conectarProposito(ctx.dialog.querySelector('form'));
    ctx.dialog.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)), columnas = leer(), error = ctx.dialog.querySelector('#markingError');
      try {
        const name = String(v.name || '').trim(), purpose = leerProposito(v), datos = d => ({...L.fijarColumnas(d, columnas), name, purpose});
        if (doc) {
          await ctx.change(datos);
          for (const otro of (await readMarkings()).filter(o => doc.grupo && o.grupo === doc.grupo && o.id !== doc.id && !o.eliminado)) await saveMarking({...datos(otro), version: otro.version + 1, updatedAt: new Date().toISOString()}, otro.version);
          ctx.dialog.close();
        } else {
          const nuevo = L.nuevoLevantamiento({name, author: exigirFirma('Inicia sesión en Atlas para crear el proyecto.'), purpose, columnas, grupo: crypto.randomUUID()}, ctx.level, crypto.randomUUID());
          await saveMarking(nuevo, 0); ctx.abrir(nuevo);
        }
      } catch (failure) { error.textContent = failure.message; }
    };
  }

  // ---------- Importar ----------
  async function leerPlanilla(file) {
    await loadVendor('xlsx'); const X = window.XLSX;
    let libro;
    if (/\.(csv|txt)$/i.test(file.name)) {
      const texto = await file.text(), primera = texto.split(/\r?\n/)[0] || '', fs = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : primera.includes('\t') ? '\t' : ',';
      libro = X.read(texto, {type: 'string', FS: fs, raw: true});
    } else libro = X.read(await file.arrayBuffer(), {type: 'array'});
    return libro.SheetNames.map(nombre => ({nombre, aoa: X.utils.sheet_to_json(libro.Sheets[nombre], {header: 1, defval: '', raw: false})}));
  }
  async function importar(file) {
    // El aviso va dentro de la ventana abierta: el mensaje flotante queda tapado por ella.
    const aviso = (texto, error = false) => { ctx.dialog.querySelector('#levAviso')?.classList.toggle('error', error); const p = ctx.dialog.open && (ctx.dialog.querySelector('#levAviso') || ctx.dialog.querySelector('#markingError')); if (p) p.textContent = texto; else if (texto) ctx.toast(texto); };
    let propuesta;
    try { if (file.size > 15e6) throw Error('La planilla supera 15 MB.'); aviso('Leyendo ' + file.name + '…'); propuesta = L.proponerLibro(await leerPlanilla(file)); }
    catch (failure) { aviso(`No se pudo importar «${file.name}»: ${failure.message}`, true); return; }
    let cols = propuesta.columnas, leer;
    const pisos = propuesta.niveles.map(n => [n, L.pisoDe(n)]), desconocidos = pisos.filter(([, p]) => !p).map(([n]) => n);
    const pintar = v => { cols = v; const caja = ctx.dialog.querySelector('#levCols'); caja.innerHTML = columnasHTML(cols); leer = conectarColumnas(caja, cols, pintar); };
    ctx.showDialog(`<h2>Importar levantamiento</h2><p>${esc(file.name)} · hoja «${esc(propuesta.hoja)}» · ${propuesta.filas} filas · código en «${esc(propuesta.encabezado[propuesta.indiceCodigo])}»${propuesta.indiceNivel >= 0 ? ` · nivel en «${esc(propuesta.encabezado[propuesta.indiceNivel])}»` : ''}.</p>
      <p>${propuesta.indiceNivel >= 0 ? 'Se crea un levantamiento por piso: ' + pisos.filter(([, p]) => p).map(([n, p]) => `${esc(n)} → ${NOMBRE_PISO[p]}`).join(' · ') + '.' : 'Sin columna Nivel: todo va a ' + esc(ctx.levelName) + '.'}${desconocidos.length ? ` <b>No se reconocen los niveles ${desconocidos.map(esc).join(', ')}: esas filas no se importan.</b>` : ''}</p>
      <form id="markingForm"><label>Nombre del proyecto *<input name="name" required maxlength="160" value="${esc(file.name.replace(/\.[^.]+$/, ''))}"></label>
      ${propositoHTML('Levantamiento', esc)}
      <fieldset class="estadosEditor"><legend>Columnas propuestas <small>(revisa nombres, tipos, colores y el estado final)</small></legend><div id="levCols"></div></fieldset>
      <button type="submit" class="primary">Importar</button></form>`);
    pintar(cols); conectarProposito(ctx.dialog.querySelector('form'));
    ctx.dialog.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)), error = ctx.dialog.querySelector('#markingError'), boton = e.target.querySelector('[type=submit]');
      try {
        boton.disabled = true; const grupo = crypto.randomUUID(), purpose = leerProposito(v), author = exigirFirma('Inicia sesión en Atlas para importar el levantamiento.');
        const {docs, avisos} = L.construir({...propuesta, columnas: leer()}, {name: v.name.trim(), author, purpose, pisoActual: ctx.level, grupo, ids: propuesta.niveles.map(() => crypto.randomUUID())});
        if (!docs.length) throw Error('Ninguna fila se pudo importar. ' + (avisos[0] || 'Revisa las columnas Nivel y Código de recinto.'));
        for (const d of docs) await saveMarking(d, 0);
        const aqui = docs.find(d => d.level === ctx.level);
        ctx.toast(`Levantamiento importado: ${docs.map(d => `${NOMBRE_PISO[d.level]} ${d.filas.length}`).join(' · ')} recintos.${avisos.length ? ` ${avisos.length} avisos.` : ''}`);
        if (avisos.length) console.info('Avisos de la importación:', avisos);
        if (aqui) ctx.abrir(aqui); else ctx.biblioteca();
      } catch (failure) { boton.disabled = false; error.textContent = failure.message; }
    };
  }

  // ---------- Exportar a Excel (todos los pisos del levantamiento) ----------
  async function exportarExcel(doc) {
    try {
      const docs = doc.grupo ? (await readMarkings()).filter(d => d.grupo === doc.grupo && d.tipo === 'levantamiento' && !d.eliminado) : [doc];
      const enlazados = Object.fromEntries(await Promise.all(docs.map(async d => [d.level, await enlacePiso(d.level)])));
      const alineado = d => enlazados[d.level]?.partida ? L.alinearPartidas(d, enlazados[d.level].partida) : d;
      const aoa = L.exportar(docs.map(d => alineado(d.id === doc.id ? doc : d)), enlazados);
      await loadVendor('xlsx'); const X = window.XLSX, ws = X.utils.aoa_to_sheet(aoa), wb = X.utils.book_new();
      ws['!cols'] = aoa[0].map((h, i) => ({wch: Math.min(40, Math.max(String(h).length, ...aoa.slice(1, 200).map(r => String(r[i] ?? '').length)) + 2)}));
      ws['!autofilter'] = {ref: X.utils.encode_range({s: {r: 0, c: 0}, e: {r: aoa.length - 1, c: aoa[0].length - 1}})};
      X.utils.book_append_sheet(wb, ws, 'Levantamiento');
      ctx.download(new Blob([X.write(wb, {bookType: 'xlsx', type: 'array'})], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), doc.name.replace(/[\\/:*?"<>|]+/g, '-') + '.xlsx');
    } catch (failure) { ctx.toast('No se pudo exportar: ' + failure.message); }
  }

  return {abrir, items, render, editor, importar, exportarExcel, pintar};
}
