// Last Planner System en Control de obra: plan intermedio con restricciones, plan semanal con compromisos y cierre,
// PPC y causas de no cumplimiento, reuniones de producción con asistencia y frentes, rendimientos y reporte con plano.
// Los datos quedan en el equipo (lastplanner-store.mjs) con respaldo JSON; la capa del plano pinta los recintos de una semana.
import {nivel, pisos} from './level.mjs';
import {registerLayer, layerNames} from './layers.mjs';
import {workChart} from './work-charts.mjs';
import * as M from './lastplanner-model.mjs';
import {SUBCONTRATOS} from './subcontratos.mjs';
import {leerActividades, leerReuniones, guardarActividades, eliminarActividad, guardarReunion, eliminarReunion, exportarPlan, importarPlan} from './lastplanner-store.mjs';

export const COLOR_ESTADO = {'Planificada': '#1b2a56', 'En ejecución': '#0f5499', 'Cumplida': '#1a7f37', 'No cumplida': '#c21f1f'};
// «Sin actividades» es blanco: la capa del plano mezcla en modo multiplicar, así que esos recintos quedan sin teñir.
export const COLORES_RECINTO = {'No cumplida': '#c21f1f', 'Con restricción': '#c26a00', 'En ejecución': '#0f5499', 'Planificada': '#1b2a56', 'Cumplida': '#1a7f37', 'Sin actividades': '#ffffff'};
const COLOR_FRENTE = {'Activo': '#1a7f37', 'Detenido': '#c21f1f', 'Sin iniciar': '#29a8df', 'Terminado': '#1b2a56'};
const ACCION = {'En ejecución': 'Iniciar', 'Cumplida': 'Marcar cumplida', 'No cumplida': 'No cumplida', 'Planificada': 'Volver a planificada'};
// Secciones del Last Planner, presentadas como tarjetas al entrar: [id, título, descripción, dibujo].
const SECCIONES = [
  ['resumen', 'Resumen', 'Cumplimiento del plan (PPC) por semana, causas de no cumplimiento y cumplimiento por responsable y sector',
    '<rect x="14" y="14" width="132" height="72" rx="2"/><path d="M14 86h132"/><path class="d" d="M20 36h120"/><path class="f" d="M28 58h14v28H28zM52 42h14v44H52zM76 50h14v36H76zM100 30h14v56h-14z"/><circle class="m" cx="131" cy="66" r="6"/>'],
  ['semanal', 'Plan semanal y rendimientos', 'Compromisos de la semana, dotación recomendada y rendimientos reales por persona',
    '<rect x="14" y="14" width="132" height="72" rx="2"/><path d="M14 28h132M47 14v72M80 14v72M113 14v72"/><path class="f" d="M49 34h29v10H49zM82 50h29v10H82zM115 66h29v10h-29z"/><path class="k" d="M24 38l4 4 8-8M24 55l4 4 8-8"/><circle class="kf" cx="30" cy="72" r="4"/>'],
  ['restricciones', 'Restricciones y reuniones', 'Plan intermedio y puntos de bloqueo, reuniones de producción con asistencia, frentes y acuerdos',
    '<rect x="14" y="14" width="132" height="72" rx="2"/><path d="M80 14v72"/><path class="f" d="M24 26h46v12H24zM24 46h46v12H24zM24 66h46v12H24z"/><path class="k" d="M29 52l4 4 8-8"/><circle class="kf" cx="98" cy="40" r="7"/><circle class="m" cx="118" cy="40" r="7"/><circle class="kf" cx="98" cy="64" r="7"/><circle cx="118" cy="64" r="7"/>']];
const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const fecha = f => f ? f.split('-').reverse().join('-') : '—';
const pct = v => v == null ? '—' : Math.round(v * 100) + ' %';
const cifra = (v, d = 1) => v == null ? '—' : v.toLocaleString('es-CL', {maximumFractionDigits: d});
const nombrePiso = id => pisos.find(p => p.id === id)?.nombre || id;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const nSemana = s => +s.slice(6);
const etiquetaSemana = s => { const {desde, hasta} = M.rangoSemana(s); return `Semana ${nSemana(s)} · ${fecha(desde).slice(0, 5)} al ${fecha(hasta)}`; };
// Verde desde 80 %, ámbar desde 60 %: referencia habitual del PPC en obras que aplican Last Planner.
const colorPct = v => v == null ? '#595959' : v >= .8 ? '#1a7f37' : v >= .6 ? '#b58500' : '#c21f1f';
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
registerLayer('lastplanner', {nombre: 'Last Planner · semana', categories: r => [M.estadoRecinto(cache?.porCodigo?.get(String(r.code).trim()))], color: k => COLORES_RECINTO[k] || '#ffffff', opacity: .55});
export function iniciarCapaLastPlanner(alCambiar) {
  const recargar = () => cargarPlan(true).then(alCambiar).catch(() => {});
  recargar(); window.addEventListener('atlas-lastplanner-changed', recargar);
}

export function createLastPlanner(ctx) {
  const esc = ctx.esc;
  const dialog = document.createElement('dialog'); dialog.className = 'obsDialog lpDialog'; dialog.setAttribute('aria-label', 'Last Planner'); document.body.append(dialog);
  let guardando = false, raiz = null, opciones = {};
  dialog.addEventListener('cancel', e => { if (guardando) e.preventDefault(); });
  // sel: lo elegido en un gráfico de cada sección (filtra su tabla); der: pestaña de la tabla de la derecha.
  const filtros = {semana: M.semanaDe(hoy()), piso: nivel.id, texto: '', sel: {}, der: {semanal: 'actividades', restricciones: 'restricciones'}, estimar: {grupo: 0, cantidad: '', dotacion: ''}};
  const refrescar = () => { if (raiz?.isConnected) panel(raiz, opciones); };
  const delPiso = a => !filtros.piso || a.level === filtros.piso;
  const chip = estado => `<span class="obsChip" style="--c:${COLOR_ESTADO[estado] || COLOR_FRENTE[estado] || '#1b2a56'}">${esc(estado)}</span>`;
  const quien = () => { let v = autorGuardado(); if (!v) { v = (prompt('¿Quién registra este cambio?') || '').trim(); if (v) recordarAutor(v); } return v; };
  const sectores = () => [...new Set([...ctx.rooms().map(r => r.sector), ...(cache?.actividades || []).map(a => a.sector)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', {numeric: true}));
  const responsables = () => [...new Set([...SUBCONTRATOS.map(s => s.nombre), ...(cache?.actividades || []).map(a => a.responsable), ...(cache?.reuniones || []).flatMap(r => [...r.frentes.map(f => f.responsable), ...r.asistentes.map(p => p.empresa)])].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  // Lista de responsables: subcontratos de la obra con su especialidad, otros ya usados en Atlas y «Otro» para escribir uno nuevo.
  function opcionesResponsable(actual) {
    const enCatalogo = new Set(SUBCONTRATOS.map(s => s.nombre)), otros = responsables().filter(r => !enCatalogo.has(r));
    return `<option value="" disabled ${actual ? '' : 'selected'}>Elige el subcontrato…</option><optgroup label="Subcontratos">${SUBCONTRATOS.map(s => `<option value="${esc(s.nombre)}" ${s.nombre === actual ? 'selected' : ''}>${esc(s.etiqueta)}</option>`).join('')}</optgroup>`
      + (otros.length ? `<optgroup label="Otros usados en Atlas">${otros.map(r => `<option ${r === actual ? 'selected' : ''}>${esc(r)}</option>`).join('')}</optgroup>` : '') + '<option value="__otro">Otro (escribir)…</option>';
  }
  // Dotación de la actividad; si con su rendimiento no alcanza en el plazo, se avisa cuántas personas se recomiendan.
  const recomendada = a => M.dotacionRecomendada(a.cantidad, a.rendimientoPlan, M.diasDisponibles(a));
  const dotacionTexto = a => { const r = recomendada(a); return (a.dotacion ? `<br><small>${plural(a.dotacion, 'persona', 'personas')}</small>` : '') + (r && (a.dotacion || 0) < r.personas ? `<br><small class="obsOverdue">Recomendado: ${plural(r.personas, 'persona', 'personas')}</small>` : ''); };
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
    return `<svg viewBox="0 0 ${w} 150" class="lpPPC" role="group" aria-label="PPC por semana"><line x1="${izq}" x2="${w}" y1="37" y2="37" class="meta"/><text x="${izq - 4}" y="40" text-anchor="end" class="meta">80 %</text><line x1="${izq}" x2="${w}" y1="125" y2="125" stroke="#1b2a56"/>${serie.map((s, i) => {
      const alto = (s.ppc ?? 0) * 110, x = izq + i * paso + 6, ancho = paso - 12, attrs = interactivo ? `data-lp-ir-semana="${s.semana}" tabindex="0" role="button"` : '';
      return `<g class="${s.cerrada || !s.comprometidas ? '' : 'abierta'}" ${attrs} aria-label="${esc(etiquetaSemana(s.semana))}: PPC ${pct(s.ppc)}, ${s.cumplidas} de ${s.comprometidas}"><title>${esc(etiquetaSemana(s.semana))} · ${s.cumplidas}/${s.comprometidas}${s.abiertas ? ' · ' + s.abiertas + ' por cerrar' : ''}</title><rect x="${x}" y="15" width="${ancho}" height="110" fill="transparent"/><rect x="${x}" y="${125 - alto}" width="${ancho}" height="${alto}" rx="3" fill="${colorPct(s.ppc)}"/><text x="${x + ancho / 2}" y="${(s.ppc == null ? 125 : 125 - alto) - 5}" text-anchor="middle">${s.ppc == null ? (s.comprometidas ? '' : '—') : Math.round(s.ppc * 100)}</text><text class="eje" x="${x + ancho / 2}" y="142" text-anchor="middle">S${nSemana(s.semana)}</text></g>`;
    }).join('')}</svg>`;
  }
  const tablaCausas = cnc => cnc.length ? `<table class="avanceTabla"><thead><tr><th>Causa</th><th>Veces</th><th>%</th><th>Acumulado</th></tr></thead><tbody>${cnc.map(c => `<tr><td>${esc(c.causa)}</td><td>${c.n}</td><td>${pct(c.pct)}</td><td>${pct(c.acumulado)}</td></tr>`).join('')}</tbody></table>` : '<p class="chartEmpty">Sin actividades no cumplidas en el período.</p>';
  const tablaFrentes = frentes => frentes.length ? `<div class="lpScroll"><table class="avanceTabla"><thead><tr><th>Piso</th><th>Sector</th><th>Frente</th><th>Responsable</th><th>Dotación</th><th>Estado</th></tr></thead><tbody>${frentes.map(f => `<tr><td>${esc(f.level ? nombrePiso(f.level) : '—')}</td><td>${esc(f.sector || '—')}</td><td>${esc(f.frente)}${f.nota ? `<br><small>${esc(f.nota)}</small>` : ''}</td><td>${esc(f.responsable || '—')}</td><td>${f.dotacion ?? '—'}</td><td>${chip(f.estado)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="chartEmpty">Sin frentes registrados. Se registran en cada reunión de producción.</p>';
  const ultimaHasta = (reuniones, s) => M.ultimaReunion(reuniones.filter(r => r.fecha <= M.rangoSemana(s).hasta));

  // ---------- Piezas interactivas: barras que filtran la tabla, tabla con filas que despliegan su detalle ----------
  // Barras seleccionables: tocar una filtra la tabla de la derecha; tocarla de nuevo quita el filtro.
  function barras(items, tipo, vista, {porcentaje = false, vacio = 'Sin registros.'} = {}) {
    if (!items.length) return `<p class="chartEmpty">${esc(vacio)}</p>`;
    const max = Math.max(...items.map(it => it.n || 0), 1), sel = filtros.sel[vista];
    return `<div class="workChartRows lpBarras">${items.map(it => {
      const color = it.color || (porcentaje ? colorPct(it.pct) : '#0f5499'), ancho = porcentaje ? (it.pct ?? 0) * 100 : (it.n || 0) / max * 100;
      return `<button type="button" class="workChartRow lpPctRow" data-lp-sel="${tipo}" data-lp-valor="${esc(it.key)}" data-lp-etiqueta="${esc(it.etiqueta || it.key)}" aria-pressed="${sel?.tipo === tipo && sel.valor === it.key}"><i style="background:${color}"></i><span>${esc(it.etiqueta || it.key)} <small>${esc(it.detalle || '')}</small></span><b>${porcentaje ? pct(it.pct) : esc(String(it.texto ?? it.n))}</b><em class="workBar"><span style="width:${ancho}%;background:${color}"></span></em></button>`;
    }).join('')}</div>`;
  }
  const filtroActivo = vista => { const s = filtros.sel[vista]; return s ? `<p class="lpFiltroActivo">Filtro: <b>${esc(s.etiqueta)}</b> <button type="button" data-lp-quitar-sel>Quitar filtro ×</button></p>` : ''; };
  const pestanas = (vista, opciones) => `<div class="obsStateTabs lpPestanas" role="tablist">${opciones.map(([id, t, n]) => `<button type="button" role="tab" data-lp-der="${id}" aria-pressed="${filtros.der[vista] === id}">${esc(t)} <b>${n}</b></button>`).join('')}</div>`;
  const accionDe = a => a.estado === 'Planificada' ? `<button type="button" data-lp-iniciar="${esc(a.id)}">Iniciar</button>` : a.estado === 'En ejecución' ? `<button type="button" data-lp-act="${esc(a.id)}" data-lp-foco="cierre">Cerrar…</button>` : a.estado === 'No cumplida' && !a.reprogramada ? `<button type="button" data-lp-reprogramar="${esc(a.id)}">Reprogramar</button>` : a.reprogramada ? `<small>Reprogramada a S${nSemana(a.reprogramada)}</small>` : '';
  // Detalle que se despliega al tocar una fila: plazo, avance, rendimiento plan y real, dotación, recintos, restricciones e historial.
  function detalleActividad(a) {
    const r = M.rendimiento(a), rec = recomendada(a), dias = M.diasDisponibles(a), u = esc(a.unidad || ''), dato = (t, v) => v ? `<div><dt>${esc(t)}</dt><dd>${v}</dd></div>` : '';
    return `<div class="lpDetalleAct"><dl>${[
      dato('Ubicación', `${esc(nombrePiso(a.level))} · Sector ${esc(a.sector || '—')}${a.frente ? ' · ' + esc(a.frente) : ''}`),
      dato('Semana y plazo', `${a.semana ? esc(etiquetaSemana(a.semana)) : 'Plan intermedio'}<br>${a.inicioPlan ? `${fecha(a.inicioPlan)} al ${fecha(a.finPlan)}` : 'Sin fechas'}${dias ? ' · ' + plural(dias, 'día hábil', 'días hábiles') : ''}`),
      dato('Avance', a.cantidad == null ? 'Sin cantidad comprometida' : `${cifra(a.cantidadEjecutada ?? 0)} de ${cifra(a.cantidad)} ${u}`),
      dato('Rendimiento por persona al día', `Plan: ${a.rendimientoPlan ? cifra(a.rendimientoPlan, 2) + ' ' + u : '—'} · Real: ${r?.porPersonaDia ? cifra(r.porPersonaDia, 2) + ' ' + u : '—'}`),
      dato('Dotación', `${a.dotacion ? plural(a.dotacion, 'persona', 'personas') : 'Sin dotación'}${rec ? ` · recomendada ${plural(rec.personas, 'persona', 'personas')}` : ''}`),
      dato('Ejecución real', a.inicioReal ? `${fecha(a.inicioReal)} al ${a.finReal ? fecha(a.finReal) : '…'}${r ? ' · ' + plural(r.dias, 'día trabajado', 'días trabajados') : ''}` : 'Sin iniciar'),
      a.causa ? dato('Causa de no cumplimiento', esc(a.causa) + (a.causaNota ? `<br><small>${esc(a.causaNota)}</small>` : '')) : '',
      dato('Recintos', a.recintos.length ? esc(a.recintos.slice(0, 12).map(x => x.code).join(', ')) + (a.recintos.length > 12 ? ` y ${a.recintos.length - 12} más` : '') : 'Sin recintos'),
      dato('Restricciones', a.restricciones.length ? a.restricciones.map(x => `${x.estado === 'Liberada' ? '✓' : M.restriccionVencida(x, hoy()) ? '<b class="obsOverdue">Vencida</b>' : '•'} ${esc(x.tipo)}: ${esc(x.descripcion)}`).join('<br>') : 'Sin restricciones')
    ].join('')}</dl><div class="lpDetalleHist">${a.historial.slice(-3).reverse().map(h => `<small>${new Date(h.at).toLocaleDateString('es-CL')} · ${esc(h.autor)} · ${esc(h.detalle)}</small>`).join('')}</div><div class="lpDetalleAcc"><button type="button" class="primary" data-lp-act="${esc(a.id)}">Abrir y editar</button></div></div>`;
  }
  // Tabla de actividades: cada fila se despliega con su detalle; columna inicial con el N° de la semana o la semana.
  function tablaActividades(lista, {numero = null, conSemana = false, accion = true, vacio = 'Sin actividades.'} = {}) {
    if (!lista.length) return `<p class="obsNota">${esc(vacio)}</p>`;
    const columnas = accion ? 6 : 5;
    return `<div class="obsTableScroll"><table class="lpTabla lpInteractiva"><thead><tr><th>${conSemana ? 'Sem.' : 'N°'}</th><th>Actividad</th><th>Responsable</th><th>Avance</th><th>Estado</th>${accion ? '<th></th>' : ''}</tr></thead><tbody>${lista.map((a, i) => { const pend = M.pendientes(a).length; return `<tr class="lpFilaTabla" data-lp-fila="${esc(a.id)}" tabindex="0" aria-expanded="false"><td data-label="${conSemana ? 'Semana' : 'N°'}"><b>${conSemana ? (a.semana ? 'S' + nSemana(a.semana) : '—') : numero?.get(a.id) ?? i + 1}</b></td>
      <td data-label="Actividad"><b>${esc(a.actividad)}</b><small>${esc(nombrePiso(a.level))} · Sector ${esc(a.sector || '—')}${a.frente ? ' · ' + esc(a.frente) : ''}</small></td><td data-label="Responsable">${esc(a.responsable)}${dotacionTexto(a)}</td>
      <td data-label="Avance">${a.cantidad == null ? '—' : `${cifra(a.cantidadEjecutada ?? 0)} / ${cifra(a.cantidad)} ${esc(a.unidad || '')}`}</td><td data-label="Estado">${chip(a.estado)}${pend && !M.CERRADOS.has(a.estado) ? `<br><small class="obsOverdue">${plural(pend, 'restricción', 'restricciones')}</small>` : ''}${a.causa ? `<br><small>${esc(a.causa)}</small>` : ''}</td>${accion ? `<td data-label="Acción">${accionDe(a)}</td>` : ''}</tr>
      <tr class="lpFilaDetalle" data-lp-detalle="${esc(a.id)}" hidden><td colspan="${columnas}">${detalleActividad(a)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  const columnas = (izquierda, derecha) => `<div class="lpDosCol"><div class="lpIzq">${izquierda}</div><div class="lpDer">${derecha}</div></div>`;
  const porSemanaDesc = (x, y) => (y.semana || '').localeCompare(x.semana || '') || x.actividad.localeCompare(y.actividad, 'es');

  // ---------- Entrada: tres tarjetas, como las de Control de obra ----------
  function vistaSecciones(datos) {
    const lista = datos.actividades.filter(delPiso), s = filtros.semana, p = M.ppcSemana(lista, s), cuatro = M.seriePPC(lista, s, 4).map(x => x.semana), acumulado = M.ppcAcumulado(lista, cuatro);
    const rr = M.resumenRestricciones(lista, hoy()), ultima = M.ultimaReunion(datos.reuniones), rendimientos = M.rendimientosPorActividad(lista).length;
    const estado = {
      resumen: `PPC S${nSemana(s)}: ${pct(p.ppc)}${p.abiertas ? ' parcial' : ''} · 4 semanas: ${pct(acumulado)}`,
      semanal: `S${nSemana(s)} · ${plural(p.comprometidas, 'actividad', 'actividades')} · ${plural(rendimientos, 'rendimiento registrado', 'rendimientos registrados')}`,
      restricciones: `${plural(rr.pendientes, 'restricción pendiente', 'restricciones pendientes')}${rr.vencidas ? ` · ${plural(rr.vencidas, 'vencida', 'vencidas')}` : ''} · ${ultima ? 'última reunión ' + fecha(ultima.fecha) : 'sin reuniones'}`};
    return `<div class="panelGrid lpSecciones">${SECCIONES.map(([id, titulo, texto, dibujo], i) => `<article class="floorCard available panelCard"><button class="floorCardLink" data-lp-ir="${id}"><span class="floorPreview"><svg class="panelArt" viewBox="0 0 160 100" aria-hidden="true">${dibujo}</svg><span class="floorPreviewNumber" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span></span><span class="floorCardInfo"><span><strong class="panelTitle">${titulo}</strong><span class="panelText">${texto}</span></span><span class="floorCardArrow" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 13 13 3M3 3h10v10"/></svg></span></span><span class="floorCardStatus"><i></i>${esc(estado[id])}</span></button></article>`).join('')}</div>`;
  }

  // ---------- Resumen: PPC, estado, causas y cumplimiento → actividades ----------
  function vistaResumen(datos) {
    const lista = datos.actividades.filter(delPiso), s = filtros.semana, p = M.ppcSemana(lista, s), serie = M.seriePPC(lista, s, 8), semanas = serie.map(x => x.semana), cuatro = semanas.slice(-4), sel = filtros.sel.resumen;
    const rr = M.resumenRestricciones(lista, hoy()), reunion = ultimaHasta(datos.reuniones, s), asis = reunion && M.asistencia(reunion), acumulado = M.ppcAcumulado(lista, cuatro);
    const semana = ordenSemana(lista.filter(a => a.semana === s)), numero = new Map(semana.map((a, i) => [a.id, i + 1]));
    const estados = M.ESTADOS.map(e => ({key: e, n: semana.filter(a => a.estado === e).length, color: COLOR_ESTADO[e]}));
    const cnc = M.causas(lista, semanas).map(c => ({key: c.causa, n: c.n, detalle: `${pct(c.pct)} · acumulado ${pct(c.acumulado)}`, color: '#c21f1f'}));
    const cumplimiento = campo => M.cumplimientoPor(lista, campo, cuatro).filter(g => g.cerradas).map(g => ({key: g.key, etiqueta: campo === 'sector' && g.key !== 'Sin sector' ? 'Sector ' + g.key : g.key, pct: g.ppc, detalle: `${g.cumplidas}/${g.cerradas}`}));
    const deCampo = (a, campo) => a[campo] || (campo === 'sector' ? 'Sin sector' : 'Sin responsable');
    let filas = semana, titulo = 'Actividades · ' + etiquetaSemana(s), conSemana = false;
    if (sel?.tipo === 'estado') { filas = semana.filter(a => a.estado === sel.valor); titulo = `${sel.valor} · ${etiquetaSemana(s)}`; }
    else if (sel?.tipo === 'causa') { filas = lista.filter(a => semanas.includes(a.semana) && a.causa === sel.valor).sort(porSemanaDesc); titulo = 'No cumplidas · últimas 8 semanas'; conSemana = true; }
    else if (sel?.tipo === 'responsable' || sel?.tipo === 'sector') { filas = lista.filter(a => cuatro.includes(a.semana) && deCampo(a, sel.tipo) === sel.valor).sort(porSemanaDesc); titulo = 'Actividades · últimas 4 semanas'; conSemana = true; }
    const izquierda = tarjeta('Porcentaje de plan completado (PPC)', '8 semanas', graficoPPC(serie), 'Cumplidas / comprometidas. Verde desde 80 %, ámbar desde 60 %. Toca una semana para ver sus actividades.')
      + workChart({title: 'Estado de la semana', items: estados, kind: 'pie', filter: 'lp:estado', emptyText: 'Sin actividades comprometidas en esta semana.'}, esc)
      + tarjeta('Causas de no cumplimiento', cnc.reduce((n, c) => n + c.n, 0) + ' veces', barras(cnc, 'causa', 'resumen', {vacio: 'Sin actividades no cumplidas en las últimas 8 semanas.'}), 'Pareto de las últimas 8 semanas. Toca una causa.')
      + tarjeta('Cumplimiento por responsable', '4 semanas', barras(cumplimiento('responsable'), 'responsable', 'resumen', {porcentaje: true, vacio: 'Sin actividades cerradas.'}), 'Cumplidas / cerradas. Toca un responsable.')
      + tarjeta('Cumplimiento por sector', '4 semanas', barras(cumplimiento('sector'), 'sector', 'resumen', {porcentaje: true, vacio: 'Sin actividades cerradas.'}), 'Toca un sector.');
    const derecha = `<section class="chartCard lpTablaCard"><div class="chartHeading"><h3>${esc(titulo)}</h3><span>${filas.length}</span></div>${filtroActivo('resumen')}<p class="chartSubtitle">Toca un gráfico para filtrar esta tabla y una fila para ver su detalle.</p>${tablaActividades(filas, {numero, conSemana, accion: false, vacio: 'Sin actividades con este filtro.'})}</section>`;
    return selectorSemana() + `<div class="kpiGrid lpKpis">${[
      // El PPC se mide al cerrar la semana: mientras queden actividades abiertas se muestra parcial y sin color.
      kpi(p.abiertas ? 'PPC de la semana (parcial)' : 'PPC de la semana', pct(p.ppc), p.comprometidas ? `${p.cumplidas} de ${p.comprometidas} cumplidas${p.abiertas ? ` · ${p.abiertas} por cerrar` : ''}` : 'Sin compromisos esta semana', 'semanal', p.abiertas ? '' : colorPct(p.ppc)),
      kpi('PPC últimas 4 semanas', pct(acumulado), 'solo actividades cerradas', '', colorPct(acumulado)),
      kpi('Restricciones pendientes', rr.pendientes, `${rr.vencidas ? `<em class="obsOverdue">${plural(rr.vencidas, 'vencida', 'vencidas')}</em> · ` : ''}${plural(rr.listas, 'actividad lista', 'actividades listas')}, ${plural(rr.bloqueadas, 'bloqueada', 'bloqueadas')}`, 'restricciones', rr.vencidas ? '#c21f1f' : ''),
      kpi('Asistencia a reunión', asis?.pct == null ? '—' : pct(asis.pct), reunion ? `${asis.presentes} de ${asis.convocados} · ${fecha(reunion.fecha)}` : 'Sin reuniones registradas', 'restricciones', asis ? colorPct(asis.pct) : '')].join('')}</div>
      <div class="obsAcciones"><button type="button" data-lp-nueva>+ Nueva actividad</button><button type="button" data-lp-capa>Ver semana en el plano</button><button type="button" class="primary" data-lp-reporte>Reporte con plano</button></div>` + columnas(izquierda, derecha);
  }

  // ---------- Plan semanal y rendimientos ----------
  function vistaSemanal(datos) {
    const s = filtros.semana, todas = ordenSemana(datos.actividades.filter(a => delPiso(a) && a.semana === s)), numero = new Map(todas.map((a, i) => [a.id, i + 1])), sel = filtros.sel.semanal;
    const grupos = M.rendimientosPorActividad(datos.actividades.filter(delPiso)), q = filtros.texto.trim().toLocaleLowerCase('es'), p = M.ppcSemana(todas, s);
    const estados = M.ESTADOS.map(e => ({key: e, n: todas.filter(a => a.estado === e).length, color: COLOR_ESTADO[e]}));
    const porResponsable = [...todas.reduce((m, a) => m.set(a.responsable, [...(m.get(a.responsable) || []), a]), new Map())].map(([key, l]) => {
      const personas = l.reduce((n, a) => n + (a.dotacion || 0), 0), recomendadas = l.reduce((n, a) => n + (recomendada(a)?.personas || 0), 0);
      return {key, n: l.length, detalle: `${plural(personas, 'persona', 'personas')}${recomendadas > personas ? ` · faltan ${recomendadas - personas}` : ''}`, color: recomendadas > personas ? '#c21f1f' : '#0f5499'};
    }).sort((a, b) => b.n - a.n);
    const conRendimiento = grupos.filter(g => g.porPersonaDia).map(g => ({key: g.actividad + '|' + (g.unidad || ''), etiqueta: g.actividad, n: g.porPersonaDia, texto: cifra(g.porPersonaDia, 1) + ' ' + (g.unidad || ''), detalle: plural(g.n, 'registro', 'registros'), color: '#1b2a56'}));
    let filas = todas;
    if (sel?.tipo === 'estado') filas = filas.filter(a => a.estado === sel.valor);
    if (sel?.tipo === 'responsable') filas = filas.filter(a => a.responsable === sel.valor);
    if (q) filas = filas.filter(a => [a.actividad, a.frente, a.responsable, ...a.recintos.map(r => r.code + ' ' + r.name)].join(' ').toLocaleLowerCase('es').includes(q));
    const e = filtros.estimar, g = grupos[e.grupo] || grupos[0], est = g && M.estimarDias(g, Number(e.cantidad), Number(e.dotacion));
    const estimador = grupos.length ? tarjeta('Estimar duración', 'con rendimientos reales', `<div class="obsFiltros lpEstimador"><label>Actividad<select data-lp-est="grupo">${grupos.map((x, i) => `<option value="${i}" ${x === g ? 'selected' : ''}>${esc(x.actividad)}${x.unidad ? ' (' + esc(x.unidad) + ')' : ''}</option>`).join('')}</select></label><label>Cantidad${g.unidad ? ' (' + esc(g.unidad) + ')' : ''}<input type="number" min="0" step="any" data-lp-est="cantidad" value="${esc(e.cantidad)}"></label><label>Dotación<input type="number" min="0" step="1" data-lp-est="dotacion" value="${esc(e.dotacion)}"></label></div><p class="lpLinea" data-lp-estimacion>${textoEstimacion(g, est)}</p>`) : '';
    const izquierda = workChart({title: 'Estado de la semana', items: estados, kind: 'pie', filter: 'lp:estado', emptyText: 'Sin actividades comprometidas en esta semana.'}, esc)
      + tarjeta('Actividades por responsable', 'esta semana', barras(porResponsable, 'responsable', 'semanal', {vacio: 'Sin actividades esta semana.'}), 'En rojo, si la dotación no alcanza lo recomendado. Toca uno para filtrar.')
      + tarjeta('Rendimiento real por persona al día', plural(conRendimiento.length, 'actividad', 'actividades'), barras(conRendimiento, 'rendimiento', 'semanal', {vacio: 'Aún sin trabajos con cantidad, dotación y fechas reales.'}), 'Promedio ponderado de lo ejecutado. Toca uno para ver sus registros.')
      + estimador;
    const desvio = v => v == null ? '—' : `<span style="color:${v > .1 ? '#c21f1f' : v < -.1 ? '#1a7f37' : 'inherit'}">${v > 0 ? '+' : ''}${Math.round(v * 100)} %</span>`;
    const tablaRendimientos = grupos.length ? `<div class="obsTableScroll"><table class="lpTabla lpInteractiva"><thead><tr><th>Actividad</th><th>Registros</th><th>Por persona-día</th><th>Por día</th><th>Desvío de plazo</th></tr></thead><tbody>${grupos.map(x => { const clave = x.actividad + '|' + (x.unidad || ''), abierta = sel?.tipo === 'rendimiento' && sel.valor === clave; return `<tr class="lpFilaTabla" data-lp-fila="g:${esc(clave)}" tabindex="0" aria-expanded="${abierta}"><td data-label="Actividad"><b>${esc(x.actividad)}</b><small>${cifra(x.cantidad)} ${esc(x.unidad || '')} en ${cifra(x.dias)} días</small></td><td data-label="Registros">${x.n}</td><td data-label="Por persona-día"><b>${cifra(x.porPersonaDia, 2)}</b> ${esc(x.unidad || '')}</td><td data-label="Por día">${cifra(x.porDia, 2)} ${esc(x.unidad || '')}</td><td data-label="Desvío de plazo">${desvio(x.desvio)}</td></tr>
      <tr class="lpFilaDetalle" data-lp-detalle="g:${esc(clave)}" ${abierta ? '' : 'hidden'}><td colspan="5"><table class="avanceTabla"><thead><tr><th>Semana</th><th>Responsable</th><th>Real</th><th>Cantidad</th><th>Dotación</th><th>Por persona-día</th></tr></thead><tbody>${x.registros.map(({a, r}) => `<tr><td>S${a.semana ? nSemana(a.semana) : '—'}</td><td>${esc(a.responsable)}</td><td>${fecha(a.inicioReal)} – ${fecha(a.finReal)}</td><td>${cifra(r.cantidad)}</td><td>${a.dotacion ?? '—'}</td><td>${cifra(r.porPersonaDia, 2)}</td></tr>`).join('')}</tbody></table></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="obsNota">Aún no hay trabajos con cantidad ejecutada e inicio y término real. Al cerrar una actividad registra la cantidad, la dotación y las fechas.</p>';
    const der = filtros.der.semanal;
    const derecha = `<section class="chartCard lpTablaCard">${pestanas('semanal', [['actividades', 'Actividades de la semana', todas.length], ['rendimientos', 'Rendimientos', grupos.length]])}${der === 'rendimientos' ? `<p class="chartSubtitle">Cantidad ejecutada ÷ días trabajados, ponderado por actividad. Toca una fila para ver sus registros.</p>${tablaRendimientos}`
      : `${filtroActivo('semanal')}<div class="obsFiltros lpBuscar"><label>Buscar<input data-lp-f="texto" value="${esc(filtros.texto)}" placeholder="Actividad, frente, recinto o responsable"></label></div>${tablaActividades(filas, {numero, vacio: todas.length ? 'Sin actividades con este filtro.' : 'No hay actividades comprometidas en esta semana. Créalas aquí o comprométela desde Restricciones y reuniones.'})}`}</section>`;
    return selectorSemana() + `<p class="lpLinea"><b style="color:${p.abiertas ? 'inherit' : colorPct(p.ppc)}">PPC ${pct(p.ppc)}${p.abiertas ? ' parcial' : ''}</b> · ${plural(p.cumplidas, 'cumplida', 'cumplidas')} · ${plural(p.noCumplidas, 'no cumplida', 'no cumplidas')} · ${p.abiertas} por cerrar · ${plural(p.comprometidas, 'comprometida', 'comprometidas')}</p>
      <div class="obsAcciones"><button type="button" class="primary" data-lp-nueva>+ Nueva actividad</button><button type="button" data-lp-ir="restricciones">Comprometer desde el intermedio</button><button type="button" data-lp-capa>Ver en el plano</button><button type="button" data-lp-reporte>Reporte con plano</button><button type="button" data-lp-csv ${todas.length ? '' : 'disabled'}>Exportar CSV</button></div>` + columnas(izquierda, derecha);
  }
  const textoEstimacion = (g, d) => d ? `<b>${cifra(d)} días hábiles</b> · con ${g.porPersonaDia && Number(filtros.estimar.dotacion) > 0 ? cifra(g.porPersonaDia, 2) + ' ' + esc(g.unidad || '') + ' por persona al día' : cifra(g.porDia, 2) + ' ' + esc(g.unidad || '') + ' por día'} (${plural(g.n, 'registro', 'registros')})` : 'Indica la cantidad (y la dotación si la conoces) para estimar los días.';

  // ---------- Restricciones y reuniones: plan intermedio, puntos de bloqueo, asistencia, frentes y acuerdos ----------
  function vistaRestricciones(datos) {
    const h = hoy(), s0 = filtros.semana, lista = datos.actividades.filter(delPiso), rr = M.resumenRestricciones(lista, h), sel = filtros.sel.restricciones, der = filtros.der.restricciones;
    const ventana = Array.from({length: 6}, (_, i) => M.moverSemana(s0, i)), planificadas = lista.filter(a => a.estado === 'Planificada' && (!a.semana || ventana.includes(a.semana)));
    const gruposIntermedio = [[null, 'Sin semana asignada'], ...ventana.map(s => [s, etiquetaSemana(s)])].map(([s, t]) => [t, ordenSemana(planificadas.filter(a => a.semana === s))]).filter(g => g[1].length);
    const todasR = lista.filter(a => !M.CERRADOS.has(a.estado)).flatMap(a => a.restricciones.map(r => ({r, a})));
    const estadoR = x => x.r.estado === 'Liberada' ? 'Liberadas' : M.restriccionVencida(x.r, h) ? 'Vencidas' : 'Pendientes por vencer';
    const estadosR = [['Vencidas', '#c21f1f'], ['Pendientes por vencer', '#c26a00'], ['Liberadas', '#1a7f37']].map(([key, color]) => ({key, n: todasR.filter(x => estadoR(x) === key).length, color}));
    const porTipo = rr.porTipo.map(([key, n]) => ({key, n, color: '#c26a00'}));
    let restricciones = todasR.filter(x => sel?.tipo === 'estadoRestriccion' ? estadoR(x) === sel.valor : sel?.tipo === 'tipoRestriccion' ? x.r.tipo === sel.valor && x.r.estado === 'Pendiente' : x.r.estado === 'Pendiente');
    restricciones = restricciones.sort((x, y) => (x.r.compromiso || '9999').localeCompare(y.r.compromiso || '9999'));
    const reuniones = [...datos.reuniones].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creada.localeCompare(a.creada)), ultima = reuniones[0], asis = ultima && M.asistencia(ultima);
    const vistos = new Set(), acuerdos = [];
    // Un acuerdo pasa de reunión en reunión hasta cumplirse: manda su registro más reciente.
    for (const r of reuniones) for (const c of r.acuerdos) { const k = c.texto.trim().toLocaleLowerCase('es') + '|' + (c.responsable || ''); if (vistos.has(k)) continue; vistos.add(k); if (!c.cumplido) acuerdos.push({...c, reunion: r}); }
    const porEmpresa = M.asistenciaPor(reuniones.slice(0, 8)).map(g => ({key: g.key, pct: g.pct, detalle: `${g.presente}/${g.convocado}`}));
    const frentes = ultima?.frentes || [];
    const izquierda = workChart({title: 'Estado de las restricciones', items: estadosR, kind: 'pie', filter: 'lp:estadoRestriccion', emptyText: 'Sin restricciones registradas en actividades abiertas.'}, esc)
      + tarjeta('Restricciones pendientes por tipo', rr.pendientes, barras(porTipo, 'tipoRestriccion', 'restricciones', {vacio: 'Sin restricciones pendientes.'}), 'Toca un tipo para ver cuáles son.')
      + tarjeta('Asistencia por empresa', 'últimas 8 reuniones', barrasPct(porEmpresa), 'Presentes / convocados.')
      + tarjeta('Frentes de trabajo', ultima ? fecha(ultima.fecha) : '—', tablaFrentes(frentes), 'Estado y dotación según la última reunión.');
    const filaRestriccion = ({r, a}) => `<tr class="lpFilaTabla" data-lp-fila="${esc(a.id)}" tabindex="0" aria-expanded="false"><td data-label="Restricción"><b>${esc(r.tipo)}</b><small>${esc(r.descripcion)}</small></td><td data-label="Actividad">${esc(a.actividad)}<small>${esc(a.semana ? etiquetaSemana(a.semana) : 'Plan intermedio')}</small></td><td data-label="Responsable">${esc(r.responsable || '—')}</td><td data-label="Compromiso">${r.estado === 'Liberada' ? `Liberada ${fecha(r.liberada)}` : `${M.restriccionVencida(r, h) ? '<b class="obsOverdue">Vencida</b><br>' : ''}${fecha(r.compromiso)}`}</td><td data-label="Acción"><button type="button" data-lp-liberar="${esc(a.id)}|${esc(r.id)}">${r.estado === 'Liberada' ? 'Reabrir' : 'Liberar'}</button></td></tr>
      <tr class="lpFilaDetalle" data-lp-detalle="${esc(a.id)}" hidden><td colspan="5">${detalleActividad(a)}</td></tr>`;
    const filaIntermedio = a => { const pend = M.pendientes(a), vencidas = pend.filter(r => M.restriccionVencida(r, h)).length; return `<tr class="lpFilaTabla" data-lp-fila="${esc(a.id)}" tabindex="0" aria-expanded="false"><td data-label="Actividad"><b>${esc(a.actividad)}</b><small>${esc(nombrePiso(a.level))} · Sector ${esc(a.sector || '—')}</small></td><td data-label="Responsable">${esc(a.responsable)}</td><td data-label="Restricciones">${pend.length ? `<span class="obsChip" style="--c:${vencidas ? '#c21f1f' : '#c26a00'}">${plural(pend.length, 'pendiente', 'pendientes')}</span>` : '<span class="obsChip" style="--c:#1a7f37">Liberada</span>'}</td><td data-label="Comprometer">${a.semana ? `<small>S${nSemana(a.semana)}</small>` : `<button type="button" data-lp-comprometer="${esc(a.id)}">Comprometer en S${nSemana(s0)}</button>`}</td></tr>
      <tr class="lpFilaDetalle" data-lp-detalle="${esc(a.id)}" hidden><td colspan="4">${detalleActividad(a)}</td></tr>`; };
    const filaReunion = r => { const a = M.asistencia(r); return `<tr class="lpFilaTabla" data-lp-fila="r:${esc(r.id)}" tabindex="0" aria-expanded="false"><td data-label="Fecha"><b>${fecha(r.fecha)}</b><small>S${nSemana(M.semanaDe(r.fecha))}</small></td><td data-label="Reunión">${esc(r.tipo)}<small>${esc(r.lugar || '')}</small></td><td data-label="Asistencia"><b style="color:${colorPct(a.pct)}">${pct(a.pct)}</b><small>${a.presentes} de ${a.convocados}</small></td><td data-label="Acuerdos">${r.acuerdos.length}<small>${r.acuerdos.filter(c => !c.cumplido).length} pendientes</small></td></tr>
      <tr class="lpFilaDetalle" data-lp-detalle="r:${esc(r.id)}" hidden><td colspan="4"><div class="lpDetalleAct"><dl><div><dt>Presentes</dt><dd>${esc(r.asistentes.filter(x => x.asistio).map(x => x.nombre + (x.empresa ? ' (' + x.empresa + ')' : '')).join(', ') || '—')}</dd></div><div><dt>Ausentes</dt><dd>${esc(r.asistentes.filter(x => !x.asistio).map(x => x.nombre + (x.empresa ? ' (' + x.empresa + ')' : '')).join(', ') || '—')}</dd></div><div><dt>Frentes</dt><dd>${r.frentes.map(f => `${esc(f.frente)} · ${esc(f.estado)}${f.dotacion != null ? ' · ' + plural(f.dotacion, 'persona', 'personas') : ''}`).join('<br>') || '—'}</dd></div><div><dt>Acuerdos</dt><dd>${r.acuerdos.map(c => `${c.cumplido ? '✓' : '•'} ${esc(c.texto)}${c.responsable ? ' · ' + esc(c.responsable) : ''}${c.plazo ? ' · ' + fecha(c.plazo) : ''}`).join('<br>') || '—'}</dd></div></dl><div class="lpDetalleAcc"><button type="button" class="primary" data-lp-reunion="${esc(r.id)}">Abrir y editar</button></div></div></td></tr>`; };
    const tabla = (cabeza, filas, vacio) => filas ? `<div class="obsTableScroll"><table class="lpTabla lpInteractiva lpTablaCorta"><thead><tr>${cabeza.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div>` : `<p class="obsNota">${vacio}</p>`;
    const contenido = {
      restricciones: filtroActivo('restricciones') + tabla(['Restricción', 'Actividad', 'Responsable', 'Compromiso', ''], restricciones.map(filaRestriccion).join(''), 'Sin restricciones con este filtro.'),
      intermedio: `<p class="chartSubtitle">Seis semanas desde la S${nSemana(s0)}. Libera las restricciones antes de comprometer.</p>` + (gruposIntermedio.length ? gruposIntermedio.map(([t, l]) => `<h4 class="lpGrupo">${esc(t)} <small>${l.length}</small></h4>` + tabla(['Actividad', 'Responsable', 'Restricciones', 'Semana'], l.map(filaIntermedio).join(''), '')).join('') : '<p class="obsNota">Sin actividades planificadas en las próximas 6 semanas.</p>'),
      reuniones: tabla(['Fecha', 'Reunión', 'Asistencia', 'Acuerdos'], reuniones.map(filaReunion).join(''), 'Registra la reunión semanal de producción: asistencia, frentes de trabajo y acuerdos.')
        + (acuerdos.length ? `<h4 class="lpGrupo">Acuerdos pendientes <small>${acuerdos.length}</small></h4><ul class="lpAcuerdos">${acuerdos.map(c => `<li><b>${esc(c.texto)}</b><small>${esc(c.responsable || 'Sin responsable')}${c.plazo ? ' · plazo ' + fecha(c.plazo) + (c.plazo < h ? ' <em class="obsOverdue">vencido</em>' : '') : ''} · reunión del ${fecha(c.reunion.fecha)}</small></li>`).join('')}</ul>` : '')};
    const derecha = `<section class="chartCard lpTablaCard">${pestanas('restricciones', [['restricciones', 'Restricciones', restricciones.length], ['intermedio', 'Plan intermedio', planificadas.length], ['reuniones', 'Reuniones', reuniones.length]])}${contenido[der] || contenido.restricciones}</section>`;
    return selectorSemana() + `<div class="kpiGrid lpKpis">${[
      kpi('Restricciones pendientes', rr.pendientes, rr.vencidas ? `<em class="obsOverdue">${plural(rr.vencidas, 'vencida', 'vencidas')}</em> · ${rr.liberadas} liberadas` : `${rr.liberadas} liberadas`, '', rr.vencidas ? '#c21f1f' : ''),
      kpi('Actividades del intermedio', `${rr.listas} / ${rr.listas + rr.bloqueadas}`, `${plural(rr.listas, 'lista', 'listas')} para comprometer · ${plural(rr.bloqueadas, 'bloqueada', 'bloqueadas')}`, '', rr.bloqueadas ? '#c26a00' : '#1a7f37'),
      kpi('Asistencia a la última reunión', asis?.pct == null ? '—' : pct(asis.pct), ultima ? `${asis.presentes} de ${asis.convocados} · ${fecha(ultima.fecha)}` : 'Sin reuniones registradas', '', asis ? colorPct(asis.pct) : ''),
      kpi('Acuerdos pendientes', acuerdos.length, 'sin marcar como cumplidos', '', acuerdos.length ? '#c26a00' : '')].join('')}</div>
      <div class="obsAcciones"><button type="button" class="primary" data-lp-nueva="intermedio">+ Actividad al intermedio</button><button type="button" data-lp-nueva-reunion>+ Nueva reunión</button><span class="obsNota">La nueva reunión trae los convocados, frentes y acuerdos pendientes de la anterior.</span></div>` + columnas(izquierda, derecha);
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
    const seccion = SECCIONES.find(([id]) => id === opts.vista), vista = seccion?.[0] || null;
    const cuerpo = vista ? {resumen: vistaResumen, semanal: vistaSemanal, restricciones: vistaRestricciones}[vista](datos) : vistaSecciones(datos);
    root.innerHTML = `<div class="documentaryIntro lpIntro"><div>${vista ? '<button type="button" class="lpVolver" data-lp-secciones>← Secciones del Last Planner</button>' : ''}<h2>Last Planner${vista ? ' · ' + esc(seccion[1]) : ''}</h2><p>${vista ? esc(seccion[2]) + '.' : 'Plan de producción de la obra. Elige una sección.'} Se guarda en este equipo; respáldalo para pasarlo a otro.</p></div>
      <div class="lpBarra"><label>Piso<select data-lp-piso><option value="">Todos los pisos</option>${pisos.map(p => `<option value="${esc(p.id)}" ${filtros.piso === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label><button type="button" data-lp-respaldo ${datos.actividades.length || datos.reuniones.length ? '' : 'disabled'}>Respaldo JSON</button><label class="obsImportar">Importar respaldo<input type="file" accept=".json,application/json" data-lp-importar></label></div></div>
      ${vista ? `<div class="workTabs lpTabsSeccion">${SECCIONES.map(([id, t]) => `<button type="button" data-lp-ir="${id}" aria-pressed="${vista === id}">${esc(t)}</button>`).join('')}</div>` : ''}${cuerpo}`;
    const on = (sel, fn, evento = 'click') => root.querySelectorAll(sel).forEach(el => el.addEventListener(evento, e => fn(el, e)));
    on('[data-lp-semana]', b => { const n = +b.dataset.lpSemana; filtros.semana = n ? M.moverSemana(filtros.semana, n) : M.semanaDe(hoy()); refrescar(); });
    on('[data-lp-piso]', s => { filtros.piso = s.value; filtros.sel = {}; refrescar(); }, 'change');
    on('[data-lp-ir]', b => opts.irA?.(b.dataset.lpIr));
    on('[data-lp-secciones]', () => opts.irA?.(null));
    // Interacción de los gráficos: la semana del PPC, las porciones de las tortas y las barras filtran la tabla de la derecha.
    on('[data-lp-ir-semana]', g => { filtros.semana = g.dataset.lpIrSemana; filtros.sel[vista] = null; refrescar(); });
    root.querySelectorAll('[data-lp-ir-semana], [data-work-filter^="lp:"]').forEach(g => g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.dispatchEvent(new Event('click')); } }));
    const elegir = (tipo, valor, etiqueta) => { const actual = filtros.sel[vista]; filtros.sel[vista] = actual?.tipo === tipo && actual.valor === valor ? null : {tipo, valor, etiqueta}; if (tipo === 'rendimiento') filtros.der.semanal = 'rendimientos'; else if (vista === 'semanal') filtros.der.semanal = 'actividades'; if (vista === 'restricciones') filtros.der.restricciones = 'restricciones'; refrescar(); };
    on('[data-lp-sel]', b => elegir(b.dataset.lpSel, b.dataset.lpValor, b.dataset.lpEtiqueta));
    on('[data-work-filter^="lp:"]', g => { const tipo = g.dataset.workFilter.slice(3), valor = g.dataset.workState; elegir(tipo, valor, valor); });
    on('[data-lp-quitar-sel]', () => { filtros.sel[vista] = null; refrescar(); });
    on('[data-lp-der]', b => { filtros.der[vista] = b.dataset.lpDer; refrescar(); });
    // Una fila se despliega con su detalle; los botones de la fila hacen su propia acción.
    const desplegar = fila => { const detalle = root.querySelector(`[data-lp-detalle="${CSS.escape(fila.dataset.lpFila)}"]`); if (!detalle) return; detalle.hidden = !detalle.hidden; fila.setAttribute('aria-expanded', String(!detalle.hidden)); fila.classList.toggle('lpFilaAbierta', !detalle.hidden); };
    on('[data-lp-fila]', (fila, e) => { if (!e.target.closest('button, a, input, select, label')) desplegar(fila); });
    root.querySelectorAll('[data-lp-fila]').forEach(fila => fila.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === fila) { e.preventDefault(); desplegar(fila); } }));
    root.querySelectorAll('[data-lp-fila][aria-expanded="true"]').forEach(f => f.classList.add('lpFilaAbierta'));
    on('[data-lp-nueva]', b => editarActividad(null, {semana: b.dataset.lpNueva === 'intermedio' ? null : filtros.semana}));
    on('[data-lp-act]', b => editarActividad(datos.actividades.find(a => a.id === b.dataset.lpAct), {foco: b.dataset.lpFoco}));
    root.querySelectorAll('[data-lp-f]').forEach(c => { let espera; const aplicar = () => { filtros[c.dataset.lpF] = c.value; refrescar(); }; c.oninput = () => { clearTimeout(espera); espera = setTimeout(aplicar, 250); }; });
    if (foco) { const campo = root.querySelector(`[data-lp-f="${foco}"]`); campo?.focus({preventScroll: true}); if (campo?.setSelectionRange) campo.setSelectionRange(campo.value.length, campo.value.length); }
    on('[data-lp-capa]', () => { semanaCapa = filtros.semana; indexar(); opts.pintarCapa?.('lastplanner'); });
    on('[data-lp-reporte]', () => reporte());
    on('[data-lp-csv]', () => exportarCSV(datos));
    on('[data-lp-iniciar]', b => { const a = datos.actividades.find(x => x.id === b.dataset.lpIniciar), autor = quien(); if (!a || !autor) return; try { guardar([{actividad: M.cambiarEstado(a, 'En ejecución', {}, {autor, hoy: hoy()}), versionEsperada: a.version}], 'Actividad iniciada hoy.'); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-reprogramar]', b => { const a = datos.actividades.find(x => x.id === b.dataset.lpReprogramar), autor = quien(); if (!a || !autor) return; const actual = M.semanaDe(hoy()), siguiente = M.moverSemana(a.semana, 1), destino = siguiente > actual ? siguiente : actual; try { const r = M.reprogramar(a, destino, {id: crypto.randomUUID(), autor}); guardar([{actividad: r.original, versionEsperada: a.version}, {actividad: r.nueva, versionEsperada: 0}], `Saldo reprogramado en la semana ${nSemana(destino)}.`); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-comprometer]', b => { const a = datos.actividades.find(x => x.id === b.dataset.lpComprometer), autor = quien(); if (!a || !autor) return; if (M.pendientes(a).length && !confirm(`«${a.actividad}» tiene ${M.pendientes(a).length} restricciones pendientes. En Last Planner solo se compromete lo liberado. ¿Comprometerla igual?`)) return; try { guardar([{actividad: M.editarActividad(a, {...a, semana: filtros.semana, ...M.ajustarFechasASemana(a, filtros.semana)}, {autor}), versionEsperada: a.version}], `Comprometida en la semana ${nSemana(filtros.semana)}.`); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-liberar]', b => { const [id, rid] = b.dataset.lpLiberar.split('|'), a = datos.actividades.find(x => x.id === id), autor = quien(); if (!a || !autor) return; try { guardar([{actividad: M.liberarRestriccion(a, rid, {autor, fecha: hoy()}), versionEsperada: a.version}], 'Restricción actualizada.'); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-nueva-reunion]', () => editarReunion(null));
    on('[data-lp-reunion]', b => editarReunion(datos.reuniones.find(r => r.id === b.dataset.lpReunion)));
    root.querySelectorAll('[data-lp-est]').forEach(c => c.addEventListener(c.tagName === 'SELECT' ? 'change' : 'input', () => { filtros.estimar[c.dataset.lpEst] = c.tagName === 'SELECT' ? +c.value : c.value; if (c.tagName === 'SELECT') refrescar(); else { const lista = M.rendimientosPorActividad(datos.actividades.filter(delPiso)), g = lista[filtros.estimar.grupo] || lista[0]; root.querySelector('[data-lp-estimacion]').innerHTML = textoEstimacion(g, g && M.estimarDias(g, Number(filtros.estimar.cantidad), Number(filtros.estimar.dotacion))); } }));
    on('[data-lp-respaldo]', async () => { try { ctx.download(new Blob([JSON.stringify(await exportarPlan())], {type: 'application/json'}), `last-planner_${hoy()}.json`); } catch (e) { ctx.toast(e.message); } });
    on('[data-lp-importar]', async input => { try { const f = input.files[0]; if (!f) return; const n = await importarPlan(JSON.parse(await f.text())); ctx.toast(`Respaldo importado: ${n} registros nuevos.`); refrescar(); } catch (e) { ctx.toast(e.message); } }, 'change');
  }

  function exportarCSV(datos) {
    const s = filtros.semana, lista = ordenSemana(datos.actividades.filter(a => delPiso(a) && a.semana === s)), celda = v => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const campos = ['N°', 'Semana', 'Piso', 'Sector', 'Frente', 'Actividad', 'Responsable', 'Recintos', 'Cantidad', 'Unidad', 'Ejecutado', 'Rendimiento por persona al día', 'Dotación', 'Dotación recomendada', 'Inicio plan', 'Término plan', 'Inicio real', 'Término real', 'Días trabajados', 'HH', 'Estado', 'Causa de no cumplimiento', 'Restricciones pendientes'];
    const filas = lista.map((a, i) => [i + 1, s, nombrePiso(a.level), a.sector, a.frente, a.actividad, a.responsable, a.recintos.map(r => r.code).join(', '), a.cantidad, a.unidad, a.cantidadEjecutada, a.rendimientoPlan, a.dotacion, recomendada(a)?.personas, a.inicioPlan, a.finPlan, a.inicioReal, a.finReal, a.diasReales, a.hh, a.estado, a.causa, M.pendientes(a).map(r => r.tipo + ': ' + r.descripcion).join(' | ')]);
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
    // Una actividad nueva en una semana parte de lunes a viernes de esa semana.
    const fechas = act ? {inicioPlan: act.inicioPlan, finPlan: act.finPlan} : sem ? {inicioPlan: M.lunesDe(sem), finPlan: M.sumarDias(M.lunesDe(sem), 4)} : {inicioPlan: null, finPlan: null};
    dialog.classList.remove('lpAncho');
    dialog.innerHTML = `<form class="obsForm lpForm" novalidate>
      <header><div><small>LAST PLANNER · ${esc(nombrePiso(level).toUpperCase())}${sem ? ' · ' + esc(etiquetaSemana(sem).toUpperCase()) : ' · PLAN INTERMEDIO'}</small><h2>${act ? esc(act.actividad) : 'Nueva actividad'}</h2>${act ? chip(act.estado) + (act.origen ? ' <small class="obsNota">Reprogramada de otra semana</small>' : '') : ''}</div><button type="button" class="obsCerrar" aria-label="Cerrar">×</button></header>
      <div class="obsCuerpo">
      <label>Actividad *<input name="actividad" list="lpNombres" maxlength="200" required value="${esc(act?.actividad || '')}" placeholder="Ej.: Pintura asepsia media, segunda mano"></label>${datalist('lpNombres', nombres)}
      <div class="obsCampos">
        <label>Piso<select name="level" ${act?.recintos.length ? 'disabled' : ''}>${pisos.map(p => `<option value="${esc(p.id)}" ${p.id === level ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
        <label>Sector<input name="sector" list="lpSectores" maxlength="60" value="${esc(act?.sector || '')}" placeholder="Ej.: A">${datalist('lpSectores', sectores())}</label>
        <label>Frente o ubicación<input name="frente" maxlength="200" value="${esc(act?.frente || '')}" placeholder="Ej.: Pasillo ejes 5-7"></label>
        <label>Responsable *<select name="responsable" required>${opcionesResponsable(act?.responsable || '')}</select><input name="responsableOtro" maxlength="160" placeholder="Nombre del subcontrato o cuadrilla" hidden></label>
        <label class="lpAncho2">Semana<select name="semana" ${act && M.CERRADOS.has(act.estado) ? 'disabled' : ''}><option value="">Plan intermedio (sin comprometer)</option>${opcionesSemana.map(s => `<option value="${s}" ${s === sem ? 'selected' : ''}>${esc(etiquetaSemana(s))}${s === actual ? ' (en curso)' : ''}</option>`).join('')}</select><small class="lpNotaSemana" data-lp-nota-semana></small></label>
        <label>Inicio planificado<input name="inicioPlan" type="date" value="${esc(fechas.inicioPlan || '')}"></label>
        <label>Término planificado<input name="finPlan" type="date" value="${esc(fechas.finPlan || '')}"></label>
        <label>Cantidad comprometida<input name="cantidad" type="number" min="0" step="any" value="${act?.cantidad ?? ''}"></label>
        <label>Unidad<input name="unidad" list="lpUnidades" maxlength="20" value="${esc(act?.unidad || '')}" placeholder="m², m, un…">${datalist('lpUnidades', M.UNIDADES)}</label>
        <label><span>Rendimiento por persona al día <span data-lp-unidad-rendimiento></span></span><input name="rendimientoPlan" type="number" min="0" step="any" value="${act?.rendimientoPlan ?? ''}" placeholder="Ej.: 10"></label>
        <label>Dotación (personas)<input name="dotacion" type="number" min="0" step="1" value="${act?.dotacion ?? ''}"></label>
        <div class="lpRecomendacion lpAncho2" data-lp-recomendacion role="status" aria-live="polite"></div>
      </div>${datalist('lpResponsables', responsables())}
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

    // Responsable: «Otro» abre un campo para escribir un subcontrato o cuadrilla que no está en la lista.
    form.responsable.onchange = () => { form.responsableOtro.hidden = form.responsable.value !== '__otro'; if (!form.responsableOtro.hidden) form.responsableOtro.focus(); };
    // Semana y fechas: las fechas quedan limitadas a la semana elegida y se mueven con ella al cambiarla.
    const semanaElegida = () => form.semana.disabled ? act.semana : form.semana.value || null, ini = form.inicioPlan, fin = form.finPlan;
    function limitesSemana() {
      const s = semanaElegida(), nota = form.querySelector('[data-lp-nota-semana]');
      if (s) { const {desde, hasta} = M.rangoSemana(s); for (const c of [ini, fin]) { c.min = desde; c.max = hasta; } nota.textContent = `Las fechas planificadas van del lunes ${fecha(desde)} al domingo ${fecha(hasta)}. Si el trabajo dura más, divídelo por semana.`; }
      else { for (const c of [ini, fin]) { c.removeAttribute('min'); c.removeAttribute('max'); } nota.textContent = 'Sin semana, las fechas son libres: es el plan intermedio.'; }
    }
    form.semana.addEventListener('change', () => {
      const s = semanaElegida();
      if (s && (ini.value || fin.value)) { const f = M.ajustarFechasASemana({inicioPlan: ini.value || null, finPlan: fin.value || null}, s); ini.value = f.inicioPlan || ''; fin.value = f.finPlan || ''; }
      else if (s) { ini.value = M.lunesDe(s); fin.value = M.sumarDias(M.lunesDe(s), 4); }
      limitesSemana(); recomendar();
    });
    ini.addEventListener('change', () => { if (ini.value && fin.value && fin.value < ini.value) fin.value = ini.value; recomendar(); });
    fin.addEventListener('change', recomendar);
    // Dotación recomendada con el rendimiento por persona al día, y el rendimiento real si Atlas ya lo tiene registrado.
    const grupos = M.rendimientosPorActividad(datos.actividades), clave = t => String(t || '').trim().toLocaleLowerCase('es').replace(/\s+/g, ' ');
    function recomendar() {
      const caja = form.querySelector('[data-lp-recomendacion]'), u = form.unidad.value.trim(), ut = esc(u || 'unidades');
      form.querySelector('[data-lp-unidad-rendimiento]').textContent = u ? `(${u})` : '';
      const cantidad = Number(form.cantidad.value), rendimiento = Number(form.rendimientoPlan.value), dotacion = Number(form.dotacion.value), s = semanaElegida();
      const dias = M.diasHabiles(ini.value, fin.value) || (s ? 5 : null), r = M.dotacionRecomendada(cantidad, rendimiento, dias);
      const real = grupos.find(g => g.porPersonaDia && clave(g.actividad) === clave(form.actividad.value) && (g.unidad || '') === u);
      let html = r ? `<p><b>Dotación recomendada: ${plural(r.personas, 'persona', 'personas')}</b> para ${cifra(cantidad)} ${ut} en ${plural(dias, 'día hábil', 'días hábiles')}, a ${cifra(rendimiento, 2)} ${ut} por persona al día. Con ${plural(r.personas, 'persona', 'personas')} se termina en ${cifra(r.diasNecesarios)} ${r.diasNecesarios === 1 ? 'día' : 'días'}.</p>`
        + (dotacion > 0 && dotacion < r.personas ? `<p class="lpAlerta">Con ${plural(dotacion, 'persona', 'personas')} se alcanzan ${cifra(dotacion * rendimiento * dias)} de ${cifra(cantidad)} ${ut} en el plazo.</p>` : '')
        + (dotacion !== r.personas ? `<button type="button" data-lp-usar-dotacion="${r.personas}">Usar ${plural(r.personas, 'persona', 'personas')}</button>` : '')
        : `<p>Indica la cantidad${dias ? '' : ', el plazo'} y el rendimiento por persona al día para calcular la dotación recomendada.</p>`;
      if (real) html += `<p class="lpHistorico">Rendimiento real registrado en Atlas para esta actividad: <b>${cifra(real.porPersonaDia, 2)} ${ut} por persona al día</b> (${plural(real.n, 'registro', 'registros')}).${Math.abs(real.porPersonaDia - rendimiento) > .005 ? ` <button type="button" data-lp-usar-rendimiento="${real.porPersonaDia.toFixed(2)}">Usar este rendimiento</button>` : ''}</p>`;
      caja.innerHTML = html;
      caja.querySelector('[data-lp-usar-dotacion]')?.addEventListener('click', e => { form.dotacion.value = e.currentTarget.dataset.lpUsarDotacion; recomendar(); });
      caja.querySelector('[data-lp-usar-rendimiento]')?.addEventListener('click', e => { form.rendimientoPlan.value = e.currentTarget.dataset.lpUsarRendimiento; recomendar(); });
    }
    for (const c of [form.cantidad, form.unidad, form.rendimientoPlan, form.dotacion, form.actividad]) c.addEventListener('input', recomendar);
    limitesSemana(); recomendar();

    async function persistir({estado = null, reprogramarA = null} = {}) {
      if (guardando) return;
      const v = Object.fromEntries(new FormData(form)), autor = String(v.autor || '').trim(), at = new Date().toISOString();
      if (!autor) { mensaje.textContent = 'Indica quién registra.'; form.autor.focus(); return; }
      const valores = {...v, level: form.level.value, semana: form.semana.disabled ? act.semana : v.semana, responsable: v.responsable === '__otro' ? v.responsableOtro : v.responsable, recintos, restricciones};
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
    g.setTransform(1, 0, 0, 1, 0, 0); g.font = '600 15px "Google Sans Flex", "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const e of porRecinto.values()) {
      const [px, py] = ctx.position(e.room), x = (px - x0) * f, y = (py - y0) * f, t = e.acts.map(a => a.n).join(','), ancho = g.measureText(t).width + 12;
      g.fillStyle = '#ffffffee'; g.strokeStyle = '#1b2a56'; g.lineWidth = 1.2; g.beginPath(); if (g.roundRect) g.roundRect(x - ancho / 2, y - 11, ancho, 22, 6); else g.rect(x - ancho / 2, y - 11, ancho, 22); g.fill(); g.stroke();
      g.fillStyle = '#1b2a56'; g.fillText(t, x, y + 1);
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
