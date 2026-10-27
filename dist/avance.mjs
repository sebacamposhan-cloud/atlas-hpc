// Avance valorizado por recinto y partida · piloto nivel −1.
// Editor compartido por la ficha del plano y Control de obra, panel con indicadores y gráficos, y capa de color del plano.
import {loadPma} from './pma.mjs';
import {pmaDifferences} from './pma-model.mjs';
import {nivel} from './level.mjs';
import {registerLayer} from './layers.mjs';
import {loadVendor} from './web-store.mjs';
import * as M from './avance-model.mjs';
import {leerAvance, guardarAvance, exportarAvance, importarAvance, guardarItemizado, leerItemizadoGuardado, borrarItemizado} from './avance-store.mjs';

export const COLORES_RECINTO = {'Sin iniciar': '#9aa3ad', 'En curso': '#d9a21b', 'Completo': '#2e9e5b', 'Observado': '#d64545', 'Sin datos': '#cfd5da'};
const COLORES_ESTADO = {'No iniciado': '#9aa3ad', 'En ejecución': '#d9a21b', 'Instalado': '#357d9a', 'Observado': '#d64545', 'Aprobado': '#2e9e5b'};
const pesos = v => v == null ? '—' : '$' + Math.round(v).toLocaleString('es-CL');
const millones = v => v == null ? '—' : '$' + (v / 1e6).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' M';
const pct = (a, b) => b ? (100 * a / b).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' %' : '—';
const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const opciones = (lista, actual, esc) => lista.map(v => `<option ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');

// Estado compartido: PMA, itemizado del dispositivo, registros y reporte calculado.
let cache = null, cargando = null;
export function cargarAvance(forzar = false) {
  if (forzar) cargando = null;
  if (!cargando) cargando = (async () => {
    const [pma, itemizado, avance] = await Promise.all([loadPma(), leerItemizadoGuardado(), leerAvance()]);
    const items = itemizado?.items || new Map(), reporte = M.reporteAvance(pma, items, avance.registros);
    cache = {pma, itemizado, items, avance, reporte, porCodigo: new Map(reporte.filas.map(f => [f.code, f]))};
    return cache;
  })().catch(e => { cargando = null; throw e; });
  return cargando;
}

// Capa «Avance de obra»: colorea cada recinto por su estado (sin iniciar, en curso, completo, observado).
registerLayer('avance', {nombre: 'Avance de obra', categories: r => [cache?.porCodigo.get(String(r.code).trim())?.estado || 'Sin datos'], color: k => COLORES_RECINTO[k] || '#cfd5da', opacity: .55});
export function iniciarCapaAvance(alCambiar) {
  if (nivel.id !== 'N-1') return;
  const recargar = () => cargarAvance(true).then(alCambiar).catch(() => {});
  recargar(); window.addEventListener('atlas-avance-changed', recargar);
}

// ---------- Editor de un recinto (viñeta del plano y Control de obra) ----------
export async function renderAvanceRecinto(root, room, esc, alGuardar = () => {}) {
  if (nivel.id !== 'N-1') { root.textContent = 'El avance valorizado está disponible en el nivel −1.'; return; }
  const serie = String((Number(root.dataset.avanceSerie) || 0) + 1); root.dataset.avanceSerie = serie; root.textContent = 'Cargando partidas…';
  try {
    const c = await cargarAvance();
    if (!root.isConnected || root.dataset.avanceSerie !== serie) return;
    const fila = c.porCodigo.get(String(room.code).trim());
    if (!fila) { root.innerHTML = '<p>Este recinto no figura como activo en el PMA del nivel −1 (A-S01). No se generan partidas.</p>'; return; }
    const reg = fila.registro, version = reg?.version || 0, nodos = fila.nodos, mats = c.pma.materials;
    const difs = room.finishes ? pmaDifferences(room, fila.row) : [];
    const term = ['PAV', 'CIE', 'M1', 'M2', 'M3', 'M4'].map(k => `<tr><td>${k}</td><td>${esc(fila.row[k] || '—')}</td><td>${esc(mats.get(String(fila.row[k] ?? '').trim()) || '')}</td></tr>`).join('');
    const prot = nodos.filter(n => n.tipo === 'protocolo'), parts = nodos.filter(n => n.tipo === 'partida');
    const previo = n => n.prereq.length ? n.prereq.map(id => { const p = nodos.find(x => x.id === id); return p ? `${esc(p.tipo === 'protocolo' ? p.nombre : p.item + ' ' + p.nombre)}: <b>${esc(p.estado)}</b>` : ''; }).join(' · ') : 'Sin protocolo previo asignado';
    root.innerHTML = `<div class="avanceResumen"><span class="avanceChip" style="--c:${COLORES_RECINTO[fila.estado]}">${esc(fila.estado)}</span><span>Asepsia ${esc(fila.asepsia)}</span><span>${esc(fila.row.area || '')}</span></div>
      <div class="avanceMontos"><div><small>EJECUTADO</small><b>${c.itemizado ? pesos(fila.ejecutado) : '—'}</b></div><div><small>PENDIENTE</small><b>${c.itemizado ? pesos(fila.total - fila.ejecutado) : '—'}</b></div><div><small>TOTAL VALORIZABLE</small><b>${c.itemizado ? pesos(fila.total) : '—'}</b></div></div>
      ${c.itemizado ? '' : '<p class="pmaWarning">Carga el itemizado en Control de obra → Avance valorizado para ver montos. El registro de avance funciona igual.</p>'}
      ${difs.length ? `<p class="pmaWarning">PMA y plano difieren en ${esc(difs.map(d => d.field + ' (plano ' + (d.plan ?? '—') + ' / PMA ' + (d.pma ?? '—') + ')').join(', '))}. Las partidas y cantidades usan el PMA; la conciliación queda pendiente.</p>` : ''}
      <details><summary>Terminaciones PMA</summary><table class="finishes"><tbody>${term}</tbody></table></details>
      <form class="avanceForm"><div class="avanceCabecera"><label>Responsable<input name="responsable" required maxlength="200" value="${esc(reg?.responsable || '')}"></label><label>Fecha<input name="fecha" type="date" required value="${esc(reg?.fecha || hoy())}"></label></div>
      ${prot.length ? `<h4>Protocolos previos</h4>${prot.map(n => `<label class="avanceProtocolo"><span>${esc(n.nombre)}<small>REV1 ${esc(n.ref)} · Previo: ${previo(n)}</small></span><select name="prot_${n.id}">${opciones(M.ESTADOS_PROTOCOLO, n.estado, esc)}</select></label>`).join('')}` : ''}
      <h4>Partidas · ${parts.length}</h4>
      ${parts.map(n => `<details class="avancePartida" data-nodo="${esc(n.id)}"><summary><i style="background:${COLORES_ESTADO[n.estado]}"></i><b>${esc(n.item)}</b> ${esc(n.nombre)}<span>${esc(n.estado)} · ${n.pct} %</span></summary>
        <p class="avanceDato">${n.cantidad != null ? esc(n.cantidad.toLocaleString('es-CL')) + ' ' + esc(n.unidad) + ' (superficie PMA)' : 'Sin cantidad por recinto en el PMA'}${n.pu != null ? ' · P.U. ' + pesos(n.pu) : ''}${n.total != null ? ' · Ejecutado ' + pesos(n.ejecutado) + ' de ' + pesos(n.total) : ''}</p>
        <p class="avancePrevio ${n.bloqueadoPor.length ? 'bloquea' : ''}">${n.bloqueadoPor.length ? '⚠ Bloquea la aprobación · ' : ''}Previo: ${previo(n)}</p>
        <div class="avanceCampos"><label>Estado<select name="estado_${n.id}">${opciones(M.ESTADOS, n.estado, esc)}</select></label><label>% avance<input name="pct_${n.id}" type="number" min="0" max="100" step="1" value="${n.pct}"></label><label>Conformidad<select name="conf_${n.id}">${opciones(M.CONFORMIDAD, n.conformidad, esc)}</select></label></div>
        <label>Qué falta<textarea name="falta_${n.id}" maxlength="3000">${esc(n.falta)}</textarea></label>
        ${n.obs.length ? `<ul class="avanceObs">${n.obs.map(o => `<li><b>${esc(o.fecha)} · ${esc(o.autor)}</b> ${esc(o.texto)}</li>`).join('')}</ul>` : ''}
        <label>Nueva observación<textarea name="obs_${n.id}" maxlength="3000" placeholder="Se guarda con la fecha y el responsable"></textarea></label></details>`).join('')}
      <p class="avanceMensaje" role="status"></p><div class="actions"><button type="submit" class="primary">Guardar avance</button></div></form>
      <details><summary>Historial del recinto</summary>${c.avance.historial.filter(h => h.registro.code === fila.code).sort((a, b) => b.registro.version - a.registro.version).map(h => `<p><b>Versión ${h.registro.version} · ${esc(h.registro.fecha)} · ${esc(h.registro.responsable)}</b><br>${esc(Object.entries(h.registro.partidas || {}).map(([id, v]) => id + ' ' + v.estado + ' ' + v.pct + '%').join(' · '))}</p>`).join('') || '<p>Sin registros guardados.</p>'}</details>`;
    const form = root.querySelector('form'), mensaje = root.querySelector('.avanceMensaje');
    // El estado fija el porcentaje cuando corresponde.
    form.addEventListener('change', e => {
      const m = e.target.name?.match(/^estado_(.+)$/); if (!m) return;
      const p = form.elements['pct_' + m[1]];
      if (e.target.value === 'No iniciado') p.value = 0; else if (['Instalado', 'Aprobado'].includes(e.target.value)) p.value = 100;
      if (e.target.value === 'Aprobado') form.elements['conf_' + m[1]].value = 'Conforme';
    });
    form.onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(form), responsable = String(f.get('responsable') || '').trim(), fecha = String(f.get('fecha') || '');
      const registro = {key: M.keyFor(fila.code), code: fila.code, level: 'N-1', version: version + 1, at: new Date().toISOString(), responsable, fecha, protocolos: {}, partidas: {}};
      for (const n of prot) registro.protocolos[n.id] = {estado: f.get('prot_' + n.id), fecha, autor: responsable};
      for (const n of parts) {
        const nueva = String(f.get('obs_' + n.id) || '').trim();
        registro.partidas[n.id] = {estado: f.get('estado_' + n.id), pct: Number(f.get('pct_' + n.id)), conformidad: f.get('conf_' + n.id), falta: String(f.get('falta_' + n.id) || ''),
          obs: [...n.obs, ...(nueva ? [{fecha, autor: responsable, texto: nueva}] : [])]};
      }
      const errores = M.validarRegistro(registro, nodos.map(({estado, pct, conformidad, falta, obs, bloqueadoPor, total, ejecutado, pendiente, ...base}) => base));
      if (errores.length) { mensaje.innerHTML = errores.map(x => `<span>${esc(x)}</span>`).join('<br>'); return; }
      const boton = form.querySelector('[type=submit]'); boton.disabled = true;
      try { await guardarAvance(registro, version); await cargarAvance(true); await renderAvanceRecinto(root, room, esc, alGuardar); if (root.isConnected) root.querySelector('.avanceMensaje').textContent = 'Avance guardado con historial.'; alGuardar(); }
      catch (error) { mensaje.textContent = error.message; boton.disabled = false; }
    };
  } catch (error) { if (root.isConnected) { root.textContent = error.message; const b = document.createElement('button'); b.textContent = 'Reintentar'; b.onclick = () => renderAvanceRecinto(root, room, esc, alGuardar); root.append(b); } }
}

// ---------- Gráficos ----------
function barras(titulo, decision, filas, esc, vacio) {
  const max = Math.max(1, ...filas.map(f => f.total));
  return `<section class="chartCard avanceGrafico"><div class="chartHeading"><h3>${esc(titulo)}</h3></div><p class="chartSubtitle">${esc(decision)}</p>${filas.length ? filas.map(f => `<div class="avanceBarra"><span>${esc(f.etiqueta)}</span><b>${esc(f.texto)}</b><em><i style="width:${100 * (f.a || 0) / max}%;background:${f.colorA || '#2e9e5b'}"></i><i style="width:${100 * (f.b || 0) / max}%;background:${f.colorB || '#d8dee3'}"></i></em></div>`).join('') : `<p class="chartEmpty">${esc(vacio)}</p>`}</section>`;
}
function graficos(rep, items, esc) {
  const g1 = barras('Avance por partida · $ ejecutado y pendiente', 'Dónde está el dinero por ejecutar: concentra cuadrillas en las partidas con mayor monto pendiente.',
    rep.porPartida.filter(p => p.total != null).slice(0, 12).map(p => ({etiqueta: p.id + ' ' + p.nombre, texto: millones(p.ejecutado) + ' / ' + millones(p.total), a: p.ejecutado, b: p.pendiente, total: p.total})), esc, 'Carga el itemizado para valorizar.');
  const total = rep.partidas.length, embudo = ['No iniciado', 'En ejecución', 'Instalado', 'Aprobado'].map(e => [e, rep.estados.find(x => x[0] === e)[1]]);
  const g2 = barras('Embudo de estados de partidas', 'Dónde se atasca el trabajo: muchas «instaladas» sin «aprobar» indican que falta inspección o protocolos, no mano de obra.',
    [...embudo, ['Observado', rep.estados.find(x => x[0] === 'Observado')[1]]].map(([e, n]) => ({etiqueta: e, texto: n + ' · ' + pct(n, total), a: n, total, colorA: COLORES_ESTADO[e]})), esc, 'Sin partidas.');
  const g3 = barras('Partidas bloqueadas por protocolo previo', 'Qué protocolo liberar primero: trabajo ya ejecutado que no puede aprobarse ni cobrarse hasta liberar su previo.',
    rep.bloqueosPorCausa.slice(0, 10).map(b => ({etiqueta: b.causa, texto: b.n + ' partidas · ' + millones(b.detenido) + ' detenido', a: b.detenido || b.n, total: b.detenido || b.n, colorA: '#c18b3f'})), esc, 'Ninguna partida con avance bloqueada. ' + rep.esperando + ' partidas sin iniciar esperan su protocolo previo.');
  const g4 = barras('Avance por nivel de asepsia', 'Si los recintos de asepsia media avanzan más lento, revisar la cadena empaste → pintura y su inspección.',
    rep.porAsepsia.map(a => ({etiqueta: 'Asepsia ' + a.id, texto: a.total != null ? millones(a.ejecutado) + ' / ' + millones(a.total) : a.fisico.toFixed(1) + ' % físico', a: a.total != null ? a.ejecutado : a.fisico, b: a.total != null ? a.pendiente : 100 - a.fisico, total: a.total != null ? a.total : 100})), esc, 'Sin datos.');
  const cub = rep.cubicacion.filter(c => c.pma != null && c.itemizado);
  const g5 = `<section class="chartCard avanceGrafico"><div class="chartHeading"><h3>Control de cubicación · PMA contra itemizado</h3></div><p class="chartSubtitle">Si la suma del PMA difiere más de 5 % del itemizado, el estado de pago por recinto no cuadrará con el presupuesto: revisar antes de valorizar.</p>${cub.length ? `<table class="avanceTabla"><thead><tr><th>Partida</th><th>PMA</th><th>Itemizado P−1</th><th>Dif.</th></tr></thead><tbody>${cub.map(c => `<tr class="${Math.abs(c.dif) > .05 ? 'alerta' : ''}"><td>${esc(c.id)} ${esc(c.nombre)}</td><td>${c.pma.toLocaleString('es-CL', {maximumFractionDigits: 2})}</td><td>${c.itemizado.toLocaleString('es-CL', {maximumFractionDigits: 2})}</td><td>${(100 * c.dif).toLocaleString('es-CL', {maximumFractionDigits: 1})} %</td></tr>`).join('')}</tbody></table>` : '<p class="chartEmpty">Carga el itemizado para comparar cantidades.</p>'}</section>`;
  return `<div class="chartGrid">${g1}${g2}${g3}${g4}</div>${g5}`;
}

// ---------- Panel de Control de obra ----------
export async function renderAvanceControl(root, ctx) {
  if (nivel.id !== 'N-1') { root.innerHTML = '<p>El avance valorizado por partida es un piloto del nivel −1.</p>'; return; }
  const esc = ctx.esc; root.textContent = 'Cargando avance valorizado…';
  let consulta = '', estado = '', asepsia = '', unidad = '', elegido = null;
  try {
    let c = await cargarAvance(true);
    const dibujar = () => {
      if (!root.isConnected) return;
      const rep = c.reporte, rev = M.revision(rep, c.items), piso = rep.piso;
      const filas = rep.filas.filter(f => (!estado || f.estado === estado) && (!asepsia || f.asepsia === asepsia) && (!unidad || f.unit === unidad) && (!consulta || (f.code + ' ' + f.name).toLowerCase().includes(consulta.toLowerCase())));
      const detenido = rep.bloqueadas.reduce((a, n) => a + (n.ejecutado || 0), 0);
      root.innerHTML = `<div class="documentaryIntro"><h2>Avance valorizado por partida · Nivel −1</h2><p>${rep.filas.length} recintos activos del PMA RevB (A-S01) con sus partidas del itemizado. Valor ejecutado = superficie PMA × % de avance × precio unitario. Registros de este dispositivo: exporta el respaldo para conservarlos o trasladarlos.</p></div>
        <section class="chartCard avanceFuente">${c.itemizado ? `<p><b>Itemizado cargado:</b> ${esc(c.itemizado.nombre)} · hoja ${esc(c.itemizado.hoja)} · ${c.items.size.toLocaleString('es-CL')} partidas · ${esc(new Date(c.itemizado.fecha).toLocaleString('es-CL'))}</p><p class="dataNote">Los precios quedan solo en este dispositivo; no se publican en el sitio ni van en los respaldos de avance.</p><button id="avanceQuitarItemizado">Quitar itemizado</button>` : '<p><b>Carga el itemizado</b> (HPC-5-GEN-GEN-PRE-01, hoja «Formulario n°11A») para valorizar. Los precios quedan solo en este dispositivo.</p>'}<label class="primary avanceCarga">${c.itemizado ? 'Reemplazar itemizado…' : 'Cargar itemizado…'}<input id="avanceItemizado" type="file" accept=".xlsx,.xls" hidden></label></section>
        <div class="actions"><button id="avancePlano">Ver avance en el plano</button><button id="avanceExportar">Exportar respaldo</button><label class="progressImportLabel">Importar respaldo<input id="avanceImportar" type="file" accept="application/json,.json"></label></div><p id="avanceMensaje" role="status"></p>
        <div class="kpiGrid">${[[c.itemizado ? millones(piso.ejecutado) : '—', 'Ejecutado valorizado', c.itemizado ? 'de ' + millones(piso.total) + ' valorizable' : 'Carga el itemizado'], [c.itemizado ? pct(piso.ejecutado, piso.total) : '—', 'Avance valorizado', piso.valorizables + ' de ' + piso.partidas + ' partidas con cantidad'], [piso.avanceFisico.toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' %', 'Avance físico promedio', 'Cada partida pesa igual; no ponderado por $'], [rep.bloqueadas.length + '', 'Con avance bloqueado', (c.itemizado ? millones(detenido) + ' ejecutado sin aprobar · ' : '') + rep.esperando + ' esperan su previo']].map(([n, t, s]) => `<article class="kpi"><span>${t}</span><b>${n}</b><small>${s}</small></article>`).join('')}</div>
        ${graficos(rep, c.items, esc)}
        <details class="progressFilters"><summary>Filtrar recintos</summary><div class="pmaFilters"><label>Recinto<input id="avanceConsulta" type="search" value="${esc(consulta)}"></label><label>Estado<select id="avanceEstado"><option value="">Todos</option>${opciones(M.ESTADOS_RECINTO, estado, esc)}</select></label><label>Asepsia<select id="avanceAsepsia"><option value="">Todas</option>${opciones([...new Set(rep.filas.map(f => f.asepsia))].sort(), asepsia, esc)}</select></label><label>Unidad PMA<select id="avanceUnidad"><option value="">Todas</option>${opciones([...new Set(rep.filas.map(f => f.unit))].sort(), unidad, esc)}</select></label></div></details>
        <details class="workRecords" open><summary>Checklist de recintos · ${filas.length}</summary><div class="progressRoomList">${filas.map(f => `<button data-avance-room="${esc(f.code)}"><i style="background:${COLORES_RECINTO[f.estado]}"></i>${esc(f.code)} · ${esc(f.name)}<small>${esc(f.estado)} · ${f.nodos.filter(n => n.tipo === 'partida' && n.estado === 'Aprobado').length}/${f.nodos.filter(n => n.tipo === 'partida').length} aprobadas${c.itemizado ? ' · ' + millones(f.ejecutado) + ' de ' + millones(f.total) : ''}</small></button>`).join('') || '<p>Sin resultados.</p>'}</div></details>
        <section id="avanceEditor" class="chartCard" hidden></section>
        <details class="avanceRevision"><summary>Para revisar: cadena de protocolos y partidas sin cantidad o sin protocolo</summary>
          <h4>Cadena de protocolos previos</h4><table class="avanceTabla"><thead><tr><th>Partida</th><th>Requiere liberado</th><th>Origen</th></tr></thead><tbody>${M.CADENA.map(([a, b, o]) => `<tr><td>${esc(a)}</td><td>${esc(M.PROTOCOLOS[b]?.nombre || b)}</td><td>${o === 'dada' ? 'Indicada' : o === 'decidida' ? 'Decidida con obra (27-10-2026)' : 'Propuesta, por validar'}</td></tr>`).join('')}</tbody></table>
          <h4>Generadas sin cantidad por recinto (${rev.sinCantidad.length})</h4><p class="dataNote">Se registra su avance físico, pero no se valorizan: el PMA no trae m² de muro, ml ni unidades por recinto.</p><ul>${rev.sinCantidad.map(x => `<li>${esc(x.id)} ${esc(x.nombre)} · ${x.recintos} recintos</li>`).join('')}</ul>
          <h4>Sin protocolo previo asignado (${rev.sinProtocolo.length})</h4><ul>${rev.sinProtocolo.map(x => `<li>${esc(x.id)} ${esc(x.nombre)} · ${x.recintos} recintos</li>`).join('')}</ul>
          <h4>Partidas del piloto sin vínculo por recinto (${rev.sinVinculo.length})</h4><p class="dataNote">Con cantidad en el piso −1 pero sin regla para asignarlas a un recinto (puertas, quincallería, protecciones, complementos y variantes). ${c.itemizado ? '' : 'Carga el itemizado para listarlas.'}</p><ul>${rev.sinVinculo.slice(0, 200).map(x => `<li>${esc(x.id)} ${esc(x.nombre)} · ${x.cantidad.toLocaleString('es-CL')} ${esc(x.unidad)}</li>`).join('')}</ul>
          <h4>Terminaciones del PMA sin partida en el piloto (${rev.sinPartida.length})</h4><ul>${rev.sinPartida.map(x => `<li>${esc(x.terminacion)} · ${x.recintos.length} recintos</li>`).join('')}</ul>
          <p class="dataNote">Capítulos 7 (artefactos) y 9 (instalaciones) quedan fuera del piloto: ${rev.posteriores} partidas con cantidad en el piso −1 se conservan en el itemizado cargado para una etapa posterior. Curva S planificada y ritmo semanal requieren el programa de obra y semanas de registros.</p></details>`;
      const $ = s => root.querySelector(s), mensaje = $('#avanceMensaje');
      for (const [id, fn] of [['#avanceEstado', v => estado = v], ['#avanceAsepsia', v => asepsia = v], ['#avanceUnidad', v => unidad = v]]) $(id).onchange = e => { fn(e.target.value); dibujar(); };
      $('#avanceConsulta').oninput = e => { consulta = e.target.value; dibujar(); const i = $('#avanceConsulta'); i.focus(); i.setSelectionRange(consulta.length, consulta.length); };
      root.querySelectorAll('[data-avance-room]').forEach(b => b.onclick = () => {
        const fila = c.porCodigo.get(b.dataset.avanceRoom), plano = ctx.rooms().find(r => r.code === fila.code), editor = $('#avanceEditor');
        elegido = fila.code; editor.hidden = false; editor.innerHTML = `<h3>${esc(fila.code)} · ${esc(fila.name)}</h3>${plano ? '<button id="avanceUbicar">Ver en el plano</button>' : '<p class="dataNote">Fuera del área visible del plano.</p>'}<div id="avanceEditorCuerpo"></div>`;
        if (plano) $('#avanceUbicar').onclick = () => ctx.locate?.(plano.id);
        renderAvanceRecinto($('#avanceEditorCuerpo'), plano || {code: fila.code, name: fila.name}, esc, async () => { c = await cargarAvance(); });
        editor.scrollIntoView({block: 'start'});
      });
      $('#avancePlano').onclick = () => ctx.pintarCapa?.('avance');
      $('#avanceExportar').onclick = async () => { try { const v = await exportarAvance(), url = URL.createObjectURL(new Blob([JSON.stringify(v, null, 2)], {type: 'application/json'})), a = document.createElement('a'); a.href = url; a.download = 'Atlas-avance-valorizado-N-1-' + hoy() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); } catch (e) { mensaje.textContent = e.message; } };
      $('#avanceImportar').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { if (f.size > 30 * 1024 * 1024) throw Error('Respaldo demasiado grande.'); await importarAvance(JSON.parse(await f.text())); c = await cargarAvance(true); dibujar(); $('#avanceMensaje').textContent = 'Respaldo importado.'; } catch (error) { mensaje.textContent = error.message; } };
      $('#avanceItemizado').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try { mensaje.textContent = 'Leyendo itemizado…'; await loadVendor('xlsx'); const libro = XLSX.read(await f.arrayBuffer(), {type: 'array'}), leido = M.leerItemizado(libro, XLSX); await guardarItemizado({nombre: f.name, ...leido}); c = await cargarAvance(true); dibujar(); $('#avanceMensaje').textContent = 'Itemizado cargado: ' + leido.items.size.toLocaleString('es-CL') + ' partidas.'; }
        catch (error) { mensaje.textContent = 'No se pudo leer «' + f.name + '»: ' + error.message; }
      };
      $('#avanceQuitarItemizado')?.addEventListener('click', async () => { await borrarItemizado(); c = await cargarAvance(true); dibujar(); });
      if (elegido) root.querySelector(`[data-avance-room="${CSS.escape(elegido)}"]`)?.click();
    };
    dibujar();
  } catch (error) { if (root.isConnected) { root.textContent = error.message; const b = document.createElement('button'); b.textContent = 'Reintentar'; b.onclick = () => renderAvanceControl(root, ctx); root.append(b); } }
}
