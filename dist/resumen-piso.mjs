// Resumen del piso en el escritorio: lo primero que muestra Control (y Protocolos) en el panel de la derecha, con el plano
// al centro. Avance, tareas, observaciones y protocolos del piso abierto; cada número abre su panel con el detalle.
// Solo lee: los mismos datos que ya muestran Avance, Mis tareas y la matriz.
import {nivel} from './level.mjs';
import {progressFloors} from './progress-scope.mjs';
import {loadPma} from './pma.mjs';
import {reportProgress, agruparMuros} from './room-progress-model.mjs';
import {readProgress} from './room-progress-store.mjs';
import {cargarAvance, derivador} from './avance.mjs';
import {cargarObservaciones} from './observaciones.mjs';
import {loadProtocolCatalog} from './protocol-catalog.mjs';
import {scopeProtocolCatalog} from './protocol-scope.mjs';
import {criticosPorTipo} from './protocol-critical.mjs';

const PENDIENTES = ['Abierta', 'En corrección', 'Corregida'];
const pct = (a, b) => b ? (100 * a / b).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' %' : '—';
const n = v => Number(v || 0).toLocaleString('es-CL');

async function avanceDelPiso(rooms) {
  if (!progressFloors[nivel.id]) return null;
  const [model, snapshot, avance] = await Promise.all([loadPma(), readProgress(), cargarAvance().catch(() => null)]);
  const deriva = derivador(avance), all = agruparMuros(reportProgress(model, rooms, snapshot.records, nivel.id, deriva), deriva);
  const tasks = all.rows.flatMap(r => r.tasks).filter(t => t.documented);
  const instaladas = tasks.filter(t => t.installation === 'Instalado').length, conformes = tasks.filter(t => t.installation === 'Instalado' && t.quality === 'Conforme').length;
  return {total: tasks.length, instaladas, conformes, recintos: all.rows.length, completos: all.rows.filter(r => r.complete).length};
}
async function observacionesDelPiso() {
  const obs = await cargarObservaciones();
  let pendientes = 0;
  for (const lista of obs.porCodigo.values()) pendientes += lista.filter(o => PENDIENTES.includes(o.estado)).length;
  return {pendientes};
}
async function protocolosDelPiso() {
  const cat = await loadProtocolCatalog(), abiertos = scopeProtocolCatalog(cat, nivel.id, 'ABIERTO').types.reduce((s, t) => s + t.visibleCount, 0);
  const criticos = (await criticosPorTipo()).reduce((s, c) => s + c.ids.size, 0);
  return {abiertos, criticos, corte: cat.source?.cutoff || ''};
}

// ctx: {esc, rooms, tareas, abrirPanel(panel, vista), abrirTareas(id)}
export function createResumenPiso(ctx) {
  const {esc} = ctx;
  const panel = document.createElement('aside');
  panel.id = 'resumenPiso'; panel.setAttribute('aria-label', 'Resumen del piso');
  document.querySelector('main').append(panel);
  let serie = 0;
  const tarjeta = (clave, titulo, valor, detalle) => `<button type="button" class="resumenDato" data-resumen="${clave}"><span>${esc(titulo)}</span><b>${valor}</b><small>${detalle}</small></button>`;
  const cargando = titulo => `<div class="resumenDato cargando"><span>${esc(titulo)}</span><b>…</b></div>`;
  async function mostrar(nombrePiso) {
    const mia = ++serie;
    panel.innerHTML = `<h2>Resumen · ${esc(nombrePiso || nivel.nombre)}</h2><div class="resumenGrilla">${['Avance', 'Tareas', 'Observaciones', 'Protocolos'].map(cargando).join('')}</div>`;
    const [av, ob, pr] = await Promise.allSettled([avanceDelPiso(ctx.rooms()), observacionesDelPiso(), protocolosDelPiso()]);
    if (mia !== serie || !panel.isConnected) return;
    const a = av.value, o = ob.value, p = pr.value;
    let tareas = '';
    const cuenta = ctx.tareas?.cuentaAgenda?.();
    if (cuenta) tareas = tarjeta('tareas', 'Mis tareas', n(cuenta.hoy + cuenta.semana), `${n(cuenta.hoy)} hoy · ${n(cuenta.semana)} esta semana`);
    else tareas = `<div class="resumenDato"><span>Mis tareas</span><b>—</b><small>Tu cuenta aún no tiene perfil en la jerarquía de obra.</small></div>`;
    panel.innerHTML = `<h2>Resumen · ${esc(nombrePiso || nivel.nombre)}</h2>
      <div class="resumenGrilla">
        ${a ? tarjeta('avance', 'Partidas instaladas', pct(a.instaladas, a.total), `${n(a.instaladas)} de ${n(a.total)} · ${pct(a.conformes, a.total)} conformes`)
          + tarjeta('avance', 'Recintos completos', `${n(a.completos)} / ${n(a.recintos)}`, 'Completos y conformes') : `<div class="resumenDato"><span>Avance</span><b>—</b><small>${av.status === 'rejected' ? esc(av.reason?.message || 'No se pudo calcular.') : 'Este piso no tiene PMA de avance.'}</small></div>`}
        ${tareas}
        ${o ? tarjeta('observaciones', 'Observaciones pendientes', n(o.pendientes), 'Abiertas, en corrección o corregidas') : '<div class="resumenDato"><span>Observaciones</span><b>—</b></div>'}
        ${p ? tarjeta('protocolos', 'Protocolos abiertos', n(p.abiertos), 'Matriz al ' + esc(String(p.corte).split('-').reverse().join('-'))) + tarjeta('criticos', 'Protocolos críticos', n(p.criticos), 'Abiertos hace más de un año') : '<div class="resumenDato"><span>Protocolos</span><b>—</b></div>'}
      </div>
      <p class="resumenNota">Toca un número para ver su detalle. Las tarjetas de la izquierda abren cada herramienta.</p>`;
    panel.querySelectorAll('[data-resumen]').forEach(b => b.onclick = () => {
      const k = b.dataset.resumen;
      if (k === 'avance') ctx.abrirPanel('avance', 'recinto');
      else if (k === 'observaciones') ctx.abrirPanel('avance', 'observaciones');
      else if (k === 'protocolos') ctx.abrirPanel('matrix', 'matriz');
      else if (k === 'criticos') ctx.abrirPanel('matrix', 'criticos');
      else if (k === 'tareas') ctx.abrirTareas('mias');
    });
  }
  return {mostrar};
}
