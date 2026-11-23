// Last Planner › Programa de obra: el nivel maestro sobre el plan intermedio. Muestra las partidas del programa de Sacyr
// para el piso, lo que empieza en las próximas semanas, su avance real (el mismo de Avance) contra lo programado, y deja
// a Planificación repartir cada partida en ventanas por sector y crear desde ahí actividades del plan intermedio,
// ligadas a su partida del programa. La carga del XML de Project es de escritorio (oficina técnica).
import {nivel, pisos} from './level.mjs';
import * as P from './programa-obra-model.mjs';
import {programaDe, guardarProgramaNube, guardarVentanasNube, refrescarProgramaNube} from './programa-obra-nube.mjs';
import {firmante, exigirFirma} from './firma.mjs';
import {nombreSector} from './sectores-model.mjs';

const hoyISO = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const corta = d => d ? d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(2, 4) : '—';
const fechaHora = iso => { try { return new Date(iso).toLocaleString('es-CL', {dateStyle: 'short', timeStyle: 'short'}); } catch { return iso || ''; } };
const pct = v => v == null ? '—' : Math.round(v) + ' %';
const numero = v => new Intl.NumberFormat('es-CL', {maximumFractionDigits: 1}).format(v || 0);
const nombrePiso = id => pisos.find(p => p.id === id)?.nombre || (id === 'N-1' ? 'Nivel −1' : 'Nivel ' + Number(id.slice(1)));
// Curvas RMP de la obra (rmp-ui.mjs): solo en el escritorio, sobre el programa del piso.
const RMP = '<section class="lpCycleCard" data-oficina data-rmp></section>';
const montarCurvasRMP = (el, ctx) => { const z = el.querySelector('[data-rmp]'); if (z && document.body.classList.contains('escritorio')) import('./rmp-ui.mjs').then(m => m.montarRMP(z, {esc: ctx.esc, toast: ctx.toast})).catch(() => {}); };
const ORDENES = [['1', '2', '3'], ['1', '3', '2'], ['2', '1', '3'], ['2', '3', '1'], ['3', '1', '2'], ['3', '2', '1']];
const estado = {abierta: null, borradores: {}, lectura: null, creando: null, soloAtlas: false, buscado: false};

// Lee el XML elegido por partes (puede pesar varios GB: las tareas van al principio) y lo pasa a pisos de Atlas.
export async function leerArchivoPrograma(archivo, alAvanzar) {
  if (!/\.xml$/i.test(archivo.name)) throw Error('Elige el programa guardado como XML desde Project (Archivo › Guardar como › XML). Atlas no lee el .mpp directamente.');
  const leido = await P.leerXMLPorPartes(archivo.stream(), {alAvanzar});
  const r = P.programaPorPiso(leido, {archivo: archivo.name});
  if (!Object.keys(r.pisos).length) throw Error('El programa no trae tareas del Módulo A con piso y código de partida (Texto1).');
  return r;
}

// Vista. ctx: {esc, toast, nivelId, rooms(), actividades, refrescar()}.
export async function montarPrograma(el, ctx) {
  if (!el) return;
  const {esc} = ctx, nivelId = ctx.nivelId || nivel.id, hoy = hoyISO();
  el.innerHTML = '<p role="status">Cargando programa de obra…</p>';
  const programa = programaDe(nivelId);
  // El avance real solo está para el piso abierto en la página (el mismo de Avance por partida).
  let partidas = [], conAvance = false;
  if (programa && nivelId === nivel.id) {
    try { const {cargarAvance} = await import('./avance.mjs'); const c = await cargarAvance(); partidas = c?.reporte?.partidas || []; conAvance = true; } catch {}
  }
  if (!el.isConnected) return;
  const salas = new Map((ctx.rooms?.() || []).map(r => [String(r.code).trim(), r])), sectorDe = code => salas.get(String(code ?? '').trim())?.sector || '';
  const avances = new Map((programa?.tareas || []).map(t => [t.codigo, conAvance ? P.avanceTarea(t, partidas, sectorDe) : null]));
  const ligadas = codigo => (ctx.actividades || []).filter(a => !a.archivada && a.level === nivelId && a.programa?.codigo === codigo);

  const cabecera = `<div class="lpProgramaCabecera"><div><h3>Programa de obra · ${esc(nombrePiso(nivelId))}</h3><p class="lpCycleNote">${programa
    ? `Revisión «${esc(programa.revision?.archivo || programa.revision?.titulo || 'sin nombre')}»${programa.revision?.estado ? ' · fecha de estado ' + corta(programa.revision.estado) : ''} · cargada el ${esc(fechaHora(programa.cargada))} por ${esc(programa.por)}. Es el programa general de Sacyr: llega hasta el piso, sin sectores ni recintos.`
    : !estado.buscado && navigator.onLine ? 'Buscando el programa de obra en la Nube…' : 'Aún no se ha cargado el programa de obra de este piso.'}</p></div><label class="progressImportLabel" data-oficina>Cargar programa (XML de Project)<input type="file" accept=".xml,application/xml,text/xml" data-programa-xml></label></div><div data-programa-lectura ${estado.lectura ? '' : 'hidden'}></div><p class="lpCycleFeedback" role="status" data-programa-mensaje></p>`;
  if (!programa) {
    // El programa vive en la Nube: si este equipo aún no lo tiene, se pide ahora (la vista se redibuja cuando llega).
    if (!estado.buscado && navigator.onLine) { estado.buscado = true; refrescarProgramaNube().catch(() => {}).finally(() => { if (el.isConnected && !programaDe(nivelId)) montarPrograma(el, ctx); }); }
    el.innerHTML = cabecera + RMP + `<section class="lpCycleCard"><p>Oficina técnica guarda el programa desde Project con <b>Archivo › Guardar como › XML</b> y lo carga aquí desde el escritorio. Atlas toma las tareas del Módulo A de cada piso (código de partida en Texto1), sin recursos ni montos, y las comparte por Nube.</p></section>`;
    conectarCarga(el, ctx); montarCurvasRMP(el, ctx); return;
  }

  const {enCurso, proximas, vencidas, limite} = P.tareasProximas(programa, hoy);
  const pendiente = t => { const a = avances.get(t.codigo); return !a || !a.partidas || a.pct < 100 - 1e-6; };
  const vencidasPend = vencidas.filter(t => conAvance && avances.get(t.codigo)?.partidas && pendiente(t));
  // «Solo lo que Atlas mide»: partidas con avance de recintos en Atlas (terminaciones); sin el filtro, todo lo del piso
  // (también instalaciones, fachada y obra gruesa, que condicionan el trabajo).
  const medida = t => !!avances.get(t.codigo)?.partidas, filtro = lista => estado.soloAtlas && conAvance ? lista.filter(medida) : lista;
  const filas = filtro([...vencidasPend, ...enCurso.filter(pendiente), ...proximas]);
  const programadoHoy = t => 100 * P.fraccionProgramada(t.inicio, t.fin, hoy);
  const atrasadas = filas.filter(t => { const a = avances.get(t.codigo), pr = a?.partidas && t.fin >= hoy ? P.proyeccion(t, a.pct, hoy) : null; return pr && pr.atraso > 0 || t.fin < hoy; });
  const conAviso = (ctx.actividades || []).filter(a => a.level === nivelId && !a.archivada && P.avisoActividad(a, programa));
  const metric = (label, value, note = '') => `<article class="lpCycleMetric"><span>${label}</span><b>${value}</b><small>${note}</small></article>`;
  // Término proyectado con el ritmo real, solo para lo que está en curso: en una vencida, el ritmo desde su inicio
  // programado no dice nada (el trabajo pudo empezar mucho después), así que se muestra lo que falta.
  const termino = (t, real) => {
    if (real == null) return null;
    if (t.fin < hoy) return real >= 100 - 1e-6 ? {texto: 'Terminada'} : {texto: `<b class="obsOverdue">Falta ${Math.round(100 - real)} %</b>`, atraso: true};
    const pr = P.proyeccion(t, real, hoy); if (!pr) return null;
    return {termino: pr.termino, atraso: pr.atraso > 0, texto: pr.atraso > 365 ? '<b class="obsOverdue">Más de un año tarde</b>' : corta(pr.termino) + (pr.atraso > 0 ? `<br><b class="obsOverdue">${pr.atraso} días tarde</b>` : '<br><small>a tiempo</small>'), dias: pr.atraso};
  };
  const fila = t => {
    const a = avances.get(t.codigo), real = a?.partidas ? a.pct : null, prog = programadoHoy(t), pr = termino(t, real), n = ligadas(t.codigo);
    const brecha = real == null ? '—' : (real - prog >= 0 ? '+' : '') + Math.round(real - prog) + ' pts';
    const cuando = t.fin < hoy ? '<b class="obsOverdue">Vencida</b>' : t.inicio > hoy ? 'Empieza en ' + P.dias(hoy, t.inicio) + ' días' : 'En curso';
    return `<tr class="${estado.abierta === t.codigo ? 'selectedRow' : ''}"><td data-label="Partida"><button type="button" class="codeLink" data-programa-tarea="${esc(t.codigo)}">${esc(t.codigo)}</button><br><small>${esc(t.partida)}</small></td>
      <td data-label="Programa">${corta(t.inicio)} → ${corta(t.fin)}<br><small>${cuando}</small></td><td data-label="Real">${real == null ? '<small>' + (conAvance ? 'Sin partidas en Atlas' : 'Abre el piso') + '</small>' : pct(real)}</td>
      <td data-label="Programado hoy">${pct(prog)}</td><td data-label="Brecha">${brecha}</td><td data-label="Término proyectado">${pr ? pr.texto : '—'}</td>
      <td data-label="Actividades">${n.length ? n.length + (n.some(x => P.avisoActividad(x, programa)) ? ' ⚠' : '') : '—'}</td></tr>`;
  };
  const tabla = (lista, vacio) => lista.length ? `<div class="lpCycleTableWrap"><table class="lpCycleTable lpProgramaTabla"><thead><tr><th>Partida</th><th>Programa</th><th>Real</th><th>Programado hoy</th><th>Brecha</th><th>Término proyectado</th><th>Actividades</th></tr></thead><tbody>${lista.map(fila).join('')}</tbody></table></div>` : `<p>${vacio}</p>`;
  el.innerHTML = cabecera + RMP + `<div class="lpCycleMetrics">${metric('Partidas del programa', programa.tareas.length, 'Módulo A · ' + esc(nombrePiso(nivelId)))}${metric('En curso', enCurso.length)}${metric('Empiezan antes del ' + corta(limite), proximas.length, P.SEMANAS_ADELANTE + ' semanas')}${metric('Vencidas con pendiente', conAvance ? vencidasPend.length : '—', conAvance ? '' : 'Abre este piso para ver su avance')}${metric('Atrasadas o en riesgo', atrasadas.length, 'Según el ritmo real')}${metric('Actividades fuera de plazo', conAviso.length, 'Terminan después de su partida')}</div>
    <section class="lpCycleCard"><div class="chartHeading"><h3>Plan intermedio · próximas ${P.SEMANAS_ADELANTE} semanas</h3>${conAvance ? `<label class="lpProgramaFiltro"><input type="checkbox" data-programa-solo-atlas ${estado.soloAtlas ? 'checked' : ''}> Solo partidas que Atlas mide (${programa.tareas.filter(medida).length})</label>` : ''}</div><p class="lpCycleNote">Partidas en curso, vencidas con pendiente y las que empiezan hasta el ${corta(limite)}. Real = avance del piso en Atlas (planillas y terreno), en m² cuando la partida los tiene. Programado hoy = avance lineal entre inicio y término del programa. Toca una partida para repartirla por sector y crear sus actividades.</p>${tabla(filas, 'Nada en curso ni por empezar en las próximas semanas.')}</section>
    <section class="lpCycleCard lpProgramaDetalle" data-programa-detalle hidden></section>
    <details class="lpCycleCard"><summary>Todo el programa del piso · ${filtro(programa.tareas).length} partidas</summary>${tabla(filtro(programa.tareas), 'Sin partidas.')}</details>
    ${programa.resumen?.anterior ? `<p class="lpCycleNote">Respecto de la revisión anterior («${esc(programa.resumen.anterior.archivo || '')}»): ${programa.resumen.cambios} ${programa.resumen.cambios === 1 ? 'cambio' : 'cambios'} en este piso.</p>` : ''}`;
  conectarCarga(el, ctx); montarCurvasRMP(el, ctx);
  el.querySelector('[data-programa-solo-atlas]')?.addEventListener('change', e => { estado.soloAtlas = e.target.checked; montarPrograma(el, ctx); });
  el.querySelectorAll('[data-programa-tarea]').forEach(b => b.onclick = () => { estado.abierta = estado.abierta === b.dataset.programaTarea ? null : b.dataset.programaTarea; estado.creando = null; montarPrograma(el, ctx); });
  if (estado.abierta) detalle(el.querySelector('[data-programa-detalle]'), programa.tareas.find(t => t.codigo === estado.abierta));

  function detalle(zona, t) {
    if (!t) { estado.abierta = null; return; }
    const a = avances.get(t.codigo), guardada = programa.ventanas?.[t.codigo] || null;
    const pendientes = Object.fromEntries(['1', '2', '3'].map(s => [s, a?.porSector?.[s]?.pendiente || 0]));
    const sinDatos = !a?.partidas;
    // Lo que se muestra: el borrador en edición, las ventanas guardadas o la propuesta de Atlas (sin avance: partes iguales).
    const propuesta = orden => P.ventanasPorSector(t, sinDatos ? {1: 1, 2: 1, 3: 1} : pendientes, {hoy, orden});
    const v = estado.borradores[t.codigo] || guardada || propuesta(['1', '2', '3']);
    const fuera = P.fueraDelPrograma(t, v), real = a?.partidas ? a.pct : null, pr = real != null && t.fin >= hoy ? P.proyeccion(t, real, hoy) : null;
    const origen = estado.borradores[t.codigo] ? 'Cambios sin guardar.' : guardada ? `Ventanas guardadas por ${esc(guardada.por)} el ${esc(fechaHora(guardada.at))}` : sinDatos ? 'Propuesta de Atlas en partes iguales (este piso no tiene avance de esta partida en Atlas).' : 'Propuesta de Atlas según lo pendiente de cada sector.';
    const filaSector = s => {
      const x = a?.porSector?.[s.sector], unidad = a?.unidad || '';
      // En m² se muestra la superficie pendiente; sin m², el % pendiente del sector (cada recinto pesa uno).
      const falta = !x ? '—' : unidad === 'm²' ? numero(x.pendiente) + ' m²' : Math.round(100 * x.pendiente / (x.total || 1)) + ' % pendiente';
      return `<tr><td data-label="Sector"><b>${esc(nombreSector(s.sector))}</b></td><td data-label="Pendiente">${x ? falta + '<br><small>' + x.pendientes.length + ' de ' + x.recintos.length + ' recintos con pendiente</small>' : '—'}</td>
        <td data-label="Inicio"><input type="date" value="${s.inicio}" data-ventana-inicio="${esc(s.sector)}"></td><td data-label="Término"><input type="date" value="${s.fin}" data-ventana-fin="${esc(s.sector)}"></td>
        <td data-label="Estado">${fuera.includes(s.sector) ? '<b class="obsOverdue">Fuera del programa</b>' : s.fin < hoy && x?.pendiente > 0 ? '<b class="obsOverdue">Vencida</b>' : s.inicio <= hoy && s.fin >= hoy ? 'En curso' : s.inicio > hoy ? 'Por empezar' : 'Terminada'}</td>
        <td data-label="Actividad"><button type="button" data-crear-sector="${esc(s.sector)}" ${x?.pendientes.length ? '' : 'disabled title="Sin recintos pendientes en este sector"'}>Crear actividad</button></td></tr>`;
    };
    const acts = ligadas(t.codigo);
    zona.hidden = false;
    zona.innerHTML = `<div class="chartHeading"><h3>${esc(t.codigo)} · ${esc(t.partida)}</h3><button type="button" data-detalle-cerrar>Cerrar</button></div>
      <p class="lpCycleNote">Programa: ${corta(t.inicio)} → ${corta(t.fin)} (${P.dias(t.inicio, t.fin) + 1} días)${t.tramos?.length > 1 ? ' en ' + t.tramos.length + ' tramos' : ''}. ${real == null ? 'Sin avance de esta partida en Atlas.' : `Real ${pct(real)} (${a.unidad === 'm²' ? numero(a.ejecutado) + ' de ' + numero(a.total) + ' m²' : 'promedio de ' + a.total + ' recintos'}) · programado hoy ${pct(programadoHoy(t))}${pr ? ' · término proyectado ' + (pr.atraso > 365 ? 'más de un año después del programa' : corta(pr.termino) + (pr.atraso > 0 ? ', ' + pr.atraso + ' días después del programa' : '')) : t.fin < hoy && real < 100 ? ' · vencida en el programa' : ''}.`}</p>
      <h4>Ventanas por sector</h4><p class="lpCycleNote">${origen} El programa original no cambia: las ventanas son el refinamiento de Planificación bajo el piso.${v.vencida ? ' La partida ya venció en el programa: el reparto usa su plazo original.' : ''}</p>
      <div class="lpCycleActions"><label>Orden<select data-ventana-orden data-sin-flujo>${ORDENES.map(o => `<option value="${o.join('')}" ${o.join('') === (v.orden || []).join('') ? 'selected' : ''}>${o.map(s => 'Sector ' + s).join(' → ')}</option>`).join('')}</select></label><button type="button" data-ventana-proponer>Proponer reparto</button><button type="button" class="primary" data-ventana-guardar>Guardar ventanas</button>${guardada ? '<button type="button" data-ventana-quitar>Volver a la propuesta de Atlas</button>' : ''}</div>
      ${v.sectores.length ? `<div class="lpCycleTableWrap"><table class="lpCycleTable"><thead><tr><th>Sector</th><th>Pendiente</th><th>Inicio</th><th>Término</th><th>Estado</th><th>Actividad</th></tr></thead><tbody>${v.sectores.map(filaSector).join('')}</tbody></table></div>` : '<p>Ningún sector tiene pendiente en esta partida.</p>'}
      <div data-crear-form hidden></div><p class="lpCycleFeedback" role="status" data-detalle-mensaje></p>
      <h4>Actividades ligadas · ${acts.length}</h4>${acts.length ? `<ul class="lpProgramaActs">${acts.map(x => { const w = P.avisoActividad(x, programa); return `<li><b>${esc(x.actividad)}</b> · ${esc(x.semana ? 'semana ' + x.semana : 'plan intermedio')}${x.programa?.sector ? ' · ' + esc(nombreSector(x.programa.sector)) : ''} · ${esc(x.fase || x.estado || '')}${w ? ` <b class="obsOverdue">⚠ termina ${w.atraso} días después de su ${x.programa?.sector ? 'ventana' : 'partida'} (${corta(w.fin)})</b>` : ''}</li>`; }).join('')}</ul>` : '<p>Aún no hay actividades de Last Planner creadas desde esta partida.</p>'}`;
    const mensaje = texto => { zona.querySelector('[data-detalle-mensaje]').textContent = texto; };
    zona.querySelector('[data-detalle-cerrar]').onclick = () => { estado.abierta = null; montarPrograma(el, ctx); };
    const leerTabla = () => ({orden: [...zona.querySelector('[data-ventana-orden]').value], sectores: v.sectores.map(s => ({sector: s.sector, inicio: zona.querySelector(`[data-ventana-inicio="${s.sector}"]`).value, fin: zona.querySelector(`[data-ventana-fin="${s.sector}"]`).value}))});
    zona.querySelectorAll('[data-ventana-inicio],[data-ventana-fin]').forEach(i => i.onchange = () => { estado.borradores[t.codigo] = leerTabla(); montarPrograma(el, ctx); });
    zona.querySelector('[data-ventana-orden]').onchange = e => { estado.borradores[t.codigo] = propuesta([...e.target.value]); montarPrograma(el, ctx); };
    zona.querySelector('[data-ventana-proponer]').onclick = () => { estado.borradores[t.codigo] = propuesta([...zona.querySelector('[data-ventana-orden]').value]); montarPrograma(el, ctx); };
    zona.querySelector('[data-ventana-guardar]').onclick = async () => {
      let por; try { por = exigirFirma('Inicia sesión en Atlas para guardar las ventanas.'); } catch (e) { mensaje(e.message); return; }
      try { P.validarVentanas(leerTabla(), t.codigo); await guardarVentanasNube(nivelId, t.codigo, leerTabla(), {por}); delete estado.borradores[t.codigo]; ctx.toast?.('Ventanas por sector guardadas en la nube.'); montarPrograma(el, ctx); }
      catch (e) { mensaje(e.message); }
    };
    zona.querySelector('[data-ventana-quitar]')?.addEventListener('click', async () => {
      let por; try { por = exigirFirma('Inicia sesión en Atlas para cambiar las ventanas.'); } catch (e) { mensaje(e.message); return; }
      try { await guardarVentanasNube(nivelId, t.codigo, null, {por}); delete estado.borradores[t.codigo]; montarPrograma(el, ctx); } catch (e) { mensaje(e.message); }
    });
    zona.querySelectorAll('[data-crear-sector]').forEach(b => b.onclick = () => formularioActividad(zona.querySelector('[data-crear-form]'), t, v.sectores.find(s => s.sector === b.dataset.crearSector), a));
    if (estado.creando?.codigo === t.codigo) { const s = v.sectores.find(x => x.sector === estado.creando.sector); if (s) formularioActividad(zona.querySelector('[data-crear-form]'), t, s, a); }
  }

  // Actividad del plan intermedio (sin semana) para los recintos pendientes del sector, ligada a la partida del programa.
  function formularioActividad(form, t, ventana, a) {
    const x = a?.porSector?.[ventana.sector], recintos = (x?.pendientes || []).map(code => salas.get(code)).filter(Boolean).slice(0, 300);
    const cantidad = a?.unidad === 'm²' ? Math.round(x.pendiente * 100) / 100 : null;
    estado.creando = {codigo: t.codigo, sector: ventana.sector};
    form.hidden = false;
    form.innerHTML = `<div class="chartHeading"><h4>Nueva actividad · ${esc(nombreSector(ventana.sector))}</h4><button type="button" data-crear-cerrar>Cerrar</button></div>
      <p class="lpCycleNote">Queda en el plan intermedio (sin semana) con ${recintos.length} recintos pendientes${cantidad ? ' y ' + numero(cantidad) + ' m²' : ''}, ligada a ${esc(t.codigo)} y a la ventana ${corta(ventana.inicio)} → ${corta(ventana.fin)}. Después se compromete en la semana desde Planificación semanal; si termina después de su ventana, Atlas lo avisa aquí.${(x?.pendientes.length || 0) > recintos.length ? ' ' + (x.pendientes.length - recintos.length) + ' recintos quedan fuera (no están en el plano o pasan de 300).' : ''}</p>
      <form class="partidaLps"><label>Actividad<input name="actividad" maxlength="200" required value="${esc((t.codigo + ' ' + t.partida + ' · ' + nombreSector(ventana.sector)).slice(0, 200))}"></label>
      <label>Responsable (subcontrato o cuadrilla)<input name="responsable" maxlength="160" required></label><div class="actions"><button type="submit" class="primary">Crear actividad</button></div><p role="status" data-crear-mensaje></p></form>`;
    form.querySelector('[data-crear-cerrar]').onclick = () => { estado.creando = null; form.hidden = true; form.replaceChildren(); };
    form.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const aviso = form.querySelector('[data-crear-mensaje]'), datos = Object.fromEntries(new FormData(e.target));
      let autor; try { autor = exigirFirma('Inicia sesión en Atlas para crear la actividad.'); } catch (error) { aviso.textContent = error.message; return; }
      if (!recintos.length) { aviso.textContent = 'Ningún recinto pendiente de este sector está en el plano.'; return; }
      try {
        const [{nuevaActividad, validarActividad}, {guardarActividades}] = await Promise.all([import('./lastplanner-model.mjs'), import('./lastplanner-store.mjs')]);
        const base = nuevaActividad({actividad: datos.actividad, level: nivelId, sector: nombreSector(ventana.sector), frente: null, responsable: datos.responsable, semana: null,
          recintos: recintos.map(r => ({id: r.id, code: String(r.code).trim(), name: r.name || ''})), cantidad, unidad: cantidad ? 'm²' : null}, {id: crypto.randomUUID(), autor});
        const actividad = validarActividad({...base, programa: P.vinculo(t, ventana, programa.revision)});
        await guardarActividades([{actividad, versionEsperada: 0}]);
        estado.creando = null;
        ctx.toast?.('Actividad creada en el plan intermedio, ligada al programa.');
        await ctx.refrescar?.();
      } catch (error) { aviso.textContent = error.message; }
    };
    form.scrollIntoView({block: 'nearest'});
  }
}

// «Cargar programa»: lee el XML, muestra por piso qué entra y qué cambió, y lo guarda en la nube al confirmar.
function conectarCarga(el, ctx) {
  const {esc} = ctx, entrada = el.querySelector('[data-programa-xml]'), zona = el.querySelector('[data-programa-lectura]'), mensaje = el.querySelector('[data-programa-mensaje]');
  const pintar = () => {
    const r = estado.lectura; if (!r) { zona.hidden = true; zona.replaceChildren(); return; }
    const ids = Object.keys(r.pisos).sort((a, b) => a === 'N-1' ? -1 : b === 'N-1' ? 1 : a.localeCompare(b)), actual = ctx.nivelId || nivel.id;
    const cambiosDe = id => P.compararProgramas(programaDe(id), r.pisos[id]), cambiosActual = r.pisos[actual] ? cambiosDe(actual) : [];
    const texto = c => c.tipo === 'nueva' ? `nueva: ${corta(c.despues[0])} → ${corta(c.despues[1])}` : c.tipo === 'quitada' ? 'ya no está en el programa' : `${corta(c.antes[0])} → ${corta(c.antes[1])} pasa a ${corta(c.despues[0])} → ${corta(c.despues[1])}${c.corre ? ` (término ${c.corre > 0 ? '+' : ''}${c.corre} días)` : ''}`;
    zona.hidden = false;
    zona.innerHTML = `<section class="lpCycleCard"><div class="chartHeading"><h3>Programa leído · ${esc(r.revision.archivo)}</h3></div>
      <p class="lpCycleNote">${esc(r.revision.titulo)}${r.revision.estado ? ' · fecha de estado ' + corta(r.revision.estado) : ''}. Entran las tareas del Módulo A con piso de Atlas y código de partida. Quedan fuera ${r.fuera.otroModulo} tareas de otros módulos y ${r.fuera.sinPiso} sin piso (hitos, obras generales, otros subterráneos y cubierta). No se leen recursos ni montos.</p>
      <div class="lpCycleTableWrap"><table class="lpCycleTable"><thead><tr><th>Piso</th><th>Partidas</th><th>Respecto de lo guardado</th></tr></thead><tbody>${ids.map(id => { const c = cambiosDe(id), previo = programaDe(id); return `<tr><td data-label="Piso">${esc(nombrePiso(id))}${pisos.some(p => p.id === id) ? '' : ' <small>(aún sin planos en Atlas)</small>'}</td><td data-label="Partidas">${r.pisos[id].tareas.length}</td><td data-label="Cambios">${!previo ? 'Primera carga' : c.length ? `${c.filter(x => x.tipo === 'fechas').length} con fechas movidas · ${c.filter(x => x.tipo === 'nueva').length} nuevas · ${c.filter(x => x.tipo === 'quitada').length} quitadas` : 'Sin cambios'}</td></tr>`; }).join('')}</tbody></table></div>
      ${programaDe(actual) && cambiosActual.length ? `<details open><summary>Cambios en ${esc(nombrePiso(actual))}</summary><ul>${cambiosActual.slice(0, 60).map(c => `<li><b>${esc(c.codigo)}</b> ${esc(c.partida)}: ${texto(c)}</li>`).join('')}</ul>${cambiosActual.length > 60 ? `<p>… y ${cambiosActual.length - 60} más.</p>` : ''}</details>` : ''}
      <p class="lpCycleNote">Las ventanas por sector ya guardadas se conservan en las partidas que siguen en el programa.</p>
      <div class="lpCycleActions"><button type="button" class="primary" data-programa-guardar>Guardar en la nube</button><button type="button" data-programa-cancelar>Cancelar</button></div><p role="status" data-programa-aviso></p></section>`;
    zona.querySelector('[data-programa-cancelar]').onclick = () => { estado.lectura = null; pintar(); };
    zona.querySelector('[data-programa-guardar]').onclick = async e => {
      const aviso = zona.querySelector('[data-programa-aviso]'), por = firmante();
      if (!por) { aviso.textContent = 'Inicia sesión en Atlas para guardar el programa.'; exigirFirma('Inicia sesión en Atlas para guardar el programa.'); return; }
      e.target.disabled = true; aviso.textContent = 'Guardando en la nube…';
      try {
        const hechos = await guardarProgramaNube(r.pisos, {por});
        estado.lectura = null; ctx.toast?.(`Programa guardado: ${hechos.length} pisos, ${hechos.reduce((n, h) => n + h.tareas, 0)} partidas.`);
        montarPrograma(el, ctx);
      } catch (error) { aviso.textContent = error.message; e.target.disabled = false; }
    };
  };
  pintar();
  if (entrada) entrada.onchange = async () => {
    const archivo = entrada.files[0]; entrada.value = ''; if (!archivo) return;
    mensaje.textContent = 'Leyendo el programa…';
    try {
      estado.lectura = await leerArchivoPrograma(archivo, bytes => { mensaje.textContent = `Leyendo el programa… ${Math.round(bytes / 1048576)} MB`; });
      mensaje.textContent = ''; pintar(); zona.scrollIntoView({block: 'nearest'});
    } catch (error) { estado.lectura = null; pintar(); mensaje.textContent = error.message; }
  };
}
