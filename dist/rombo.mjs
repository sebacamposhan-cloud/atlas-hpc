// Rombo interactivo del recinto: avance y observaciones juntos. Cada sección es una partida, ubicada como en el rombo de
// las láminas (M1 arriba, M2 derecha, M3 abajo, M4 izquierda, cielo al centro arriba y pavimento al centro abajo). Su
// color es el estado de ejecución y un número rojo cuenta las observaciones pendientes de ese elemento. Tocar una sección
// despliega su checklist (instalación, revisión, qué falta) y sus observaciones; cambiar el estado lo guarda al instante.
import {loadPma} from './pma.mjs';
import {nivel} from './level.mjs';
import {tasksFor, reportProgress, keyFor, fields, ESTADOS_PARTIDA, COLOR_PARTIDA, estadoPartida, actualizarPartida} from './room-progress-model.mjs';
import {readProgress, saveProgress} from './room-progress-store.mjs';
import {progressFloors, progressFloor} from './progress-scope.mjs';

const ZONAS = {
  M1: {puntos: '75,85 150,10 225,85 205,105 95,105', texto: [150, 66], aviso: [180, 54]},
  M2: {puntos: '225,85 290,150 225,215 205,195 205,105', texto: [240, 150], aviso: [222, 110]},
  M3: {puntos: '225,215 150,290 75,215 95,195 205,195', texto: [150, 240], aviso: [176, 212]},
  M4: {puntos: '75,215 10,150 75,85 95,105 95,195', texto: [60, 150], aviso: [60, 110]},
  CIE: {puntos: '95,105 205,105 205,150 95,150', texto: [150, 128], aviso: [183, 108]},
  PAV: {puntos: '95,150 205,150 205,195 95,195', texto: [150, 173], aviso: [183, 153]}
};
const NOMBRE_OBS = {PAV: 'Pavimento', CIE: 'Cielo', M1: 'Muro M1', M2: 'Muro M2', M3: 'Muro M3', M4: 'Muro M4'};
const OSCUROS = new Set(['No iniciado', 'En proceso', 'Instalado · por revisar', 'Con observaciones', 'Instalado y conforme']);
const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const CLAVE_AUTOR = 'atlas-autor';
const autor = () => { try { return localStorage.getItem(CLAVE_AUTOR) || ''; } catch { return ''; } };
const recordarAutor = v => { try { localStorage.setItem(CLAVE_AUTOR, v); } catch {} };

// Dibujo del rombo (SVG). partes: {campo: {codigo, estado, pendientes}}; elegido: campo seleccionado.
export function romboSVG(partes, elegido, esc = String, interactivo = true) {
  const parte = campo => {
    const p = partes[campo] || {codigo: '—', estado: 'Sin definición', pendientes: 0}, z = ZONAS[campo], oscuro = OSCUROS.has(p.estado), [x, y] = z.texto;
    const relleno = p.estado === 'No aplica' ? 'url(#romboNA)' : COLOR_PARTIDA[p.estado];
    const attrs = interactivo ? ` data-rombo="${campo}" role="button" tabindex="0" aria-pressed="${elegido === campo}"` : '';
    return `<g class="romboParte${elegido === campo ? ' romboElegida' : ''}"${attrs} aria-label="${esc(fields[campo])} ${esc(campo)} · ${esc(p.codigo)} · ${esc(p.estado)}${p.pendientes ? ` · ${p.pendientes} observaciones pendientes` : ''}"><title>${esc(fields[campo])} (${campo}) · ${esc(p.codigo)} · ${esc(p.estado)}</title>
      <polygon points="${z.puntos}" fill="${relleno}"/><text x="${x}" y="${y}" class="${oscuro ? 'claro' : ''}">${esc(p.codigo)}</text><text x="${x}" y="${y + 15}" class="romboCampo${oscuro ? ' claro' : ''}">${campo}</text>
      ${p.pendientes ? `<g class="romboAviso"><rect x="${z.aviso[0]}" y="${z.aviso[1]}" width="20" height="18"/><text x="${z.aviso[0] + 10}" y="${z.aviso[1] + 10}">${p.pendientes}</text></g>` : ''}</g>`;
  };
  // La elegida se dibuja al final para que su contorno quede encima.
  const orden = Object.keys(ZONAS).sort((a, b) => (a === elegido) - (b === elegido));
  return `<svg class="romboSVG" viewBox="0 0 300 300" role="group" aria-label="Rombo del recinto: toca una partida"><defs><pattern id="romboNA" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#fff"/><line x1="0" y1="0" x2="0" y2="8" stroke="#8c8c8c" stroke-width="2"/></pattern></defs>${orden.map(parte).join('')}</svg>`;
}

// ctx: {esc, toast, observaciones: () => Promise<{porCodigo}>, nuevaObservacion(room, campo, alGuardar), abrirObservacion(id, alCambiar), modalOriginal?()}
export function createRombo(ctx) {
  const esc = ctx.esc;
  let elegido = 'PAV';
  async function ficha(root, room, {alGuardar = () => {}} = {}) {
    const serial = (Number(root.dataset.romboSerial) || 0) + 1; root.dataset.romboSerial = serial;
    const vigente = () => root.isConnected && Number(root.dataset.romboSerial) === serial;
    const enPiso = progressFloors[nivel.id] && progressFloor(room.level) === nivel.id;
    let model = null, snapshot = {records: []}, obs = [];
    try { [model, snapshot] = enPiso ? await Promise.all([loadPma(), readProgress()]) : [null, {records: []}]; } catch (e) { model = null; }
    try { obs = ((await ctx.observaciones?.())?.porCodigo.get(String(room.code).trim()) || []); } catch {}
    if (!vigente()) return;
    const actual = snapshot.records.find(r => r.key === keyFor(room.code, nivel.id));
    const todas = model ? tasksFor(model, room, nivel.id) : [], fila = model ? reportProgress(model, [room], snapshot.records, nivel.id).rows[0] : null;
    const tarea = campo => { const t = todas.find(t => t.field === campo); if (!t) return null; const r = fila?.tasks.find(x => x.field === campo); return {...t, ...(r || {installation: 'Sin registrar', quality: 'Sin revisar', missing: '', notes: ''})}; };
    const codigo = campo => tarea(campo)?.code || room.finishes?.find(f => f.field === campo)?.code || '—';
    const pendientes = campo => obs.filter(o => o.terminacion === campo && ['Abierta', 'En corrección', 'Corregida'].includes(o.estado));
    const partes = Object.fromEntries(Object.keys(ZONAS).map(c => [c, {codigo: codigo(c), estado: todas.length ? estadoPartida(tarea(c)) : 'Sin definición', pendientes: pendientes(c).length}]));
    const avisos = [...(fila?.warnings || []), ...(actual && model && actual.sourceSha !== model.source.sha256 ? ['El avance guardado es de otra versión del PMA.'] : [])];
    const registrable = !!(model && todas.length);
    const t = tarea(elegido), estado = partes[elegido].estado, editable = registrable && t?.applicable && t?.documented;
    const lista = obs.filter(o => o.terminacion === elegido).sort((a, b) => b.actualizada.localeCompare(a.actualizada));
    const boton = (campo, valor, actualV, extra = '') => `<button type="button" data-rombo-${campo}="${esc(valor)}" aria-pressed="${valor === actualV}" ${extra}>${esc(valor)}</button>`;
    root.innerHTML = `<div class="romboCaja">${romboSVG(partes, elegido, esc, true)}
      <div class="romboLeyenda">${ESTADOS_PARTIDA.filter(e => e !== 'Sin definición').map(e => `<span><i class="${e === 'No aplica' ? 'na' : ''}" style="background:${COLOR_PARTIDA[e]}"></i>${esc(e)}</span>`).join('')}<span><i class="obs"></i>Observaciones pendientes</span></div></div>
      ${registrable ? '' : `<p class="romboNota">${enPiso ? 'Este recinto no tiene correspondencia en el PMA: el rombo muestra los códigos, pero el avance no se puede registrar.' : 'El recinto no pertenece al piso activo.'}</p>`}
      ${avisos.map(w => `<p class="pmaWarning">${esc(w)}</p>`).join('')}
      <section class="romboPartida" aria-live="polite"><div class="romboTitulo"><span class="romboChip" style="--c:${COLOR_PARTIDA[estado]}">${esc(estado)}</span><h4>${esc(fields[elegido])} · ${esc(elegido)} · ${esc(partes[elegido].codigo)}</h4></div>
        <p class="romboDesc">${esc(t?.description || room.finishes?.find(f => f.field === elegido)?.description || 'Sin descripción en el PMA')}${t && elegido !== 'PAV' && t.asepsis ? ` · Asepsia ${esc(t.asepsis)}` : ''}</p>
        ${editable ? `<div class="romboFila"><span>Ejecución</span><div class="romboBotones">${['No iniciado', 'En proceso', 'Instalado'].map(v => boton('inst', v, t.installation)).join('')}</div></div>
          <div class="romboFila"><span>Revisión</span><div class="romboBotones">${['Sin revisar', 'Con observaciones', 'Conforme'].map(v => boton('cal', v, t.quality, v === 'Conforme' && t.installation !== 'Instalado' ? 'disabled title="Primero márcala instalada"' : '')).join('')}</div></div>
          <label>Qué falta<textarea data-rombo-texto="missing" maxlength="5000" rows="2">${esc(t.missing || '')}</textarea></label>
          <label>Observación de la partida${t.quality === 'Con observaciones' ? ' *' : ''}<textarea data-rombo-texto="notes" maxlength="5000" rows="2">${esc(t.notes || '')}</textarea></label>
          <div class="romboFila romboFirma"><label>Responsable *<input data-rombo-resp maxlength="200" value="${esc(actual?.responsible || autor())}" autocomplete="name"></label>${avisos.length ? '<label class="check"><input type="checkbox" data-rombo-cotejo> Cotejé las diferencias documentales</label>' : ''}<button type="button" class="primary" data-rombo-guardar>Guardar notas</button></div>
          <p class="romboMensaje" role="status">${t.stale ? 'La fuente cambió desde el último registro: revisa y vuelve a guardar.' : actual ? `Último registro: ${esc(actual.date)} · ${esc(actual.responsible)}` : 'Sin registros todavía.'}</p>`
        : registrable ? `<p class="romboNota">${t && !t.applicable ? 'No aplica según el PMA: fuera del cálculo de avance.' : 'Requiere definición documental en el PMA: fuera del porcentaje.'}</p>` : ''}
        <div class="romboObs"><div class="romboTitulo"><h4>Observaciones en ${esc(NOMBRE_OBS[elegido])} <small>${lista.length}</small></h4><button type="button" data-rombo-obs-nueva>+ Observación con foto</button></div>
          ${lista.length ? `<ul class="romboObsLista">${lista.map(o => `<li><button type="button" data-rombo-obs="${esc(o.id)}"><b>${esc(o.descripcion)}</b><small>${esc(o.estado === 'Corregida' ? 'Por validar' : o.estado)} · ${esc(o.responsable || 'Sin responsable')}${o.plazo ? ' · plazo ' + esc(o.plazo.split('-').reverse().join('-')) : ''}${o.fotos.length ? ` · ${o.fotos.length} foto${o.fotos.length === 1 ? '' : 's'}` : ''}</small></button></li>`).join('')}</ul>` : '<p class="romboNota">Sin observaciones en este elemento.</p>'}</div></section>`;
    const volver = () => ficha(root, room, {alGuardar});
    const elegir = campo => { elegido = campo; volver(); };
    root.querySelectorAll('[data-rombo]').forEach(g => { g.addEventListener('click', () => elegir(g.dataset.rombo)); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(g.dataset.rombo); } }); });
    root.querySelector('[data-rombo-obs-nueva]').onclick = () => ctx.nuevaObservacion(room, elegido, volver);
    root.querySelectorAll('[data-rombo-obs]').forEach(b => b.onclick = () => ctx.abrirObservacion(b.dataset.romboObs, volver));
    if (!editable) return;
    const mensaje = root.querySelector('.romboMensaje'), texto = k => root.querySelector(`[data-rombo-texto="${k}"]`).value;
    let pendiente = null; // «Con observaciones» sin nota: se aplica al guardar la nota
    async function guardar(cambio) {
      const responsible = root.querySelector('[data-rombo-resp]').value.trim(), cotejo = root.querySelector('[data-rombo-cotejo]');
      if (!responsible) { mensaje.textContent = 'Indica el responsable antes de registrar.'; root.querySelector('[data-rombo-resp]').focus(); return; }
      if (cotejo && !cotejo.checked) { mensaje.textContent = 'Marca que cotejaste las diferencias documentales antes de registrar.'; cotejo.focus(); return; }
      try {
        const valor = actualizarPartida(model, room, nivel.id, actual, elegido, {missing: texto('missing'), notes: texto('notes'), ...cambio}, {responsible, date: hoy(), sourceReviewed: !!cotejo?.checked});
        root.querySelectorAll('button').forEach(b => { b.disabled = true; });
        await saveProgress(valor, actual?.version || 0); recordarAutor(responsible);
        ctx.toast?.(`${fields[elegido]}: ${estadoPartida({...t, ...valor.fields[elegido]})}.`);
        alGuardar(); await volver();
      } catch (e) {
        root.querySelectorAll('button').forEach(b => { b.disabled = false; });
        if (/observación de la partida/.test(e.message)) { pendiente = cambio; mensaje.textContent = 'Escribe la observación de la partida y pulsa «Guardar notas».'; root.querySelector('[data-rombo-texto="notes"]').focus(); }
        else mensaje.textContent = e.message;
      }
    }
    root.querySelectorAll('[data-rombo-inst]').forEach(b => b.onclick = () => guardar({installation: b.dataset.romboInst}));
    root.querySelectorAll('[data-rombo-cal]').forEach(b => b.onclick = () => guardar({quality: b.dataset.romboCal}));
    root.querySelector('[data-rombo-guardar]').onclick = () => guardar(pendiente || {});
  }
  return {ficha};
}
