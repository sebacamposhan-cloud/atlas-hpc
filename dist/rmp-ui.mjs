// Last Planner › Programa de obra › Curvas RMP (escritorio). Las curvas del Reporte Mensual de Progreso calculadas en
// ATLAS con los pesos de Planificación (rmp-model.mjs): curva S plan/real con proyección, eficiencia, plan vs real de los
// últimos 4 meses y cumplimiento de la programación. Sin la planilla de pesos se ven desactivadas, con el motivo.
// El real de lo que ATLAS mide sale del avance de terreno de los pisos cargados (los mismos registros del rombo).
import * as R from './rmp-model.mjs';
import {pesosRMP, guardarRMPNube, refrescarRMPNube} from './rmp-nube.mjs';
import {pisos, prefijo} from './level.mjs';
import {firmante} from './firma.mjs';

const PLAN = '#29a8df', REAL = '#0f5499';
const hoyISO = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesCorto = m => MESES[Number(m.slice(5, 7)) - 1] + '-' + m.slice(2, 4);
const pct = (v, d = 1) => v == null ? '—' : v.toLocaleString('es-CL', {maximumFractionDigits: d, minimumFractionDigits: d}) + ' %';
const factor = v => v == null ? '—' : v.toLocaleString('es-CL', {maximumFractionDigits: 2, minimumFractionDigits: 2});
let buscado = false;

// Avance de ATLAS por partida EETT en los pisos cargados (sin abrirlos: PMA de la obra + registros de avance del equipo).
async function avanceDeAtlas(codigos) {
  const [{loadPma}, {leerAvance}, {planillaDe}, M] = await Promise.all([import('./pma.mjs'), import('./avance-store.mjs'), import('./planilla-avance-nube.mjs'), import('./avance-model.mjs')]);
  const [pma, avance] = await Promise.all([loadPma(), leerAvance()]);
  const reportes = pisos.map(p => { try { return M.reporteAvance(pma, new Map(), avance.registros, p.id, planillaDe(p.id)).partidas || []; } catch { return []; } });
  return R.avanceAtlas(codigos, reportes);
}

export async function montarRMP(el, {esc, toast = () => {}}) {
  if (!el) return;
  const rmp = pesosRMP();
  if (!rmp && !buscado && navigator.onLine) { buscado = true; refrescarRMPNube().then(c => { if (c && el.isConnected) montarRMP(el, {esc, toast}); }).catch(() => {}); }
  const carga = `<div class="rmpAcciones"><label class="progressImportLabel">Cargar pesos del RMP (Excel)<input type="file" accept=".xlsx,.xls" data-rmp-excel></label><button type="button" data-rmp-plantilla>Descargar plantilla</button></div>`;
  const titulo = `<div class="chartHeading"><h3>Curvas RMP · obra completa</h3>${carga}</div>`;
  if (!rmp) {
    el.innerHTML = titulo + `<p class="rmpMotivo"><b>Falta la planilla de pesos del RMP.</b> Planificación la carga una vez con la plantilla (peso de cada partida EETT, si ATLAS la mide y el % plan y real acumulado de cada mes) y la actualiza cada mes. Con ella, ATLAS calcula el mismo % que el RMP.</p>
      <div class="rmpGrilla rmpDesactivada" aria-hidden="true">${['Progreso físico · curva S', 'Eficiencia', 'Plan vs real · últimos 4 meses', 'Cumplimiento de programación'].map(t => `<section class="rmpTarjeta"><h4>${t}</h4><p>Sin pesos del RMP</p></section>`).join('')}</div>`;
    conectar(el, {esc, toast}); return;
  }
  el.innerHTML = titulo + '<p role="status">Calculando las curvas…</p>';
  let atlas = new Map();
  try { atlas = await avanceDeAtlas(rmp.partidas.filter(p => p.mideAtlas).map(p => p.codigo)); } catch {}
  if (!el.isConnected) return;
  const c = R.curvasRMP(rmp, {hoy: hoyISO(), atlas}), medidas = rmp.partidas.filter(p => p.mideAtlas);
  const nota = `Pesos de «${esc(rmp.archivo || 'planilla de Planificación')}», cargados el ${esc(new Date(rmp.cargada).toLocaleDateString('es-CL'))} por ${esc(rmp.por)}. `
    + `${medidas.length} de ${rmp.partidas.length} partidas las mide ATLAS en terreno; en ${esc(mesCorto(c.mesHoy))} ${c.conAtlas ? `${c.conAtlas} toman el avance de ATLAS de los pisos cargados` : 'ninguna tiene aún avance en ATLAS'} y el resto, el % de Planificación.`;
  const actual = c.actual;
  el.innerHTML = titulo + `<p class="lpCycleNote">${nota}</p>
    <div class="rmpGrilla">
      <section class="rmpTarjeta rmpAncha"><h4>Progreso físico · curva S</h4><div class="curvaResumen">${actual ? `<span><b>${pct(actual.real)}</b> real</span><span><b>${pct(actual.plan)}</b> plan</span><span><b>${actual.plan == null ? '—' : (actual.real - actual.plan).toLocaleString('es-CL', {maximumFractionDigits: 1})} pts</b> ${actual.real >= (actual.plan ?? 0) ? 'sobre' : 'bajo'} el plan · ${esc(mesCorto(actual.mes))}</span>` : '<span>Sin real informado aún</span>'}</div>
        <div class="curvaLeyenda"><span><i class="programado"></i>Plan</span><span><i class="real"></i>Real</span>${c.proyeccion.length ? `<span><i class="proyeccion"></i>${c.fuenteProyeccion === 'reprogramacion' ? `Proyección con la reprogramación (término ${esc(mesCorto(c.proyeccion.at(-1).mes))})` : 'Proyección con el ritmo de los últimos 3 meses'}</span>` : ''}</div><div class="curvaGrafico" data-rmp-curva><div class="curvaDato" hidden></div></div></section>
      <section class="rmpTarjeta"><h4>Eficiencia <small>real ÷ plan, 1,00 = al día</small></h4><div class="curvaGrafico" data-rmp-eficiencia><div class="curvaDato" hidden></div></div></section>
      <section class="rmpTarjeta"><h4>Plan vs real · últimos 4 meses <small>avance de cada mes</small></h4><div class="curvaLeyenda"><span><i class="barraPlan"></i>Plan</span><span><i class="barraReal"></i>Real</span></div><div data-rmp-barras></div></section>
      <section class="rmpTarjeta"><h4>Cumplimiento de programación</h4>${c.cumplimiento == null ? '<p>Sin plan para comparar.</p>' : `<p class="rmpCifra"><b>${pct(100 * c.cumplimiento, 2)}</b> cumplimiento</p><span class="rmpMedidor" role="img" aria-label="Cumplimiento ${pct(100 * c.cumplimiento, 2)}"><i style="width:${(100 * c.cumplimiento).toFixed(1)}%"></i></span><p class="rmpPie"><b>${pct(100 * c.desviacion, 2)}</b> desviación · real acumulado ÷ plan acumulado a ${esc(mesCorto(c.actual.mes))}</p>`}</section>
    </div>
    <details class="rmpTabla"><summary>Ver los datos por mes</summary><div class="lpCycleTableWrap"><table class="lpCycleTable"><thead><tr><th>Mes</th><th>Plan acumulado</th><th>Real acumulado</th><th>Eficiencia</th></tr></thead><tbody>${c.puntos.map(p => `<tr><td>${esc(mesCorto(p.mes))}</td><td>${pct(p.plan)}</td><td>${pct(p.real)}</td><td>${factor(p.plan > 0 && p.real != null ? p.real / p.plan : null)}</td></tr>`).join('')}</tbody></table></div></details>`;
  lineas(el.querySelector('[data-rmp-curva]'), c.puntos.map(p => p.mes), [
    {nombre: 'Plan', color: PLAN, guion: '6 4', valores: c.puntos.map(p => p.plan)},
    {nombre: 'Real', color: REAL, valores: c.puntos.map(p => p.real)},
    ...(c.proyeccion.length ? [{nombre: 'Proyección', color: REAL, guion: '2 4', valores: null, puntos: c.proyeccion}] : [])], {max: 100, formato: v => pct(v), marcas: [0, 25, 50, 75, 100]});
  lineas(el.querySelector('[data-rmp-eficiencia]'), c.eficiencia.map(e => e.mes), [
    {nombre: 'Ideal', color: '#8c8c8c', valores: c.eficiencia.map(() => 1), sinPunto: true},
    {nombre: 'Eficiencia', color: REAL, valores: c.eficiencia.map(e => e.valor)}], {max: 1.5, formato: factor, marcas: [0, .5, 1, 1.5]});
  barras(el.querySelector('[data-rmp-barras]'), c.ultimos, esc);
  conectar(el, {esc, toast});
}

// Curva S de la obra sola (Avance › Avance por recinto, junto a la del piso): plan, real y proyección del RMP, los mismos
// valores de Curvas RMP. Sin planilla del RMP, el motivo.
export async function montarCurvaObra(el, {esc}) {
  if (!el) return;
  const titulo = '<div class="chartHeading"><h3>Avance de la obra · RMP</h3><span>% de la obra, ponderado por costo</span></div>';
  let rmp = pesosRMP();
  if (!rmp && navigator.onLine) { try { await refrescarRMPNube(); rmp = pesosRMP(); } catch {} }
  if (!el.isConnected) return;
  if (!rmp) { el.innerHTML = titulo + '<p class="chartEmpty">Falta la planilla de pesos del RMP. Se carga en Last Planner › Programa de obra › Curvas RMP (escritorio).</p>'; return; }
  el.innerHTML = titulo + '<p role="status">Calculando la curva de la obra…</p>';
  let atlas = new Map();
  try { atlas = await avanceDeAtlas(rmp.partidas.filter(p => p.mideAtlas).map(p => p.codigo)); } catch {}
  if (!el.isConnected) return;
  const c = R.curvasRMP(rmp, {hoy: hoyISO(), atlas}), actual = c.actual;
  el.innerHTML = titulo + `<div class="curvaResumen">${actual ? `<span><b>${pct(actual.real)}</b> real</span><span><b>${pct(actual.plan)}</b> plan</span><span><b>${actual.plan == null ? '—' : Math.abs(actual.real - actual.plan).toLocaleString('es-CL', {maximumFractionDigits: 1})} pts</b> ${actual.real >= (actual.plan ?? 0) ? 'sobre' : 'bajo'} el plan · ${esc(mesCorto(actual.mes))}</span>` : '<span>Sin real informado aún</span>'}</div>
    <div class="curvaLeyenda"><span><i class="programado"></i>Plan (línea base)</span><span><i class="real"></i>Real</span>${c.proyeccion.length ? `<span><i class="proyeccion"></i>${c.fuenteProyeccion === 'reprogramacion' ? `Proyección con la reprogramación (término ${esc(mesCorto(c.proyeccion.at(-1).mes))})` : 'Proyección con el ritmo de los últimos 3 meses'}</span>` : ''}</div>
    <div class="curvaGrafico" data-rmp-curva><div class="curvaDato" hidden></div></div>
    <p class="chartSubtitle">Mismos valores que el Reporte Mensual de Progreso: pesos de «${esc(rmp.archivo || 'planilla del RMP')}».</p>`;
  lineas(el.querySelector('[data-rmp-curva]'), c.puntos.map(p => p.mes), [
    {nombre: 'Plan', color: PLAN, guion: '6 4', valores: c.puntos.map(p => p.plan)},
    {nombre: 'Real', color: REAL, valores: c.puntos.map(p => p.real)},
    ...(c.proyeccion.length ? [{nombre: 'Proyección', color: REAL, guion: '2 4', valores: null, puntos: c.proyeccion}] : [])], {max: 100, formato: v => pct(v), marcas: [0, 25, 50, 75, 100]});
}

function conectar(el, ctx) {
  el.querySelector('[data-rmp-plantilla]')?.addEventListener('click', async () => {
    try {
      const {loadVendor} = await import('./vendor-loader.mjs'); await loadVendor('xlsx');
      const X = window.XLSX, libro = X.utils.book_new(), hojas = R.plantillaRMP();
      for (const [nombre, filas] of Object.entries(hojas)) X.utils.book_append_sheet(libro, X.utils.aoa_to_sheet(filas), nombre);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([X.write(libro, {bookType: 'xlsx', type: 'array'})], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      a.download = prefijo + 'plantilla-pesos-RMP.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { ctx.toast(e.message); }
  });
  el.querySelector('[data-rmp-excel]')?.addEventListener('change', async e => {
    const archivo = e.target.files?.[0]; e.target.value = ''; if (!archivo) return;
    try {
      const {loadVendor} = await import('./vendor-loader.mjs'); await loadVendor('xlsx');
      const X = window.XLSX, libro = X.read(await archivo.arrayBuffer(), {type: 'array'});
      const hojas = Object.fromEntries(libro.SheetNames.map(n => [n, X.utils.sheet_to_json(libro.Sheets[n], {header: 1, raw: true, defval: ''})]));
      const {registro, avisos} = R.leerPesosRMP(hojas);
      await guardarRMPNube(registro, {archivo: archivo.name, por: firmante()});
      ctx.toast(`Pesos del RMP cargados: ${registro.partidas.length} partidas y ${Object.keys(registro.meses).length} meses.${avisos.length ? ' ' + avisos.join(' ') : ''}`);
      montarRMP(el, ctx);
    } catch (error) { ctx.toast(error.message); }
  });
}

// Gráfico de líneas con cruz y dato al pasar (o con las flechas del teclado). series: {nombre, color, guion, valores
// (uno por mes) o puntos ([{mes, valor}] para la proyección)}.
function lineas(zona, meses, series, {max, formato, marcas}) {
  if (!zona) return;
  const todos = [...new Set([...meses, ...series.flatMap(s => s.puntos ? s.puntos.map(p => p.mes) : [])])].sort();
  if (!todos.length) { zona.insertAdjacentHTML('afterbegin', '<p class="chartEmpty">Sin meses informados.</p>'); return; }
  const dato = zona.querySelector('.curvaDato');
  const pintar = () => {
    const w = Math.max(280, zona.clientWidth || 280), h = 220, m = {arriba: 12, derecha: 14, abajo: 26, izquierda: 48}, n = todos.length;
    const x = i => m.izquierda + (n > 1 ? i / (n - 1) : .5) * (w - m.izquierda - m.derecha), y = v => m.arriba + (1 - Math.min(max, v) / max) * (h - m.arriba - m.abajo);
    const valor = (s, mes) => s.puntos ? s.puntos.find(p => p.mes === mes)?.valor ?? null : s.valores[meses.indexOf(mes)] ?? null;
    const camino = s => todos.flatMap((mes, i) => { const v = valor(s, mes); return v == null ? [] : [`${x(i).toFixed(1)} ${y(v).toFixed(1)}`]; }).map((c, i) => (i ? 'L' : 'M') + c).join('');
    const cada = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(w / 64))));
    const ejeY = marcas.map(v => `<line class="curvaGrilla" x1="${m.izquierda}" x2="${w - m.derecha}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.izquierda - 8}" y="${y(v) + 4}" text-anchor="end">${formato(v)}</text>`).join('');
    const ejeX = todos.map((mes, i) => i % cada ? '' : `<text x="${x(i)}" y="${h - 8}" text-anchor="middle">${mesCorto(mes)}</text>`).join('');
    zona.querySelector('svg')?.remove();
    zona.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" tabindex="0" role="img" aria-label="${series.map(s => s.nombre).join(', ')} por mes">${ejeY}${ejeX}
      ${series.map(s => `<path d="${camino(s)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" ${s.guion ? `stroke-dasharray="${s.guion}"` : ''}/>`).join('')}
      <line class="curvaCruz" y1="${m.arriba}" y2="${h - m.abajo}" visibility="hidden"/></svg>`);
    const svg = zona.querySelector('svg'), cruz = svg.querySelector('.curvaCruz');
    let actual = n - 1;
    const mostrar = i => {
      actual = Math.max(0, Math.min(n - 1, i)); const mes = todos[actual], px = x(actual);
      cruz.setAttribute('x1', px); cruz.setAttribute('x2', px); cruz.setAttribute('visibility', 'visible');
      dato.replaceChildren(); const t = document.createElement('small'); t.textContent = mesCorto(mes); dato.append(t);
      for (const s of series) { const v = valor(s, mes); if (v == null || s.sinPunto) continue; const f = document.createElement('div'), b = document.createElement('b'); b.textContent = formato(v); f.append(b, ' ' + s.nombre); dato.append(f); }
      dato.hidden = false; dato.style.left = Math.max(0, Math.min(w - 150, px + (px > w / 2 ? -158 : 8))) + 'px'; dato.style.top = '12px';
    };
    const ocultar = () => { cruz.setAttribute('visibility', 'hidden'); dato.hidden = true; };
    svg.addEventListener('pointermove', e => { const r = svg.getBoundingClientRect(); mostrar(Math.round((e.clientX - r.left - m.izquierda) / Math.max(1, w - m.izquierda - m.derecha) * (n - 1))); });
    svg.addEventListener('pointerleave', ocultar); svg.addEventListener('blur', ocultar); svg.addEventListener('focus', () => mostrar(actual));
    svg.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); mostrar(actual + (e.key === 'ArrowRight' ? 1 : -1)); } });
  };
  pintar();
  if (typeof ResizeObserver === 'function') { let ancho = zona.clientWidth; new ResizeObserver(() => { if (zona.isConnected && zona.clientWidth !== ancho) { ancho = zona.clientWidth; pintar(); } }).observe(zona); }
}

// Barras agrupadas plan/real por mes, con el valor sobre cada barra (son pocas) y el detalle al pasar.
function barras(zona, ultimos, esc) {
  if (!zona) return;
  if (!ultimos.length) { zona.innerHTML = '<p class="chartEmpty">Sin meses con real informado.</p>'; return; }
  const w = 360, h = 200, m = {arriba: 18, abajo: 24, izquierda: 8, derecha: 8}, max = Math.max(1, ...ultimos.flatMap(u => [u.plan, u.real])) * 1.15;
  const grupo = (w - m.izquierda - m.derecha) / ultimos.length, ancho = Math.min(34, grupo / 3), y = v => m.arriba + (1 - Math.max(0, v) / max) * (h - m.arriba - m.abajo), base = h - m.abajo;
  const barra = (cx, v, color, nombre, mes) => `<g><title>${esc(mesCorto(mes))} · ${nombre} ${pct(v, 2)}</title>${base - y(v) > 5 ? `<path d="M${cx} ${base}V${y(v) + 4}q0 -4 4 -4h${ancho - 8}q4 0 4 4V${base}Z" fill="${color}"/>` : `<rect x="${cx}" y="${y(v)}" width="${ancho}" height="${Math.max(1, base - y(v))}" fill="${color}"/>`}<text x="${cx + ancho / 2}" y="${y(v) - 5}" text-anchor="middle">${pct(v, 2)}</text></g>`;
  zona.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Plan y real de cada uno de los últimos ${ultimos.length} meses"><line class="curvaGrilla" x1="${m.izquierda}" x2="${w - m.derecha}" y1="${base}" y2="${base}"/>
    ${ultimos.map((u, i) => { const cx = m.izquierda + grupo * i + grupo / 2; return barra(cx - ancho - 1, u.plan, PLAN, 'Plan', u.mes) + barra(cx + 1, u.real, REAL, 'Real', u.mes) + `<text x="${cx}" y="${h - 6}" text-anchor="middle">${esc(mesCorto(u.mes))}</text>`; }).join('')}</svg>`;
}
