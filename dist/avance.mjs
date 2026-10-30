// Avance por recinto y partida en los cuatro pisos, en m² ejecutados y pendientes (sin valorización: los precios no
// se manejan en la plataforma). Editor compartido por la ficha del plano y Control de obra, panel con indicadores y
// gráficos, y capa de color del plano.
import {loadPma} from './pma.mjs';
import {pmaDifferences} from './pma-model.mjs';
import {nivel} from './level.mjs';
import {registerLayer} from './layers.mjs';
import {progressFloors} from './progress-scope.mjs';
import * as M from './avance-model.mjs';
import {crearFiltrosColumna} from './column-filters.mjs';
import {leerAvance, guardarAvance, exportarAvance, importarAvance, borrarItemizado} from './avance-store.mjs';

export const COLORES_RECINTO = {'Sin iniciar': '#9aa3ad', 'En curso': '#d9a21b', 'Completo': '#2e9e5b', 'Observado': '#d64545', 'Sin datos': '#cfd5da'};
const COLORES_ESTADO = {'No iniciado': '#9aa3ad', 'En ejecución': '#d9a21b', 'Instalado': '#357d9a', 'Observado': '#d64545', 'Aprobado': '#2e9e5b'};
export const unidad = u => u === 'm2' ? 'm²' : u || '';
export const m2 = v => v == null ? '—' : v.toLocaleString('es-CL', {maximumFractionDigits: 1});
const pct = (a, b) => b ? (100 * a / b).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' %' : '—';
const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const opciones = (lista, actual, esc) => lista.map(v => `<option ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
const PISO_PMA = () => progressFloors[nivel.id];
// Pavimento y cielo del recinto: la partida de la terminación con su superficie PMA (m² ejecutados de pendientes).
export const superficiesRecinto = fila => [['Pavimento', 'PAV'], ['Cielo', 'CIE']].map(([nombre, campo]) => {
  const n = fila.nodos.find(x => x.tipo === 'partida' && x.cantidad != null && x.origen.includes((campo === 'PAV' ? 'Pavimento ' : 'Cielo ') + String(fila.row[campo] ?? '').trim()));
  return {nombre, campo, nodo: n || null};
});

// Estado compartido: PMA, registros y reporte calculado del piso activo. El itemizado con precios que hubiera quedado
// guardado en este equipo se borra: la valorización salió de la plataforma.
let cache = null, cargando = null, itemizadoBorrado = false;
export function cargarAvance(forzar = false) {
  if (forzar) cargando = null;
  if (!cargando) cargando = (async () => {
    if (!itemizadoBorrado) { itemizadoBorrado = true; borrarItemizado().catch(() => {}); }
    const [pma, avance] = await Promise.all([loadPma(), leerAvance()]);
    const items = new Map(), reporte = M.reporteAvance(pma, items, avance.registros, nivel.id);
    cache = {pma, items, avance, reporte, porCodigo: new Map(reporte.filas.map(f => [f.code, f]))};
    return cache;
  })().catch(e => { cargando = null; throw e; });
  return cargando;
}

// Capa «Avance de obra»: colorea cada recinto por su estado (sin iniciar, en curso, completo, observado).
registerLayer('avance', {nombre: 'Avance de obra', categories: r => [cache?.porCodigo.get(String(r.code).trim())?.estado || 'Sin datos'], color: k => COLORES_RECINTO[k] || '#cfd5da', opacity: .55});
export function iniciarCapaAvance(alCambiar) {
  if (!PISO_PMA()) return;
  const recargar = () => cargarAvance(true).then(alCambiar).catch(() => {});
  recargar(); window.addEventListener('atlas-avance-changed', recargar);
}

// ---------- Editor de un recinto (ficha del plano y Control de obra) ----------
export async function renderAvanceRecinto(root, room, esc, alGuardar = () => {}) {
  if (!PISO_PMA()) { root.textContent = 'El avance por partida está disponible en los pisos −1, 1, 2 y 3.'; return; }
  const serie = String((Number(root.dataset.avanceSerie) || 0) + 1); root.dataset.avanceSerie = serie; root.textContent = 'Cargando partidas…';
  try {
    const c = await cargarAvance();
    if (!root.isConnected || root.dataset.avanceSerie !== serie) return;
    const fila = c.porCodigo.get(String(room.code).trim());
    if (!fila) { root.innerHTML = `<p>Este recinto no figura como activo en el PMA de ${esc(nivel.nombre)} (${esc(PISO_PMA())}). No se generan partidas.</p>`; return; }
    const reg = fila.registro, version = reg?.version || 0, nodos = fila.nodos, mats = c.pma.materials;
    const difs = room.finishes ? pmaDifferences(room, fila.row) : [];
    const term = ['PAV', 'CIE', 'M1', 'M2', 'M3', 'M4'].map(k => `<tr><td>${k}</td><td>${esc(fila.row[k] || '—')}</td><td>${esc(mats.get(String(fila.row[k] ?? '').trim()) || '')}</td></tr>`).join('');
    const prot = nodos.filter(n => n.tipo === 'protocolo'), parts = nodos.filter(n => n.tipo === 'partida');
    const previo = n => n.prereq.length ? n.prereq.map(id => { const p = nodos.find(x => x.id === id); return p ? `${esc(p.tipo === 'protocolo' ? p.nombre : p.item + ' ' + p.nombre)}: <b>${esc(p.estado)}</b>` : ''; }).join(' · ') : 'Sin protocolo previo asignado';
    const cantidad = n => n.cantidad != null ? `${m2(n.m2Ejecutado)} de ${m2(n.cantidad)} ${esc(unidad(n.unidad))} ejecutados · ${m2(n.m2Pendiente)} ${esc(unidad(n.unidad))} pendientes` : 'Sin cantidad por recinto en el PMA: se registra el % de avance';
    root.innerHTML = `<div class="avanceResumen"><span class="avanceChip" style="--c:${COLORES_RECINTO[fila.estado]}">${esc(fila.estado)}</span><span>Asepsia ${esc(fila.asepsia)}</span><span>${esc(fila.row.area || '')}</span></div>
      <div class="avanceMontos">${superficiesRecinto(fila).map(s => `<div><small>${s.nombre.toUpperCase()} · m²</small><b>${s.nodo ? m2(s.nodo.m2Ejecutado) + ' / ' + m2(s.nodo.cantidad) : '—'}</b><small>${s.nodo ? 'pendientes ' + m2(s.nodo.m2Pendiente) : 'sin superficie en el PMA'}</small></div>`).join('')}<div><small>AVANCE FÍSICO</small><b>${m2(M.avanceFisico(nodos))} %</b><small>${parts.filter(n => n.estado === 'Aprobado').length} de ${parts.length} partidas aprobadas</small></div></div>
      ${difs.length ? `<p class="pmaWarning">PMA y plano difieren en ${esc(difs.map(d => d.field + ' (plano ' + (d.plan ?? '—') + ' / PMA ' + (d.pma ?? '—') + ')').join(', '))}. Las partidas y cantidades usan el PMA; la conciliación queda pendiente.</p>` : ''}
      <details><summary>Terminaciones PMA</summary><table class="finishes"><tbody>${term}</tbody></table></details>
      <form class="avanceForm"><div class="avanceCabecera"><label>Responsable<input name="responsable" required maxlength="200" value="${esc(reg?.responsable || '')}"></label><label>Fecha<input name="fecha" type="date" required value="${esc(reg?.fecha || hoy())}"></label></div>
      ${prot.length ? `<h4>Protocolos previos</h4>${prot.map(n => `<label class="avanceProtocolo"><span>${esc(n.nombre)}<small>REV1 ${esc(n.ref)} · Previo: ${previo(n)}</small></span><select name="prot_${n.id}">${opciones(M.ESTADOS_PROTOCOLO, n.estado, esc)}</select></label>`).join('')}` : ''}
      <h4>Partidas · ${parts.length}</h4>
      ${parts.map(n => `<details class="avancePartida" data-nodo="${esc(n.id)}"><summary><i style="background:${COLORES_ESTADO[n.estado]}"></i><b>${esc(n.item)}</b> ${esc(n.nombre)}<span>${esc(n.estado)} · ${n.pct} %</span></summary>
        <p class="avanceDato">${cantidad(n)}</p>
        <p class="avancePrevio ${n.bloqueadoPor.length ? 'bloquea' : ''}">${n.bloqueadoPor.length ? '⚠ Bloquea la aprobación · ' : ''}Previo: ${previo(n)}</p>
        <div class="avanceCampos"><label>Estado<select name="estado_${n.id}">${opciones(M.ESTADOS, n.estado, esc)}</select></label><label>% avance<input name="pct_${n.id}" type="number" min="0" max="100" step="1" value="${n.pct}"></label><label>Conformidad<select name="conf_${n.id}">${opciones(M.CONFORMIDAD, n.conformidad, esc)}</select></label></div>
        <label>Qué falta<textarea name="falta_${n.id}" maxlength="3000">${esc(n.falta)}</textarea></label>
        ${n.obs.length ? `<ul class="avanceObs">${n.obs.map(o => `<li><b>${esc(o.fecha)} · ${esc(o.autor)}</b> ${esc(o.texto)}</li>`).join('')}</ul>` : ''}
        <label>Nueva observación<textarea name="obs_${n.id}" maxlength="3000" placeholder="Se guarda con la fecha y el responsable"></textarea></label></details>`).join('')}
      <p class="avanceMensaje" role="status"></p><div class="actions"><button type="submit" class="primary">Guardar avance</button></div></form>
      <details><summary>Historial del recinto</summary>${c.avance.historial.filter(h => h.registro.key === M.keyFor(fila.code, nivel.id)).sort((a, b) => b.registro.version - a.registro.version).map(h => `<p><b>Versión ${h.registro.version} · ${esc(h.registro.fecha)} · ${esc(h.registro.responsable)}</b><br>${esc(Object.entries(h.registro.partidas || {}).map(([id, v]) => id + ' ' + v.estado + ' ' + v.pct + '%').join(' · '))}</p>`).join('') || '<p>Sin registros guardados.</p>'}</details>`;
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
      const registro = {key: M.keyFor(fila.code, nivel.id), code: fila.code, level: nivel.id, version: version + 1, at: new Date().toISOString(), responsable, fecha, protocolos: {}, partidas: {}};
      for (const n of prot) registro.protocolos[n.id] = {estado: f.get('prot_' + n.id), fecha, autor: responsable};
      for (const n of parts) {
        const nueva = String(f.get('obs_' + n.id) || '').trim();
        registro.partidas[n.id] = {estado: f.get('estado_' + n.id), pct: Number(f.get('pct_' + n.id)), conformidad: f.get('conf_' + n.id), falta: String(f.get('falta_' + n.id) || ''),
          obs: [...n.obs, ...(nueva ? [{fecha, autor: responsable, texto: nueva}] : [])]};
      }
      const errores = M.validarRegistro(registro, nodos.map(({estado, pct, conformidad, falta, obs, bloqueadoPor, total, ejecutado, pendiente, m2Ejecutado, m2Pendiente, ...base}) => base));
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
function graficos(rep, esc) {
  const g1 = barras('Avance por partida · m² ejecutados y pendientes', 'Dónde queda más superficie por ejecutar: concentra cuadrillas en las partidas con más m² pendientes.',
    rep.porPartida.filter(p => p.cantidad > 0).sort((a, b) => (b.cantidad - b.m2Ejecutado) - (a.cantidad - a.m2Ejecutado)).slice(0, 12).map(p => ({etiqueta: p.id + ' ' + p.nombre, texto: m2(p.m2Ejecutado) + ' / ' + m2(p.cantidad) + ' ' + unidad(p.unidad), a: p.m2Ejecutado, b: p.cantidad - p.m2Ejecutado, total: p.cantidad})), esc, 'Sin partidas con superficie en el PMA.');
  const total = rep.partidas.length, embudo = ['No iniciado', 'En ejecución', 'Instalado', 'Aprobado'].map(e => [e, rep.estados.find(x => x[0] === e)[1]]);
  const g2 = barras('Embudo de estados de partidas', 'Dónde se atasca el trabajo: muchas «instaladas» sin «aprobar» indican que falta inspección o protocolos, no mano de obra.',
    [...embudo, ['Observado', rep.estados.find(x => x[0] === 'Observado')[1]]].map(([e, n]) => ({etiqueta: e, texto: n + ' · ' + pct(n, total), a: n, total, colorA: COLORES_ESTADO[e]})), esc, 'Sin partidas.');
  const g3 = barras('Partidas bloqueadas por protocolo previo', 'Qué protocolo liberar primero: trabajo con avance que no puede aprobarse hasta liberar su previo.',
    rep.bloqueosPorCausa.slice(0, 10).map(b => ({etiqueta: b.causa, texto: b.n + (b.n === 1 ? ' partida' : ' partidas'), a: b.n, total: rep.bloqueosPorCausa[0].n, colorA: '#c18b3f'})), esc, 'Ninguna partida con avance bloqueada. ' + rep.esperando + ' partidas sin iniciar esperan su protocolo previo.');
  const g4 = barras('Avance físico por nivel de asepsia', 'Si los recintos de asepsia media avanzan más lento, revisar la cadena empaste → pintura y su inspección.',
    rep.porAsepsia.map(a => ({etiqueta: 'Asepsia ' + a.id, texto: a.fisico.toFixed(1) + ' %', a: a.fisico, b: 100 - a.fisico, total: 100})), esc, 'Sin datos.');
  return `<div class="chartGrid">${g1}${g2}${g3}${g4}</div>`;
}

// ---------- Panel de Control de obra ----------
// Recintos con filtros por columna (como Excel); el estado del filtro sobrevive a los redibujos del panel.
const tablaPartidas = {filtros: {}, orden: null};
const tramo = v => v >= 100 ? '100 %' : v >= 50 ? '50 a 99 %' : v > 0 ? '1 a 49 %' : '0 %';
export async function renderAvanceControl(root, ctx) {
  if (!PISO_PMA()) { root.innerHTML = '<p>El avance por partida está disponible en los pisos −1, 1, 2 y 3.</p>'; return; }
  const esc = ctx.esc; root.textContent = 'Cargando avance por partida…';
  let elegido = null, pagina = 0;
  try {
    let c = await cargarAvance(true);
    const dibujar = () => {
      if (!root.isConnected) return;
      const rep = c.reporte, rev = M.revision(rep, c.items), piso = rep.piso;
      const aprobadas = f => f.nodos.filter(n => n.tipo === 'partida' && n.estado === 'Aprobado').length;
      const cf = crearFiltrosColumna({id: 'partidas', estado: tablaPartidas, esc, alCambiar: () => { pagina = 0; dibujar(); }, columnas: [
        {key: 'recinto', titulo: 'Recinto', valor: f => f.code + ' · ' + f.name, orden: f => f.code}, {key: 'estado', titulo: 'Estado', valor: f => f.estado, opciones: M.ESTADOS_RECINTO},
        {key: 'asepsia', titulo: 'Asepsia', valor: f => f.asepsia}, {key: 'unidad', titulo: 'Unidad PMA', valor: f => f.unit},
        {key: 'aprobadas', titulo: 'Aprobadas', valor: f => aprobadas(f) ? 'Con aprobadas' : 'Sin aprobadas', orden: f => aprobadas(f), ordenTextos: ['Menos aprobadas primero', 'Más aprobadas primero']},
        {key: 'fisico', titulo: 'Avance físico', valor: f => tramo(M.avanceFisico(f.nodos)), opciones: ['0 %', '1 a 49 %', '50 a 99 %', '100 %'], orden: f => M.avanceFisico(f.nodos), ordenTextos: ['Menor avance primero', 'Mayor avance primero']}]});
      const filas = cf.aplicar(rep.filas), paginas = Math.max(1, Math.ceil(filas.length / 30)); pagina = Math.min(pagina, paginas - 1);
      // m² del piso por terminación (pavimentos y cielos), sumando la partida de cada recinto.
      const sup = campo => filas.flatMap(f => superficiesRecinto(f).filter(s => s.campo === campo && s.nodo).map(s => s.nodo)), suma = (l, k) => l.reduce((a, n) => a + (n[k] || 0), 0);
      const pav = sup('PAV'), cie = sup('CIE');
      root.innerHTML = `<div class="documentaryIntro"><h2>Avance por partida · ${esc(nivel.nombre)}</h2><p>${rep.filas.length} recintos activos del PMA RevB (${esc(PISO_PMA())}) con sus partidas. Avance físico en m²: superficie PMA × % de avance. Sin valorización: los precios no se manejan en la plataforma. Registros de este dispositivo: exporta el respaldo para conservarlos o trasladarlos.</p></div>
        <div class="actions"><button id="avancePlano">Ver avance en el plano</button><button id="avanceExportar">Exportar respaldo</button><label class="progressImportLabel">Importar respaldo<input id="avanceImportar" type="file" accept="application/json,.json"></label></div><p id="avanceMensaje" role="status"></p>
        <div class="kpiGrid">${[[m2(suma(pav, 'm2Ejecutado')) + ' m²', 'Pavimentos ejecutados', 'de ' + m2(suma(pav, 'cantidad')) + ' m² · pendientes ' + m2(suma(pav, 'm2Pendiente'))], [m2(suma(cie, 'm2Ejecutado')) + ' m²', 'Cielos ejecutados', 'de ' + m2(suma(cie, 'cantidad')) + ' m² · pendientes ' + m2(suma(cie, 'm2Pendiente'))], [piso.avanceFisico.toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' %', 'Avance físico promedio', 'Cada partida pesa igual'], [rep.bloqueadas.length + '', 'Con avance bloqueado', rep.esperando + ' esperan su protocolo previo']].map(([n, t, s]) => `<article class="kpi"><span>${t}</span><b>${n}</b><small>${s}</small></article>`).join('')}</div>
        ${graficos(rep, esc)}
        <section class="chartCard progressTabla"><div class="chartHeading"><h3>Recintos · ${filas.length} de ${rep.filas.length}</h3>${cf.limpiar()}</div><p class="chartSubtitle">Toca un encabezado para ordenar o filtrar, como en Excel. Toca un recinto para registrar su avance por partida.</p><div class="tableScroll"><table class="masterTable"><thead><tr>${cf.cabecera()}</tr></thead><tbody>${filas.slice(pagina * 30, pagina * 30 + 30).map(f => `<tr class="${elegido === f.code ? 'selectedRow' : ''}"><td data-label="Recinto"><button type="button" class="codeLink" data-avance-room="${esc(f.code)}">${esc(f.code)}</button><br><small>${esc(f.name)}</small></td><td data-label="Estado"><span class="partidaEstado clara" style="--c:#fff;border-left:8px solid ${COLORES_RECINTO[f.estado]}">${esc(f.estado)}</span></td><td data-label="Asepsia">${esc(f.asepsia || '—')}</td><td data-label="Unidad PMA">${esc(f.unit || '—')}</td><td data-label="Aprobadas">${aprobadas(f)} / ${f.nodos.filter(n => n.tipo === 'partida').length}</td><td data-label="Avance físico">${m2(M.avanceFisico(f.nodos))} %</td></tr>`).join('') || `<tr><td colspan="6">Sin recintos con estos filtros.</td></tr>`}</tbody></table></div><div class="pagination"><button type="button" id="avancePrev" ${pagina === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${pagina + 1} de ${paginas}</span><button type="button" id="avanceNext" ${pagina + 1 === paginas ? 'disabled' : ''}>Siguiente</button></div></section>
        <section id="avanceEditor" class="chartCard" hidden></section>
        <details class="avanceRevision"><summary>Para revisar: cadena de protocolos y partidas sin cantidad o sin protocolo</summary>
          <h4>Cadena de protocolos previos</h4><table class="avanceTabla"><thead><tr><th>Partida</th><th>Requiere liberado</th><th>Origen</th></tr></thead><tbody>${M.CADENA.map(([a, b, o]) => `<tr><td>${esc(a)}</td><td>${esc(M.PROTOCOLOS[b]?.nombre || b)}</td><td>${o === 'dada' ? 'Indicada' : o === 'decidida' ? 'Decidida con obra (27-10-2026)' : 'Propuesta, por validar'}</td></tr>`).join('')}</tbody></table>
          <h4>Generadas sin cantidad por recinto (${rev.sinCantidad.length})</h4><p class="dataNote">Se registra su % de avance, pero no sus m²: el PMA no trae m² de muro, ml ni unidades por recinto.</p><ul>${rev.sinCantidad.map(x => `<li>${esc(x.id)} ${esc(x.nombre)} · ${x.recintos} recintos</li>`).join('')}</ul>
          <h4>Sin protocolo previo asignado (${rev.sinProtocolo.length})</h4><ul>${rev.sinProtocolo.map(x => `<li>${esc(x.id)} ${esc(x.nombre)} · ${x.recintos} recintos</li>`).join('')}</ul>
          <h4>Terminaciones del PMA sin partida (${rev.sinPartida.length})</h4><ul>${rev.sinPartida.map(x => `<li>${esc(x.terminacion)} · ${x.recintos.length} recintos</li>`).join('')}</ul>
          <p class="dataNote">Capítulos 7 (artefactos) y 9 (instalaciones) quedan fuera de las partidas por recinto. Curva S planificada y ritmo semanal requieren el programa de obra y semanas de registros.</p></details>`;
      const $ = s => root.querySelector(s), mensaje = $('#avanceMensaje');
      cf.conectar(root, rep.filas);
      $('#avancePrev').onclick = () => { pagina--; dibujar(); }; $('#avanceNext').onclick = () => { pagina++; dibujar(); };
      root.querySelectorAll('[data-avance-room]').forEach(b => b.onclick = () => {
        const fila = c.porCodigo.get(b.dataset.avanceRoom), plano = ctx.rooms().find(r => r.code === fila.code), editor = $('#avanceEditor');
        elegido = fila.code; editor.hidden = false; editor.innerHTML = `<h3>${esc(fila.code)} · ${esc(fila.name)}</h3>${plano ? '<button id="avanceUbicar">Ver en el plano</button>' : '<p class="dataNote">Fuera del área visible del plano.</p>'}<div id="avanceEditorCuerpo"></div>`;
        if (plano) $('#avanceUbicar').onclick = () => ctx.locate?.(plano.id);
        renderAvanceRecinto($('#avanceEditorCuerpo'), plano || {code: fila.code, name: fila.name}, esc, async () => { c = await cargarAvance(); });
        editor.scrollIntoView({block: 'start'});
      });
      $('#avancePlano').onclick = () => ctx.pintarCapa?.('avance');
      $('#avanceExportar').onclick = async () => { try { const v = await exportarAvance(), url = URL.createObjectURL(new Blob([JSON.stringify(v, null, 2)], {type: 'application/json'})), a = document.createElement('a'); a.href = url; a.download = 'Atlas-avance-partidas-' + hoy() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); } catch (e) { mensaje.textContent = e.message; } };
      $('#avanceImportar').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { if (f.size > 30 * 1024 * 1024) throw Error('Respaldo demasiado grande.'); await importarAvance(JSON.parse(await f.text())); c = await cargarAvance(true); dibujar(); $('#avanceMensaje').textContent = 'Respaldo importado.'; } catch (error) { mensaje.textContent = error.message; } };
      if (elegido) root.querySelector(`[data-avance-room="${CSS.escape(elegido)}"]`)?.click();
    };
    dibujar();
  } catch (error) { if (root.isConnected) { root.textContent = error.message; const b = document.createElement('button'); b.textContent = 'Reintentar'; b.onclick = () => renderAvanceControl(root, ctx); root.append(b); } }
}
