// Last Planner System en Control de obra: plan intermedio con restricciones, plan semanal con compromisos y cierre,
// PPC y causas de no cumplimiento, reuniones de producción con asistencia y frentes, rendimientos y reporte con plano.
// Los datos quedan en el equipo (lastplanner-store.mjs) con respaldo JSON; la capa del plano pinta los recintos de una semana.
import {nivel, pisos} from './level.mjs';
import {registerLayer, layerNames} from './layers.mjs';
import {workChart} from './work-charts.mjs';
import * as M from './lastplanner-model.mjs';
import {leerActividades, leerReuniones, guardarActividades, eliminarActividad, guardarReunion, eliminarReunion, exportarPlan, importarPlan} from './lastplanner-store.mjs';

export const COLOR_ESTADO = {'Planificada': '#6f8faa', 'En ejecución': '#2f7fb5', 'Cumplida': '#2e9e5b', 'No cumplida': '#c62f2f'};
export const COLORES_RECINTO = {'No cumplida': '#c62f2f', 'Con restricción': '#e0882a', 'En ejecución': '#2f7fb5', 'Planificada': '#8aa4b8', 'Cumplida': '#2e9e5b', 'Sin actividades': '#cfd5da'};
const COLOR_FRENTE = {'Activo': '#2e9e5b', 'Detenido': '#c62f2f', 'Sin iniciar': '#8aa4b8', 'Terminado': '#6f7d88'};
const ACCION = {'En ejecución': 'Iniciar', 'Cumplida': 'Marcar cumplida', 'No cumplida': 'No cumplida', 'Planificada': 'Volver a planificada'};
const VISTAS = {resumen: 'Resumen', semanal: 'Plan semanal', intermedio: 'Intermedio y restricciones', reuniones: 'Reuniones y frentes', rendimientos: 'Rendimientos'};
const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const fecha = f => f ? f.split('-').reverse().join('-') : '—';
const pct = v => v == null ? '—' : Math.round(v * 100) + ' %';
const cifra = (v, d = 1) => v == null ? '—' : v.toLocaleString('es-CL', {maximumFractionDigits: d});
const nombrePiso = id => pisos.find(p => p.id === id)?.nombre || id;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const nSemana = s => +s.slice(6);
const etiquetaSemana = s => { const {desde, hasta} = M.rangoSemana(s); return `Semana ${nSemana(s)} · ${fecha(desde).slice(0, 5)} al ${fecha(hasta)}`; };
// Verde desde 80 %, ámbar desde 60 %: referencia habitual del PPC en obras que aplican Last Planner.
const colorPct = v => v == null ? '#cfd5da' : v >= .8 ? '#2e9e5b' : v >= .6 ? '#c9a21b' : '#c62f2f';
const CLAVE_AUTOR = 'atlas-autor';
const autorGuardado = () => { try { return localStorage.getItem(CLAVE_AUTOR) || ''; } catch { return ''; } };
const recordarAutor = v => { try { localStorage.setItem(CLAVE_AUTOR, v); } catch {} };
// Orden estable de la semana: la numeración del listado es la misma del reporte y del plano.
const ordenSemana = lista => [...lista].sort((a, b) => a.level.localeCompare(b.level) || (a.sector || '').localeCompare(b.sector || '', 'es', {numeric: true}) || (a.inicioPlan || '').localeCompare(b.inicioPlan || '') || a.actividad.localeCompare(b.actividad, 'es') || a.creada.localeCompare(b.creada));

// ---------- Estado compartido: plan completo en memoria y capa del plano de una semana ----------
let cache = null, cargando = null, semanaCapa = M.semanaDe(hoy());
function indexar() {
  const porCodigo = new Map();
  for (const a of cache.actividades) if (a.level === nivel.id && a.semana === semanaCapa) for (const r of a.recintos) {
    const k = String(r.code).trim(); if (!porCodigo.has(k)) porCodigo.set(k, []); porCodigo.get(k).push(a);
  }
  cache.porCodigo = porCodigo;
  layerNames.lastplanner = 'Last Planner · semana ' + nSemana(semanaCapa);
}
export function cargarPlan(forzar = false) {
  if (forzar) cargando = null;
  if (!cargando) cargando = Promise.all([leerActividades(), leerReuniones()]).then(([actividades, reuniones]) => { cache = {actividades, reuniones}; indexar(); return cache; }).catch(e => { cargando = null; throw e; });
  return cargando;
}
registerLayer('lastplanner', {nombre: 'Last Planner · semana', categories: r => [M.estadoRecinto(cache?.porCodigo?.get(String(r.code).trim()))], color: k => COLORES_RECINTO[k] || '#cfd5da', opacity: .55});
export function iniciarCapaLastPlanner(alCambiar) {
  const recargar = () => cargarPlan(true).then(alCambiar).catch(() => {});
  recargar(); window.addEventListener('atlas-lastplanner-changed', recargar);
}

export function createLastPlanner(ctx) {
  const esc = ctx.esc;
  const dialog = document.createElement('dialog'); dialog.className = 'obsDialog lpDialog'; dialog.setAttribute('aria-label', 'Last Planner'); document.body.append(dialog);
  let guardando = false, raiz = null, opciones = {};
  dialog.addEventListener('cancel', e => { if (guardando) e.preventDefault(); });
  const filtros = {semana: M.semanaDe(hoy()), piso: nivel.id, estado: '', sector: '', responsable: '', texto: '', restricciones: 'Pendientes', estimar: {grupo: 0, cantidad: '', dotacion: ''}};
  const refrescar = () => { if (raiz?.isConnected) panel(raiz, opciones); };
  const delPiso = a => !filtros.piso || a.level === filtros.piso;
  const chip = estado => `<span class="obsChip" style="--c:${COLOR_ESTADO[estado] || COLOR_FRENTE[estado] || '#6f7d88'}">${esc(estado)}</span>`;
  const quien = () => { let v = autorGuardado(); if (!v) { v = (prompt('¿Quién registra este cambio?') || '').trim(); if (v) recordarAutor(v); } return v; };
  const sectores = () => [...new Set([...ctx.rooms().map(r => r.sector), ...(cache?.actividades || []).map(a => a.sector)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', {numeric: true}));
  const responsables = () => [...new Set([...(cache?.actividades || []).map(a => a.responsable), ...(cache?.reuniones || []).flatMap(r => [...r.frentes.map(f => f.responsable), ...r.asistentes.map(p => p.empresa)])].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const datalist = (id, valores) => `<datalist id="${id}">${valores.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  async function guardar(cambios, aviso) {
    try { await guardarActividades(cambios); await cargarPlan(true); ctx.toast(aviso); refrescar(); } catch (e) { ctx.toast(e.message); }
  }

  // ---------- Piezas comunes del panel ----------
  const selectorSemana = () => { const actual = M.semanaDe(hoy()); return `<div class="lpSemana" role="group" aria-label="Semana"><button type="button" data-lp-semana="-1" aria-label="Semana anterior">‹</button><strong>${esc(etiquetaSemana(filtros.semana))}</strong><button type="button" data-lp-semana="1" aria-label="Semana siguiente">›</button>${filtros.semana === actual ? '<span class="lpHoy">Semana en curso</span>' : '<button type="button" data-lp-semana="0">Ir a esta semana</button>'}</div>`; };
  const kpi = (titulo, valor, detalle, ir = '', color = '') => `<${ir ? `button type="button" data-lp-ir="${ir}"` : 'div'} class="kpi lpKpi"${color ? ` style="--c:${color}"` : ''}><span>${esc(titulo)}</span><b>${valor}</b><small>${detalle}</small></${ir ? 'button' : 'div'}>`;
  const tarjeta = (titulo, contador, cuerpo, subtitulo = '') => `<section class="chartCard"><div class="chartHeading"><h3>${esc(titulo)}</h3><span>${contador}</span></div>${subtitulo ? `<p class="chartSubtitle">${subtitulo}</p>` : ''}${cuerpo}</section>`;
  const barrasPct = filas => filas.length ? `<div class="workChartRows">${filas.map(f => `<div class="workChartRow lpPctRow"><i style="background:${colorPct(f.pct)}"></i><span>${esc(f.key)} <small>${esc(f.detalle)}</small></span><b>${pct(f.pct)}</b><em class="workBar"><span style="width:${(f.pct ?? 0) * 100}%;background:${colorPct(f.pct)}"></span></em></div>`).join('')}</div>` : '<p class="chartEmpty">Sin registros cerrados todavía.</p>';
  function graficoPPC(serie, interactivo = true) {
    const w = 336, izq = 30, paso = (w - izq) / serie.length;
    return `<svg viewBox="0 0 ${w} 150" class="lpPPC" role="group" aria-label="PPC por semana"><line x1="${izq}" x2="${w}" y1="37" y2="37" class="meta"/><text x="${izq - 4}" y="40" text-anchor="end" class="meta">80 %</text><line x1="${izq}" x2="${w}" y1="125" y2="125" stroke="#d5dde3"/>${serie.map((s, i) => {
      const alto = (s.ppc ?? 0) * 110, x = izq + i * paso + 6, ancho = paso - 12, attrs = interactivo ? `data-lp-ir-semana="${s.semana}" tabindex="0" role="button"` : '';
      return `<g class="${s.cerrada || !s.comprometidas ? '' : 'abierta'}" ${attrs} aria-label="${esc(etiquetaSemana(s.semana))}: PPC ${pct(s.ppc)}, ${s.cumplidas} de ${s.comprometidas}"><title>${esc(etiquetaSemana(s.semana))} · ${s.cumplidas}/${s.comprometidas}${s.abiertas ? ' · ' + s.abiertas + ' por cerrar' : ''}</title><rect x="${x}" y="15" width="${ancho}" height="110" fill="transparent"/><rect x="${x}" y="${125 - alto}" width="${ancho}" height="${alto}" rx="3" fill="${colorPct(s.ppc)}"/><text x="${x + ancho / 2}" y="${(s.ppc == null ? 125 : 125 - alto) - 5}" text-anchor="middle">${s.ppc == null ? (s.comprometidas ? '' : '—') : Math.round(s.ppc * 100)}</text><text class="eje" x="${x + ancho / 2}" y="142" text-anchor="middle">S${nSemana(s.semana)}</text></g>`;
    }).join('')}</svg>`;
  }
  const tablaCausas = cnc => cnc.length ? `<table class="avanceTabla"><thead><tr><th>Causa</th><th>Veces</th><th>%</th><th>Acumulado</th></tr></thead><tbody>${cnc.map(c => `<tr><td>${esc(c.causa)}</td><td>${c.n}</td><td>${pct(c.pct)}</td><td>${pct(c.acumulado)}</td></tr>`).join('')}</tbody></table>` : '<p class="chartEmpty">Sin actividades no cumplidas en el período.</p>';
  const tablaFrentes = frentes => frentes.length ? `<div class="lpScroll"><table class="avanceTabla"><thead><tr><th>Piso</th><th>Sector</th><th>Frente</th><th>Responsable</th><th>Dotación</th><th>Estado</th></tr></thead><tbody>${frentes.map(f => `<tr><td>${esc(f.level ? nombrePiso(f.level) : '—')}</td><td>${esc(f.sector || '—')}</td><td>${esc(f.frente)}${f.nota ? `<br><small>${esc(f.nota)}</small>` : ''}</td><td>${esc(f.responsable || '—')}</td><td>${f.dotacion ?? '—'}</td><td>${chip(f.estado)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="chartEmpty">Sin frentes registrados. Se registran en cada reunión de producción.</p>';
  const ultimaHasta = (reuniones, s) => M.ultimaReunion(reuniones.filter(r => r.fecha <= M.rangoSemana(s).hasta));

  // ---------- Vistas ----------
  function vistaResumen(datos) {
    const lista = datos.actividades.filter(delPiso), s = filtros.semana, p = M.ppcSemana(lista, s), serie = M.seriePPC(lista, s, 8), semanas = serie.map(x => x.semana), cuatro = semanas.slice(-4);
    const rr = M.resumenRestricciones(lista, hoy()), reunion = ultimaHasta(datos.reuniones, s), asis = reunion && M.asistencia(reunion), frentes = reunion?.frentes || [];
    const estados = M.ESTADOS.map(e => ({key: e, n: lista.filter(a => a.semana === s && a.estado === e).length, color: COLOR_ESTADO[e]}));
    const porResp = M.cumplimientoPor(lista, 'responsable', cuatro).filter(g => g.cerradas).map(g => ({key: g.key, pct: g.ppc, detalle: `${g.cumplidas}/${g.cerradas}`}));
    const porSector = M.cumplimientoPor(lista, 'sector', cuatro).filter(g => g.cerradas).map(g => ({key: g.key === 'Sin sector' ? g.key : 'Sector ' + g.key, pct: g.ppc, detalle: `${g.cumplidas}/${g.cerradas}`}));
    const dotacion = frentes.filter(f => f.estado === 'Activo').reduce((n, f) => n + (f.dotacion || 0), 0);
    return selectorSemana() + `<div class="kpiGrid lpKpis">${[
      // El PPC se mide al cerrar la semana: mientras queden actividades abiertas se muestra parcial y sin color.
      kpi(p.abiertas ? 'PPC de la semana (parcial)' : 'PPC de la semana', pct(p.ppc), p.comprometidas ? `${p.cumplidas} de ${p.comprometidas} cumplidas${p.abiertas ? ` · ${plural(p.abiertas, 'por cerrar', 'por cerrar')}` : ''}` : 'Sin compromisos esta semana', 'semanal', p.abiertas ? '' : colorPct(p.ppc)),
      kpi('PPC últimas 4 semanas', pct(M.ppcAcumulado(lista, cuatro)), 'solo actividades cerradas', '', colorPct(M.ppcAcumulado(lista, cuatro))),
      kpi('Restricciones pendientes', rr.pendientes, `${rr.vencidas ? `<em class="obsOverdue">${plural(rr.vencidas, 'vencida', 'vencidas')}</em> · ` : ''}${plural(rr.listas, 'actividad lista', 'actividades listas')}, ${plural(rr.bloqueadas, 'bloqueada', 'bloqueadas')}`, 'intermedio', rr.vencidas ? '#c62f2f' : ''),
      kpi('Asistencia a reunión', asis?.pct == null ? '—' : pct(asis.pct), reunion ? `${asis.presentes} de ${asis.convocados} · ${fecha(reunion.fecha)}` : 'Sin reuniones registradas', 'reuniones', asis ? colorPct(asis.pct) : '')].join('')}</div>
      <div class="obsAcciones"><button type="button" data-lp-nueva>+ Nueva actividad</button><button type="button" data-lp-capa>Ver semana en el plano</button><button type="button" class="primary" data-lp-reporte>Reporte con plano</button></div>
      <div class="chartGrid lpGrid">
      ${tarjeta('Porcentaje de plan completado (PPC)', '8 semanas', graficoPPC(serie), 'Cumplidas / comprometidas por semana. Verde desde 80 %, ámbar desde 60 %. Las barras claras tienen actividades por cerrar. Toca una semana para abrirla.')}
      ${workChart({title: 'Estado de la semana', items: estados, kind: 'pie', emptyText: 'Sin actividades comprometidas en esta semana.'}, esc)}
      ${tarjeta('Causas de no cumplimiento', M.causas(lista, semanas).reduce((n, c) => n + c.n, 0) + ' veces', tablaCausas(M.causas(lista, semanas)), 'Pareto de las últimas 8 semanas.')}
      ${tarjeta('Cumplimiento por responsable', porResp.length, barrasPct(porResp), 'PPC de las últimas 4 semanas (cumplidas / cerradas).')}
      ${tarjeta('Cumplimiento por sector', porSector.length, barrasPct(porSector), 'PPC de las últimas 4 semanas.')}
      ${workChart({title: 'Restricciones pendientes por tipo', items: rr.porTipo.map(([key, n], i) => ({key, n, color: ['#e0882a', '#c9a21b', '#8a76a7', '#527f6b', '#356e88', '#a26b68', '#8a9eaa', '#bd944e', '#788650', '#697c88'][i % 10]})), emptyText: 'Sin restricciones pendientes.'}, esc)}
      ${tarjeta('Frentes de trabajo', frentes.length ? `${dotacion} personas en frentes activos` : '—', tablaFrentes(frentes), reunion ? `Según la reunión del ${fecha(reunion.fecha)}.` : '')}
      </div>`;
  }

  function vistaSemanal(datos) {
    const s = filtros.semana, todas = ordenSemana(datos.actividades.filter(a => delPiso(a) && a.semana === s)), numero = new Map(todas.map((a, i) => [a.id, i + 1]));
    const conRestriccion = a => !M.CERRADOS.has(a.estado) && !M.liberada(a);
    const categorias = [['', 'Todas', todas], ...M.ESTADOS.map(e => [e, e === 'En ejecución' ? e : e + 's', todas.filter(a => a.estado === e)]), ['Con restricción', 'Con restricción', todas.filter(conRestriccion)]];
    const q = filtros.texto.trim().toLocaleLowerCase('es');
    const filas = (categorias.find(c => c[0] === filtros.estado)?.[2] || todas).filter(a => (!filtros.sector || a.sector === filtros.sector) && (!filtros.responsable || a.responsable === filtros.responsable)
      && (!q || [a.actividad, a.frente, a.responsable, ...a.recintos.map(r => r.code + ' ' + r.name)].join(' ').toLocaleLowerCase('es').includes(q)));
    const p = M.ppcSemana(todas, s), opcion = (lista, actual, todasTxt) => `<option value="">${todasTxt}</option>` + lista.map(v => `<option ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const accion = a => a.estado === 'Planificada' ? `<button type="button" data-lp-iniciar="${esc(a.id)}">Iniciar</button>` : a.estado === 'En ejecución' ? `<button type="button" data-lp-act="${esc(a.id)}" data-lp-foco="cierre">Cerrar…</button>` : a.estado === 'No cumplida' && !a.reprogramada ? `<button type="button" data-lp-reprogramar="${esc(a.id)}">Reprogramar</button>` : a.reprogramada ? `<small>Reprogramada a S${nSemana(a.reprogramada)}</small>` : '';
    const fila = a => { const pend = M.pendientes(a).length; return `<tr><td data-label="N°"><b>${numero.get(a.id)}</b></td><td data-label="Actividad"><button type="button" class="obsOpenRecord" data-lp-act="${esc(a.id)}"><b>${esc(a.actividad)}</b><small>${esc([a.frente, a.recintos.length ? a.recintos.length + (a.recintos.length === 1 ? ' recinto' : ' recintos') : 'sin recintos'].filter(Boolean).join(' · '))}</small></button></td>
      <td data-label="Ubicación">${esc(nombrePiso(a.level))}<br><small>Sector ${esc(a.sector || '—')}</small></td><td data-label="Responsable">${esc(a.responsable)}${a.dotacion ? `<br><small>${a.dotacion} personas</small>` : ''}</td>
      <td data-label="Cantidad">${a.cantidad == null ? '—' : `${cifra(a.cantidadEjecutada ?? 0)} / ${cifra(a.cantidad)} ${esc(a.unidad || '')}`}</td><td data-label="Plazo">${a.inicioPlan ? fecha(a.inicioPlan).slice(0, 5) : '—'}<br><small>al ${a.finPlan ? fecha(a.finPlan).slice(0, 5) : '—'}</small></td>
      <td data-label="Estado">${chip(a.estado)}${pend && !M.CERRADOS.has(a.estado) ? `<br><small class="obsOverdue">${pend} restricci${pend === 1 ? 'ón' : 'ones'}</small>` : ''}${a.causa ? `<br><small>${esc(a.causa)}</small>` : ''}</td><td data-label="Acción">${accion(a)}</td></tr>`; };
    return selectorSemana() + `<p class="lpLinea"><b style="color:${p.abiertas ? 'inherit' : colorPct(p.ppc)}">PPC ${pct(p.ppc)}${p.abiertas ? ' parcial' : ''}</b> · ${plural(p.cumplidas, 'cumplida', 'cumplidas')} · ${plural(p.noCumplidas, 'no cumplida', 'no cumplidas')} · ${p.abiertas} por cerrar · ${plural(p.comprometidas, 'comprometida', 'comprometidas')}</p>
      <div class="obsAcciones"><button type="button" class="primary" data-lp-nueva>+ Nueva actividad</button><button type="button" data-lp-ir="intermedio">Comprometer desde el intermedio</button><button type="button" data-lp-capa>Ver en el plano</button><button type="button" data-lp-reporte>Reporte con plano</button><button type="button" data-lp-csv ${todas.length ? '' : 'disabled'}>Exportar CSV</button></div>
      <div class="obsWorkspace"><nav class="obsCategories" aria-label="Estados del plan semanal"><h3>Estados</h3>${categorias.map(([k, t, l]) => `<button type="button" data-lp-estado="${esc(k)}" aria-pressed="${filtros.estado === k}"><span>${esc(t)}</span><b>${l.length}</b></button>`).join('')}</nav><div class="obsInventory">
      <div class="obsFiltros"><label>Buscar<input data-lp-f="texto" value="${esc(filtros.texto)}" placeholder="Actividad, frente, recinto o responsable"></label><label>Sector<select data-lp-f="sector">${opcion([...new Set(todas.map(a => a.sector).filter(Boolean))].sort(), filtros.sector, 'Todos')}</select></label><label>Responsable<select data-lp-f="responsable">${opcion([...new Set(todas.map(a => a.responsable))].sort(), filtros.responsable, 'Todos')}</select></label></div>
      <h3 class="obsTitulo">${filas.length} actividad${filas.length === 1 ? '' : 'es'}</h3>
      ${filas.length ? `<div class="obsTableScroll"><table class="lpTabla"><thead><tr><th>N°</th><th>Actividad</th><th>Ubicación</th><th>Responsable</th><th>Ejecutado / comprometido</th><th>Plazo</th><th>Estado</th><th></th></tr></thead><tbody>${filas.map(fila).join('')}</tbody></table></div>`
        : `<p class="obsNota">${todas.length ? 'Sin actividades con estos filtros.' : 'No hay actividades comprometidas en esta semana. Créalas aquí o comprométela desde el plan intermedio cuando sus restricciones estén liberadas.'}</p>`}</div></div>`;
  }

  function vistaIntermedio(datos) {
    const h = hoy(), s0 = filtros.semana, ventana = Array.from({length: 6}, (_, i) => M.moverSemana(s0, i)), lista = datos.actividades.filter(delPiso), rr = M.resumenRestricciones(lista, h);
    const planificadas = lista.filter(a => a.estado === 'Planificada' && (!a.semana || ventana.includes(a.semana)));
    const grupos = [[null, 'Sin semana asignada'], ...ventana.map(s => [s, etiquetaSemana(s)])].map(([s, t]) => [s, t, ordenSemana(planificadas.filter(a => a.semana === s))]).filter(g => g[2].length);
    const fila = a => { const pend = M.pendientes(a), vencidas = pend.filter(r => M.restriccionVencida(r, h)).length; return `<tr><td data-label="Actividad"><button type="button" class="obsOpenRecord" data-lp-act="${esc(a.id)}"><b>${esc(a.actividad)}</b><small>${esc(nombrePiso(a.level))} · Sector ${esc(a.sector || '—')}${a.frente ? ' · ' + esc(a.frente) : ''}</small></button></td><td data-label="Responsable">${esc(a.responsable)}</td>
      <td data-label="Restricciones">${pend.length ? `<span class="obsChip" style="--c:${vencidas ? '#c62f2f' : '#e0882a'}">${pend.length} pendiente${pend.length === 1 ? '' : 's'}</span>${vencidas ? `<br><small class="obsOverdue">${vencidas} vencida${vencidas === 1 ? '' : 's'}</small>` : ''}` : `<span class="obsChip" style="--c:#2e9e5b">Liberada</span>`}<br><small>${a.restricciones.length} en total</small></td>
      <td data-label="Comprometer">${a.semana ? `<small>${esc(etiquetaSemana(a.semana))}</small>` : `<button type="button" data-lp-comprometer="${esc(a.id)}" ${pend.length ? 'title="Tiene restricciones pendientes"' : ''}>Comprometer en S${nSemana(s0)}</button>`}</td></tr>`; };
    const todas = lista.filter(a => !M.CERRADOS.has(a.estado)).flatMap(a => a.restricciones.map(r => ({r, a})));
    const filtrosR = {Pendientes: x => x.r.estado === 'Pendiente', Vencidas: x => M.restriccionVencida(x.r, h), Liberadas: x => x.r.estado === 'Liberada', Todas: () => true};
    const restricciones = todas.filter(filtrosR[filtros.restricciones]).sort((x, y) => (x.r.compromiso || '9999').localeCompare(y.r.compromiso || '9999'));
    return selectorSemana() + `<div class="kpiGrid lpKpis">${[kpi('Listas para comprometer', rr.listas, 'sin restricciones pendientes', '', '#2e9e5b'), kpi('Bloqueadas', rr.bloqueadas, 'con restricciones por liberar', '', rr.bloqueadas ? '#e0882a' : ''),
      kpi('Restricciones pendientes', rr.pendientes, rr.liberadas + ' liberadas'), kpi('Vencidas', rr.vencidas, 'compromiso de liberación cumplido', '', rr.vencidas ? '#c62f2f' : '')].join('')}</div>
      <div class="obsAcciones"><button type="button" class="primary" data-lp-nueva="intermedio">+ Actividad al intermedio</button></div>
      <h3 class="obsTitulo">Plan intermedio · 6 semanas desde la S${nSemana(s0)}</h3>
      <p class="obsNota">Antes de comprometer una actividad en el plan semanal, libera sus restricciones (puntos de bloqueo): planos, materiales, mano de obra, frente previo, etc.</p>
      ${grupos.length ? grupos.map(([s, t, l]) => `<h4 class="lpGrupo">${esc(t)} <small>${l.length}</small></h4><div class="obsTableScroll"><table class="lpTabla lpTablaCorta"><thead><tr><th>Actividad</th><th>Responsable</th><th>Restricciones</th><th>Semana</th></tr></thead><tbody>${l.map(fila).join('')}</tbody></table></div>`).join('') : '<p class="obsNota">Sin actividades planificadas en las próximas 6 semanas.</p>'}
      <h3 class="obsTitulo">Restricciones</h3>
      <div class="obsStateTabs">${Object.keys(filtrosR).map(k => `<button type="button" data-lp-restricciones="${k}" aria-pressed="${filtros.restricciones === k}">${k} <b>${todas.filter(filtrosR[k]).length}</b></button>`).join('')}</div>
      ${restricciones.length ? `<div class="obsTableScroll"><table class="lpTabla lpTablaCorta"><thead><tr><th>Restricción</th><th>Actividad</th><th>Responsable</th><th>Compromiso</th><th></th></tr></thead><tbody>${restricciones.map(({r, a}) => `<tr><td data-label="Restricción"><b>${esc(r.tipo)}</b><br>${esc(r.descripcion)}</td><td data-label="Actividad"><button type="button" class="obsOpenRecord" data-lp-act="${esc(a.id)}"><b>${esc(a.actividad)}</b><small>${esc(a.semana ? etiquetaSemana(a.semana) : 'Sin semana')}</small></button></td>
        <td data-label="Responsable">${esc(r.responsable || '—')}</td><td data-label="Compromiso">${r.estado === 'Liberada' ? `Liberada ${fecha(r.liberada)}` : `${M.restriccionVencida(r, h) ? '<em class="obsOverdue">Vencida · </em>' : ''}${fecha(r.compromiso)}`}</td><td data-label="Acción"><button type="button" data-lp-liberar="${esc(a.id)}|${esc(r.id)}">${r.estado === 'Liberada' ? 'Reabrir' : 'Liberar'}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="obsNota">Sin restricciones en esta categoría.</p>'}`;
  }

  function vistaReuniones(datos) {
    const reuniones = [...datos.reuniones].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creada.localeCompare(a.creada)), ultima = reuniones[0];
    const conLista = reuniones.map(M.asistencia).filter(x => x.pct != null), promedio = conLista.length ? conLista.reduce((n, x) => n + x.pct, 0) / conLista.length : null;
    const frentes = ultima?.frentes || [], activos = frentes.filter(f => f.estado === 'Activo');
    // Un acuerdo pasa de reunión en reunión hasta cumplirse: manda su registro más reciente.
    const vistos = new Set(), acuerdos = [];
    for (const r of reuniones) for (const c of r.acuerdos) { const k = c.texto.trim().toLocaleLowerCase('es') + '|' + (c.responsable || ''); if (vistos.has(k)) continue; vistos.add(k); if (!c.cumplido) acuerdos.push({...c, reunion: r}); }
    const porEmpresa = M.asistenciaPor(reuniones.slice(0, 8)).map(g => ({key: g.key, pct: g.pct, detalle: `${g.presente}/${g.convocado}`}));
    return `<div class="kpiGrid lpKpis">${[kpi('Reuniones registradas', reuniones.length, ultima ? 'última el ' + fecha(ultima.fecha) : 'aún sin reuniones'), kpi('Asistencia promedio', pct(promedio), conLista.length + ' reuniones con lista', '', colorPct(promedio)),
      kpi('Frentes activos', activos.length, `${plural(activos.reduce((n, f) => n + (f.dotacion || 0), 0), 'persona', 'personas')} · ${plural(frentes.filter(f => f.estado === 'Detenido').length, 'detenido', 'detenidos')}`), kpi('Acuerdos pendientes', acuerdos.length, 'sin marcar como cumplidos', '', acuerdos.length ? '#e0882a' : '')].join('')}</div>
      <div class="obsAcciones"><button type="button" class="primary" data-lp-nueva-reunion>+ Nueva reunión</button><span class="obsNota">La nueva reunión trae los convocados, frentes y acuerdos pendientes de la anterior.</span></div>
      ${reuniones.length ? `<div class="obsTableScroll"><table class="lpTabla lpTablaCorta"><thead><tr><th>Fecha</th><th>Reunión</th><th>Asistencia</th><th>Frentes</th><th>Acuerdos</th></tr></thead><tbody>${reuniones.map(r => { const a = M.asistencia(r); return `<tr><td data-label="Fecha"><b>${fecha(r.fecha)}</b><br><small>S${nSemana(M.semanaDe(r.fecha))}</small></td><td data-label="Reunión"><button type="button" class="obsOpenRecord" data-lp-reunion="${esc(r.id)}"><b>${esc(r.tipo)}</b><small>${esc(r.lugar || '')}</small></button></td><td data-label="Asistencia"><b style="color:${colorPct(a.pct)}">${pct(a.pct)}</b><br><small>${a.presentes} de ${a.convocados}</small></td><td data-label="Frentes">${r.frentes.length}<br><small>${r.frentes.filter(f => f.estado === 'Activo').length} activos</small></td><td data-label="Acuerdos">${r.acuerdos.length}<br><small>${r.acuerdos.filter(c => !c.cumplido).length} pendientes</small></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="obsNota">Registra la reunión semanal de producción: asistencia de cada empresa, estado de los frentes de trabajo y acuerdos.</p>'}
      <div class="chartGrid lpGrid">${tarjeta('Asistencia por empresa', porEmpresa.length, barrasPct(porEmpresa), 'Últimas 8 reuniones (presentes / convocados).')}
      ${tarjeta('Frentes de trabajo', ultima ? fecha(ultima.fecha) : '—', tablaFrentes(frentes), 'Estado y dotación según la última reunión.')}
      ${tarjeta('Acuerdos pendientes', acuerdos.length, acuerdos.length ? `<ul class="lpAcuerdos">${acuerdos.map(c => `<li><b>${esc(c.texto)}</b><small>${esc(c.responsable || 'Sin responsable')}${c.plazo ? ' · plazo ' + fecha(c.plazo) + (c.plazo < hoy() ? ' <em class="obsOverdue">vencido</em>' : '') : ''} · reunión del ${fecha(c.reunion.fecha)}</small></li>`).join('')}</ul>` : '<p class="chartEmpty">Sin acuerdos pendientes.</p>')}</div>`;
  }

  function vistaRendimientos(datos) {
    const grupos = M.rendimientosPorActividad(datos.actividades.filter(delPiso)), e = filtros.estimar, g = grupos[e.grupo] || grupos[0];
    const est = g && M.estimarDias(g, Number(e.cantidad), Number(e.dotacion));
    const desvio = v => v == null ? '—' : `<span style="color:${v > .1 ? '#c62f2f' : v < -.1 ? '#2e9e5b' : 'inherit'}">${v > 0 ? '+' : ''}${Math.round(v * 100)} %</span>`;
    return `<div class="documentaryIntro"><p>Se calculan con lo ejecutado: cantidad ejecutada ÷ días trabajados (lunes a viernes entre inicio y término real, o los días que se registren). Con dotación se obtiene el rendimiento por persona-día; con horas, por HH. Los promedios son ponderados (total ejecutado ÷ total de días). Desvío: días reales frente a los planificados.</p></div>
      ${grupos.length ? `<section class="chartCard lpEstimador"><div class="chartHeading"><h3>Estimar duración</h3><span>con rendimientos reales</span></div><div class="obsFiltros"><label>Actividad<select data-lp-est="grupo">${grupos.map((x, i) => `<option value="${i}" ${x === g ? 'selected' : ''}>${esc(x.actividad)}${x.unidad ? ' (' + esc(x.unidad) + ')' : ''}</option>`).join('')}</select></label><label>Cantidad${g.unidad ? ' (' + esc(g.unidad) + ')' : ''}<input type="number" min="0" step="any" data-lp-est="cantidad" value="${esc(e.cantidad)}"></label><label>Dotación (personas)<input type="number" min="0" step="1" data-lp-est="dotacion" value="${esc(e.dotacion)}"></label></div>
        <p class="lpLinea" data-lp-estimacion>${est ? `<b>${cifra(est)} días hábiles</b> · con ${g.porPersonaDia && Number(e.dotacion) > 0 ? cifra(g.porPersonaDia, 2) + ' ' + esc(g.unidad || '') + ' por persona-día' : cifra(g.porDia, 2) + ' ' + esc(g.unidad || '') + ' por día'} (${g.n} registro${g.n === 1 ? '' : 's'})` : 'Indica la cantidad (y la dotación si la conoces) para estimar los días.'}</p></section>
        <div class="obsTableScroll"><table class="lpTabla lpTablaCorta"><thead><tr><th>Actividad</th><th>Registros</th><th>Ejecutado</th><th>Días</th><th>Por día</th><th>Por persona-día</th><th>Por HH</th><th>Desvío de plazo</th></tr></thead><tbody>${grupos.map(x => `<tr><td data-label="Actividad"><b>${esc(x.actividad)}</b><details class="lpDetalle"><summary>Ver registros</summary><table class="avanceTabla"><thead><tr><th>Semana</th><th>Sector</th><th>Responsable</th><th>Inicio – término</th><th>Cantidad</th><th>Días</th><th>Dotación</th><th>Por día</th></tr></thead><tbody>${x.registros.map(({a, r}) => `<tr><td>S${a.semana ? nSemana(a.semana) : '—'}</td><td>${esc(a.sector || '—')}</td><td>${esc(a.responsable)}</td><td>${fecha(a.inicioReal)} – ${fecha(a.finReal)}</td><td>${cifra(r.cantidad)}</td><td>${cifra(r.dias)}</td><td>${a.dotacion ?? '—'}</td><td>${cifra(r.porDia, 2)}</td></tr>`).join('')}</tbody></table></details></td>
          <td data-label="Registros">${x.n}</td><td data-label="Ejecutado">${cifra(x.cantidad)} ${esc(x.unidad || '')}</td><td data-label="Días">${cifra(x.dias)}</td><td data-label="Por día"><b>${cifra(x.porDia, 2)}</b> ${esc(x.unidad || '')}</td><td data-label="Por persona-día">${cifra(x.porPersonaDia, 2)}</td><td data-label="Por HH">${cifra(x.porHH, 2)}</td><td data-label="Desvío de plazo">${desvio(x.desvio)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="obsNota">Aún no hay trabajos con cantidad ejecutada e inicio/término real. Al cerrar una actividad del plan semanal registra la cantidad, la dotación y las fechas reales.</p>'}`;
  }

  // ---------- Panel ----------
  async function panel(root, opts = {}) {
    raiz = root; opciones = opts;
    if (!root.isConnected) return;
    const request = Number(root.dataset.lpRequest || 0) + 1; root.dataset.lpRequest = request;
    const vigente = () => root.isConnected && Number(root.dataset.lpRequest) === request, foco = root.contains(document.activeElement) ? document.activeElement.dataset?.lpF : null;
    if (!root.querySelector('.lpIntro')) root.innerHTML = '<p class="obsNota">Cargando el plan…</p>';
    let datos; try { datos = await cargarPlan(true); } catch (e) { if (vigente()) root.innerHTML = `<p class="obsError">No se pudo leer el plan: ${esc(e.message)}</p>`; return; }
    if (!vigente()) return;
    const vista = VISTAS[opts.vista] ? opts.vista : 'resumen';
    const cuerpo = {resumen: vistaResumen, semanal: vistaSemanal, intermedio: vistaIntermedio, reuniones: vistaReuniones, rendimientos: vistaRendimientos}[vista](datos);
    root.innerHTML = `<div class="documentaryIntro lpIntro"><div><h2>Last Planner · ${esc(VISTAS[vista])}</h2><p>Plan de producción de la obra: compromisos por semana, restricciones, cumplimiento (PPC), reuniones y rendimientos. Se guarda en este equipo; respáldalo para pasarlo a otro.</p></div>
      <div class="lpBarra">${vista === 'reuniones' ? '' : `<label>Piso<select data-lp-piso><option value="">Todos los pisos</option>${pisos.map(p => `<option value="${esc(p.id)}" ${filtros.piso === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>`}<button type="button" data-lp-respaldo ${datos.actividades.length || datos.reuniones.length ? '' : 'disabled'}>Respaldo JSON</button><label class="obsImportar">Importar respaldo<input type="file" accept=".json,application/json" data-lp-importar></label></div></div>${cuerpo}`;
    const on = (sel, fn, evento = 'click') => root.querySelectorAll(sel).forEach(el => el.addEventListener(evento, () => fn(el)));
    on('[data-lp-semana]', b => { const n = +b.dataset.lpSemana; filtros.semana = n ? M.moverSemana(filtros.semana, n) : M.semanaDe(hoy()); refrescar(); });
    on('[data-lp-piso]', s => { filtros.piso = s.value; filtros.sector = ''; refrescar(); }, 'change');
    on('[data-lp-ir]', b => opts.irA?.(b.dataset.lpIr));
    on('[data-lp-ir-semana]', g => { filtros.semana = g.dataset.lpIrSemana; filtros.estado = ''; opts.irA?.('semanal'); });
    root.querySelectorAll('[data-lp-ir-semana]').forEach(g => g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.dispatchEvent(new Event('click')); } }));
    on('[data-lp-nueva]', b => editarActividad(null, {semana: b.dataset.lpNueva === 'intermedio' ? null : filtros.semana}));
    on('[data-lp-act]', b => editarActividad(datos.actividades.find(a => a.id === b.dataset.lpAct), {foco: b.dataset.lpFoco}));
    on('[data-lp-estado]', b => { filtros.estado = b.dataset.lpEstado; refrescar(); });
    on('[data-lp-restricciones]', b => { filtros.restricciones = b.dataset.lpRestricciones; refrescar(); });
    root.querySelectorAll('[data-lp-f]').forEach(c => { let espera; const aplicar = () => { filtros[c.dataset.lpF] = c.value; refrescar(); }; if (c.tagName === 'INPUT') c.oninput = () => { clearTimeout(espera); espera = setTimeout(aplicar, 250); }; else c.onchange = aplicar; });
    if (foco) { const campo = root.querySelector(`[data-lp-f="${foco}"]`); campo?.focus({preventScroll: true}); if (campo?.setSelectionRange) campo.setSelectionRange(campo.value.length, campo.value.length); }
    on('[data-lp-capa]', () => { semanaCapa = filtros.semana; indexar(); opts.pintarCapa?.('lastplanner'); });
    on('[data-lp-reporte]', () => reporte());
    on('[data-lp-csv]', () => exportarCSV(datos));
    on('[data-lp-iniciar]', b => { const a = datos.actividades.find(x => x.id === b.dataset.lpIniciar), autor = quien(); if (!a || !autor) return; try { guardar([{actividad: M.cambiarEstado(a, 'En ejecución', {}, {autor, hoy: hoy()}), versionEsperada: a.version}], 'Actividad iniciada hoy.'); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-reprogramar]', b => { const a = datos.actividades.find(x => x.id === b.dataset.lpReprogramar), autor = quien(); if (!a || !autor) return; const actual = M.semanaDe(hoy()), siguiente = M.moverSemana(a.semana, 1), destino = siguiente > actual ? siguiente : actual; try { const r = M.reprogramar(a, destino, {id: crypto.randomUUID(), autor}); guardar([{actividad: r.original, versionEsperada: a.version}, {actividad: r.nueva, versionEsperada: 0}], `Saldo reprogramado en la semana ${nSemana(destino)}.`); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-comprometer]', b => { const a = datos.actividades.find(x => x.id === b.dataset.lpComprometer), autor = quien(); if (!a || !autor) return; if (M.pendientes(a).length && !confirm(`«${a.actividad}» tiene ${M.pendientes(a).length} restricciones pendientes. En Last Planner solo se compromete lo liberado. ¿Comprometerla igual?`)) return; try { guardar([{actividad: M.editarActividad(a, {...a, semana: filtros.semana}, {autor}), versionEsperada: a.version}], `Comprometida en la semana ${nSemana(filtros.semana)}.`); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-liberar]', b => { const [id, rid] = b.dataset.lpLiberar.split('|'), a = datos.actividades.find(x => x.id === id), autor = quien(); if (!a || !autor) return; try { guardar([{actividad: M.liberarRestriccion(a, rid, {autor, fecha: hoy()}), versionEsperada: a.version}], 'Restricción actualizada.'); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-nueva-reunion]', () => editarReunion(null));
    on('[data-lp-reunion]', b => editarReunion(datos.reuniones.find(r => r.id === b.dataset.lpReunion)));
    root.querySelectorAll('[data-lp-est]').forEach(c => c.addEventListener(c.tagName === 'SELECT' ? 'change' : 'input', () => { filtros.estimar[c.dataset.lpEst] = c.tagName === 'SELECT' ? +c.value : c.value; if (c.tagName === 'SELECT') refrescar(); else { const lista = M.rendimientosPorActividad(datos.actividades.filter(delPiso)), g = lista[filtros.estimar.grupo] || lista[0], d = g && M.estimarDias(g, Number(filtros.estimar.cantidad), Number(filtros.estimar.dotacion)); root.querySelector('[data-lp-estimacion]').innerHTML = d ? `<b>${cifra(d)} días hábiles</b> · con ${g.porPersonaDia && Number(filtros.estimar.dotacion) > 0 ? cifra(g.porPersonaDia, 2) + ' ' + esc(g.unidad || '') + ' por persona-día' : cifra(g.porDia, 2) + ' ' + esc(g.unidad || '') + ' por día'} (${g.n} registro${g.n === 1 ? '' : 's'})` : 'Indica la cantidad (y la dotación si la conoces) para estimar los días.'; } }));
    on('[data-lp-respaldo]', async () => { try { ctx.download(new Blob([JSON.stringify(await exportarPlan())], {type: 'application/json'}), `last-planner_${hoy()}.json`); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-importar]', async input => { try { const f = input.files[0]; if (!f) return; const n = await importarPlan(JSON.parse(await f.text())); ctx.toast(`Respaldo importado: ${n} registros nuevos.`); refrescar(); } catch (e) { ctx.toast(e.message); } }, 'change');
  }

  function exportarCSV(datos) {
    const s = filtros.semana, lista = ordenSemana(datos.actividades.filter(a => delPiso(a) && a.semana === s)), celda = v => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const campos = ['N°', 'Semana', 'Piso', 'Sector', 'Frente', 'Actividad', 'Responsable', 'Recintos', 'Cantidad', 'Unidad', 'Ejecutado', 'Dotación', 'Inicio plan', 'Término plan', 'Inicio real', 'Término real', 'Días trabajados', 'HH', 'Estado', 'Causa de no cumplimiento', 'Restricciones pendientes'];
    const filas = lista.map((a, i) => [i + 1, s, nombrePiso(a.level), a.sector, a.frente, a.actividad, a.responsable, a.recintos.map(r => r.code).join(', '), a.cantidad, a.unidad, a.cantidadEjecutada, a.dotacion, a.inicioPlan, a.finPlan, a.inicioReal, a.finReal, a.diasReales, a.hh, a.estado, a.causa, M.pendientes(a).map(r => r.tipo + ': ' + r.descripcion).join(' | ')]);
    ctx.download(new Blob(['﻿' + [campos, ...filas].map(f => f.map(celda).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'}), `last-planner_${s}.csv`);
  }

  // ---------- Formulario de actividad ----------
  async function editarActividad(act, {semana = null, foco = null} = {}) {
    const datos = cache || await cargarPlan(), h = hoy();
    if (act && !datos.actividades.some(a => a.id === act.id)) return ctx.toast('La actividad ya no existe.');
    const level = act?.level || (filtros.piso || nivel.id), salas = ctx.rooms();
    let recintos = [...(act?.recintos || [])], restricciones = (act?.restricciones || []).map(r => ({...r}));
    const sem = act ? act.semana : semana, actual = M.semanaDe(h), opcionesSemana = [...new Set([...(sem ? [sem] : []), ...Array.from({length: 11}, (_, i) => M.moverSemana(actual, i - 2))])].sort();
    const cierre = act?.semana, nombres = [...new Set(datos.actividades.map(a => a.actividad))].sort((a, b) => a.localeCompare(b, 'es'));
    dialog.classList.remove('lpAncho');
    dialog.innerHTML = `<form class="obsForm lpForm" novalidate>
      <header><div><small>LAST PLANNER · ${esc(nombrePiso(level).toUpperCase())}${sem ? ' · ' + esc(etiquetaSemana(sem).toUpperCase()) : ' · PLAN INTERMEDIO'}</small><h2>${act ? esc(act.actividad) : 'Nueva actividad'}</h2>${act ? chip(act.estado) + (act.origen ? ' <small class="obsNota">Reprogramada de otra semana</small>' : '') : ''}</div><button type="button" class="obsCerrar" aria-label="Cerrar">×</button></header>
      <div class="obsCuerpo">
      <label>Actividad *<input name="actividad" list="lpNombres" maxlength="200" required value="${esc(act?.actividad || '')}" placeholder="Ej.: Pintura asepsia media, segunda mano"></label>${datalist('lpNombres', nombres)}
      <div class="obsCampos">
        <label>Piso<select name="level" ${act?.recintos.length ? 'disabled' : ''}>${pisos.map(p => `<option value="${esc(p.id)}" ${p.id === level ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
        <label>Sector<input name="sector" list="lpSectores" maxlength="60" value="${esc(act?.sector || '')}" placeholder="Ej.: A">${datalist('lpSectores', sectores())}</label>
        <label>Frente o ubicación<input name="frente" maxlength="200" value="${esc(act?.frente || '')}" placeholder="Ej.: Pasillo ejes 5-7"></label>
        <label>Responsable *<input name="responsable" list="lpResponsables" maxlength="160" required value="${esc(act?.responsable || '')}" placeholder="Subcontrato o cuadrilla">${datalist('lpResponsables', responsables())}</label>
        <label>Semana<select name="semana" ${act && M.CERRADOS.has(act.estado) ? 'disabled' : ''}><option value="">Plan intermedio (sin comprometer)</option>${opcionesSemana.map(s => `<option value="${s}" ${s === sem ? 'selected' : ''}>${esc(etiquetaSemana(s))}${s === actual ? ' (en curso)' : ''}</option>`).join('')}</select></label>
        <label>Dotación (personas)<input name="dotacion" type="number" min="0" step="1" value="${act?.dotacion ?? ''}"></label>
        <label>Inicio planificado<input name="inicioPlan" type="date" value="${esc(act?.inicioPlan || '')}"></label>
        <label>Término planificado<input name="finPlan" type="date" value="${esc(act?.finPlan || '')}"></label>
        <label>Cantidad comprometida<input name="cantidad" type="number" min="0" step="any" value="${act?.cantidad ?? ''}"></label>
        <label>Unidad<input name="unidad" list="lpUnidades" maxlength="20" value="${esc(act?.unidad || '')}" placeholder="m², m, un…">${datalist('lpUnidades', M.UNIDADES)}</label>
      </div>
      <section class="lpSeccion"><h3>Recintos <small data-lp-n-recintos></small></h3><div class="lpElegidos"></div>
        ${level === nivel.id ? `<div class="lpBuscarRecinto"><input type="search" data-lp-buscar placeholder="Buscar recinto por código o nombre (o filtra por sector)"><div class="lpResultados"></div></div>` : `<p class="obsNota">Para elegir recintos de ${esc(nombrePiso(level))}, abre ese piso.</p>`}</section>
      <section class="lpSeccion"><h3>Restricciones (puntos de bloqueo)</h3><ul class="lpRestricciones"></ul>
        <div class="lpNuevaRestriccion"><select data-r="tipo">${M.TIPOS_RESTRICCION.map(t => `<option>${esc(t)}</option>`).join('')}</select><input data-r="descripcion" maxlength="500" placeholder="Qué falta liberar"><input data-r="responsable" maxlength="160" placeholder="Responsable" list="lpResponsables"><input data-r="compromiso" type="date" aria-label="Fecha compromiso"><button type="button" data-lp-agregar-restriccion>Agregar</button></div></section>
      ${cierre ? `<section class="lpSeccion lpCierre" id="lpCierre"><h3>Ejecución y cierre</h3>
        <div class="obsCampos"><label>Inicio real<input name="inicioReal" type="date" value="${esc(act.inicioReal || '')}"></label><label>Término real<input name="finReal" type="date" value="${esc(act.finReal || '')}"></label>
        <label>Cantidad ejecutada${act.unidad ? ' (' + esc(act.unidad) + ')' : ''}<input name="cantidadEjecutada" type="number" min="0" step="any" value="${act.cantidadEjecutada ?? ''}" placeholder="${act.cantidad ?? ''}"></label><label>Días trabajados<input name="diasReales" type="number" min="0" step="any" value="${act.diasReales ?? ''}" placeholder="lunes a viernes"></label>
        <label>Horas-hombre (HH)<input name="hh" type="number" min="0" step="any" value="${act.hh ?? ''}"></label><label>Causa de no cumplimiento<select name="causa"><option value="">—</option>${M.CAUSAS.map(c => `<option ${act.causa === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
        <label>Detalle de la causa<input name="causaNota" maxlength="1000" value="${esc(act.causaNota || '')}"></label>
        <label>Comentario del cambio<textarea name="comentario" rows="2" maxlength="1000" placeholder="Obligatorio para reabrir una actividad cerrada"></textarea></label>
        <p class="obsNota">Solo cuenta como cumplida si se completó el 100 %. Lo parcial se cierra como no cumplida, con su causa, y el saldo se reprograma.</p>
        <div class="obsTransiciones">${(M.TRANSICIONES[act.estado] || []).filter(e => !(act.reprogramada && M.CERRADOS.has(act.estado))).map(e => `<button type="button" data-estado="${esc(e)}" style="--c:${COLOR_ESTADO[e]}">${esc(M.CERRADOS.has(act.estado) ? 'Reabrir' : ACCION[e])}</button>`).join('')}</div>
        ${act.estado === 'No cumplida' && !act.reprogramada ? `<div class="lpReprogramar"><label>Reprogramar el saldo en<select data-lp-destino>${Array.from({length: 8}, (_, i) => M.moverSemana(act.semana, i + 1)).map((s, i) => `<option value="${s}" ${i === 0 ? 'selected' : ''}>${esc(etiquetaSemana(s))}</option>`).join('')}</select></label><button type="button" data-lp-reprogramar-form>Reprogramar</button></div>` : act.reprogramada ? `<p class="obsNota">Saldo reprogramado en la ${esc(etiquetaSemana(act.reprogramada))}.</p>` : ''}</section>` : ''}
      <label>${act ? 'Quién hace este cambio' : 'Registrado por'} *<input name="autor" maxlength="160" required value="${esc(autorGuardado())}" autocomplete="name"></label>
      ${act ? `<details class="obsHistorial"><summary>Historial (${act.historial.length})</summary><ol>${act.historial.map(x => `<li><b>${new Date(x.at).toLocaleString('es-CL', {dateStyle: 'short', timeStyle: 'short'})}</b> · ${esc(x.autor)} · ${esc(x.detalle)}${x.comentario ? `<br><span>${esc(x.comentario)}</span>` : ''}</li>`).join('')}</ol></details>` : ''}
      </div>
      <footer><span class="obsMensaje" role="alert"></span>${act?.estado === 'Planificada' ? '<button type="button" data-lp-eliminar>Eliminar</button>' : ''}<button type="submit" class="primary">${act ? 'Guardar cambios' : 'Guardar actividad'}</button></footer></form>`;
    const form = dialog.querySelector('form'), mensaje = form.querySelector('.obsMensaje');
    form.querySelector('.obsCerrar').onclick = () => { if (!guardando) dialog.close(); };
    // Recintos: buscador sobre el piso abierto, filtrado por el sector escrito; «agregar todos» para un sector completo.
    const buscar = form.querySelector('[data-lp-buscar]'), resultados = form.querySelector('.lpResultados');
    function pintarRecintos() {
      form.querySelector('[data-lp-n-recintos]').textContent = recintos.length ? `· ${recintos.length}` : '';
      form.querySelector('.lpElegidos').innerHTML = recintos.length ? recintos.map((r, i) => `<span class="lpChip">${esc(r.code)} · ${esc(r.name)}<button type="button" data-quitar-recinto="${i}" aria-label="Quitar ${esc(r.code)}">×</button></span>`).join('') : '<p class="obsNota">Sin recintos. Agrégalos para ver la actividad en el plano y en el reporte.</p>';
      form.querySelectorAll('[data-quitar-recinto]').forEach(b => { b.onclick = () => { recintos.splice(+b.dataset.quitarRecinto, 1); pintarRecintos(); }; });
      if (!buscar) return;
      const q = buscar.value.trim().toLocaleLowerCase('es'), sector = form.sector.value.trim(), ids = new Set(recintos.map(r => r.id));
      const candidatos = salas.filter(r => !ids.has(r.id) && (q ? (r.code + ' ' + r.name).toLocaleLowerCase('es').includes(q) && (!sector || r.sector === sector) : sector && r.sector === sector));
      resultados.innerHTML = (sector && !q && candidatos.length ? `<button type="button" class="lpTodos" data-agregar-todos>+ Agregar los ${candidatos.length} recintos del sector ${esc(sector)}</button>` : '') + candidatos.slice(0, 30).map(r => `<button type="button" data-agregar-recinto="${esc(r.id)}">+ <b>${esc(r.code)}</b> ${esc(r.name)} <small>Sector ${esc(r.sector || '—')}</small></button>`).join('') + (candidatos.length > 30 ? `<p class="obsNota">${candidatos.length - 30} más: escribe para acotar.</p>` : '') + (!candidatos.length && (q || sector) ? '<p class="obsNota">Sin recintos que coincidan.</p>' : '');
      const agregar = r => recintos.push({id: r.id, code: r.code, name: r.name});
      resultados.querySelectorAll('[data-agregar-recinto]').forEach(b => { b.onclick = () => { agregar(salas.find(r => r.id === b.dataset.agregarRecinto)); pintarRecintos(); }; });
      resultados.querySelector('[data-agregar-todos]')?.addEventListener('click', () => { candidatos.forEach(agregar); pintarRecintos(); });
    }
    if (buscar) { buscar.oninput = pintarRecintos; form.sector.addEventListener('input', pintarRecintos); }
    pintarRecintos();
    // Restricciones: se agregan, liberan o reabren aquí y se guardan con la actividad.
    function pintarRestricciones() {
      form.querySelector('.lpRestricciones').innerHTML = restricciones.map((r, i) => `<li class="${r.estado === 'Liberada' ? 'liberada' : M.restriccionVencida(r, h) ? 'vencida' : ''}"><div><b>${esc(r.tipo)}</b> · ${esc(r.descripcion)}<small>${esc(r.responsable || 'Sin responsable')} · ${r.estado === 'Liberada' ? 'liberada el ' + fecha(r.liberada) : (M.restriccionVencida(r, h) ? 'vencida · ' : '') + (r.compromiso ? 'compromiso ' + fecha(r.compromiso) : 'sin fecha compromiso')}</small></div><button type="button" data-liberar="${i}">${r.estado === 'Liberada' ? 'Reabrir' : 'Liberar'}</button>${r.estado === 'Pendiente' ? `<button type="button" class="lpQuitar" data-quitar-restriccion="${i}" aria-label="Quitar restricción">×</button>` : ''}</li>`).join('') || '<li class="lpVacio">Sin restricciones registradas.</li>';
      form.querySelectorAll('[data-liberar]').forEach(b => { b.onclick = () => { const r = restricciones[+b.dataset.liberar]; Object.assign(r, r.estado === 'Liberada' ? {estado: 'Pendiente', liberada: null} : {estado: 'Liberada', liberada: h}); pintarRestricciones(); }; });
      form.querySelectorAll('[data-quitar-restriccion]').forEach(b => { b.onclick = () => { restricciones.splice(+b.dataset.quitarRestriccion, 1); pintarRestricciones(); }; });
    }
    form.querySelector('[data-lp-agregar-restriccion]').onclick = () => {
      const caja = form.querySelector('.lpNuevaRestriccion'), v = Object.fromEntries([...caja.querySelectorAll('[data-r]')].map(c => [c.dataset.r, c.value]));
      try { restricciones.push(M.nuevaRestriccion(v, crypto.randomUUID())); caja.querySelectorAll('input').forEach(c => { c.value = ''; }); mensaje.textContent = ''; pintarRestricciones(); } catch (e) { mensaje.textContent = e.message; }
    };
    pintarRestricciones();

    async function persistir({estado = null, reprogramarA = null} = {}) {
      if (guardando) return;
      const v = Object.fromEntries(new FormData(form)), autor = String(v.autor || '').trim(), at = new Date().toISOString();
      if (!autor) { mensaje.textContent = 'Indica quién registra.'; form.autor.focus(); return; }
      const valores = {...v, level: form.level.value, semana: form.semana.disabled ? act.semana : v.semana, recintos, restricciones};
      let cambios;
      try {
        if (!act) cambios = [{actividad: M.nuevaActividad(valores, {id: crypto.randomUUID(), autor, at}), versionEsperada: 0}];
        else {
          let x = M.editarActividad(act, valores, {autor, at});
          if (cierre) {
            const ejecucion = {inicioReal: v.inicioReal, finReal: v.finReal, cantidadEjecutada: v.cantidadEjecutada, diasReales: v.diasReales, hh: v.hh, causa: v.causa, causaNota: v.causaNota};
            x = estado ? M.cambiarEstado(x, estado, ejecucion, {autor, comentario: v.comentario, at, hoy: h}) : M.registrarEjecucion(x, ejecucion, {autor, at});
            if (!estado && String(v.comentario || '').trim()) x = {...x, actualizada: at, historial: [...x.historial, M.entrada(autor, 'Comentario', v.comentario, at)]};
          }
          if (x === act && !reprogramarA) { dialog.close(); return; }
          x = M.validarActividad({...x, version: act.version + 1});
          cambios = [{actividad: x, versionEsperada: act.version}];
          if (reprogramarA) { const r = M.reprogramar(x, reprogramarA, {id: crypto.randomUUID(), autor, at}); cambios = [{actividad: {...r.original, version: act.version + 1}, versionEsperada: act.version}, {actividad: r.nueva, versionEsperada: 0}]; }
        }
        if (cambios[0].actividad.semana && M.pendientes(cambios[0].actividad).length && !M.CERRADOS.has(cambios[0].actividad.estado) && (!act || !act.semana) && !confirm('Esta actividad tiene restricciones pendientes. En Last Planner solo se compromete lo liberado. ¿Guardarla comprometida igual?')) return;
      } catch (e) { mensaje.textContent = e.message; return; }
      guardando = true; form.querySelectorAll('button').forEach(b => { b.disabled = true; }); mensaje.textContent = 'Guardando…';
      try {
        await guardarActividades(cambios); recordarAutor(autor); guardando = false; dialog.close(); await cargarPlan(true);
        ctx.toast(reprogramarA ? `Saldo reprogramado en la semana ${nSemana(reprogramarA)}.` : estado ? `Actividad: ${estado}.` : 'Actividad guardada en este equipo.'); refrescar();
      } catch (e) { guardando = false; form.querySelectorAll('button').forEach(b => { b.disabled = false; }); mensaje.textContent = 'No se guardó. ' + e.message; }
    }
    form.onsubmit = e => { e.preventDefault(); persistir(); };
    form.querySelectorAll('[data-estado]').forEach(b => { b.onclick = () => persistir({estado: b.dataset.estado}); });
    form.querySelector('[data-lp-reprogramar-form]')?.addEventListener('click', () => persistir({reprogramarA: form.querySelector('[data-lp-destino]').value}));
    form.querySelector('[data-lp-eliminar]')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar «${act.actividad}»? No se puede deshacer.`)) return;
      try { await eliminarActividad(act.id); dialog.close(); await cargarPlan(true); ctx.toast('Actividad eliminada.'); refrescar(); } catch (e) { mensaje.textContent = e.message; }
    });
    if (!dialog.open) dialog.showModal();
    if (foco === 'cierre') form.querySelector('#lpCierre')?.scrollIntoView({block: 'start'});
    else if (!act) setTimeout(() => form.actividad.focus({preventScroll: true}), 50);
  }

  // ---------- Formulario de reunión: asistencia, frentes de trabajo y acuerdos ----------
  async function editarReunion(reu) {
    const datos = cache || await cargarPlan();
    const base = reu ? structuredClone(reu) : {fecha: hoy(), tipo: M.TIPOS_REUNION[0], lugar: null, notas: null, ...M.plantillaReunion(M.ultimaReunion(datos.reuniones))};
    const listas = {asistentes: base.asistentes, frentes: base.frentes, acuerdos: base.acuerdos};
    const nuevo = {asistentes: () => ({nombre: '', empresa: null, cargo: null, asistio: true}), frentes: () => ({level: nivel.id, sector: null, frente: '', responsable: null, dotacion: null, estado: 'Activo', nota: null}), acuerdos: () => ({texto: '', responsable: null, plazo: null, cumplido: false})};
    dialog.classList.add('lpAncho');
    dialog.innerHTML = `<form class="obsForm lpForm" novalidate>
      <header><div><small>LAST PLANNER · REUNIÓN DE PRODUCCIÓN</small><h2>${reu ? esc(reu.tipo) + ' · ' + fecha(reu.fecha) : 'Nueva reunión'}</h2></div><button type="button" class="obsCerrar" aria-label="Cerrar">×</button></header>
      <div class="obsCuerpo">
      <div class="obsCampos lpTres"><label>Fecha *<input name="fecha" type="date" required value="${esc(base.fecha)}"></label><label>Tipo<select name="tipo">${M.TIPOS_REUNION.map(t => `<option ${t === base.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><label>Lugar<input name="lugar" maxlength="160" value="${esc(base.lugar || '')}"></label></div>
      <section class="lpSeccion"><h3>Asistencia <small data-lp-conteo></small></h3><div data-lista="asistentes"></div><div class="lpBotones"><button type="button" data-agregar="asistentes">+ Asistente</button><button type="button" data-todos>Todos presentes</button></div></section>
      <section class="lpSeccion"><h3>Frentes de trabajo</h3><div data-lista="frentes"></div><div class="lpBotones"><button type="button" data-agregar="frentes">+ Frente</button></div></section>
      <section class="lpSeccion"><h3>Acuerdos</h3><div data-lista="acuerdos"></div><div class="lpBotones"><button type="button" data-agregar="acuerdos">+ Acuerdo</button></div></section>
      <label>Notas<textarea name="notas" rows="3" maxlength="4000">${esc(base.notas || '')}</textarea></label>
      <label>Registrado por *<input name="autor" maxlength="160" required value="${esc(autorGuardado())}" autocomplete="name"></label>
      ${datalist('lpResponsablesR', responsables())}${datalist('lpSectoresR', sectores())}
      </div>
      <footer><span class="obsMensaje" role="alert"></span>${reu ? '<button type="button" data-lp-eliminar>Eliminar</button>' : ''}<button type="submit" class="primary">${reu ? 'Guardar cambios' : 'Guardar reunión'}</button></footer></form>`;
    const form = dialog.querySelector('form'), mensaje = form.querySelector('.obsMensaje');
    form.querySelector('.obsCerrar').onclick = () => { if (!guardando) dialog.close(); };
    const campo = (lista, i, k, tipo = 'text', extra = '') => `<input type="${tipo}" data-l="${lista}" data-i="${i}" data-k="${k}" value="${esc(listas[lista][i][k] ?? '')}" ${extra}>`;
    const filas = {
      asistentes: (p, i) => `<div class="lpFila lpFilaAsistente">${campo('asistentes', i, 'nombre', 'text', 'placeholder="Nombre *" maxlength="160" aria-label="Nombre"')}${campo('asistentes', i, 'empresa', 'text', 'placeholder="Empresa" list="lpResponsablesR" maxlength="160" aria-label="Empresa"')}${campo('asistentes', i, 'cargo', 'text', 'placeholder="Cargo" maxlength="160" aria-label="Cargo"')}<label class="check"><input type="checkbox" data-l="asistentes" data-i="${i}" data-k="asistio" ${p.asistio ? 'checked' : ''}> Asistió</label><button type="button" class="lpQuitar" data-quitar="asistentes|${i}" aria-label="Quitar">×</button></div>`,
      frentes: (f, i) => `<div class="lpFila lpFilaFrente"><select data-l="frentes" data-i="${i}" data-k="level" aria-label="Piso">${pisos.map(p => `<option value="${esc(p.id)}" ${p.id === f.level ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>${campo('frentes', i, 'sector', 'text', 'placeholder="Sector" list="lpSectoresR" maxlength="60" aria-label="Sector"')}${campo('frentes', i, 'frente', 'text', 'placeholder="Frente *" maxlength="200" aria-label="Frente"')}${campo('frentes', i, 'responsable', 'text', 'placeholder="Responsable" list="lpResponsablesR" maxlength="160" aria-label="Responsable"')}${campo('frentes', i, 'dotacion', 'number', 'placeholder="Personas" min="0" step="1" aria-label="Dotación"')}<select data-l="frentes" data-i="${i}" data-k="estado" aria-label="Estado">${M.ESTADOS_FRENTE.map(e => `<option ${e === f.estado ? 'selected' : ''}>${e}</option>`).join('')}</select>${campo('frentes', i, 'nota', 'text', 'placeholder="Nota" maxlength="500" aria-label="Nota"')}<button type="button" class="lpQuitar" data-quitar="frentes|${i}" aria-label="Quitar">×</button></div>`,
      acuerdos: (c, i) => `<div class="lpFila lpFilaAcuerdo">${campo('acuerdos', i, 'texto', 'text', 'placeholder="Acuerdo *" maxlength="1000" aria-label="Acuerdo"')}${campo('acuerdos', i, 'responsable', 'text', 'placeholder="Responsable" list="lpResponsablesR" maxlength="160" aria-label="Responsable"')}${campo('acuerdos', i, 'plazo', 'date', 'aria-label="Plazo"')}<label class="check"><input type="checkbox" data-l="acuerdos" data-i="${i}" data-k="cumplido" ${c.cumplido ? 'checked' : ''}> Cumplido</label><button type="button" class="lpQuitar" data-quitar="acuerdos|${i}" aria-label="Quitar">×</button></div>`};
    const conteo = () => { const a = listas.asistentes; form.querySelector('[data-lp-conteo]').textContent = a.length ? `· ${a.filter(p => p.asistio).length} de ${a.length} presentes` : ''; };
    function pintar(lista) {
      form.querySelector(`[data-lista="${lista}"]`).innerHTML = listas[lista].map(filas[lista]).join('') || '<p class="obsNota">Sin registros.</p>';
      form.querySelectorAll(`[data-quitar^="${lista}|"]`).forEach(b => { b.onclick = () => { listas[lista].splice(+b.dataset.quitar.split('|')[1], 1); pintar(lista); }; });
      conteo();
    }
    Object.keys(listas).forEach(pintar);
    form.addEventListener('input', e => { const c = e.target, l = c.dataset?.l; if (!l) return; const fila = listas[l][+c.dataset.i]; fila[c.dataset.k] = c.type === 'checkbox' ? c.checked : c.type === 'number' ? (c.value === '' ? null : Number(c.value)) : c.value; conteo(); });
    form.addEventListener('change', e => { if (e.target.tagName === 'SELECT' && e.target.dataset.l) listas[e.target.dataset.l][+e.target.dataset.i][e.target.dataset.k] = e.target.value; });
    form.querySelectorAll('[data-agregar]').forEach(b => { b.onclick = () => { const l = b.dataset.agregar; listas[l].push(nuevo[l]()); pintar(l); form.querySelector(`[data-lista="${l}"] .lpFila:last-child input`)?.focus(); }; });
    form.querySelector('[data-todos]').onclick = () => { listas.asistentes.forEach(p => { p.asistio = true; }); pintar('asistentes'); };
    form.onsubmit = async e => {
      e.preventDefault(); if (guardando) return;
      const v = Object.fromEntries(new FormData(form)), autor = String(v.autor || '').trim(), at = new Date().toISOString(), t = x => String(x ?? '').trim() || null;
      if (!autor) { mensaje.textContent = 'Indica quién registra.'; return; }
      // Las filas vacías se ignoran; el resto se valida completo.
      const r = {schema: 1, id: reu?.id || crypto.randomUUID(), fecha: v.fecha, tipo: v.tipo, lugar: t(v.lugar), notas: t(v.notas),
        asistentes: listas.asistentes.filter(p => t(p.nombre) || t(p.empresa) || t(p.cargo)).map(p => ({nombre: String(p.nombre || '').trim(), empresa: t(p.empresa), cargo: t(p.cargo), asistio: !!p.asistio})),
        frentes: listas.frentes.filter(f => t(f.frente) || t(f.sector) || t(f.responsable)).map(f => ({level: t(f.level), sector: t(f.sector), frente: String(f.frente || '').trim(), responsable: t(f.responsable), dotacion: f.dotacion ?? null, estado: f.estado, nota: t(f.nota)})),
        acuerdos: listas.acuerdos.filter(c => t(c.texto) || t(c.responsable)).map(c => ({texto: String(c.texto || '').trim(), responsable: t(c.responsable), plazo: c.plazo || null, cumplido: !!c.cumplido})),
        autor: reu?.autor || autor, creada: reu?.creada || at, actualizada: at, version: (reu?.version || 0) + 1};
      try { M.validarReunion(r); } catch (error) { mensaje.textContent = error.message; return; }
      guardando = true; mensaje.textContent = 'Guardando…';
      try { await guardarReunion(r, reu?.version || 0); recordarAutor(autor); guardando = false; dialog.close(); await cargarPlan(true); ctx.toast('Reunión guardada en este equipo.'); refrescar(); }
      catch (error) { guardando = false; mensaje.textContent = 'No se guardó. ' + error.message; }
    };
    form.querySelector('[data-lp-eliminar]')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar la reunión del ${fecha(reu.fecha)}? No se puede deshacer.`)) return;
      try { await eliminarReunion(reu.id); dialog.close(); await cargarPlan(true); ctx.toast('Reunión eliminada.'); refrescar(); } catch (e) { mensaje.textContent = e.message; }
    });
    if (!dialog.open) dialog.showModal();
  }

  // ---------- Reporte semanal con plano (para imprimir o guardar en PDF) ----------
  async function dibujarPlano(acts) {
    const fondo = ctx.fondo(), salas = ctx.rooms(), cargar = src => new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(Error('No se pudo cargar el plano.')); im.src = src; });
    const porRecinto = new Map(), faltan = [];
    for (const a of acts) for (const rec of a.recintos) {
      const room = salas.find(r => r.id === rec.id) || salas.find(r => r.code === rec.code);
      if (!room) { faltan.push(rec.code); continue; }
      const e = porRecinto.get(room) || {room, acts: []}; e.acts.push(a); porRecinto.set(room, e);
    }
    // La vista general basta en los pisos dibujados desde DWG; si es de baja resolución se usa la imagen de exportación.
    let img = await cargar(fondo.url); if (img.naturalWidth / fondo.width < .25 && fondo.export) img = await cargar(fondo.export);
    const pos = [...porRecinto.keys()].map(r => ctx.position(r));
    let [x0, y0, x1, y1] = pos.length ? [Math.min(...pos.map(p => p[0])), Math.min(...pos.map(p => p[1])), Math.max(...pos.map(p => p[0])), Math.max(...pos.map(p => p[1]))] : [fondo.origin[0], fondo.origin[1], fondo.origin[0] + fondo.width, fondo.origin[1] + fondo.height];
    const margen = Math.max(400, (x1 - x0) * .12, (y1 - y0) * .12); x0 -= margen; y0 -= margen; x1 += margen; y1 += margen;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let w = x1 - x0, hh = y1 - y0; if (hh > w * 1.1) w = hh / 1.1; if (w > hh * 16 / 9) hh = w * 9 / 16;
    x0 = Math.max(fondo.origin[0], cx - w / 2); y0 = Math.max(fondo.origin[1], cy - hh / 2); x1 = Math.min(fondo.origin[0] + fondo.width, cx + w / 2); y1 = Math.min(fondo.origin[1] + fondo.height, cy + hh / 2);
    const k = img.naturalWidth / fondo.width, f = Math.min(1600 / (x1 - x0), 1400 / (y1 - y0)), canvas = document.createElement('canvas');
    canvas.width = Math.round((x1 - x0) * f); canvas.height = Math.round((y1 - y0) * f);
    const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, (x0 - fondo.origin[0]) * k, (y0 - fondo.origin[1]) * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, canvas.width, canvas.height);
    g.setTransform(f, 0, 0, f, -x0 * f, -y0 * f);
    const conteo = Object.fromEntries(M.ESTADOS_RECINTO.map(e => [e, 0]));
    for (const e of porRecinto.values()) {
      const d = ctx.path(e.room.id), estado = M.estadoRecinto(e.acts), c = COLORES_RECINTO[estado]; conteo[estado]++;
      if (!d) continue;
      g.globalAlpha = .5; g.fillStyle = c; g.fill(new Path2D(d), 'evenodd'); g.globalAlpha = 1; g.strokeStyle = c; g.lineWidth = 2 / f; g.stroke(new Path2D(d));
    }
    // Número de cada actividad sobre sus recintos (el mismo del listado).
    g.setTransform(1, 0, 0, 1, 0, 0); g.font = '600 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const e of porRecinto.values()) {
      const [px, py] = ctx.position(e.room), x = (px - x0) * f, y = (py - y0) * f, t = e.acts.map(a => a.n).join(','), ancho = g.measureText(t).width + 12;
      g.fillStyle = '#ffffffee'; g.strokeStyle = '#12343a'; g.lineWidth = 1.2; g.beginPath(); if (g.roundRect) g.roundRect(x - ancho / 2, y - 11, ancho, 22, 6); else g.rect(x - ancho / 2, y - 11, ancho, 22); g.fill(); g.stroke();
      g.fillStyle = '#12343a'; g.fillText(t, x, y + 1);
    }
    return {url: canvas.toDataURL('image/png'), conteo, recintos: porRecinto.size, faltan: [...new Set(faltan)]};
  }
  async function reporte() {
    let datos; try { datos = await cargarPlan(true); } catch (e) { return ctx.toast(e.message); }
    document.getElementById('lpReporte')?.remove();
    const s = filtros.semana, {desde, hasta} = M.rangoSemana(s), h = hoy(), lista = datos.actividades.filter(delPiso), semana = ordenSemana(lista.filter(a => a.semana === s)).map((a, i) => ({...a, n: i + 1}));
    const p = M.ppcSemana(lista, s), serie = M.seriePPC(lista, s, 8), cnc = M.causas(lista, [s]), rr = M.resumenRestricciones(lista, h), reunion = ultimaHasta(datos.reuniones, s), asis = reunion && M.asistencia(reunion);
    const enPlano = semana.filter(a => a.level === nivel.id && a.recintos.length), pendientes = lista.filter(a => !M.CERRADOS.has(a.estado)).flatMap(a => M.pendientes(a).map(r => ({r, a}))).sort((x, y) => (x.r.compromiso || '9999').localeCompare(y.r.compromiso || '9999'));
    const cont = document.createElement('div'); cont.id = 'lpReporte'; cont.className = 'lpReporte'; cont.setAttribute('role', 'dialog'); cont.setAttribute('aria-label', 'Reporte semanal Last Planner');
    const dato = (t, v, d = '', color = '') => `<div><span>${esc(t)}</span><b${color ? ` style="color:${color}"` : ''}>${v}</b>${d ? `<small>${d}</small>` : ''}</div>`;
    cont.innerHTML = `<div class="lpReporteBarra"><span>Vista previa del reporte · usa «Imprimir» y elige «Guardar como PDF» para compartirlo.</span><button type="button" class="primary" data-imprimir>Imprimir o guardar PDF</button><button type="button" data-cerrar>Cerrar</button></div>
      <article class="lpHoja">
      <div class="lpHojaCabecera"><div><small>HOSPITAL PROVINCIA CORDILLERA · CONTROL DE OBRA</small><h1>Reporte semanal · Last Planner</h1><p>${esc(etiquetaSemana(s))} · ${esc(filtros.piso ? nombrePiso(filtros.piso) : 'Todos los pisos')}</p></div><div class="lpHojaFecha">Emitido el ${fecha(h)}${autorGuardado() ? '<br>por ' + esc(autorGuardado()) : ''}</div></div>
      <div class="lpDatos">${dato(p.abiertas ? 'PPC de la semana (parcial)' : 'PPC de la semana', pct(p.ppc), `${p.cumplidas} de ${p.comprometidas}`, p.abiertas ? '' : colorPct(p.ppc))}${dato('No cumplidas', p.noCumplidas)}${dato('Por cerrar', p.abiertas)}${dato('PPC 4 semanas', pct(M.ppcAcumulado(lista, serie.slice(-4).map(x => x.semana))))}${dato('Restricciones pendientes', rr.pendientes, rr.vencidas ? rr.vencidas + ' vencidas' : '')}${dato('Asistencia reunión', asis ? pct(asis.pct) : '—', reunion ? `${asis.presentes}/${asis.convocados} · ${fecha(reunion.fecha)}` : '')}</div>
      <section class="lpHojaPlano"><h2>Plano · ${esc(nivel.nombre)}</h2><figure><div class="lpPlanoImagen"><p class="obsNota">Dibujando el plano…</p></div><figcaption></figcaption></figure></section>
      <section><h2>Actividades comprometidas</h2>${semana.length ? `<table class="lpHojaTabla"><thead><tr><th>N°</th><th>Actividad</th><th>Ubicación</th><th>Recintos</th><th>Responsable</th><th>Ejecutado</th><th>Estado</th><th>Causa (CNC)</th></tr></thead><tbody>${semana.map(a => `<tr><td><b>${a.n}</b></td><td>${esc(a.actividad)}${a.frente ? `<br><small>${esc(a.frente)}</small>` : ''}</td><td>${esc(nombrePiso(a.level))}<br><small>Sector ${esc(a.sector || '—')}</small></td><td><small>${esc(a.recintos.slice(0, 6).map(r => r.code).join(', '))}${a.recintos.length > 6 ? ` y ${a.recintos.length - 6} más` : ''}</small></td><td>${esc(a.responsable)}</td><td>${a.cantidad == null ? '—' : `${cifra(a.cantidadEjecutada ?? 0)}/${cifra(a.cantidad)} ${esc(a.unidad || '')}`}</td><td><span class="lpPunto" style="--c:${COLOR_ESTADO[a.estado]}"></span>${esc(a.estado)}</td><td>${esc(a.causa || '')}${a.causaNota ? `<br><small>${esc(a.causaNota)}</small>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p>Sin actividades comprometidas en esta semana.</p>'}</section>
      <div class="lpHojaDos"><section><h2>PPC · últimas 8 semanas</h2>${graficoPPC(serie, false)}</section><section><h2>Causas de no cumplimiento</h2>${tablaCausas(cnc)}</section></div>
      <section><h2>Restricciones pendientes</h2>${pendientes.length ? `<table class="lpHojaTabla"><thead><tr><th>Tipo</th><th>Restricción</th><th>Actividad</th><th>Responsable</th><th>Compromiso</th></tr></thead><tbody>${pendientes.slice(0, 40).map(({r, a}) => `<tr><td>${esc(r.tipo)}</td><td>${esc(r.descripcion)}</td><td>${esc(a.actividad)}<br><small>${esc(a.semana ? 'S' + nSemana(a.semana) : 'Intermedio')}</small></td><td>${esc(r.responsable || '—')}</td><td>${M.restriccionVencida(r, h) ? '<b class="obsOverdue">Vencida</b> ' : ''}${fecha(r.compromiso)}</td></tr>`).join('')}</tbody></table>${pendientes.length > 40 ? `<p class="obsNota">Y ${pendientes.length - 40} más.</p>` : ''}` : '<p>Sin restricciones pendientes.</p>'}</section>
      ${reunion ? `<section><h2>Reunión de producción · ${fecha(reunion.fecha)}</h2><p><b>Asistencia:</b> ${reunion.asistentes.map(x => `${esc(x.nombre)}${x.empresa ? ' (' + esc(x.empresa) + ')' : ''} ${x.asistio ? '✓' : '<span class="obsOverdue">✗</span>'}`).join(' · ') || '—'}</p>${tablaFrentes(reunion.frentes)}${reunion.acuerdos.length ? `<h3>Acuerdos</h3><ul>${reunion.acuerdos.map(c => `<li>${c.cumplido ? '✓ ' : ''}${esc(c.texto)}${c.responsable ? ' · ' + esc(c.responsable) : ''}${c.plazo ? ' · ' + fecha(c.plazo) : ''}</li>`).join('')}</ul>` : ''}</section>` : ''}
      <div class="lpFirmas"><div>Jefe de producción</div><div>Administrador de obra</div><div>ITO / Mandante</div></div>
      </article>`;
    document.body.append(cont); document.body.classList.add('lpReporteAbierto');
    const cerrar = () => { cont.remove(); document.body.classList.remove('lpReporteAbierto'); };
    cont.querySelector('[data-cerrar]').onclick = cerrar;
    cont.querySelector('[data-imprimir]').onclick = () => window.print();
    cont.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    cont.querySelector('[data-imprimir]').focus();
    const caja = cont.querySelector('.lpPlanoImagen'), pie = cont.querySelector('.lpHojaPlano figcaption');
    if (!enPlano.length) { caja.innerHTML = `<p class="obsNota">${semana.some(a => a.level === nivel.id) ? 'Las actividades de esta semana no tienen recintos asignados en ' + esc(nivel.nombre) + '.' : 'Sin actividades de esta semana en ' + esc(nivel.nombre) + '. El plano corresponde al piso abierto.'}</p>`; return; }
    try {
      const r = await dibujarPlano(enPlano);
      caja.innerHTML = `<img src="${r.url}" alt="Plano de ${esc(nivel.nombre)} con los recintos de la semana coloreados por estado">`;
      pie.innerHTML = M.ESTADOS_RECINTO.filter(e => r.conteo[e]).map(e => `<span><i style="background:${COLORES_RECINTO[e]}"></i>${esc(e)} <b>${r.conteo[e]}</b></span>`).join('') + `<small>Los números son los de la tabla de actividades. ${r.recintos} recintos.${r.faltan.length ? ' Sin ubicar en el plano: ' + esc(r.faltan.join(', ')) + '.' : ''}${semana.some(a => a.level !== nivel.id) ? ' Las actividades de otros pisos no se dibujan.' : ''}</small>`;
    } catch (e) { caja.innerHTML = `<p class="obsError">${esc(e.message)}</p>`; }
  }

  return {panel, editarActividad, reporte};
}
