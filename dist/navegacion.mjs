// Barra inferior, rueda de Control de obra y botones de función sobre el plano. La lógica vive en navegacion-model.mjs.
import {TARJETAS, tarjeta as buscarTarjeta, momentanea, tituloNavegacion, leerMemoria, guardarMemoria, aRetomar} from './navegacion-model.mjs';
import {nivel} from './level.mjs';
import {loadProtocolCatalog, loadProtocolType} from './protocol-catalog.mjs';
import {scopeProtocolCatalog, scopedProtocolRows} from './protocol-scope.mjs';
import {criticosPorTipo} from './protocol-critical.mjs';

const memoria = () => { try { return localStorage; } catch { return {getItem: () => null, setItem: () => {}}; } };
const quietud = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ctx: {esc, toast, ui, cerrarModos, verProtocolos, escritorio}
export function createNavegacion(ctx) {
  const {esc, ui} = ctx, $ = id => document.getElementById(id), main = document.querySelector('main');
  let actual = null, funcion = null, tipoAbierto = null;

  const barra = document.createElement('nav');
  barra.id = 'barraFunciones'; barra.hidden = true; barra.setAttribute('aria-label', 'Funciones');
  const rueda = document.createElement('section');
  rueda.id = 'ruedaObra'; rueda.hidden = true; rueda.setAttribute('aria-label', 'Control de obra');
  rueda.innerHTML = `<div class="ruedaCabeza"><h2>Control de obra</h2><button type="button" id="ruedaCerrar" aria-label="Cerrar Control de obra">×</button></div>
    <div class="ruedaPista" tabindex="-1">${TARJETAS.map(t => `<button type="button" class="ruedaTarjeta" data-tarjeta="${t.id}"><svg class="panelArt" viewBox="0 0 160 100" aria-hidden="true">${t.dibujo}</svg><strong>${esc(t.titulo)}</strong><small>${esc(t.texto)}</small></button>`).join('')}</div>`;
  const hoja = document.createElement('aside');
  hoja.id = 'hojaFuncion'; hoja.hidden = true;
  hoja.innerHTML = '<div class="hojaCabeza"><h2 id="hojaTitulo"></h2><button type="button" id="hojaCerrar" aria-label="Cerrar">×</button></div><div id="hojaCuerpo" class="hojaCuerpo"></div>';
  hoja.setAttribute('aria-labelledby', 'hojaTitulo');
  main.append(barra, hoja, rueda);
  const pista = rueda.querySelector('.ruedaPista'), tarjetas = [...pista.querySelectorAll('.ruedaTarjeta')];

  // La tarjeta del centro queda de frente y las demás giran alrededor, como una rueda.
  function girar() {
    const centro = pista.getBoundingClientRect().left + pista.clientWidth / 2;
    for (const t of tarjetas) {
      const r = t.getBoundingClientRect(), d = (r.left + r.width / 2 - centro) / (r.width + 12), a = Math.max(-1.6, Math.min(1.6, d));
      t.style.transform = quietud() ? '' : `rotateY(${(a * -24).toFixed(1)}deg) scale(${(1 - Math.abs(a) * .12).toFixed(3)})`;
      t.classList.toggle('alCentro', Math.abs(d) < .5);
    }
  }
  pista.addEventListener('scroll', () => requestAnimationFrame(girar), {passive: true});
  addEventListener('resize', () => { if (!rueda.hidden) girar(); });

  function centrar(id, suave = false) {
    const t = tarjetas.find(x => x.dataset.tarjeta === id) || tarjetas[1];
    pista.scrollTo({left: t.offsetLeft - (pista.clientWidth - t.offsetWidth) / 2, behavior: suave && !quietud() ? 'smooth' : 'auto'});
  }
  function abrirRueda() {
    if (ctx.ocupado?.()) return;
    cerrarHoja(); ui.show('map'); document.body.classList.add('hideRight'); document.body.classList.remove('fichaMinima');
    rueda.hidden = false; document.body.classList.add('ruedaAbierta'); $('bottomObra').setAttribute('aria-expanded', 'true');
    centrar(actual || 'recintos'); girar();
    tarjetas.find(t => t.dataset.tarjeta === (actual || 'recintos'))?.focus({preventScroll: true});
  }
  function cerrarRueda(foco = false) {
    if (rueda.hidden) return;
    rueda.hidden = true; document.body.classList.remove('ruedaAbierta'); $('bottomObra').setAttribute('aria-expanded', 'false');
    if (foco) $('bottomObra').focus();
  }

  function abrirHoja(titulo) { $('hojaTitulo').textContent = titulo; $('hojaCuerpo').innerHTML = '<p role="status">Cargando…</p>'; hoja.hidden = false; document.body.classList.add('hojaAbierta'); return $('hojaCuerpo'); }
  function cerrarHoja() { if (hoja.hidden) return; hoja.hidden = true; document.body.classList.remove('hojaAbierta'); $('hojaCuerpo').replaceChildren(); }
  $('hojaCerrar').onclick = () => { cerrarHoja(); if (['tipos', 'criticos'].includes(funcion)) { funcion = null; dibujarBarra(); } };

  function dibujarBarra() {
    const t = buscarTarjeta(actual);
    document.body.classList.toggle('conFunciones', !!t);
    barra.hidden = !t;
    if (t) {
      barra.setAttribute('aria-label', 'Funciones de ' + t.titulo);
      barra.innerHTML = `<span class="funcionesTitulo">${esc(t.titulo)}</span><div class="funcionesBotones">${t.funciones.map(([id, nombre]) => `<button type="button" data-funcion="${id}" aria-pressed="${funcion === id}">${esc(nombre)}</button>`).join('')}</div><button type="button" id="funcionesCerrar" aria-label="Cerrar ${esc(t.titulo)}">×</button>`;
      barra.querySelectorAll('[data-funcion]').forEach(b => b.onclick = () => elegirFuncion(b.dataset.funcion));
      $('funcionesCerrar').onclick = cerrarTarjeta;
    }
    const titulo = document.querySelector('header .project span');
    if (titulo) titulo.textContent = tituloNavegacion(actual, funcion);
  }
  const recordar = () => guardarMemoria(memoria(), {tarjeta: actual, funcion: momentanea(funcion) ? null : funcion});

  function cerrarTarjeta() {
    cerrarHoja(); ctx.cerrarModos();
    if (actual === 'recintos' && funcion) ui.setLayer(null);
    actual = null; funcion = null; recordar(); dibujarBarra();
  }
  function elegirTarjeta(id) {
    const t = buscarTarjeta(id);
    if (!t) return;
    cerrarRueda();
    if (t.panel) { ui.abrirPanel(t.panel); return; }
    if (actual === id) return;
    cerrarHoja(); ctx.cerrarModos();
    if (actual === 'recintos' && funcion) ui.setLayer(null);
    actual = id; funcion = null; recordar(); dibujarBarra();
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
    const opciones = [['exportPlan', 'Exportar plano'], ['legend', 'Ver simbología'], ['original', 'Documentos fuente'], ['diamondCatalogOpen', 'Rombos'], ['assistantOpen', 'Asistente'], ['import', 'Respaldos'], ['reset', 'Limpiar plano'], ...(ctx.escritorio() ? [['editorContornos', 'Editor de contornos']] : [])].filter(([id]) => $(id));
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
    else if (id === 'filtros') ui.openFilters();
    else if (id === 'mas') verMas();
    recordar(); dibujarBarra();
  }
  // Al salir de la lista de folios se vuelve a la lista desde la que se abrió.
  function volverProtocolos() { if (tipoAbierto === 'criticos') verCriticos(); else verTipos(); }

  function retomar() {
    const previo = aRetomar(leerMemoria(memoria()));
    if (!previo.tarjeta) { dibujarBarra(); return; }
    actual = previo.tarjeta; funcion = null; dibujarBarra();
    if (previo.funcion) elegirFuncion(previo.funcion);
  }

  $('bottomObra').onclick = () => rueda.hidden ? abrirRueda() : cerrarRueda(true);
  $('ruedaCerrar').onclick = () => cerrarRueda(true);
  tarjetas.forEach(t => t.onclick = () => elegirTarjeta(t.dataset.tarjeta));
  document.addEventListener('keydown', e => {
    if (rueda.hidden) return;
    if (e.key === 'Escape') cerrarRueda(true);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const i = tarjetas.findIndex(t => t.classList.contains('alCentro')), siguiente = tarjetas[Math.max(0, Math.min(tarjetas.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
      centrar(siguiente.dataset.tarjeta, true); siguiente.focus({preventScroll: true});
    }
  });
  window.addEventListener('atlas-floor-home', () => { cerrarRueda(); cerrarHoja(); });
  window.addEventListener('atlas-piso-visible', dibujarBarra);
  return {abrirRueda, cerrarRueda, cerrarHoja, retomar, volverProtocolos, dibujarBarra};
}
