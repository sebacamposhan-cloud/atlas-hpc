// Libreta «Mis tareas», asignación al equipo y vista del equipo, dentro de la hoja de Control de obra (navegacion.mjs).
// App de terreno: una función por pantalla, botones de al menos 44 px y textos simples. Todo se guarda primero en este
// equipo (jerarquia-store.mjs) y sube con Nube. El frente se elige con el selector de superficies de Last Planner y el
// avance se marca tocando los recintos en el plano.
import * as J from './jerarquia-model.mjs';
import * as S from './jerarquia-store.mjs';
import {allowed, isoToday} from './lastplanner-cycle-model.mjs';
import {readWorkflow} from './lastplanner-cycle-store.mjs';

const pct = v => v == null ? '—' : Math.round(v * 100) + ' %';
const dia = f => f ? f.slice(8, 10) + '-' + f.slice(5, 7) : '';
const MOTIVOS_DEVOLVER = ['Falta terminar', 'Hay que corregir', 'Falta limpieza'];
const MOTIVOS_REASIGNAR = ['Persona ausente', 'Cambio de cargo', 'Otra prioridad'];

// ctx: {esc, toast, nivelId, pisos, path, footprint, verPuntos, spatial, abrir, irAPiso, svg}
export function createTareas(ctx) {
  const {esc} = ctx;
  let datos = {actor: null, perfil: null, personas: [], metas: []}, vista = null, cuerpo = null, hoja = null;
  let detalle = null, persona = null, accion = null, borrador = null, actividades = [], enCola = 0, avisos = [], foco = null, marcando = null;
  const yo = () => datos.actor?.id;
  const meta = id => datos.metas.find(m => m.id === id);
  const quien = id => J.nombreDe(datos.personas.find(p => p.id === id));
  const puede = permiso => allowed(datos.actor, permiso);
  const asigna = () => J.perfilActivo(datos.perfil) && datos.perfil.area === 'linea' && J.NIVELES_QUE_ASIGNAN.includes(datos.perfil.nivel) && puede('draft');

  async function recargar() {
    datos = await S.leerJerarquia();
    [enCola, avisos] = await Promise.all([S.tareasPendientesDeSubir(), S.avisosTareas()]);
    if (cuerpo?.isConnected && vista) pintar();
    pintarPlano(); pintarBarra();
    return datos;
  }
  const contador = () => datos.perfil && yo() ? J.pendientes(datos.metas, yo()).total : 0;

  // ── Hoja ──
  function mostrar(id, el, opciones) {
    vista = id; cuerpo = el; hoja = opciones; accion = null;
    if (id !== 'mias') detalle = null;
    if (id !== 'equipo') persona = null;
    if (id === 'asignar' && !borrador) borrador = nuevoBorrador();
    el.onclick = clic; el.oninput = escribir; el.onchange = escribir;
    pintar();
    recargar().catch(e => ctx.toast(e.message));
  }
  const nuevoBorrador = (extra = {}) => ({paso: 1, asignadaA: null, titulo: '', detalle: '', padre: '', actividadId: '', piso: ctx.nivelId, fechaLimite: '', alcances: [], ...extra});
  function pintar() {
    if (!cuerpo?.isConnected) return;
    if (!datos.perfil) { cuerpo.innerHTML = '<p class="jerVacio">Tu cuenta aún no tiene un perfil en la jerarquía de obra. Pide a la administración que lo cargue.</p>'; return; }
    const html = vista === 'mias' ? (detalle ? vistaTarea(meta(detalle)) : vistaMias()) : vista === 'asignar' ? vistaAsignar() : (persona ? vistaPersona(persona) : vistaEquipo());
    cuerpo.innerHTML = estadoNube() + html;
    hoja?.titulo?.(vista === 'mias' ? (detalle ? 'Tarea' : 'Mis tareas') : vista === 'asignar' ? 'Asignar a mi equipo' : persona ? quien(persona) : 'Mi equipo');
  }
  function estadoNube() {
    return (enCola ? `<p class="jerCola" role="status">${enCola === 1 ? '1 cambio guardado en este equipo' : enCola + ' cambios guardados en este equipo'}. Se sube solo cuando haya señal.</p>` : '')
      + avisos.map(a => `<div class="jerAviso" role="alert"><p>${esc(a.mensaje)}</p><button type="button" data-jer="aviso" data-id="${esc(a.id)}">Entendido</button></div>`).join('');
  }
  const barraAvance = v => `<span class="jerBarra" aria-hidden="true"><i style="width:${Math.round((v || 0) * 100)}%"></i></span>`;
  const chip = m => `<span class="jerEstado" data-estado="${m.estado}">${esc(J.ETIQUETA[m.estado])}</span>`;
  function tarjeta(m, {para = false, botones = ''} = {}) {
    const v = J.avanceMeta(m, datos.metas), venc = J.vencida(m, isoToday());
    return `<article class="jerTarea${venc ? ' vencida' : ''}"><button type="button" class="jerTareaAbrir" data-jer="abrir" data-id="${m.id}"><span class="jerTareaTitulo">${esc(m.titulo)}</span>
      <small>${para ? 'Para ' + esc(quien(m.asignadaA)) : 'De ' + esc(quien(m.asignadaPor))}${m.piso ? ' · Piso ' + esc(pisoCorto(m.piso)) : ''}${m.fechaLimite ? ' · ' + (venc ? 'venció el ' : 'hasta el ') + dia(m.fechaLimite) : ''}</small>
      <span class="jerTareaFila">${chip(m)}${barraAvance(v)}<b>${pct(v)}</b></span>${m.estado === 'devuelta' ? `<span class="jerMotivo">Devuelta: ${esc(m.motivo)}</span>` : ''}</button>${botones}</article>`;
  }
  const pisoCorto = id => ctx.pisos.find(p => p.id === id)?.corto || id;
  const orden = (a, b) => (b.estado === 'devuelta') - (a.estado === 'devuelta') || String(a.fechaLimite || '9999').localeCompare(String(b.fechaLimite || '9999')) || a.creada.localeCompare(b.creada);

  // ── Mis tareas ──
  function vistaMias() {
    const mias = datos.metas.filter(m => m.asignadaA === yo()), abiertas = mias.filter(m => J.ABIERTAS.includes(m.estado)).sort(orden);
    const porConfirmar = mias.filter(m => m.estado === 'hecha'), listas = mias.filter(m => m.estado === 'confirmada').sort((a, b) => b.actualizada.localeCompare(a.actualizada)).slice(0, 10);
    return `<p class="jerResumen"><b>${abiertas.length}</b> ${abiertas.length === 1 ? 'tarea por hacer' : 'tareas por hacer'}</p>
      ${abiertas.map(m => tarjeta(m)).join('') || '<p class="jerVacio">No tienes tareas pendientes.</p>'}
      ${porConfirmar.length ? `<h3 class="jerSeccion">Esperando confirmación (${porConfirmar.length})</h3>${porConfirmar.map(m => tarjeta(m)).join('')}` : ''}
      ${listas.length ? `<details class="jerListas"><summary>Confirmadas (${listas.length})</summary>${listas.map(m => tarjeta(m)).join('')}</details>` : ''}`;
  }
  function vistaTarea(m) {
    if (!m) { detalle = null; return vistaMias(); }
    const mia = m.asignadaA === yo(), abierta = J.ABIERTAS.includes(m.estado), v = J.avanceMeta(m, datos.metas), marca = mia && abierta && puede('execution');
    const recintos = [...new Map(m.alcances.map(s => [s.roomId, s])).values()];
    const hecho = r => m.alcances.filter(s => s.roomId === r.roomId).every(s => (m.marcas[s.id]?.avance || 0) >= 1);
    return `<button type="button" class="jerVolver" data-jer="volver">← Mis tareas</button>
      <h3 class="jerTitulo">${esc(m.titulo)}</h3>
      <p class="jerDato">${chip(m)} De ${esc(quien(m.asignadaPor))}${m.piso ? ' · Piso ' + esc(pisoCorto(m.piso)) : ''}${m.fechaLimite ? ' · hasta el ' + dia(m.fechaLimite) : ''}</p>
      ${m.detalle ? `<p class="jerTexto">${esc(m.detalle)}</p>` : ''}${m.estado === 'devuelta' ? `<p class="jerMotivo">Devuelta: ${esc(m.motivo)}</p>` : ''}
      <div class="jerAvanceGrande">${barraAvance(v)}<b>${pct(v)}</b></div>
      ${m.alcances.length ? `<div class="jerAcciones"><button type="button" data-jer="ver" data-id="${m.id}">Ver en el plano</button>${marca ? `<button type="button" class="primary" data-jer="marcar" data-id="${m.id}">Marcar en el plano</button>` : ''}</div>
        <h4 class="jerSeccion">Frente: ${recintos.length} ${recintos.length === 1 ? 'recinto' : 'recintos'}</h4>
        <ul class="jerRecintos">${recintos.map(r => `<li><span><b>${esc(r.code)}</b><small>${esc(r.name || '')}</small></span>${marca ? `<button type="button" data-jer="recinto" data-id="${m.id}" data-room="${esc(r.roomId)}" aria-pressed="${hecho(r)}">${hecho(r) ? '✓ Hecho' : 'Marcar hecho'}</button>` : `<em>${hecho(r) ? '✓ Hecho' : 'Pendiente'}</em>`}</li>`).join('')}</ul>`
      : marca ? `<h4 class="jerSeccion">¿Cuánto llevas?</h4><div class="jerPasos">${[0, .25, .5, .75].map(x => `<button type="button" data-jer="manual" data-id="${m.id}" data-valor="${x}" aria-pressed="${m.avanceManual === x}">${x * 100} %</button>`).join('')}</div>` : ''}
      ${marca ? `<button type="button" class="primary jerPrincipal" data-jer="hecha" data-id="${m.id}">Terminé esta tarea</button><small class="jerAyuda">Quien te la asignó la confirma o te la devuelve.</small>` : ''}`;
  }

  // ── Asignar ──
  function vistaAsignar() {
    const b = borrador, gente = J.asignables(datos.personas, yo());
    if (!asigna()) return '<p class="jerVacio">Tu cargo no asigna tareas en esta versión.</p>';
    if (b.paso === 3) return `<p class="jerListo" role="status">Tarea asignada a <b>${esc(quien(b.asignadaA))}</b>. Le aparece en su libreta cuando ambos tengan señal.</p>
      <div class="jerAcciones"><button type="button" class="primary" data-jer="otra">Asignar otra</button><button type="button" data-jer="ir-equipo">Ver mi equipo</button></div>`;
    if (b.paso === 1) return `${b.actividadId ? `<p class="jerDato">Desde Last Planner: <b>${esc(b.titulo)}</b></p>` : ''}<h3 class="jerPregunta">¿A quién?</h3>
      ${gente.map(p => `<button type="button" class="jerPersona" data-jer="persona" data-id="${p.id}"><b>${esc(J.nombreDe(p))}</b><small>${esc(J.cargoDe(p))}${p.pisos.length ? ' · Piso ' + p.pisos.map(pisoCorto).map(esc).join(', ') : ''}${p.empresa ? ' · ' + esc(p.empresa) : ''}</small></button>`).join('')
      || '<p class="jerVacio">Aún no tienes personas a tu cargo en la jerarquía. Pide a la administración que las cargue.</p>'}`;
    const destino = datos.personas.find(p => p.id === b.asignadaA), pisosDestino = ctx.pisos.filter(p => J.trabajaEnPiso(destino, p.id));
    const recibidas = datos.metas.filter(m => m.asignadaA === yo() && J.ABIERTAS.includes(m.estado) && (!m.piso || m.piso === b.piso));
    const lps = actividades.filter(a => a.level === b.piso), recintos = new Set(b.alcances.map(s => s.roomId)).size;
    return `<button type="button" class="jerVolver" data-jer="paso1">← Cambiar persona</button>
      <p class="jerDato">Para <b>${esc(quien(b.asignadaA))}</b></p>
      <label class="jerCampo">¿Qué tiene que hacer?<input data-jer-campo="titulo" maxlength="200" value="${esc(b.titulo)}" placeholder="Ej.: Pavimento de pasillo norte" autocomplete="off"></label>
      <label class="jerCampo">Piso<select data-jer-campo="piso">${pisosDestino.map(p => `<option value="${p.id}" ${p.id === b.piso ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
      <label class="jerCampo">Actividad de Last Planner (opcional)<select data-jer-campo="actividadId"><option value="">Sin actividad</option>${lps.map(a => `<option value="${esc(a.id)}" ${a.id === b.actividadId ? 'selected' : ''}>${esc(a.semana + ' · ' + a.actividad)}</option>`).join('')}</select></label>
      ${recibidas.length ? `<label class="jerCampo">Es parte de (opcional)<select data-jer-campo="padre"><option value="">Tarea nueva</option>${recibidas.map(m => `<option value="${m.id}" ${m.id === b.padre ? 'selected' : ''}>${esc(m.titulo)}</option>`).join('')}</select></label>` : ''}
      <label class="jerCampo">Hasta el (opcional)<input type="date" data-jer-campo="fechaLimite" value="${esc(b.fechaLimite)}" min="${isoToday()}"></label>
      <div class="jerFrente"><span><b>Frente de trabajo</b><small>${recintos ? recintos + (recintos === 1 ? ' recinto' : ' recintos') + ' · ' + b.alcances.length + (b.alcances.length === 1 ? ' superficie' : ' superficies') : 'Sin frente: la persona marca el avance en %.'}</small></span><button type="button" data-jer="frente">${recintos ? 'Cambiar en el plano' : 'Marcar en el plano'}</button></div>
      <label class="jerCampo">Indicaciones (opcional)<textarea data-jer-campo="detalle" maxlength="2000" rows="2">${esc(b.detalle)}</textarea></label>
      <button type="button" class="primary jerPrincipal" data-jer="asignar">Asignar tarea</button>`;
  }
  function escribir(e) {
    const campo = e.target.dataset?.jerCampo; if (!campo || !borrador) return;
    borrador[campo] = e.target.value;
    if (campo === 'piso') { borrador.alcances = []; borrador.actividadId = ''; borrador.padre = ''; pintar(); }
    if (campo === 'actividadId' && e.type === 'change') { const a = actividades.find(x => x.id === borrador.actividadId); borrador.alcances = a ? structuredClone(a.alcances) : []; if (a && !borrador.titulo) borrador.titulo = a.actividad; pintar(); }
  }
  async function cargarActividades() {
    try { actividades = (await readWorkflow()).actividades.filter(a => !a.archivada && !String(a.id).startsWith('demo-') && a.fase !== 'cerrada').sort((a, b) => b.semana.localeCompare(a.semana) || a.actividad.localeCompare(b.actividad, 'es')); }
    catch { actividades = []; }
  }
  async function elegirFrente() {
    const b = borrador, actividad = actividades.find(a => a.id === b.actividadId);
    hoja?.cerrar();
    let elegidas = null;
    try { elegidas = await ctx.spatial({level: b.piso, scopes: b.alcances, mode: actividad?.alcances[0]?.tipo || 'recinto', purpose: 'meta', ...(actividad ? {allowed: actividad.alcances} : {})}); }
    catch (e) { ctx.toast(e.message); }
    if (elegidas) b.alcances = elegidas.map(s => { const c = structuredClone(s); delete c.locationOnly; return c; });
    ctx.abrir('asignar');
  }
  async function enviarAsignacion() {
    const b = borrador;
    try {
      await S.asignar({asignadaA: b.asignadaA, titulo: b.titulo, detalle: b.detalle || null, padre: b.padre || null, actividadId: b.actividadId || null, piso: b.piso, fechaLimite: b.fechaLimite || null, alcances: b.alcances});
      b.paso = 3; await recargar();
    } catch (e) { ctx.toast(e.message); }
  }
  async function prepararAsignacion(actividadId) {
    await cargarActividades();
    const a = actividades.find(x => x.id === actividadId);
    borrador = nuevoBorrador(a ? {actividadId: a.id, piso: a.level, titulo: a.actividad, alcances: structuredClone(a.alcances).map(s => { delete s.locationOnly; return s; })} : {});
  }

  // ── Mi equipo ──
  const confirmable = m => m.estado === 'hecha' && J.gestiona(datos.personas, yo(), m) && puede('verify');
  const gestionable = m => J.ABIERTAS.includes(m.estado) && puede('draft') && (J.gestiona(datos.personas, yo(), m) || J.esSuperior(datos.personas, yo(), m.asignadaA));
  function botonesTarea(m) {
    if (accion?.id === m.id) return formularioAccion(m);
    const b = [];
    if (m.alcances.length) b.push(`<button type="button" data-jer="ver" data-id="${m.id}">Ver en el plano</button>`);
    if (confirmable(m)) b.push(`<button type="button" class="primary" data-jer="confirmar" data-id="${m.id}">Confirmar</button>`, `<button type="button" data-jer="pedir" data-tipo="devolver" data-id="${m.id}">Devolver</button>`);
    if (gestionable(m) && asigna()) b.push(`<button type="button" data-jer="pedir" data-tipo="reasignar" data-id="${m.id}">Reasignar</button>`);
    if ((gestionable(m) || m.estado === 'hecha' && J.gestiona(datos.personas, yo(), m) && puede('draft'))) b.push(`<button type="button" data-jer="pedir" data-tipo="anular" data-id="${m.id}">Anular</button>`);
    return b.length ? `<div class="jerAcciones">${b.join('')}</div>` : '';
  }
  function formularioAccion(m) {
    const tipo = accion.tipo, rapidos = tipo === 'devolver' ? MOTIVOS_DEVOLVER : tipo === 'reasignar' ? MOTIVOS_REASIGNAR : [];
    const otros = tipo === 'reasignar' ? J.asignables(datos.personas, yo()).filter(p => p.id !== m.asignadaA && J.trabajaEnPiso(p, m.piso)) : [];
    return `<div class="jerFormAccion"><b>${tipo === 'devolver' ? '¿Qué falta?' : tipo === 'reasignar' ? '¿A quién se la pasas?' : '¿Por qué se anula?'}</b>
      ${tipo === 'reasignar' ? (otros.map(p => `<button type="button" class="jerPersona" data-jer="destino" data-id="${p.id}" aria-pressed="${accion.destino === p.id}"><b>${esc(J.nombreDe(p))}</b><small>${esc(J.cargoDe(p))}</small></button>`).join('') || '<p class="jerVacio">No hay otra persona a tu cargo en ese piso.</p>') : ''}
      ${rapidos.length ? `<div class="jerPasos">${rapidos.map(r => `<button type="button" data-jer="motivo" data-valor="${esc(r)}" aria-pressed="${accion.motivo === r}">${esc(r)}</button>`).join('')}</div>` : ''}
      <input data-jer-motivo value="${esc(accion.motivo || '')}" maxlength="2000" placeholder="Escribe el motivo" aria-label="Motivo">
      <div class="jerAcciones"><button type="button" class="primary" data-jer="aplicar" data-id="${m.id}">${tipo === 'devolver' ? 'Devolver' : tipo === 'reasignar' ? 'Reasignar' : 'Anular tarea'}</button><button type="button" data-jer="cancelar">Cancelar</button></div></div>`;
  }
  function vistaEquipo() {
    const filas = J.resumenEquipo(datos.personas, datos.metas, yo()), porConfirmar = datos.metas.filter(confirmable).sort(orden);
    const todas = datos.metas.filter(m => m.asignadaPor === yo() || filas.some(f => f.persona.id === m.asignadaA)), total = J.resumen(todas, datos.metas);
    return `${porConfirmar.length ? `<h3 class="jerSeccion">Por confirmar (${porConfirmar.length})</h3>${porConfirmar.map(m => tarjeta(m, {para: true, botones: botonesTarea(m)})).join('')}` : ''}
      <div class="jerTotal"><span>Cumplimiento del equipo</span><b>${pct(total.cumplimiento)}</b><small>${total.confirmadas} de ${total.total} confirmadas · avance ${pct(total.avance)}</small></div>
      <ul class="jerEquipo">${filas.map(f => `<li><button type="button" data-jer="persona-ver" data-id="${f.persona.id}"><span class="jerEquipoNombre"><b>${esc(J.nombreDe(f.persona))}</b><small>${esc(J.cargoDe(f.persona))}${f.persona.activo ? '' : ' · inactivo'}</small></span>
        <span class="jerEquipoDato">${barraAvance(f.cumplimiento)}<b>${pct(f.cumplimiento)}</b><small>${f.confirmadas}/${f.total} confirmadas${f.abiertas ? ' · ' + f.abiertas + ' por hacer' : ''}${f.porConfirmar ? ' · ' + f.porConfirmar + ' por confirmar' : ''}</small></span></button></li>`).join('')
        || '<li class="jerVacio">Aún no hay personas a tu cargo con tareas.</li>'}</ul>`;
  }
  function vistaPersona(id) {
    const lista = datos.metas.filter(m => m.asignadaA === id && m.estado !== 'anulada').sort(orden), r = J.resumen(lista, datos.metas);
    return `<button type="button" class="jerVolver" data-jer="volver-equipo">← Mi equipo</button>
      <p class="jerDato">${esc(J.cargoDe(datos.personas.find(p => p.id === id)))} · cumplimiento <b>${pct(r.cumplimiento)}</b> · avance <b>${pct(r.avance)}</b></p>
      ${lista.map(m => tarjeta(m, {para: true, botones: botonesTarea(m)})).join('') || '<p class="jerVacio">Sin tareas.</p>'}`;
  }

  // ── Acciones ──
  async function hacer(fn, despues) { try { await fn(); accion = null; despues?.(); await recargar(); } catch (e) { ctx.toast(e.message); } }
  function clic(e) {
    const b = e.target.closest('[data-jer]'); if (!b || b.disabled) return;
    const id = b.dataset.id, t = b.dataset.jer;
    if (t === 'abrir') { if (vista === 'mias') detalle = id; else if (meta(id)?.alcances.length) return verEnPlano(id); pintar(); cuerpo.scrollTop = 0; }
    else if (t === 'volver') { detalle = null; pintar(); }
    else if (t === 'volver-equipo') { persona = null; accion = null; pintar(); }
    else if (t === 'persona-ver') { persona = id; pintar(); cuerpo.scrollTop = 0; }
    else if (t === 'ver') verEnPlano(id);
    else if (t === 'marcar') marcarEnPlano(id);
    else if (t === 'recinto') { const m = meta(id), propias = m.alcances.filter(s => s.roomId === b.dataset.room), hechas = propias.every(s => (m.marcas[s.id]?.avance || 0) >= 1); hacer(() => S.avanzar(id, {marcas: Object.fromEntries(propias.map(s => [s.id, hechas ? 0 : 1]))})); }
    else if (t === 'manual') hacer(() => S.avanzar(id, {avanceManual: Number(b.dataset.valor)}));
    else if (t === 'hecha') hacer(() => S.hecha(id), () => { ctx.toast('Listo. Quedó esperando la confirmación de quien te la asignó.'); });
    else if (t === 'confirmar') hacer(() => S.confirmar(id));
    else if (t === 'pedir') { accion = {id, tipo: b.dataset.tipo, motivo: '', destino: null}; pintar(); }
    else if (t === 'cancelar') { accion = null; pintar(); }
    else if (t === 'motivo') { accion.motivo = b.dataset.valor; pintar(); }
    else if (t === 'destino') { accion.destino = id; pintar(); }
    else if (t === 'aplicar') {
      const motivo = (cuerpo.querySelector('[data-jer-motivo]')?.value || accion.motivo || '').trim();
      if (accion.tipo === 'reasignar' && !accion.destino) return ctx.toast('Elige a quién se la pasas.');
      hacer(() => accion.tipo === 'devolver' ? S.devolver(id, motivo) : accion.tipo === 'reasignar' ? S.reasignar(id, accion.destino, motivo) : S.anular(id, motivo));
    }
    else if (t === 'persona') { borrador.asignadaA = id; borrador.paso = 2; const destino = datos.personas.find(p => p.id === id); if (!J.trabajaEnPiso(destino, borrador.piso)) { borrador.piso = destino.pisos[0]; borrador.alcances = []; borrador.actividadId = ''; } cargarActividades().then(pintar); pintar(); }
    else if (t === 'paso1') { borrador.paso = 1; pintar(); }
    else if (t === 'frente') elegirFrente();
    else if (t === 'asignar') enviarAsignacion();
    else if (t === 'otra') { borrador = nuevoBorrador(); pintar(); }
    else if (t === 'ir-equipo') { borrador = null; ctx.abrir('equipo'); }
    else if (t === 'aviso') S.descartarAviso(id).then(recargar);
  }
  // Escribir el motivo no vuelve a dibujar la hoja (no se pierde el foco del teclado).
  document.addEventListener('input', e => { if (accion && e.target.matches?.('[data-jer-motivo]')) accion.motivo = e.target.value; });

  // ── Plano ──
  const capa = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  capa.id = 'jerTareasLayer'; capa.setAttribute('pointer-events', 'none'); ctx.svg?.append(capa);
  const barra = document.createElement('div');
  barra.id = 'jerMarcado'; barra.hidden = true; barra.setAttribute('role', 'region'); barra.setAttribute('aria-label', 'Marcar avance en el plano');
  document.querySelector('main')?.append(barra);
  const trazo = s => { const g = s.geometry; if (!g?.points?.length) return ctx.path(s.roomId) || ''; return 'M' + g.points.map(p => p.join(',')).join('L') + (g.type === 'polygon' ? 'Z' + (g.holes || []).map(h => 'M' + h.map(p => p.join(',')).join('L') + 'Z').join('') : ''); };
  function pintarPlano() {
    const m = foco && meta(foco);
    if (!m || (m.piso && m.piso !== ctx.nivelId)) { capa.replaceChildren(); return; }
    capa.innerHTML = m.alcances.map(s => {
      const hecho = m.estado === 'hecha' || m.estado === 'confirmada' || (m.marcas[s.id]?.avance || 0) >= 1, linea = s.geometry?.type === 'line';
      return `<path class="jerFrente${hecho ? ' hecho' : ''}" d="${esc(trazo(s))}" fill="${linea ? 'none' : hecho ? '#1b2a56' : '#29a8df'}" fill-opacity="${hecho ? .55 : .32}" fill-rule="evenodd" stroke="${hecho ? '#1b2a56' : '#0f5499'}" stroke-width="${linea ? 7 : 2.5}" ${hecho ? '' : 'stroke-dasharray="7 4"'} vector-effect="non-scaling-stroke"/>`;
    }).join('');
  }
  function pintarBarra() {
    const m = marcando && meta(marcando);
    if (!m) { barra.hidden = true; document.body.classList.remove('jerMarcando'); return; }
    const recintos = [...new Set(m.alcances.map(s => s.roomId))], hechos = recintos.filter(r => m.alcances.filter(s => s.roomId === r).every(s => (m.marcas[s.id]?.avance || 0) >= 1)).length;
    const abierta = J.ABIERTAS.includes(m.estado);
    barra.innerHTML = `<div><b>${esc(m.titulo)}</b><small>${abierta ? 'Toca cada recinto terminado. Tócalo de nuevo para desmarcar.' : 'La tarea ya no está abierta.'}</small></div><span class="jerMarcadoCuenta"><b>${hechos}</b> de ${recintos.length}</span><button type="button" class="primary" data-jer-listo>Listo</button>`;
    barra.querySelector('[data-jer-listo]').onclick = terminarMarcado;
    barra.hidden = false; document.body.classList.add('jerMarcando');
  }
  function encuadrar(m) {
    const puntos = m.alcances.flatMap(s => s.geometry?.points || ctx.footprint(s.roomId)?.rings?.[0]?.polygon || []);
    if (puntos.length) ctx.verPuntos(puntos);
  }
  function verEnPlano(id) {
    const m = meta(id); if (!m) return;
    if (m.piso && m.piso !== ctx.nivelId) return ctx.irAPiso(m.piso, 'tarea=' + id);
    foco = id; marcando = null; hoja?.cerrar(); pintarPlano(); pintarBarra(); encuadrar(m);
  }
  function marcarEnPlano(id) {
    const m = meta(id); if (!m) return;
    if (m.piso && m.piso !== ctx.nivelId) return ctx.irAPiso(m.piso, 'tarea=' + id + ':marcar');
    foco = id; marcando = id; hoja?.cerrar(); pintarPlano(); pintarBarra(); encuadrar(m);
  }
  function terminarMarcado() { const id = marcando; marcando = null; pintarBarra(); detalle = id; ctx.abrir('mias'); }
  // Toque en un recinto mientras se marca: alterna «hecho» en todas las superficies de la tarea en ese recinto.
  function tocar(room) {
    const m = marcando && meta(marcando); if (!m) return false;
    if (!J.ABIERTAS.includes(m.estado)) { ctx.toast('La tarea ya no está abierta.'); return true; }
    const propias = m.alcances.filter(s => s.roomId === room?.id);
    if (!propias.length) { ctx.toast('Ese recinto no es parte de esta tarea.'); return true; }
    const hechas = propias.every(s => (m.marcas[s.id]?.avance || 0) >= 1);
    S.avanzar(m.id, {marcas: Object.fromEntries(propias.map(s => [s.id, hechas ? 0 : 1]))}).then(recargar).catch(e => ctx.toast(e.message));
    return true;
  }
  function limpiarPlano() { if (marcando) return; foco = null; pintarPlano(); }

  // ── Last Planner: resumen en la ficha de la actividad y acceso para asignarla ──
  function resumenActividad(a) {
    if (!datos.perfil || !a) return '';
    const r = J.avanceActividad(a, datos.metas), propias = datos.metas.filter(m => m.actividadId === a.id && m.estado !== 'anulada');
    return `<div class="jerEnActividad"><p><b>Tareas del equipo: ${r.tareas}</b> · avance en terreno ${pct(r.avance)}</p>${propias.length ? `<ul>${propias.map(m => `<li>${esc(quien(m.asignadaA))} · ${esc(J.ETIQUETA[m.estado])} · ${pct(J.avanceMeta(m, datos.metas))}</li>`).join('')}</ul>` : ''}${asigna() && a.fase !== 'cerrada' ? `<button type="button" data-jer-asignar-actividad="${esc(a.id)}">Asignar a mi equipo</button>` : ''}</div>`;
  }

  return {mostrar, recargar, contador, tocar, marcando: () => !!marcando, verEnPlano, marcarEnPlano, limpiarPlano, pintarPlano, resumenActividad, prepararAsignacion, perfil: () => datos.perfil};
}
