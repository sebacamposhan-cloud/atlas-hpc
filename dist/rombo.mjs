// Rombo interactivo del recinto: avance y observaciones juntos. Cada sección es una terminación, ubicada como en el rombo
// de las láminas (M1 arriba, M2 derecha, M3 abajo, M4 izquierda, cielo al centro arriba y pavimento al centro abajo). Su
// color es el estado de ejecución y un número rojo cuenta las observaciones pendientes de ese elemento. Tocar una sección
// despliega sus partidas del avance, cada una con dos filas (ejecución, con su % mientras se ejecuta, y revisión) que se
// guardan al tocarlas: el color de la terminación se calcula desde ellas. Una terminación sin partidas se marca directo.
// Firma la cuenta de Nube del equipo; el detalle de lo observado va solo en las observaciones con foto.
import {loadPma} from './pma.mjs';
import {nivel} from './level.mjs';
import {tasksFor, reportProgress, keyFor, fields, ESTADOS_PARTIDA, COLOR_PARTIDA, estadoPartida, actualizarPartida} from './room-progress-model.mjs';
import {readProgress, saveProgress} from './room-progress-store.mjs';
import {progressFloors, progressFloor} from './progress-scope.mjs';
import {cargarAvance, m2, unidad} from './avance.mjs';
import {partidasDeTerminacion, estadoTerminacion, actualizarNodo, sembrarTerminacion, protocolosDe, EJECUCION, REVISION} from './avance-model.mjs';
import {guardarAvance} from './avance-store.mjs';
import {firmante, exigirFirma, pedirSesion} from './firma.mjs';

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
const fecha = d => String(d || '').split('-').reverse().join('-');

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

// ctx: {esc, toast, observaciones: () => Promise<{porCodigo}>, nuevaObservacion(room, campo, alGuardar), abrirObservacion(id, alCambiar),
//       verCodigo?(campo, codigo) para ver en el plano los recintos con ese código}
export function createRombo(ctx) {
  const esc = ctx.esc;
  let elegido = 'PAV';
  async function ficha(root, room, {alGuardar = () => {}} = {}) {
    const serial = (Number(root.dataset.romboSerial) || 0) + 1; root.dataset.romboSerial = serial;
    const vigente = () => root.isConnected && Number(root.dataset.romboSerial) === serial;
    const enPiso = progressFloors[nivel.id] && progressFloor(room.level) === nivel.id;
    let model = null, snapshot = {records: []}, obs = [], avance = null;
    try { [model, snapshot] = enPiso ? await Promise.all([loadPma(), readProgress()]) : [null, {records: []}]; } catch (e) { model = null; }
    try { obs = ((await ctx.observaciones?.())?.porCodigo.get(String(room.code).trim()) || []); } catch {}
    try { avance = enPiso ? (await cargarAvance()).porCodigo.get(String(room.code).trim()) || null : null; } catch {}
    if (!vigente()) return;
    const actual = snapshot.records.find(r => r.key === keyFor(room.code, nivel.id));
    const todas = model ? tasksFor(model, room, nivel.id) : [], fila = model ? reportProgress(model, [room], snapshot.records, nivel.id).rows[0] : null;
    const partidasDe = campo => avance ? partidasDeTerminacion(avance.nodos, campo, avance.row) : [];
    // Lo marcado directo en el rombo; con partidas registradas, su estado calculado manda.
    const marcada = campo => { const t = todas.find(t => t.field === campo); if (!t) return null; const r = fila?.tasks.find(x => x.field === campo); return {...t, ...(r || {installation: 'Sin registrar', quality: 'Sin revisar', stale: false})}; };
    const tarea = campo => { const t = marcada(campo), d = t && estadoTerminacion(partidasDe(campo)); return d ? {...t, ...d, stale: false} : t; };
    const codigo = campo => tarea(campo)?.code || room.finishes?.find(f => f.field === campo)?.code || '—';
    const pendientes = campo => obs.filter(o => o.terminacion === campo && ['Abierta', 'En corrección', 'Corregida'].includes(o.estado));
    const partes = Object.fromEntries(Object.keys(ZONAS).map(c => [c, {codigo: codigo(c), estado: todas.length ? estadoPartida(tarea(c)) : 'Sin definición', pendientes: pendientes(c).length}]));
    const avisos = [...(fila?.warnings || []), ...(actual && model && actual.sourceSha !== model.source.sha256 ? ['El avance guardado es de otra versión del PMA.'] : [])];
    const registrable = !!(model && todas.length);
    const t = tarea(elegido), estado = partes[elegido].estado, aplica = registrable && t?.applicable && t?.documented;
    const ps = aplica ? partidasDe(elegido) : [], conPartidas = ps.length > 0, directo = aplica && !conPartidas;
    const previa = conPartidas && !ps.some(p => p.registrada) ? marcada(elegido) : null, traspasar = previa && !previa.stale && previa.installation !== 'Sin registrar';
    const lista = obs.filter(o => o.terminacion === elegido).sort((a, b) => b.actualizada.localeCompare(a.actualizada));
    const boton = (attr, valor, actualV, extra = '') => `<button type="button" ${attr}="${esc(valor)}" aria-pressed="${valor === actualV}" ${extra}>${esc(valor)}</button>`;
    const cantidad = n => n.cantidad != null ? `${m2(n.m2Ejecutado)} de ${m2(n.cantidad)} ${esc(unidad(n.unidad))} ejecutados · <b>${m2(n.m2Pendiente)} ${esc(unidad(n.unidad))} pendientes</b>` : 'Sin superficie por recinto en el PMA: avance en %';
    const resumen = n => (n.ejecucion === 'En ejecución' && n.pctIndicado != null ? 'En ejecución · ' + n.pctIndicado + ' %' : n.ejecucion) + (n.revision === 'Sin revisar' ? '' : ' · ' + n.revision);
    const nombre = b => b.tipo === 'protocolo' ? b.nombre : b.item + ' ' + b.nombre;
    const partida = n => `<li data-partida="${esc(n.id)}"><div class="romboPartidaCab"><span><b>${esc(n.item)}</b> ${esc(n.nombre)}</span><span class="romboPct">${esc(resumen(n))}</span></div>
      <small>${cantidad(n)}</small>${n.bloqueadoPor.length ? `<small class="romboBloqueo">Para quedar conforme falta liberar: ${esc(n.bloqueadoPor.map(nombre).join(', '))}</small>` : ''}
      <div class="romboFila"><span>Ejecución</span><div class="romboBotones">${EJECUCION.map(v => boton('data-p-ejec', v, n.ejecucion)).join('')}</div></div>
      ${n.ejecucion === 'En ejecución' ? `<label class="romboPctCampo">% ejecutado<input type="number" inputmode="numeric" min="1" max="99" step="1" data-p-pct value="${n.pctIndicado ?? ''}" placeholder="1 a 99"></label>` : ''}
      <div class="romboFila"><span>Revisión</span><div class="romboBotones">${REVISION.map(v => boton('data-p-rev', v, n.revision, v === 'Conforme' && n.ejecucion !== 'Instalado' ? 'disabled title="Primero márcala instalada"' : v === 'Conforme' && n.bloqueadoPor.length ? 'disabled title="Falta liberar su previo"' : '')).join('')}</div></div></li>`;
    const protocolo = n => `<li><span>${esc(n.nombre)}</span><div class="romboBotones romboDos">${['Pendiente', 'Liberado'].map(v => `<button type="button" data-prot="${esc(n.id)}|${v}" aria-pressed="${n.estado === v}">${v}</button>`).join('')}</div></li>`;
    const ultimo = conPartidas ? (avance.registro ? `Último cambio: ${fecha(avance.registro.fecha)} · ${avance.registro.responsable}` : 'Sin registros todavía.')
      : directo ? (t.stale ? 'La fuente cambió desde el último registro: vuelve a marcar.' : actual ? `Último cambio: ${fecha(actual.date)} · ${actual.responsible}` : 'Sin registros todavía.') : '';
    root.innerHTML = `<div class="romboCaja">${romboSVG(partes, elegido, esc, true)}
      <div class="romboLeyenda">${ESTADOS_PARTIDA.filter(e => e !== 'Sin definición').map(e => `<span><i class="${e === 'No aplica' ? 'na' : ''}" style="background:${COLOR_PARTIDA[e]}"></i>${esc(e)}</span>`).join('')}<span><i class="obs"></i>Observaciones pendientes</span></div></div>
      ${registrable ? '' : `<p class="romboNota">${enPiso ? 'Este recinto no tiene correspondencia en el PMA: el rombo muestra los códigos, pero el avance no se puede registrar.' : 'El recinto no pertenece al piso activo.'}</p>`}
      ${avisos.map(w => `<p class="pmaWarning">${esc(w)}</p>`).join('')}
      <section class="romboPartida" aria-live="polite"><div class="romboTitulo"><span class="romboChip" style="--c:${COLOR_PARTIDA[estado]}">${esc(estado)}</span><h4>${esc(fields[elegido])} · ${esc(elegido)} · ${esc(partes[elegido].codigo)}</h4></div>
        <p class="romboDesc">${esc(t?.description || room.finishes?.find(f => f.field === elegido)?.description || 'Sin descripción en el PMA')}${t && elegido !== 'PAV' && t.asepsis ? ` · Asepsia ${esc(t.asepsis)}` : ''}${ctx.verCodigo && !['—', 'N/A', '-'].includes(partes[elegido].codigo) ? ` <button type="button" class="romboVerCodigo" data-rombo-ver-codigo>Ver en el plano los recintos con ${esc(elegido)} ${esc(partes[elegido].codigo)}</button>` : ''}</p>
        ${aplica && !firmante() ? '<p class="romboNota romboSesion">Entra en Nube con tu cuenta para marcar el avance. <button type="button" data-rombo-entrar>Entrar</button></p>' : ''}
        ${traspasar ? '<p class="romboNota">Marcada antes en el rombo: al marcar una partida, ese estado pasa a todas las de esta terminación.</p>' : ''}
        ${conPartidas ? `${(() => { const pr = protocolosDe(avance.nodos, ps); return pr.length ? `<div class="romboProtocolos"><h5>Protocolos previos</h5><ul>${pr.map(protocolo).join('')}</ul></div>` : ''; })()}
          <ul class="romboPartidas">${ps.map(partida).join('')}</ul>`
        : directo ? `<div class="romboFila"><span>Ejecución</span><div class="romboBotones">${['No iniciado', 'En proceso', 'Instalado'].map(v => boton('data-rombo-inst', v, t.installation)).join('')}</div></div>
          <div class="romboFila"><span>Revisión</span><div class="romboBotones">${['Sin revisar', 'Con observaciones', 'Conforme'].map(v => boton('data-rombo-cal', v, t.quality, v === 'Conforme' && t.installation !== 'Instalado' ? 'disabled title="Primero márcala instalada"' : '')).join('')}</div></div>`
        : registrable ? `<p class="romboNota">${t && !t.applicable ? 'No aplica según el PMA: fuera del cálculo de avance.' : 'Requiere definición documental en el PMA: fuera del porcentaje.'}</p>` : ''}
        <p class="romboMensaje" role="status">${esc(ultimo)}</p>
        <div class="romboObs"><div class="romboTitulo"><h4>Observaciones en ${esc(NOMBRE_OBS[elegido])} <small>${lista.length}</small></h4><button type="button" data-rombo-obs-nueva>+ Observación con foto</button></div>
          ${lista.length ? `<ul class="romboObsLista">${lista.map(o => `<li><button type="button" data-rombo-obs="${esc(o.id)}"><b>${esc(o.descripcion)}</b><small>${esc(o.estado === 'Corregida' ? 'Por validar' : o.estado)} · ${esc(o.responsable || 'Sin responsable')}${o.plazo ? ' · plazo ' + esc(o.plazo.split('-').reverse().join('-')) : ''}${o.fotos.length ? ` · ${o.fotos.length} foto${o.fotos.length === 1 ? '' : 's'}` : ''}</small></button></li>`).join('')}</ul>` : '<p class="romboNota">Sin observaciones en este elemento.</p>'}</div></section>`;
    const volver = () => ficha(root, room, {alGuardar});
    const elegir = campo => { elegido = campo; volver(); };
    root.querySelectorAll('[data-rombo]').forEach(g => { g.addEventListener('click', () => elegir(g.dataset.rombo)); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(g.dataset.rombo); } }); });
    root.querySelector('[data-rombo-obs-nueva]').onclick = () => ctx.nuevaObservacion(room, elegido, volver);
    root.querySelector('[data-rombo-ver-codigo]')?.addEventListener('click', () => ctx.verCodigo(elegido, partes[elegido].codigo));
    root.querySelector('[data-rombo-entrar]')?.addEventListener('click', () => pedirSesion());
    root.querySelectorAll('[data-rombo-obs]').forEach(b => b.onclick = () => ctx.abrirObservacion(b.dataset.romboObs, volver));
    if (!aplica) return;
    // Cada toque guarda al instante; mientras se guarda, la ficha no acepta otro toque.
    const controles = () => root.querySelectorAll('.romboPartida button:not([data-rombo-obs-nueva]):not([data-rombo-obs]):not([data-rombo-ver-codigo]), .romboPartida input');
    async function registrar(guardar) {
      let firma; try { firma = exigirFirma(); } catch (e) { root.querySelector('.romboMensaje').textContent = e.message; return; }
      controles().forEach(c => { c.disabled = true; });
      try { const aviso = await guardar(firma); ctx.toast?.(aviso); alGuardar(); await volver(); }
      catch (e) { await volver(); if (vigenteDespues()) root.querySelector('.romboMensaje').textContent = e.message; }
    }
    const vigenteDespues = () => root.isConnected && root.querySelector('.romboMensaje');
    const guardarNodo = (id, cambio) => registrar(async firma => {
      const nodo = avance.nodos.find(n => n.id === id);
      const base = traspasar && nodo?.tipo === 'partida' ? sembrarTerminacion(avance.registro, avance.nodos, ps, previa) : avance.registro;
      const nuevo = actualizarNodo({code: avance.code, level: nivel.id}, avance.nodos, base, id, cambio, {responsable: firma, fecha: hoy()});
      await guardarAvance(nuevo, avance.registro?.version || 0); await cargarAvance(true);
      return nodo.tipo === 'protocolo' ? `${nodo.nombre}: ${cambio.estado}.` : `${nodo.item} ${nodo.nombre}: ${Object.values(cambio).join(' ')}${'pct' in cambio ? ' %' : ''}.`;
    });
    const guardarDirecto = cambio => registrar(async firma => {
      const valor = actualizarPartida(model, room, nivel.id, actual, elegido, cambio, {responsible: firma, date: hoy(), sourceReviewed: false});
      await saveProgress(valor, actual?.version || 0);
      return `${fields[elegido]}: ${estadoPartida({...t, ...valor.fields[elegido]})}.`;
    });
    const sinCambio = b => b.getAttribute('aria-pressed') === 'true';
    const idDe = el => el.closest('[data-partida]').dataset.partida;
    root.querySelectorAll('[data-p-ejec]').forEach(b => b.onclick = () => { if (!sinCambio(b)) guardarNodo(idDe(b), {ejecucion: b.dataset.pEjec}); });
    root.querySelectorAll('[data-p-rev]').forEach(b => b.onclick = () => { if (!sinCambio(b)) guardarNodo(idDe(b), {revision: b.dataset.pRev}); });
    root.querySelectorAll('[data-p-pct]').forEach(i => i.onchange = () => {
      const v = Math.round(Number(i.value));
      if (!i.value || !(v >= 1 && v <= 99)) { root.querySelector('.romboMensaje').textContent = 'El % en ejecución va de 1 a 99.'; return; }
      guardarNodo(idDe(i), {pct: v});
    });
    root.querySelectorAll('[data-prot]').forEach(b => b.onclick = () => { if (sinCambio(b)) return; const [id, estado] = b.dataset.prot.split('|'); guardarNodo(id, {estado}); });
    root.querySelectorAll('[data-rombo-inst]').forEach(b => b.onclick = () => { if (!sinCambio(b)) guardarDirecto({installation: b.dataset.romboInst}); });
    root.querySelectorAll('[data-rombo-cal]').forEach(b => b.onclick = () => { if (!sinCambio(b)) guardarDirecto({quality: b.dataset.romboCal}); });
  }
  return {ficha};
}
