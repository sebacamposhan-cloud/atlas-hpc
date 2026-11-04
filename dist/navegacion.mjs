// Barra inferior, rueda de tarjetas de cada módulo y botones de función sobre el plano. La lógica vive en navegacion-model.mjs.
import {TARJETAS, ICONOS, momentanea, tituloNavegacion, leerMemoria, guardarMemoria, aRetomar, tarjetasPara, cartasDelModulo, moduloDe, conPortada} from './navegacion-model.mjs';
import {funcionesDe} from './jerarquia-model.mjs';
import {crearPista} from './selector-flujo.mjs';
import {nivel} from './level.mjs';
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
  // Tarjetas de esta cuenta. Se vuelven a armar si cambia su perfil (después de sincronizar).
  let lista = TARJETAS, firma = '', pista = null;
  const buscarTarjeta = id => lista.find(t => t.id === id) || null;
  const tituloModulo = () => moduloDe(modulo).titulo;

  function construirRueda() {
    const nuevas = tarjetasPara(funcionesDe(ctx.perfil?.() || null)), cartas = cartasDelModulo(nuevas, modulo), clave = modulo + '|' + nuevas.map(t => t.id + ':' + t.funciones.map(([f]) => f).join(',')).join('|');
    if (clave === firma && pista) return false;
    firma = clave; lista = nuevas;
    rueda.setAttribute('aria-label', tituloModulo());
    rueda.innerHTML = `<div class="ruedaCabeza"><h2>${esc(tituloModulo())}</h2><button type="button" id="ruedaCerrar" aria-label="Cerrar ${esc(tituloModulo())}">×</button></div>
    <div class="ruedaPista" tabindex="-1">${cartas.map(t => `<button type="button" class="ruedaTarjeta" data-tarjeta="${t.id}"><svg class="panelArt" viewBox="0 0 160 100" aria-hidden="true">${t.dibujo}</svg><strong>${esc(t.titulo)}</strong><small>${esc(t.texto)}</small>${t.id === 'tareas' ? '<b class="ruedaContador" hidden></b>' : ''}</button>`).join('')}</div>`;
    pista = crearPista(rueda.querySelector('.ruedaPista'));
    pista.tarjetas.forEach(t => t.onclick = () => elegirTarjeta(t.dataset.tarjeta));
    $('ruedaCerrar').onclick = () => cerrarRueda(true);
    pista.acomodar(indiceDe(actual));
    contar();
    return true;
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
    cerrarRueda();
    if (t.panel) { ui.abrirPanel(t.panel, t.vista); return; }
    if (t.accion) { cerrarHoja(); ctx.cerrarModos(); ui.openFilters(); return; }
    if (t.grupo) { cambiarTarjeta(t.grupo); elegirFuncion(t.funcion); return; }
    cambiarTarjeta(id);
    // Una libreta con una sola función (supervisores y capataces) se abre directo: un toque menos.
    if (id === 'tareas' && t.funciones.length === 1) elegirFuncion(t.funciones[0][0]);
  }

  async function listaProtocolos(titulo, cargar, vacio) {
    const cuerpo = abrirHoja(titulo);
    let filas;
    try { filas = await cargar(); } catch (e) { if (!hoja.hidden) cuerpo.innerHTML = `<p role="alert">${esc(e.message)}</p>`; return; }
    if (hoja.hidden || $('hojaTitulo').textContent !== titulo) return;
    cuerpo.innerHTML = `<input type="search" id="hojaBuscar" aria-label="Buscar protocolo" placeholder="Buscar por nombre o código…" autocomplete="off"><ul class="hojaLista">${filas.map((f, i) => `<li data-texto="${esc((f.tipo.code + ' ' + f.tipo.name).toLocaleLowerCase('es'))}"><button type="button" data-fila="${i}"><span><b>${esc(f.tipo.name || f.tipo.code)}</b><small>${esc(f.tipo.code)}</small></span><em>${f.n.toLocaleString('es-CL')}</em></button></li>`).join('')}</ul><p class="hojaVacia"${filas.length ? ' hidden' : ''}>${esc(vacio)}</p>`;
    const buscar = $('hojaBuscar');
    buscar.oninput = () => { const q = buscar.value.trim().toLocaleLowerCase('es'); let n = 0; cuerpo.querySelectorAll('li').forEach(li => { li.hidden = !li.dataset.texto.includes(q); if (!li.hidden) n++; }); cuerpo.querySelector('.hojaVacia').hidden = !!n; };
    cuerpo.querySelectorAll('[data-fila]').forEach(b => b.onclick = async () => {
      const f = filas[Number(b.dataset.fila)];
      b.disabled = true;
      try { const datos = await f.abrir(); tipoAbierto = funcion; cerrarHoja(); await ctx.verProtocolos(datos); }
      catch (e) { b.disabled = false; ctx.toast(e.message); }
    });
  }
  const verTipos = () => listaProtocolos('Protocolos abiertos de este piso', async () => {
    const catalogo = await loadProtocolCatalog(), alcance = scopeProtocolCatalog(catalogo, nivel.id, 'ABIERTO');
    return [...alcance.types].sort((a, b) => b.visibleCount - a.visibleCount || a.code.localeCompare(b.code, 'es')).map(tipo => ({tipo, n: tipo.visibleCount,
      abrir: async () => ({tipo, filas: scopedProtocolRows(await loadProtocolType(catalogo, tipo), nivel.id)})}));
  }, 'Este piso no tiene protocolos abiertos.');
  const verCriticos = () => listaProtocolos('Críticos · más de un año abiertos', async () => {
    const catalogo = await loadProtocolCatalog();
    return (await criticosPorTipo()).map(({tipo, ids}) => ({tipo, n: ids.size,
      abrir: async () => ({tipo, filas: scopedProtocolRows(await loadProtocolType(catalogo, tipo), nivel.id).filter(f => ids.has(f.id))})}));
  }, 'Este piso no tiene protocolos críticos.');

  function verMas() {
    const cuerpo = abrirHoja('Más herramientas');
    const opciones = [['exportPlan', 'Exportar plano'], ['legend', 'Ver simbología'], ['original', 'Documentos fuente'], ['diamondCatalogOpen', 'Rombos'], ['import', 'Respaldos'], ...(ctx.escritorio() ? [['editorContornos', 'Editor de contornos']] : [])].filter(([id]) => $(id));
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
    if (portada()) abrirRueda(); else cerrarRueda();
  }

  $('bottomObra').onclick = () => { if (rueda.hidden) abrirRueda(); else if (!portada()) cerrarRueda(true); };
  construirRueda(); rotular();
  // Al sincronizar puede llegar (o irse) el perfil: se rearma la rueda y se actualiza el contador.
  function alCambiarTareas() {
    if (construirRueda() && actual && !buscarTarjeta(actual)) cerrarTarjeta();
    else if (actual && barra.dataset.tarjeta && buscarTarjeta(actual)?.funciones.map(([f]) => f).join() !== [...barra.querySelectorAll('[data-funcion]')].map(b => b.dataset.funcion).join()) { delete barra.dataset.tarjeta; dibujarBarra(); }
    contar();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !rueda.hidden && !portada()) cerrarRueda(true); });
  window.addEventListener('atlas-floor-home', () => { cerrarRueda(); cerrarHoja(); });
  window.addEventListener('atlas-floor-resume', entrar);
  window.addEventListener('atlas-piso-visible', dibujarBarra);
  // Abre una función de la libreta desde otro módulo (por ejemplo, «Asignar a mi equipo» en Last Planner).
  function abrirTareas(id) { if (!buscarTarjeta('tareas')?.funciones.some(([f]) => f === id)) return false; cerrarRueda(); if (actual !== 'tareas') { cerrarHoja(); ctx.cerrarModos(); if (actual === 'recintos' && funcion) ui.setLayer(null); actual = 'tareas'; funcion = null; dibujarBarra(); } elegirFuncion(id); return true; }
  return {abrirRueda, cerrarRueda, cerrarHoja, retomar, volverProtocolos, dibujarBarra, alLimpiar, alCambiarTareas, abrirTareas, contar, modulo: () => modulo, tituloModulo};
}
