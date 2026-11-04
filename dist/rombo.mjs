// Rombo interactivo del recinto: avance y observaciones juntos. Cada sección es una terminación, ubicada como en el rombo
// de las láminas (M1 arriba, M2 derecha, M3 abajo, M4 izquierda, cielo al centro arriba y pavimento al centro abajo). Su
// color es el estado de ejecución y un número rojo cuenta las observaciones pendientes de ese elemento. Tocar una sección
// despliega sus partidas del avance, cada una con dos filas (ejecución, con su % mientras se ejecuta, y revisión) que se
// guardan al tocarlas: el color de la terminación se calcula desde ellas. Una terminación sin partidas se marca directo.
// Firma la cuenta de Nube del equipo; el detalle de lo observado va solo en las observaciones con foto. Fuera del rombo
// dibuja el panel de avance del recinto (bajo su nombre) y el bloque de protocolos previos de todas sus partidas.
import {loadPma} from './pma.mjs';
import {nivel} from './level.mjs';
import {tasksFor, reportProgress, keyFor, fields, ESTADOS_PARTIDA, COLOR_PARTIDA, estadoPartida, actualizarPartida, esMuro, muroUnico} from './room-progress-model.mjs';
import {readProgress, saveProgress} from './room-progress-store.mjs';
import {progressFloors, progressFloor} from './progress-scope.mjs';
import {cargarAvance, m2, unidad} from './avance.mjs';
import {partidasDeTerminacion, partidasDeMuros, estadoTerminacion, actualizarNodo, sembrarTerminacion, resumenRecinto, EJECUCION, REVISION} from './avance-model.mjs';
import {guardarAvance} from './avance-store.mjs';
import {firmante, exigirFirma, pedirSesion} from './firma.mjs';
import {palancaHTML, activarPalancas} from './palanca.mjs';

const ZONAS = {
  M1: {puntos: '75,85 150,10 225,85 205,105 95,105', texto: [150, 66], aviso: [180, 54]},
  M2: {puntos: '225,85 290,150 225,215 205,195 205,105', texto: [240, 150], aviso: [222, 110]},
  M3: {puntos: '225,215 150,290 75,215 95,195 205,195', texto: [150, 240], aviso: [176, 212]},
  M4: {puntos: '75,215 10,150 75,85 95,105 95,195', texto: [60, 150], aviso: [60, 110]},
  CIE: {puntos: '95,105 205,105 205,150 95,150', texto: [150, 128], aviso: [183, 108]},
  PAV: {puntos: '95,150 205,150 205,195 95,195', texto: [150, 173], aviso: [183, 153]}
};
const NOMBRE_OBS = {PAV: 'Pavimento', CIE: 'Cielo', M: 'Muros'}, MUROS = ['M1', 'M2', 'M3', 'M4'];
const OSCUROS = new Set(['No iniciado', 'En proceso', 'Instalado · por revisar', 'Con observaciones', 'Instalado y conforme']);
const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const fecha = d => String(d || '').split('-').reverse().join('-');

// Dibujo del rombo (SVG). partes: {campo: {codigo, estado, pendientes}}; elegido: campo seleccionado ('M' = los cuatro muros).
const elegidaEn = (elegido, campo) => elegido === campo || (elegido === 'M' && esMuro(campo));
export function romboSVG(partes, elegido, esc = String, interactivo = true) {
  const parte = campo => {
    const p = partes[campo] || {codigo: '—', estado: 'Sin definición', pendientes: 0}, z = ZONAS[campo], oscuro = OSCUROS.has(p.estado), [x, y] = z.texto;
    const relleno = p.estado === 'No aplica' ? 'url(#romboNA)' : COLOR_PARTIDA[p.estado];
    const attrs = interactivo ? ` data-rombo="${campo}" role="button" tabindex="0" aria-pressed="${elegidaEn(elegido, campo)}"` : '';
    return `<g class="romboParte${elegidaEn(elegido, campo) ? ' romboElegida' : ''}"${attrs} aria-label="${esc(fields[campo])} ${esc(campo)} · ${esc(p.codigo)} · ${esc(p.estado)}${p.pendientes ? ` · ${p.pendientes} observaciones pendientes` : ''}"><title>${esc(fields[campo])} (${campo}) · ${esc(p.codigo)} · ${esc(p.estado)}</title>
      <polygon points="${z.puntos}" fill="${relleno}"/><text x="${x}" y="${y}" class="${oscuro ? 'claro' : ''}">${esc(p.codigo)}</text><text x="${x}" y="${y + 15}" class="romboCampo${oscuro ? ' claro' : ''}">${campo}</text>
      ${p.pendientes ? `<g class="romboAviso"><rect x="${z.aviso[0]}" y="${z.aviso[1]}" width="20" height="18"/><text x="${z.aviso[0] + 10}" y="${z.aviso[1] + 10}">${p.pendientes}</text></g>` : ''}</g>`;
  };
  // La elegida se dibuja al final para que su contorno quede encima.
  const orden = Object.keys(ZONAS).sort((a, b) => elegidaEn(elegido, a) - elegidaEn(elegido, b));
  return `<svg class="romboSVG" viewBox="0 0 300 300" role="group" aria-label="Rombo del recinto: toca una partida"><defs><pattern id="romboNA" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#fff"/><line x1="0" y1="0" x2="0" y2="8" stroke="#8c8c8c" stroke-width="2"/></pattern></defs>${orden.map(parte).join('')}</svg>`;
}

// ctx: {esc, toast, observaciones: () => Promise<{porCodigo}>, nuevaObservacion(room, campo, alGuardar), abrirObservacion(id, alCambiar),
//       verCodigo?(campo, codigo) para ver en el plano los recintos con ese código}
// ficha(root, room, {alGuardar, panel, previos}): panel y previos son los contenedores del panel de avance y de los
// protocolos previos; se ocultan si el recinto no tiene partidas o protocolos.
export function createRombo(ctx) {
  const esc = ctx.esc;
  // Dos pasos: el rombo del recinto, y al tocar una parte su menú de avance. abierta: partida con sus palancas desplegadas.
  let elegido = 'PAV', menu = false, abierta = null, recinto = null;
  async function ficha(root, room, {alGuardar = () => {}, panel = null, previos = null} = {}) {
    const serial = (Number(root.dataset.romboSerial) || 0) + 1; root.dataset.romboSerial = serial;
    if (recinto !== room.code) { recinto = room.code; menu = false; abierta = null; }
    const vigente = () => root.isConnected && Number(root.dataset.romboSerial) === serial;
    const enPiso = progressFloors[nivel.id] && progressFloor(room.level) === nivel.id;
    let model = null, snapshot = {records: []}, obs = [], avance = null;
    try { [model, snapshot] = enPiso ? await Promise.all([loadPma(), readProgress()]) : [null, {records: []}]; } catch (e) { model = null; }
    try { obs = ((await ctx.observaciones?.())?.porCodigo.get(String(room.code).trim()) || []); } catch {}
    try { avance = enPiso ? (await cargarAvance()).porCodigo.get(String(room.code).trim()) || null : null; } catch {}
    if (!vigente()) return;
    const actual = snapshot.records.find(r => r.key === keyFor(room.code, nivel.id));
    const todas = model ? tasksFor(model, room, nivel.id) : [], fila = model ? reportProgress(model, [room], snapshot.records, nivel.id).rows[0] : null;
    // Los muros van juntos ('M'): sus partidas sin repetir las comunes y un solo estado para los que aplican.
    const partidasDe = campo => !avance ? [] : campo === 'M' ? partidasDeMuros(avance.nodos, avance.row) : partidasDeTerminacion(avance.nodos, campo, avance.row);
    // Lo marcado directo en el rombo; con partidas registradas, su estado calculado manda.
    const marcadaUna = campo => { const t = todas.find(t => t.field === campo); if (!t) return null; const r = fila?.tasks.find(x => x.field === campo); return {...t, ...(r || {installation: 'Sin registrar', quality: 'Sin revisar', stale: false})}; };
    const marcada = campo => campo === 'M' ? muroUnico(MUROS.map(marcadaUna).filter(Boolean)) : marcadaUna(campo);
    const tarea = campo => { const t = marcada(campo), d = t && estadoTerminacion(partidasDe(campo)); return d ? {...t, ...d, stale: false} : t; };
    const codigo = campo => marcadaUna(campo)?.code || room.finishes?.find(f => f.field === campo)?.code || '—';
    const pendientes = campo => obs.filter(o => (campo === 'M' ? esMuro(o.terminacion) : o.terminacion === campo) && ['Abierta', 'En corrección', 'Corregida'].includes(o.estado));
    // Cada muro conserva su código; los que aplican llevan el estado de «Muros» y el número rojo suma los cuatro (en el primero que aplica).
    const estadoMuros = todas.length && tarea('M') ? estadoPartida(tarea('M')) : 'Sin definición', primerMuro = MUROS.find(c => marcadaUna(c)?.applicable);
    const partes = Object.fromEntries(Object.keys(ZONAS).map(c => [c, esMuro(c)
      ? {codigo: codigo(c), estado: !todas.length ? 'Sin definición' : marcadaUna(c)?.applicable ? estadoMuros : estadoPartida(marcadaUna(c)), pendientes: c === primerMuro ? pendientes('M').length : 0}
      : {codigo: codigo(c), estado: todas.length ? estadoPartida(tarea(c)) : 'Sin definición', pendientes: pendientes(c).length}]));
    const avisos = [...(fila?.warnings || []), ...(actual && model && actual.sourceSha !== model.source.sha256 ? ['El avance guardado es de otra versión del PMA.'] : [])];
    const registrable = !!(model && todas.length);
    const t = tarea(elegido), estado = elegido === 'M' ? estadoMuros : partes[elegido].estado, aplica = registrable && t?.applicable && t?.documented;
    const codigoElegido = elegido === 'M' ? t?.code || '—' : partes[elegido].codigo, nombreElegido = elegido === 'M' ? 'Muros' : fields[elegido];
    const ps = aplica ? partidasDe(elegido) : [], conPartidas = ps.length > 0, directo = aplica && !conPartidas;
    const previa = conPartidas && !ps.some(p => p.registrada) ? marcada(elegido) : null, traspasar = previa && !previa.stale && previa.installation !== 'Sin registrar';
    const lista = obs.filter(o => elegido === 'M' ? esMuro(o.terminacion) : o.terminacion === elegido).sort((a, b) => b.actualizada.localeCompare(a.actualizada));
    const cantidad = n => n.cantidad != null ? `${m2(n.m2Ejecutado)} de ${m2(n.cantidad)} ${esc(unidad(n.unidad))} ejecutados · <b>${m2(n.m2Pendiente)} ${esc(unidad(n.unidad))} pendientes</b>` : 'Sin superficie por recinto en el PMA: avance en %';
    const resumen = n => (n.ejecucion === 'En ejecución' && n.pctIndicado != null ? 'En ejecución · ' + n.pctIndicado + ' %' : n.ejecucion) + (n.revision === 'Sin revisar' ? '' : ' · ' + n.revision);
    const nombre = b => b.tipo === 'protocolo' ? b.nombre : b.item + ' ' + b.nombre;
    const protocoloDe = id => avance?.nodos.find(n => n.id === id && n.tipo === 'protocolo');
    const previo = n => n.prereq.map(id => avance.nodos.find(x => x.id === id)).filter(Boolean).map(p => `${esc(nombre(p))}: <b>${esc(p.tipo === 'protocolo' ? p.estado : resumen(p))}</b>`).join(' · ');
    const palancaProtocolo = n => palancaHTML({titulo: 'Protocolo', esc, valor: n.estado, opciones: ['Pendiente', 'Liberado'].map(v => ({valor: v, atributo: 'data-prot', dato: n.id + '|' + v}))});
    // Cada partida se despliega en sus palancas: protocolo previo, ejecución y revisión, en el orden en que se avanza.
    const partida = n => {
      const desplegada = ps.length === 1 || abierta === n.id, suyos = n.prereq.map(protocoloDe).filter(Boolean);
      const revision = v => v !== 'Conforme' ? '' : n.ejecucion !== 'Instalado' ? 'Primero márcala instalada.' : n.bloqueadoPor.length ? 'Falta liberar su previo: ' + n.bloqueadoPor.map(nombre).join(', ') + '.' : '';
      return `<li data-partida="${esc(n.id)}"><button type="button" class="romboPartidaCab" data-partida-abrir aria-expanded="${desplegada}"><span><b>${esc(n.item)}</b> ${esc(n.nombre)}</span><span class="romboPct">${esc(resumen(n))}</span></button>
      ${desplegada ? `<div class="romboMando"><small>${cantidad(n)}</small>${n.bloqueadoPor.length ? `<small class="romboBloqueo">Para quedar conforme falta liberar: ${esc(n.bloqueadoPor.map(nombre).join(', '))}</small>` : ''}${suyos.map(p => `<small>Protocolo previo: <b>${esc(p.nombre)}</b> · REV1 ${esc(p.ref)}${p.prereq.length ? ' · Previo: ' + previo(p) : ''}</small>`).join('')}
        <div class="palancas">${suyos.map(palancaProtocolo).join('')}${palancaHTML({titulo: 'Ejecución', esc, valor: n.ejecucion, opciones: EJECUCION.map(v => ({valor: v, atributo: 'data-p-ejec'}))})}${palancaHTML({titulo: 'Revisión', esc, valor: n.revision, opciones: REVISION.map(v => ({valor: v, atributo: 'data-p-rev', bloqueo: revision(v)}))})}</div>
        ${n.ejecucion === 'En ejecución' ? `<label class="romboPctCampo">% ejecutado<input type="number" inputmode="numeric" min="1" max="99" step="1" data-p-pct value="${n.pctIndicado ?? ''}" placeholder="1 a 99"></label>` : ''}</div>` : ''}</li>`;
    };
    const ultimo = conPartidas ? (avance.registro ? `Último cambio: ${fecha(avance.registro.fecha)} · ${avance.registro.responsable}` : 'Sin registros todavía.')
      : directo ? (t.stale ? 'La fuente cambió desde el último registro: vuelve a marcar.' : actual ? `Último cambio: ${fecha(actual.date)} · ${actual.responsible}` : 'Sin registros todavía.') : '';
    root.closest('#detail')?.classList.toggle('fichaEnMenu', menu);
    root.innerHTML = !menu ? `<div class="romboCaja"><p class="romboPista">Toca una parte del rombo para marcar su avance</p>${romboSVG(partes, null, esc, true)}
      <div class="romboLeyenda">${ESTADOS_PARTIDA.filter(e => e !== 'Sin definición').map(e => `<span><i class="${e === 'No aplica' ? 'na' : ''}" style="background:${COLOR_PARTIDA[e]}"></i>${esc(e)}</span>`).join('')}<span><i class="obs"></i>Observaciones pendientes</span></div></div>
      ${registrable ? '' : `<p class="romboNota">${enPiso ? 'Este recinto no tiene correspondencia en el PMA: el rombo muestra los códigos, pero el avance no se puede registrar.' : 'El recinto no pertenece al piso activo.'}</p>`}
      ${avisos.map(w => `<p class="pmaWarning">${esc(w)}</p>`).join('')}` : `
      <section class="romboPartida" aria-live="polite"><button type="button" class="romboVolver" data-rombo-volver>← Rombo</button>
        <div class="romboEncabezado"><div class="romboMini">${romboSVG(partes, elegido, esc, true)}</div><div class="romboTitulo"><h4>${esc(nombreElegido)} · ${elegido === 'M' ? '' : esc(elegido) + ' · '}${esc(codigoElegido)}</h4><span class="romboChip" style="--c:${COLOR_PARTIDA[estado]}">${esc(estado)}</span></div></div>
        <p class="romboTipo">${esc(t?.description || room.finishes?.find(f => f.field === elegido)?.description || 'Sin descripción en el PMA')}</p>
        <p class="romboDesc">${t && elegido !== 'PAV' && t.asepsis ? `Asepsia ${esc(t.asepsis)} ` : ''}${ctx.verCodigo && !['—', 'N/A', '-'].includes(codigoElegido) ? ` <button type="button" class="romboVerCodigo" data-rombo-ver-codigo>Ver en el plano los recintos con ${elegido === 'M' ? 'muros' : esc(elegido)} ${esc(codigoElegido.split(' / ')[0])}</button>` : ''}</p>
        ${aplica && !firmante() ? '<p class="romboNota romboSesion">Inicia sesión en Atlas para marcar el avance. <button type="button" data-rombo-entrar>Entrar</button></p>' : ''}
        ${traspasar ? '<p class="romboNota">Marcada antes en el rombo: al marcar una partida, ese estado pasa a todas las de esta terminación.</p>' : ''}
        ${conPartidas ? `<ul class="romboPartidas">${ps.map(partida).join('')}</ul>`
        : directo ? `<div class="palancas">${palancaHTML({titulo: 'Ejecución', esc, valor: t.installation, opciones: ['No iniciado', 'En proceso', 'Instalado'].map(v => ({valor: v, atributo: 'data-rombo-inst'}))})}${palancaHTML({titulo: 'Revisión', esc, valor: t.quality, opciones: ['Sin revisar', 'Con observaciones', 'Conforme'].map(v => ({valor: v, atributo: 'data-rombo-cal', bloqueo: v === 'Conforme' && t.installation !== 'Instalado' ? 'Primero márcala instalada.' : ''}))})}</div>`
        : registrable ? `<p class="romboNota">${(t && !t.applicable) || (elegido === 'M' && !t) ? 'No aplica según el PMA: fuera del cálculo de avance.' : 'Requiere definición documental en el PMA: fuera del porcentaje.'}</p>` : ''}
        <p class="romboMensaje" role="status">${esc(ultimo)}</p>
        <div class="romboObs"><div class="romboTitulo"><h4>Observaciones en ${esc(NOMBRE_OBS[elegido])} <small>${lista.length}</small></h4><button type="button" data-rombo-obs-nueva>+ Observación con foto</button></div>
          ${lista.length ? `<ul class="romboObsLista">${lista.map(o => `<li><button type="button" data-rombo-obs="${esc(o.id)}"><b>${elegido === 'M' ? esc(o.terminacion) + ' · ' : ''}${esc(o.descripcion)}</b><small>${esc(o.estado === 'Corregida' ? 'Por validar' : o.estado)} · ${esc(o.responsable || 'Sin responsable')}${o.plazo ? ' · plazo ' + esc(o.plazo.split('-').reverse().join('-')) : ''}${o.fotos.length ? ` · ${o.fotos.length} foto${o.fotos.length === 1 ? '' : 's'}` : ''}</small></button></li>`).join('')}</ul>` : '<p class="romboNota">Sin observaciones en este elemento.</p>'}</div></section>`;
    // Avance general del recinto: el detalle por partida está en el menú de cada parte del rombo.
    const res = avance ? resumenRecinto(avance.nodos, avance.row) : null;
    if (panel) {
      panel.innerHTML = res?.partidas ? `<div class="arCabecera"><span>Avance del recinto</span><b>${Math.round(res.pct)} %</b></div><span class="arBarra"><i style="width:${Math.round(res.pct)}%"></i></span>
        <p class="arPie">${res.conformes} de ${res.partidas} partidas conformes${res.protocolos ? ` · ${res.liberados} de ${res.protocolos} protocolos previos liberados` : ''}</p>` : '';
      panel.hidden = !panel.innerHTML;
    }
    // Los protocolos previos se marcan con su partida, en el menú de avance. Aquí quedan solo los que no pertenecen a ninguna.
    const protos = avance ? avance.nodos.filter(n => n.tipo === 'protocolo') : [];
    const conPartida = new Set(['PAV', 'CIE', 'M'].flatMap(c => partidasDe(c)).flatMap(p => p.prereq)), sueltos = protos.filter(n => !conPartida.has(n.id));
    if (previos) {
      previos.innerHTML = sueltos.length ? `<div class="section-label">PROTOCOLOS PREVIOS</div><ul class="previosLista">${sueltos.map(n => `<li><div class="previoTexto"><b>${esc(n.nombre)}</b><small>REV1 ${esc(n.ref)}${n.prereq.length ? ' · Previo: ' + previo(n) : ''}</small></div><div class="palancas">${palancaProtocolo(n)}</div></li>`).join('')}</ul><p class="romboMensaje previosMensaje" role="status"></p>` : '';
      previos.hidden = !previos.innerHTML;
    }
    const volver = () => ficha(root, room, {alGuardar, panel, previos});
    const alInicio = () => root.closest('.right')?.scrollTo(0, 0);
    const elegir = async campo => { elegido = campo; menu = true; abierta = null; await volver(); alInicio(); };
    root.querySelector('[data-rombo-volver]')?.addEventListener('click', async () => { menu = false; await volver(); alInicio(); });
    root.querySelectorAll('[data-partida-abrir]').forEach(b => b.onclick = () => { const id = b.closest('[data-partida]').dataset.partida; abierta = abierta === id ? null : id; volver(); });
    const avisoPalanca = texto => { const m = root.querySelector('.romboMensaje'); if (m) m.textContent = texto; };
    activarPalancas(root, {aviso: avisoPalanca}); if (previos) activarPalancas(previos, {aviso: avisoPalanca});
    // Tocar cualquier muro elige los cuatro.
    const campoDe = g => esMuro(g.dataset.rombo) ? 'M' : g.dataset.rombo;
    root.querySelectorAll('[data-rombo]').forEach(g => { g.addEventListener('click', () => elegir(campoDe(g))); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(campoDe(g)); } }); });
    // Una observación en muros se registra en un muro concreto (se elige en el formulario; parte en el primero que aplica).
    root.querySelector('[data-rombo-obs-nueva]')?.addEventListener('click', () => ctx.nuevaObservacion(room, elegido === 'M' ? primerMuro || 'M1' : elegido, volver));
    root.querySelector('[data-rombo-ver-codigo]')?.addEventListener('click', () => ctx.verCodigo(elegido === 'M' ? primerMuro || 'M1' : elegido, codigoElegido.split(' / ')[0]));
    root.querySelector('[data-rombo-entrar]')?.addEventListener('click', () => pedirSesion());
    root.querySelectorAll('[data-rombo-obs]').forEach(b => b.onclick = () => ctx.abrirObservacion(b.dataset.romboObs, volver));
    // Cada toque guarda al instante; mientras se guarda, la ficha no acepta otro toque.
    const controles = () => [root, previos].filter(Boolean).flatMap(el => [...el.querySelectorAll('.romboPartida button:not([data-rombo-obs-nueva]):not([data-rombo-obs]):not([data-rombo-ver-codigo]):not([data-rombo-volver]), .romboPartida input, [data-prot]')]);
    async function registrar(guardar, mensaje = () => root.querySelector('.romboMensaje')) {
      let firma; try { firma = exigirFirma(); } catch (e) { const m = mensaje(); if (m) m.textContent = e.message; return; }
      controles().forEach(c => { c.disabled = true; });
      try { const aviso = await guardar(firma); ctx.toast?.(aviso); alGuardar(); await volver(); }
      catch (e) { await volver(); const m = root.isConnected && mensaje(); if (m) m.textContent = e.message; }
    }
    const guardarNodo = (id, cambio, mensaje) => registrar(async firma => {
      const nodo = avance.nodos.find(n => n.id === id);
      const base = traspasar && nodo?.tipo === 'partida' ? sembrarTerminacion(avance.registro, avance.nodos, ps, previa) : avance.registro;
      const nuevo = actualizarNodo({code: avance.code, level: nivel.id}, avance.nodos, base, id, cambio, {responsable: firma, fecha: hoy()});
      await guardarAvance(nuevo, avance.registro?.version || 0); await cargarAvance(true);
      return nodo.tipo === 'protocolo' ? `${nodo.nombre}: ${cambio.estado}.` : `${nodo.item} ${nodo.nombre}: ${Object.values(cambio).join(' ')}${'pct' in cambio ? ' %' : ''}.`;
    }, mensaje);
    const sinCambio = b => b.getAttribute('aria-pressed') === 'true';
    [root, previos].filter(Boolean).forEach(el => el.querySelectorAll('[data-prot]').forEach(b => b.onclick = () => { if (sinCambio(b)) return; const [id, estado] = b.dataset.prot.split('|'); guardarNodo(id, {estado}, () => el.querySelector('.romboMensaje')); }));
    if (!aplica) return;
    // Sin partidas, «Muros» marca a la vez todos los muros que aplican (un solo registro nuevo del recinto).
    const guardarDirecto = cambio => registrar(async firma => {
      const campos = elegido === 'M' ? t.muros.filter(c => marcadaUna(c)?.documented) : [elegido];
      let valor = actual; for (const c of campos) valor = actualizarPartida(model, room, nivel.id, valor, c, cambio, {responsible: firma, date: hoy(), sourceReviewed: false});
      valor = {...valor, version: (actual?.version || 0) + 1};
      await saveProgress(valor, actual?.version || 0);
      return `${nombreElegido}: ${estadoPartida({...t, ...valor.fields[campos[0]]})}.`;
    });
    const idDe = el => el.closest('[data-partida]').dataset.partida;
    root.querySelectorAll('[data-p-ejec]').forEach(b => b.onclick = () => { if (!sinCambio(b)) guardarNodo(idDe(b), {ejecucion: b.dataset.pEjec}); });
    root.querySelectorAll('[data-p-rev]').forEach(b => b.onclick = () => { if (!sinCambio(b)) guardarNodo(idDe(b), {revision: b.dataset.pRev}); });
    root.querySelectorAll('[data-p-pct]').forEach(i => i.onchange = () => {
      const v = Math.round(Number(i.value));
      if (!i.value || !(v >= 1 && v <= 99)) { root.querySelector('.romboMensaje').textContent = 'El % en ejecución va de 1 a 99.'; return; }
      guardarNodo(idDe(i), {pct: v});
    });
    root.querySelectorAll('[data-rombo-inst]').forEach(b => b.onclick = () => { if (!sinCambio(b)) guardarDirecto({installation: b.dataset.romboInst}); });
    root.querySelectorAll('[data-rombo-cal]').forEach(b => b.onclick = () => { if (!sinCambio(b)) guardarDirecto({quality: b.dataset.romboCal}); });
  }
  return {ficha};
}
