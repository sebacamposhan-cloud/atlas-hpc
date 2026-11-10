// Barra inferior, rueda de tarjetas de cada módulo y botones de función sobre el plano. La lógica vive en navegacion-model.mjs.
import {TARJETAS, ICONOS, momentanea, tituloNavegacion, leerMemoria, guardarMemoria, aRetomar, tarjetasPara, cartasDelModulo, moduloDe, conPortada, consultaPiso, paraTerreno, opcionesMas} from './navegacion-model.mjs';
import {alCambiarDispositivo} from './dispositivo.mjs';
import {createResumenPiso} from './resumen-piso.mjs';
import {funcionesDe} from './jerarquia-model.mjs';
import {crearPista, activarFlujos, rearmarFlujo} from './selector-flujo.mjs';
import {nivel, pisos} from './level.mjs';
import {loadProtocolCatalog, loadProtocolType} from './protocol-catalog.mjs';
import {scopeProtocolCatalog, scopedProtocolRows} from './protocol-scope.mjs';
import {criticosPorTipo} from './protocol-critical.mjs';

const memoria = () => { try { return localStorage; } catch { return {getItem: () => null, setItem: () => {}}; } };
const moduloPedido = () => moduloDe(window.ATLAS_MODULO)?.id || 'plano';

// ctx: {esc, toast, ui, cerrarModos, verProtocolos, escritorio, perfil, tareas}. perfil() es el de la jerarquía de obra:
// con perfil activo la rueda muestra lo de su nivel y la libreta «Mis tareas»; sin perfil, la rueda de siempre.
export function createNavegacion(ctx) {
  const {esc, ui} = ctx, $ = id => document.getElementById(id), main = document.querySelector('main');
  let actual = null, funcion = null, tipoAbierto = null, modulo = moduloPedido();
  const portada = () => conPortada(modulo);

  const barra = document.createElement('nav');
  barra.id = 'barraFunciones'; barra.hidden = true; barra.setAttribute('aria-label', 'Funciones');
  const rueda = document.createElement('section');
  rueda.id = 'ruedaObra'; rueda.hidden = true;
  const hoja = document.createElement('aside');
  hoja.id = 'hojaFuncion'; hoja.hidden = true;
  hoja.innerHTML = '<div class="hojaCabeza"><h2 id="hojaTitulo"></h2><button type="button" id="hojaCerrar" aria-label="Cerrar">×</button></div><div id="hojaCuerpo" class="hojaCuerpo"></div>';
  hoja.setAttribute('aria-labelledby', 'hojaTitulo');
  main.append(barra, hoja, rueda);
  const resumen = createResumenPiso({esc, rooms: () => ctx.rooms?.() || [], tareas: ctx.tareas, abrirPanel: (panel, vista) => { cerrarRueda(); ui.abrirPanel(panel, vista); }, abrirTareas: id => abrirTareas(id)});
  // Franja de pisos: con varios pisos elegidos se ve uno a la vez y aquí se cambia. La página tiene cargado un solo piso:
  // Last Planner cambia sin recargar porque no depende del piso; lo demás recarga y vuelve a abrir lo que estaba abierto.
  const franja = document.createElement('nav');
  franja.id = 'franjaPisos'; franja.hidden = true; franja.setAttribute('aria-label', 'Pisos elegidos');
  document.querySelector('.workspace')?.append(franja);
  let pisoVisto = nivel.id, pistaPisos = null;
  const elegidos = () => window.ATLAS_PISOS_ELEGIDOS || [];
  const pisoCorto = id => pisos.find(p => p.id === id)?.corto || id;
  // Tarjetas de esta cuenta. Se vuelven a armar si cambia su perfil (después de sincronizar).
  let lista = TARJETAS, firma = '', pista = null, marcada = null;
  // Escritorio: las tarjetas del módulo van en la columna izquierda, una debajo de otra, sin deslizar.
  const pistaFija = c => ({tarjetas: [...c.querySelectorAll('.ruedaTarjeta')], acomodar() {}, ir() {}, soltarCursor() {}, destruir() {}});
  // Tarjeta abierta: en el escritorio se ve en azul en la columna izquierda.
  function marcarTarjeta() { rueda.querySelectorAll('.ruedaTarjeta[data-tarjeta]').forEach(c => c.setAttribute('aria-current', String(c.dataset.tarjeta === marcada))); }
  const buscarTarjeta = id => lista.find(t => t.id === id) || null;
  const tituloModulo = () => moduloDe(modulo).titulo;

  function construirRueda() {
    const todas = tarjetasPara(funcionesDe(ctx.perfil?.() || null)), nuevas = ctx.escritorio() ? todas : paraTerreno(todas), cartas = cartasDelModulo(nuevas, modulo), clave = modulo + '|' + nuevas.map(t => t.id + ':' + t.funciones.map(([f]) => f).join(',')).join('|');
    if (clave === firma && pista) return false;
    firma = clave; lista = nuevas;
    rueda.setAttribute('aria-label', tituloModulo());
    // Control con libreta: la agenda (Hoy y Esta semana) va arriba de las tarjetas.
    const conAgenda = modulo === 'control' && cartas.some(t => t.id === 'tareas');
    rueda.innerHTML = `<div class="ruedaCabeza"><h2>${esc(tituloModulo())}</h2><button type="button" id="ruedaCerrar" aria-label="Cerrar ${esc(tituloModulo())}">×</button></div>
    ${conAgenda ? '<div class="agendaObra" id="agendaObra" aria-label="Agenda" hidden></div>' : ''}
    <div class="ruedaPista" tabindex="-1">${cartas.map(t => `<button type="button" class="ruedaTarjeta" data-tarjeta="${t.id}"><svg class="panelArt" viewBox="0 0 160 100" aria-hidden="true">${t.dibujo}</svg><strong>${esc(t.titulo)}</strong><small>${esc(t.texto)}</small>${t.id === 'tareas' ? '<b class="ruedaContador" hidden></b>' : ''}</button>`).join('')}</div>`;
    pista = ctx.escritorio() ? pistaFija(rueda.querySelector('.ruedaPista')) : crearPista(rueda.querySelector('.ruedaPista'));
    marcarTarjeta();
    pista.tarjetas.forEach(t => t.onclick = () => elegirTarjeta(t.dataset.tarjeta));
    $('ruedaCerrar').onclick = () => cerrarRueda(true);
    if (conAgenda) ctx.tareas?.agenda?.($('agendaObra'), id => { if (abrirTareas('mias')) ctx.tareas.verTarea(id); });
    pista.acomodar(indiceDe(actual));
    contar();
    return true;
  }
  function dibujarFranja() {
    const lista = elegidos(), visible = portada() && lista.length > 1;
    franja.hidden = !visible; document.body.classList.toggle('conFranja', visible);
    pistaPisos?.destruir(); pistaPisos = null;
    if (!visible) return;
    franja.className = 'ruedaPista conFlujo flujo-baja';
    franja.innerHTML = lista.map(id => `<button type="button" class="ruedaTarjeta" data-piso="${esc(id)}" aria-pressed="${id === pisoVisto}">Piso ${esc(pisoCorto(id))}</button>`).join('');
    pistaPisos = crearPista(franja, {conRueda: false});
    pistaPisos.acomodar(lista.indexOf(pisoVisto));
    pistaPisos.tarjetas.forEach(b => b.onclick = () => verPiso(b.dataset.piso));
  }
  // Tarjeta y vista abiertas, para retomarlas después de cambiar de piso.
  function loAbierto() {
    const panel = ui.panelAbierto();
    if (panel === 'avance') return 'resumen:' + ui.vistaDe('avance');
    if (panel === 'matrix') return 'matriz:' + ui.vistaDe('matrix');
    if (actual === 'protocolos') return funcion === 'criticos' ? 'criticos' : 'tipos';
    return actual && buscarTarjeta(actual) ? actual : '';
  }
  function irAlPiso(id, abierto) {
    if (!window.dispatchEvent(new Event('atlas-before-floor-change', {cancelable: true}))) return;
    location.assign((globalThis.ATLAS_RAIZ || '/') + consultaPiso({nivel: id, modulo, pisos: elegidos()}) + (abierto ? '#abrir=' + abierto : ''));
  }
  function verPiso(id) {
    if (id === pisoVisto) return;
    pisoVisto = id;
    franja.querySelectorAll('[data-piso]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.piso === id)));
    pistaPisos?.ir(elegidos().indexOf(id));
    $('navPiso').textContent = 'Piso ' + pisoCorto(id);
    // En las tarjetas todavía no hay nada abierto: el piso se usa al elegir una.
    if (!rueda.hidden) return;
    if (ui.panelAbierto() === 'lastplanner') { ctx.lastplanner?.verPiso(id); ui.refresh(); return; }
    irAlPiso(id, loAbierto());
  }
  // Contador de la libreta: lo que la persona tiene por hacer más lo que debe confirmar.
  function contar() {
    const n = ctx.tareas?.contador?.() || 0, texto = n > 99 ? '99+' : String(n);
    const enTarjeta = rueda.querySelector('.ruedaContador');
    if (enTarjeta) { enTarjeta.hidden = !n; enTarjeta.textContent = texto; enTarjeta.setAttribute('aria-label', n + ' pendientes'); }
    // En Control va en su botón. En los otros módulos va en Módulos, que es el camino para llegar a la libreta.
    const destino = $(modulo === 'control' ? 'bottomObra' : 'bottomModulos');
    let enBarra = document.querySelector('.obraContador');
    if (!enBarra) { enBarra = document.createElement('b'); enBarra.className = 'obraContador'; }
    if (enBarra.parentElement !== destino) destino.append(enBarra);
    const conLibreta = lista.some(t => t.id === 'tareas');
    enBarra.hidden = !n || !conLibreta; enBarra.textContent = texto; enBarra.setAttribute('aria-label', n + ' tareas pendientes');
    const boton = barra.querySelector('[data-funcion=mias] .funcionCirculo');
    if (boton) { let b = boton.querySelector('.funcionContador'); if (!b) { b = document.createElement('b'); b.className = 'funcionContador'; boton.append(b); } b.hidden = !n; b.textContent = texto; }
  }
  const indiceDe = id => Math.max(0, pista.tarjetas.findIndex(t => t.dataset.tarjeta === id));
  function abrirRueda() {
    if (ctx.ocupado?.()) return;
    cerrarHoja(); ui.show('map'); document.body.classList.add('hideRight'); document.body.classList.remove('fichaMinima');
    rueda.hidden = false; document.body.classList.add('ruedaAbierta'); document.body.classList.toggle('ruedaPortada', portada()); $('bottomObra').setAttribute('aria-expanded', 'true');
    pista.acomodar(indiceDe(actual));
    pista.tarjetas[indiceDe(actual)]?.focus({preventScroll: true});
    // Escritorio: la portada de Control y Protocolos muestra el resumen del piso a la derecha, con el plano al centro.
    if (portada()) { marcada = null; marcarTarjeta(); if (ctx.escritorio()) resumen.mostrar(pisos.find(p => p.id === pisoVisto)?.nombre); }
  }
  function cerrarRueda(foco = false) {
    if (rueda.hidden) return;
    pista.soltarCursor();
    rueda.hidden = true; document.body.classList.remove('ruedaAbierta', 'ruedaPortada'); $('bottomObra').setAttribute('aria-expanded', 'false');
    if (foco) $('bottomObra').focus();
  }

  function abrirHoja(titulo) { $('hojaTitulo').textContent = titulo; $('hojaCuerpo').innerHTML = '<p role="status">Cargando…</p>'; hoja.hidden = false; document.body.classList.add('hojaAbierta'); return $('hojaCuerpo'); }
  function cerrarHoja() { if (hoja.hidden) return; hoja.hidden = true; document.body.classList.remove('hojaAbierta'); $('hojaCuerpo').replaceChildren(); }
  $('hojaCerrar').onclick = () => { cerrarHoja(); if (['tipos', 'criticos', 'mias', 'asignar', 'equipo'].includes(funcion)) { funcion = null; dibujarBarra(); } };

  function dibujarBarra() {
    const t = buscarTarjeta(actual);
    document.body.classList.toggle('conFunciones', !!t);
    barra.hidden = !t;
    // Solo se vuelven a crear al cambiar de tarjeta, para que los botones no reaparezcan con cada toque.
    if (t && barra.dataset.tarjeta !== t.id) {
      barra.dataset.tarjeta = t.id;
      barra.setAttribute('aria-label', 'Funciones de ' + t.titulo);
      barra.innerHTML = t.funciones.map(([id, nombre], i) => `<button type="button" class="funcionFlotante" style="--n:${i}" data-funcion="${id}" aria-pressed="false"><span class="funcionCirculo">${ICONOS[id]}</span><span class="funcionNombre">${esc(nombre)}</span></button>`).join('') + `<button type="button" id="funcionesCerrar" class="funcionFlotante" style="--n:${t.funciones.length}" aria-label="Cerrar ${esc(t.titulo)}"><span class="funcionCirculo">${ICONOS.cerrar}</span></button>`;
      barra.querySelectorAll('[data-funcion]').forEach(b => b.onclick = () => elegirFuncion(b.dataset.funcion));
      $('funcionesCerrar').onclick = cerrarTarjeta;
      contar();
    }
    if (!t) delete barra.dataset.tarjeta;
    barra.querySelectorAll('[data-funcion]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.funcion === funcion)));
    const titulo = document.querySelector('header .project span');
    if (titulo) titulo.textContent = tituloNavegacion(actual, funcion, modulo);
  }
  const recordar = () => guardarMemoria(memoria(), {tarjeta: actual, funcion: momentanea(funcion) ? null : funcion});

  function cerrarTarjeta() {
    cerrarHoja(); ctx.cerrarModos();
    if (actual === 'recintos' && funcion) ui.setLayer(null);
    actual = null; funcion = null; recordar(); dibujarBarra();
    if (portada()) abrirRueda();
  }
  function cambiarTarjeta(id) {
    if (actual === id) return;
    cerrarHoja(); ctx.cerrarModos();
    if (actual === 'recintos' && funcion) ui.setLayer(null);
    actual = id; funcion = null; recordar(); dibujarBarra();
  }
  function elegirTarjeta(id) {
    const t = buscarTarjeta(id);
    if (!t) return;
    marcada = t.grupo || id; marcarTarjeta();
    // El piso visto no es el cargado: Last Planner sirve igual; para lo demás hay que cargar ese piso.
    if (pisoVisto !== nivel.id && t.panel !== 'lastplanner') { irAlPiso(pisoVisto, id); return; }
    cerrarRueda();
    if (t.panel === 'lastplanner') ctx.lastplanner?.verPiso(pisoVisto);
    if (t.panel) { ui.abrirPanel(t.panel, t.vista); return; }
    if (t.accion) { cerrarHoja(); ctx.cerrarModos(); ui.openFilters(); return; }
    if (t.grupo) { cambiarTarjeta(t.grupo); elegirFuncion(t.funcion); return; }
    cambiarTarjeta(id);
    // Una libreta con una sola función (supervisores y capataces) se abre directo: un toque menos.
    if (id === 'tareas' && t.funciones.length === 1) elegirFuncion(t.funciones[0][0]);
  }

  let corteMatriz = '';
  async function listaProtocolos(titulo, cargar, vacio) {
    const cuerpo = abrirHoja(titulo);
    let filas;
    try { filas = await cargar(); } catch (e) { if (!hoja.hidden) cuerpo.innerHTML = `<p role="alert">${esc(e.message)}</p>`; return; }
    if (hoja.hidden || $('hojaTitulo').textContent !== titulo) return;
    cuerpo.innerHTML = `${corteMatriz ? `<p class="folioAviso">Matriz al ${esc(corteMatriz.split('-').reverse().join('-'))} · ${filas.length} ${filas.length === 1 ? 'tipo' : 'tipos'}</p>` : ''}<input type="search" id="hojaBuscar" aria-label="Buscar protocolo" placeholder="Buscar por nombre o código…" autocomplete="off"><ul class="hojaLista">${filas.map((f, i) => `<li data-texto="${esc((f.tipo.code + ' ' + f.tipo.name).toLocaleLowerCase('es'))}"><button type="button" data-fila="${i}"><span><b>${esc(f.tipo.name || f.tipo.code)}</b><small>${esc(f.tipo.code)}${f.detalle ? ' · ' + esc(f.detalle) : ''}</small></span><em>${f.n.toLocaleString('es-CL')}</em></button></li>`).join('')}</ul><p class="hojaVacia"${filas.length ? ' hidden' : ''}>${esc(vacio)}</p>`;
    const buscar = $('hojaBuscar');
    buscar.oninput = () => { const q = buscar.value.trim().toLocaleLowerCase('es'); let n = 0; cuerpo.querySelectorAll('li').forEach(li => { li.hidden = !li.dataset.texto.includes(q); if (!li.hidden) n++; }); cuerpo.querySelector('.hojaVacia').hidden = !!n; rearmarFlujo(cuerpo.querySelector('.hojaLista')); };
    cuerpo.querySelectorAll('[data-fila]').forEach(b => b.onclick = async () => {
      const f = filas[Number(b.dataset.fila)];
      b.disabled = true;
      try { const datos = await f.abrir(); tipoAbierto = funcion; cerrarHoja(); await ctx.verProtocolos(datos); }
      catch (e) { b.disabled = false; ctx.toast(e.message); }
    });
  }
  const verTipos = () => listaProtocolos('Protocolos abiertos de este piso', async () => {
    const catalogo = await loadProtocolCatalog(), alcance = scopeProtocolCatalog(catalogo, nivel.id, 'ABIERTO');
    // Total del tipo en el piso, todos los estados: el plano los dibuja todos y se filtran por estado en su panel.
    const totales = new Map(scopeProtocolCatalog(catalogo, nivel.id, '').types.map(t => [t.id, t.visibleCount]));
    corteMatriz = catalogo.source?.cutoff || '';
    return [...alcance.types].sort((a, b) => b.visibleCount - a.visibleCount || a.code.localeCompare(b.code, 'es')).map(tipo => ({tipo, n: tipo.visibleCount, detalle: `${tipo.visibleCount.toLocaleString('es-CL')} abiertos · ${(totales.get(tipo.id) ?? tipo.visibleCount).toLocaleString('es-CL')} en total`,
      abrir: async () => ({tipo, filas: scopedProtocolRows(await loadProtocolType(catalogo, tipo), nivel.id)})}));
  }, 'Este piso no tiene protocolos abiertos.');
  const verCriticos = () => listaProtocolos('Críticos · más de un año abiertos', async () => {
    const catalogo = await loadProtocolCatalog();
    return (await criticosPorTipo()).map(({tipo, ids}) => ({tipo, n: ids.size,
      abrir: async () => ({tipo, filas: scopedProtocolRows(await loadProtocolType(catalogo, tipo), nivel.id).filter(f => ids.has(f.id))})}));
  }, 'Este piso no tiene protocolos críticos.');

  function verMas() {
    const cuerpo = abrirHoja('Más herramientas');
    const opciones = opcionesMas(ctx.escritorio()).filter(([id]) => $(id));
    cuerpo.innerHTML = `<ul class="hojaLista">${opciones.map(([id, nombre]) => `<li><button type="button" data-mas="${id}"><span><b>${esc(nombre)}</b></span></button></li>`).join('')}</ul>`;
    cuerpo.querySelectorAll('[data-mas]').forEach(b => b.onclick = () => { const destino = $(b.dataset.mas); cerrarHoja(); destino.click(); });
  }

  function elegirFuncion(id) {
    cerrarRueda();
    if (id === 'resumen') { cerrarHoja(); ui.abrirPanel(actual === 'protocolos' ? 'matrix' : 'avance', actual === 'protocolos' ? 'matriz' : funcion === 'observaciones' ? 'observaciones' : 'recinto'); return; }
    cerrarHoja(); ctx.cerrarModos();
    if (actual === 'recintos') { ui.pintarCapa(id); funcion = id; }
    else if (id === 'tipos') { funcion = id; verTipos(); }
    else if (id === 'criticos') { funcion = id; verCriticos(); }
    else if (id === 'proyectos') $('markingOpen')?.click();
    else if (id === 'mas') verMas();
    else if (actual === 'tareas') { funcion = id; const nombre = buscarTarjeta('tareas')?.funciones.find(([f]) => f === id)?.[1] || 'Mis tareas'; ctx.tareas?.mostrar(id, abrirHoja(nombre), {titulo: texto => { $('hojaTitulo').textContent = texto; }, cerrar: () => { cerrarHoja(); funcion = null; dibujarBarra(); }}); }
    recordar(); dibujarBarra();
  }
  // «Limpiar» apaga los colores del plano: la función de Recintos deja de verse activa. La tarjeta sigue abierta.
  function alLimpiar() { cerrarHoja(); if (actual === 'recintos' || ['tipos', 'criticos'].includes(funcion)) { funcion = null; recordar(); dibujarBarra(); } }
  // Al salir de la lista de folios se vuelve a la lista desde la que se abrió.
  function volverProtocolos() { if (tipoAbierto === 'criticos') verCriticos(); else verTipos(); }

  function retomar() {
    if (portada()) { dibujarBarra(); abrirRueda(); return; }
    const previo = aRetomar(leerMemoria(memoria()));
    if (!previo.tarjeta) { dibujarBarra(); return; }
    actual = previo.tarjeta; funcion = null; dibujarBarra();
    if (previo.funcion) elegirFuncion(previo.funcion);
  }
  // El botón de la barra lleva el nombre del módulo abierto.
  const rotular = () => { $('bottomObra').firstChild.textContent = tituloModulo(); };
  // Se volvió a entrar sin recargar, quizá a otro módulo: Control y Protocolos parten en sus tarjetas; Plano, en el plano.
  function entrar() {
    const pedido = moduloPedido();
    if (pedido !== modulo) {
      cerrarHoja(); ctx.cerrarModos();
      if (actual === 'recintos' && funcion) ui.setLayer(null);
      actual = null; funcion = null; modulo = pedido;
      construirRueda(); rotular(); contar(); dibujarBarra();
    }
    pisoVisto = nivel.id; dibujarFranja();
    if (portada()) abrirRueda(); else cerrarRueda();
  }
  // Abre una tarjeta por dirección (#abrir=tarjeta:vista), al volver de cambiar de piso.
  function abrirTarjeta(id, vista) {
    const t = buscarTarjeta(id);
    if (!t) return;
    if (t.panel) { cerrarRueda(); ui.abrirPanel(t.panel, vista || t.vista); return; }
    elegirTarjeta(id);
  }

  $('bottomObra').onclick = () => { if (rueda.hidden) abrirRueda(); else if (!portada()) cerrarRueda(true); };
  construirRueda(); rotular(); dibujarFranja();
  activarFlujos();
  // Al sincronizar puede llegar (o irse) el perfil: se rearma la rueda y se actualiza el contador.
  function alCambiarTareas() {
    if (construirRueda() && actual && !buscarTarjeta(actual)) cerrarTarjeta();
    else if (actual && barra.dataset.tarjeta && buscarTarjeta(actual)?.funciones.map(([f]) => f).join() !== [...barra.querySelectorAll('[data-funcion]')].map(b => b.dataset.funcion).join()) { delete barra.dataset.tarjeta; dibujarBarra(); }
    contar();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !rueda.hidden && !portada()) cerrarRueda(true); });
  window.addEventListener('atlas-floor-home', () => { cerrarRueda(); cerrarHoja(); franja.hidden = true; document.body.classList.remove('conFranja'); });
  window.addEventListener('atlas-floor-resume', entrar);
  window.addEventListener('atlas-piso-visible', dibujarBarra);
  // Abre una función de la libreta desde otro módulo (por ejemplo, «Asignar a mi equipo» en Last Planner).
  function abrirTareas(id) { if (!buscarTarjeta('tareas')?.funciones.some(([f]) => f === id)) return false; cerrarRueda(); if (actual !== 'tareas') { cerrarHoja(); ctx.cerrarModos(); if (actual === 'recintos' && funcion) ui.setLayer(null); actual = 'tareas'; funcion = null; dibujarBarra(); } elegirFuncion(id); return true; }
  // Búsqueda en terreno con varios resultados: una lista en la hoja, sin abrir el panel de oficina. Tocar uno lo muestra
  // encendido y centrado en el plano, como cuando se busca un código exacto.
  function listaRecintos(filas, elegir) {
    const cuerpo = abrirHoja('Recintos encontrados');
    const vistas = filas.slice(0, 300);
    cuerpo.innerHTML = `<p class="hojaNota">${filas.length === 1 ? '1 recinto' : filas.length.toLocaleString('es-CL') + ' recintos'}${filas.length > vistas.length ? ' · se muestran los primeros ' + vistas.length : ''}. Toca uno para verlo en el plano.</p><ul class="hojaLista">${vistas.map((r, i) => `<li><button type="button" data-recinto="${i}"><span><b>${esc(r.code)}</b><small>${esc(r.name || '')}</small></span></button></li>`).join('')}</ul>`;
    cuerpo.querySelectorAll('[data-recinto]').forEach(b => b.onclick = () => { const r = vistas[Number(b.dataset.recinto)]; cerrarHoja(); elegir(r.id); });
  }
  // «Reporte diario» desde una tarea con actividad de Last Planner: abre Ejecución y seguimiento de la semana.
  window.addEventListener('atlas-reporte-diario', () => {
    if (!buscarTarjeta('lastplanner')) { ctx.toast('Tu cuenta no tiene Last Planner.'); return; }
    cerrarHoja(); cerrarRueda(); ctx.lastplanner?.verPiso(pisoVisto); ui.abrirPanel('lastplanner', 'ejecucion');
  });
  // Al pasar de terreno a escritorio (o al revés) cambian las tarjetas de oficina: se rearma la rueda.
  alCambiarDispositivo(() => { firma = ''; alCambiarTareas(); });
  return {abrirRueda, cerrarRueda, cerrarHoja, retomar, volverProtocolos, dibujarBarra, alLimpiar, alCambiarTareas, abrirTareas, abrirTarjeta, contar, listaRecintos, modulo: () => modulo, tituloModulo, nombrePiso: () => pisos.find(p => p.id === pisoVisto)?.nombre};
}
