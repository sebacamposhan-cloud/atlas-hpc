// Avance por partida: panel único de Control → Avance (escritorio). Se elige la partida (cielo duro, pavimento…) y se ve
// lo ejecutado y lo pendiente en m², el % ponderado por etapa, lo que avanzó desde la carga anterior, el plano coloreado
// por etapa y la tabla de recintos. Con los recintos elegidos se arma una hoja de ruta en Proyectos o una actividad de
// Last Planner. La fuente es la planilla de la oficina; lo marcado en terreno después de la carga manda (avance-model).
// Abajo, «Datos»: cargar la planilla, devolverla con lo de terreno, respaldos y el detalle por ítem del itemizado.
import {nivel} from './level.mjs';
import {registerLayer} from './layers.mjs';
import {progressFloors} from './progress-scope.mjs';
import {esEscritorio} from './dispositivo.mjs';
import {cargarAvance, textoPlanilla, conectarPlanilla, renderAvanceControl} from './avance.mjs';
import {exportarAvance, importarAvance} from './avance-store.mjs';
import {avanceFamilia, cambiosFamilia, totalesPorFamilia, TERMINADO} from './planilla-avance-model.mjs';
import {proyectoPartida, unidadFamilia, FAMILIAS_AVANCE} from './proyecto-partida.mjs';
import {crearFiltrosColumna} from './column-filters.mjs';
import {exigirFirma} from './firma.mjs';

const numero = v => v == null ? '—' : v.toLocaleString('es-CL', {maximumFractionDigits: 1});
const porc = v => (100 * v).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' %';
const fecha = iso => { const d = new Date(iso); return Number.isFinite(+d) ? new Intl.DateTimeFormat('es-CL', {timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric'}).format(d) : '—'; };
const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());

// Capa del plano «Avance por partida»: cada recinto con la categoría de la partida elegida.
const capa = {porCodigo: new Map(), colores: {}};
const SIN_PARTIDA = 'Sin esta partida';
function fijarCapa(afam) {
  capa.porCodigo = new Map(afam.filas.map(f => [f.code, f.categoria])); capa.colores = {...afam.colores, [SIN_PARTIDA]: '#e9ecef'};
  registerLayer('avance-partida', {nombre: 'Avance · ' + afam.nombre, categories: r => [capa.porCodigo.get(String(r.code).trim()) || SIN_PARTIDA], color: k => capa.colores[k] || '#e9ecef', opacity: .6});
}
registerLayer('avance-partida', {nombre: 'Avance por partida', categories: () => [SIN_PARTIDA], color: () => '#e9ecef', opacity: .6});

// Estado del panel (sobrevive a los redibujos y a cambiar de vista).
const estado = {familia: null, tabla: {filtros: {}, orden: null}, soloPendientes: true, elegidos: new Set(), pagina: 0};

export async function renderAvancePartida(root, ctx) {
  const esc = ctx.esc;
  if (!progressFloors[nivel.id]) { root.innerHTML = '<p>El avance por partida está disponible en los pisos −1, 1, 2 y 3.</p>'; return; }
  if (!esEscritorio()) {
    root.innerHTML = `<div class="documentaryIntro"><h2>Avance por partida · ${esc(nivel.nombre)}</h2><p>Los indicadores de avance se ven en el computador. En terreno, marca el avance en el rombo de cada recinto (toca el recinto en el plano) o en Proyectos.</p></div>`;
    return;
  }
  root.textContent = 'Cargando avance por partida…';
  let c, rombo = null, abierto = null;
  try { c = await cargarAvance(); } catch (e) { root.textContent = e.message; return; }
  const salas = () => new Map(ctx.rooms().map(r => [String(r.code).trim(), r]));

  function dibujar() {
    if (!root.isConnected) return;
    // % de cada partida con lo de terreno incluido (el mismo cálculo del panel).
    const planilla = c.planilla, familias = planilla ? totalesPorFamilia(planilla).filter(t => FAMILIAS_AVANCE.includes(t.familia)).map(t => ({...t, pct: avanceFamilia(planilla, t.familia, c.porCodigo).pct})) : [];
    if (familias.length && !familias.some(t => t.familia === estado.familia)) { estado.familia = (familias.find(t => t.familia === 'cieloDuro') || familias[0]).familia; estado.tabla = {filtros: {}, orden: null}; estado.elegidos.clear(); }
    const plano = salas(), afam = estado.familia && planilla ? avanceFamilia(planilla, estado.familia, c.porCodigo) : null;
    if (afam) { for (const f of afam.filas) f.name ||= plano.get(f.code)?.name || ''; fijarCapa(afam); }
    const unidad = afam ? unidadFamilia(afam.familia) : 'm²';
    const cambios = afam ? cambiosFamilia(planilla, afam.familia) : null;
    const columnas = afam ? [
      {key: 'recinto', titulo: 'Recinto', valor: f => f.code + ' · ' + f.name, orden: f => f.code},
      {key: 'sector', titulo: 'Sector', valor: f => plano.get(f.code)?.sector || 'Sin sector'},
      {key: 'estado', titulo: 'Estado', valor: f => f.categoria, opciones: afam.categorias, orden: f => afam.categorias.indexOf(f.categoria)},
      ...afam.etapas.map((e, k) => ({key: 'e' + k, titulo: e, valor: f => f.et[k] >= 0.995 ? 'Lista' : f.et[k] <= 0.004 ? 'Sin iniciar' : 'En curso', opciones: ['Sin iniciar', 'En curso', 'Lista'], orden: f => f.et[k]})),
      {key: 'pendiente', titulo: 'Pendiente (' + unidad + ')', valor: f => f.pendiente >= 0.05 ? 'Con pendiente' : 'Sin pendiente', orden: f => f.pendiente, ordenTextos: ['Menos pendiente primero', 'Más pendiente primero']},
      {key: 'fuente', titulo: 'Fuente', valor: f => f.fuente === 'terreno' ? 'Terreno' : 'Planilla'}] : [];
    const cf = crearFiltrosColumna({id: 'avancePartida', columnas, estado: estado.tabla, esc, alCambiar: () => { estado.pagina = 0; dibujar(); }});
    const base = afam ? afam.filas.filter(f => !estado.soloPendientes || f.categoria !== TERMINADO) : [], filas = afam ? cf.aplicar(base) : [];
    const paginas = Math.max(1, Math.ceil(filas.length / 40)); estado.pagina = Math.min(estado.pagina, paginas - 1);
    const visibles = filas.slice(estado.pagina * 40, estado.pagina * 40 + 40), cuenta = new Map();
    if (afam) for (const f of afam.filas) cuenta.set(f.categoria, (cuenta.get(f.categoria) || 0) + 1);
    const elegidas = filas.filter(f => estado.elegidos.has(f.code)), destino = elegidas.length ? elegidas : filas;

    root.innerHTML = `<div class="documentaryIntro"><h2>Avance por partida · ${esc(nivel.nombre)}</h2><p class="planillaEstado">${esc(textoPlanilla(planilla))}</p></div>
      ${familias.length ? `<div class="partidaChips" role="tablist" aria-label="Partida">${familias.map(t => `<button type="button" role="tab" data-familia="${esc(t.familia)}" aria-selected="${t.familia === estado.familia}"><b>${esc(t.nombre)}</b><span>${porc(t.pct)}</span></button>`).join('')}</div>`
        : `<p class="pmaWarning">Aún no hay planilla de avance de este piso. Ábrela en «Datos» → «Cargar planilla de avance».</p>`}
      ${afam ? `<div class="kpiGrid">
          <article class="kpi"><span>Ejecutado</span><b>${numero(afam.ejecutado)} ${unidad}</b><small>de ${numero(afam.cantidad)} ${unidad} · pendientes ${numero(afam.cantidad - afam.ejecutado)}</small></article>
          <article class="kpi"><span>Avance ponderado</span><b>${porc(afam.pct)}</b><small>${afam.etapas.length > 1 ? 'Etapas: ' + esc(afam.etapas.join(' · ')) : 'Según la planilla y terreno'}</small></article>
          <article class="kpi"><span>Recintos terminados</span><b>${afam.terminados} / ${afam.filas.length}</b><small>${afam.pendientes} con trabajo pendiente</small></article>
          <article class="kpi"><span>Desde la carga anterior</span><b>${cambios.anterior ? (cambios.avance >= 0 ? '+' : '') + numero(cambios.avance) + ' ' + unidad : '—'}</b><small>${cambios.anterior ? `${cambios.recintos} ${cambios.recintos === 1 ? 'recinto avanzó' : 'recintos avanzaron'} desde el ${esc(fecha(cambios.anterior))}` : 'Se verá con la próxima carga'}</small></article></div>
        <section class="chartCard"><div class="chartHeading"><h3>Recintos por etapa · ${esc(afam.nombre)}</h3><button type="button" id="partidaPlano">Ver en el plano</button></div>
          <div class="partidaEtapas">${afam.categorias.map(k => `<button type="button" data-categoria="${esc(k)}" style="--c:${afam.colores[k]};flex-grow:${Math.max(1, cuenta.get(k) || 0)}" title="Filtrar la tabla: ${esc(k)}"><i></i><span>${esc(k)}</span><b>${cuenta.get(k) || 0}</b></button>`).join('')}</div>
          <p class="chartSubtitle">Toca una etapa para ver sus recintos en la tabla. «Ver en el plano» colorea el piso por etapa de esta partida.</p></section>
        <section class="chartCard progressTabla"><div class="chartHeading"><h3>Recintos · ${filas.length}${estado.soloPendientes ? ' pendientes' : ''} de ${afam.filas.length}</h3>${cf.limpiar()}</div>
          <div class="actions partidaAcciones"><label class="check"><input type="checkbox" id="partidaPendientes" ${estado.soloPendientes ? 'checked' : ''}> Solo pendientes</label>
            <button type="button" id="partidaHoja" class="primary">Armar hoja de ruta · ${destino.length} ${destino.length === 1 ? 'recinto' : 'recintos'}</button><button type="button" id="partidaLps">Enviar a Last Planner</button><button type="button" id="partidaProyecto">Proyecto de la partida</button>
            ${estado.elegidos.size ? `<button type="button" id="partidaLimpiar">Quitar selección (${estado.elegidos.size})</button>` : ''}</div>
          <p class="chartSubtitle">Elige recintos con las casillas; sin elegir, la hoja de ruta y Last Planner toman todos los de la tabla (con sus filtros). Toca un código para marcar su avance en el rombo.</p>
          <div class="tableScroll"><table class="masterTable partidaTabla"><thead><tr><th><input type="checkbox" id="partidaTodos" aria-label="Elegir todos los de la tabla" ${filas.length && elegidas.length === filas.length ? 'checked' : ''}></th>${cf.cabecera()}</tr></thead>
            <tbody>${visibles.map(f => `<tr class="${abierto === f.code ? 'selectedRow' : ''}"><td><input type="checkbox" data-elegir="${esc(f.code)}" ${estado.elegidos.has(f.code) ? 'checked' : ''} aria-label="Elegir ${esc(f.code)}"></td>
              <td data-label="Recinto"><button type="button" class="codeLink" data-partida-recinto="${esc(f.code)}">${esc(f.code)}</button><br><small>${esc(f.name)}</small></td><td data-label="Sector">${esc(plano.get(f.code)?.sector || 'Sin sector')}</td>
              <td data-label="Estado"><span class="levChip" style="--c:${afam.colores[f.categoria]}">${esc(f.categoria)}</span></td>
              ${afam.etapas.map((e, k) => `<td data-label="${esc(e)}">${Math.round(100 * (f.et[k] ?? 0))} %</td>`).join('')}
              <td data-label="Pendiente">${numero(f.pendiente)} <small>de ${numero(f.cant)}</small></td><td data-label="Fuente">${f.fuente === 'terreno' ? '<b>Terreno</b>' : 'Planilla'}</td></tr>`).join('') || `<tr><td colspan="${6 + afam.etapas.length}">Sin recintos con estos filtros.</td></tr>`}</tbody></table></div>
          <div class="pagination"><button type="button" id="partidaPrev" ${estado.pagina ? '' : 'disabled'}>Anterior</button><span>Página ${estado.pagina + 1} de ${paginas}</span><button type="button" id="partidaNext" ${estado.pagina < paginas - 1 ? '' : 'disabled'}>Siguiente</button></div></section>
        <section id="partidaLpsForm" class="chartCard" hidden></section>
        <section id="avanceEditor" class="chartCard" hidden></section>` : ''}
      <p id="avanceMensaje" role="status"></p><section id="avancePlanillaResumen" class="chartCard" hidden></section>
      <details class="avanceDatos" ${planilla ? '' : 'open'}><summary>Datos: planilla de avance, respaldos y detalle por ítem</summary>
        <div class="actions"><label class="progressImportLabel">Cargar planilla de avance<input id="avancePlanilla" type="file" accept=".xlsx,.xlsm"></label>
          <label class="progressImportLabel">Devolver la planilla con lo de terreno<input id="avanceDevolver" type="file" accept=".xlsx,.xlsm"></label>
          <button type="button" id="avanceExportar">Exportar respaldo</button><label class="progressImportLabel">Importar respaldo<input id="avanceImportar" type="file" accept="application/json,.json"></label></div>
        <p class="dataNote">«Devolver la planilla»: elige la misma planilla de la oficina; Atlas escribe en las celdas de % de cada etapa lo marcado en terreno después de la carga y descarga una copia, sin tocar fórmulas ni formato.</p>
        <details class="avanceItemizado"><summary>Detalle por ítem del itemizado (m², embudo de estados y protocolos previos)</summary><div id="avanceItemizado"></div></details></details>`;

    const $ = s => root.querySelector(s), mensaje = $('#avanceMensaje');
    root.querySelectorAll('[data-familia]').forEach(b => b.onclick = () => { if (estado.familia === b.dataset.familia) return; estado.familia = b.dataset.familia; estado.tabla = {filtros: {}, orden: null}; estado.elegidos.clear(); estado.pagina = 0; abierto = null; dibujar(); });
    conectarPlanilla(root, {esc, toast: ctx.toast, conocidos: () => new Set([...c.reporte.filas.map(f => f.code), ...ctx.rooms().map(r => String(r.code).trim())]), alGuardar: async () => { c = await cargarAvance(true); dibujar(); }});
    $('#avanceDevolver').onchange = async e => {
      const archivo = e.target.files[0]; e.target.value = ''; if (!archivo) return;
      mensaje.textContent = 'Preparando la planilla con lo de terreno…';
      try { const {devolverPlanilla} = await import('./planilla-avance-devolver.mjs'); const r = await devolverPlanilla(archivo, {planilla: c.planilla, reporte: c.reporte, nivel: nivel.id}); mensaje.textContent = r.mensaje; }
      catch (error) { mensaje.textContent = error.message; }
    };
    $('#avanceExportar').onclick = async () => { try { const v = await exportarAvance(), url = URL.createObjectURL(new Blob([JSON.stringify(v, null, 2)], {type: 'application/json'})), a = document.createElement('a'); a.href = url; a.download = 'Atlas-avance-partidas-' + hoy() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); } catch (e) { mensaje.textContent = e.message; } };
    $('#avanceImportar').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { if (f.size > 30 * 1024 * 1024) throw Error('Respaldo demasiado grande.'); await importarAvance(JSON.parse(await f.text())); c = await cargarAvance(true); dibujar(); $('#avanceMensaje').textContent = 'Respaldo importado.'; } catch (error) { mensaje.textContent = error.message; } };
    const itemizado = root.querySelector('.avanceItemizado');
    itemizado.addEventListener('toggle', () => { if (itemizado.open && !itemizado.dataset.listo) { itemizado.dataset.listo = '1'; renderAvanceControl($('#avanceItemizado'), ctx); } });
    if (!afam) return;
    cf.conectar(root, base);
    $('#partidaPlano').onclick = () => ctx.pintarCapa?.('avance-partida');
    root.querySelectorAll('[data-categoria]').forEach(b => b.onclick = () => { estado.tabla.filtros = {...estado.tabla.filtros, estado: [b.dataset.categoria]}; if (b.dataset.categoria === TERMINADO) estado.soloPendientes = false; estado.pagina = 0; dibujar(); });
    $('#partidaPendientes').onchange = e => { estado.soloPendientes = e.target.checked; estado.pagina = 0; dibujar(); };
    $('#partidaPrev').onclick = () => { estado.pagina--; dibujar(); }; $('#partidaNext').onclick = () => { estado.pagina++; dibujar(); };
    $('#partidaLimpiar')?.addEventListener('click', () => { estado.elegidos.clear(); dibujar(); });
    $('#partidaTodos').onchange = e => { for (const f of filas) e.target.checked ? estado.elegidos.add(f.code) : estado.elegidos.delete(f.code); dibujar(); };
    root.querySelectorAll('[data-elegir]').forEach(i => i.onchange = () => { i.checked ? estado.elegidos.add(i.dataset.elegir) : estado.elegidos.delete(i.dataset.elegir); dibujar(); });
    root.querySelectorAll('[data-partida-recinto]').forEach(b => b.onclick = () => abrirRombo(b.dataset.partidaRecinto));
    // Proyecto (todos los recintos de la partida) u hoja de ruta (los elegidos o los de la tabla), en Proyectos.
    const crearProyecto = async hojaDeRuta => {
      let autor; try { autor = exigirFirma('Inicia sesión en Atlas para crear el proyecto.'); } catch (e) { mensaje.textContent = e.message; return; }
      const filasDoc = hojaDeRuta ? destino : afam.filas;
      if (!filasDoc.length) { mensaje.textContent = 'No hay recintos en la tabla para la hoja de ruta.'; return; }
      try {
        const {saveMarking} = await import('./marking-store.mjs');
        const doc = proyectoPartida(afam, {nivel: nivel.id, autor, docId: crypto.randomUUID(), filas: filasDoc, hojaDeRuta});
        await saveMarking(doc, 0);
        ctx.toast?.(`«${doc.name}» quedó en Proyectos con ${doc.filas.length} recintos.`);
        mensaje.innerHTML = `«${esc(doc.name)}» quedó en <b>Herramientas → Proyectos</b> (${doc.filas.length} ${doc.filas.length === 1 ? 'recinto' : 'recintos'}). El plano se colorea por etapa y la tabla filtra y exporta a PDF.`;
      } catch (e) { mensaje.textContent = e.message; }
    };
    $('#partidaHoja').onclick = () => crearProyecto(true);
    $('#partidaProyecto').onclick = () => crearProyecto(false);
    $('#partidaLps').onclick = () => formularioLps(destino, afam, unidad);
  }

  // Actividad de Last Planner (plan intermedio, sin semana) con los recintos y la cantidad pendiente.
  function formularioLps(filas, afam, unidad) {
    const form = root.querySelector('#partidaLpsForm'), plano = salas(), conPlano = filas.filter(f => plano.has(f.code)).slice(0, 300);
    const cantidad = Math.round(conPlano.reduce((a, f) => a + f.pendiente, 0) * 10) / 10;
    const sectores = [...new Set(conPlano.map(f => plano.get(f.code)?.sector).filter(Boolean))];
    form.hidden = false;
    form.innerHTML = `<div class="chartHeading"><h3>Enviar a Last Planner</h3><button type="button" data-lps-cerrar>Cerrar</button></div>
      <p class="chartSubtitle">Se crea una actividad en el plan intermedio (sin semana) con ${conPlano.length} recintos y ${numero(cantidad)} ${unidad} pendientes. ${filas.length > conPlano.length ? `${filas.length - conPlano.length} recintos quedan fuera (no están en el plano o pasan de 300).` : ''} Después se compromete en la semana desde Last Planner.</p>
      <form class="partidaLps"><label>Actividad<input name="actividad" maxlength="200" required value="${esc((afam.nombre + ': ' + (afam.etapas.length ? 'completar ' + afam.etapas.map(e => e.toLowerCase()).join(', ') : 'pendientes')).slice(0, 200))}"></label>
        <label>Responsable (subcontrato o cuadrilla)<input name="responsable" maxlength="160" required></label>
        <label>Sector<input name="sector" maxlength="60" value="${esc(sectores.length === 1 ? sectores[0] : '')}"></label>
        <div class="actions"><button type="submit" class="primary">Crear actividad</button></div><p data-lps-mensaje role="status"></p></form>`;
    form.scrollIntoView({block: 'nearest'});
    form.querySelector('[data-lps-cerrar]').onclick = () => { form.hidden = true; form.replaceChildren(); };
    form.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const aviso = form.querySelector('[data-lps-mensaje]'), v = Object.fromEntries(new FormData(e.target));
      let autor; try { autor = exigirFirma('Inicia sesión en Atlas para crear la actividad.'); } catch (error) { aviso.textContent = error.message; return; }
      try {
        const [{nuevaActividad}, {guardarActividades}] = await Promise.all([import('./lastplanner-model.mjs'), import('./lastplanner-store.mjs')]);
        const actividad = nuevaActividad({actividad: v.actividad, level: nivel.id, sector: v.sector, frente: null, responsable: v.responsable, semana: null,
          recintos: conPlano.map(f => { const r = plano.get(f.code); return {id: r.id, code: f.code, name: r.name || f.name || ''}; }), cantidad: cantidad || null, unidad: unidad === 'ml' ? 'm' : 'm²'}, {id: crypto.randomUUID(), autor});
        await guardarActividades([{actividad, versionEsperada: 0}]);
        ctx.toast?.('Actividad creada en Last Planner (plan intermedio).');
        form.innerHTML = `<p class="dataNote">Actividad «${esc(actividad.actividad)}» creada en Last Planner, en el plan intermedio, con ${actividad.recintos.length} recintos. Comprométela en la semana desde Last Planner.</p>`;
      } catch (error) { aviso.textContent = error.message; }
    };
  }

  // Rombo del recinto (el mismo de la ficha del plano) para marcar su avance.
  async function abrirRombo(code) {
    const room = ctx.rooms().find(r => String(r.code).trim() === code), editor = root.querySelector('#avanceEditor'); if (!editor) return;
    abierto = code; editor.hidden = false;
    editor.innerHTML = `<div class="chartHeading"><h3>${esc(code)} · ${esc(room?.name || '')}</h3><span>${room && ctx.locate ? '<button type="button" data-partida-ubicar>Ver en el plano</button> ' : ''}<button type="button" data-partida-cerrar>Cerrar</button></span></div>${room ? '<section class="avanceRecinto" hidden></section><div class="avanceRombo"></div><section class="protocolosPrevios" hidden></section>' : '<p class="dataNote">El recinto no está en el plano de este piso.</p>'}`;
    editor.querySelector('[data-partida-cerrar]').onclick = () => { abierto = null; editor.hidden = true; editor.replaceChildren(); };
    editor.scrollIntoView({block: 'start'});
    if (!room) return;
    editor.querySelector('[data-partida-ubicar]')?.addEventListener('click', () => ctx.locate(room.id));
    const [{createRombo}, {cargarObservaciones}] = await Promise.all([import('./rombo.mjs'), import('./observaciones.mjs')]);
    rombo ||= createRombo({esc, toast: ctx.toast, observaciones: () => cargarObservaciones(), nuevaObservacion: (r, campo, listo) => ctx.observaciones?.editor(r, null, listo, {terminacion: campo}), abrirObservacion: (id, listo) => ctx.observaciones?.abrir(id, listo)});
    rombo.ficha(editor.querySelector('.avanceRombo'), room, {panel: editor.querySelector('.avanceRecinto'), previos: editor.querySelector('.protocolosPrevios'),
      alGuardar: async () => { c = await cargarAvance(true); const guardado = abierto; dibujar(); if (guardado) abrirRombo(guardado); }});
  }

  dibujar();
}
