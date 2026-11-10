// Tarjetas con flujo: la misma rueda para todas las selecciones de Atlas. Se arrastran con el mouse o el dedo, con inercia,
// y el cursor ilumina en azul la tarjeta que tiene debajo. Si caben todas, la pista queda centrada y no gira: el cursor
// acerca la tarjeta sin desplazar el grupo. Si no caben (celular), la del centro queda de frente y las demás giran alrededor.
import {crearFluido, arrastrar, crearOleaje} from './fluido.mjs';

const quietud = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// elemento: contenedor con sus tarjetas adentro. alCambiar(i): cambió la tarjeta del centro al girar (solo si no caben todas).
// conRueda: false si la pista está dentro de algo que se desplaza, para no quitarle la rueda del mouse.
// lista: las tarjetas, si no son todas las que hay adentro (una búsqueda esconde algunas).
export function crearPista(elemento, {inicial = 0, alCambiar = () => {}, tarjeta = '.ruedaTarjeta', conRueda = true, lista = null} = {}) {
  const tarjetas = lista || [...elemento.querySelectorAll(tarjeta)], fin = new AbortController(), senal = fin.signal;
  let cursor = null, posiciones = [], lado = [], fila = [], fuerza = [];
  // Con el cursor encima se ilumina la tarjeta que tiene debajo, también mientras la rueda se mueve.
  function iluminar() {
    const bajo = cursor && document.elementFromPoint(cursor[0], cursor[1])?.closest(tarjeta);
    tarjetas.forEach(t => t.classList.toggle('iluminada', t === bajo));
    elemento.classList.toggle('conCursor', !!bajo);
  }
  const distancia = () => (tarjetas[0]?.offsetWidth || 0) + 12;
  const caben = () => elemento.clientWidth >= tarjetas.length * distancia() + 40;
  const centro = () => caben() ? (tarjetas.length - 1) / 2 : null;
  function pintar() {
    const tramo = distancia(), abierta = caben();
    tarjetas.forEach((t, i) => {
      const d = i - (posiciones[i] ?? 0), a = Math.max(-1.6, Math.min(1.6, d)), h = fuerza[i] || 0, dh = i - (fila[i] || 0), cerca = Math.exp(-dh * dh * 2.5);
      // En listas largas, lo que está lejos no se dibuja.
      const lejos = Math.abs(d) > 8;
      t.style.visibility = lejos ? 'hidden' : '';
      if (lejos) return;
      t.style.transform = `translate(${(d * tramo + (lado[i] || 0) * h * 10).toFixed(1)}px, ${(-8 * h * cerca).toFixed(1)}px) rotateY(${(a * (abierta ? -12 : -24) * (1 - h * cerca)).toFixed(1)}deg) scale(${(1 - Math.abs(a) * (abierta ? .04 : .12) + .05 * h * cerca).toFixed(3)})`;
      t.classList.toggle('alCentro', !abierta && Math.abs(d) < .5);
    });
    if (cursor) iluminar();
  }
  const giro = crearFluido({cantidad: tarjetas.length, inicial, quieto: quietud, centro, alCambiar: i => { if (centro() === null) alCambiar(i); }, dibujar: p => { posiciones = p; pintar(); }});
  const oleaje = crearOleaje({cantidad: tarjetas.length, quieto: quietud, rapidez: .3, dibujar: (x, f, h) => { lado = x; fila = f; fuerza = h; pintar(); }});
  arrastrar(elemento, giro, {eje: 'x', paso: () => distancia() || 1, conRueda, senal});
  elemento.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    cursor = [e.clientX, e.clientY]; iluminar();
    if (e.buttons) return;
    const r = elemento.getBoundingClientRect(), medio = r.left + r.width / 2;
    oleaje.mover(Math.max(-1, Math.min(1, (e.clientX - medio) / (r.width / 2))), giro.objetivo() + (e.clientX - medio) / (distancia() || 1));
  }, {signal: senal});
  elemento.addEventListener('pointerleave', () => { cursor = null; iluminar(); oleaje.soltar(); }, {signal: senal});
  // Con las flechas del teclado se pasa de una tarjeta a otra.
  elemento.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const enfocada = tarjetas.indexOf(document.activeElement), siguiente = Math.max(0, Math.min(tarjetas.length - 1, (enfocada < 0 ? giro.indice() : enfocada) + (e.key === 'ArrowRight' ? 1 : -1)));
    if (centro() === null) giro.ir(siguiente);
    tarjetas[siguiente]?.focus({preventScroll: true});
  }, {signal: senal});
  // Se acomoda sola al cambiar de tamaño y al hacerse visible (estaba en una hoja o un panel oculto).
  // Solo cuando cambia el ancho, para no interrumpir el deslizamiento con que parte una pista recién armada.
  let ancho = elemento.clientWidth;
  const medida = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (elemento.clientWidth !== ancho) { ancho = elemento.clientWidth; pista.acomodar(); } }) : null;
  medida?.observe(elemento);
  const pista = {
    tarjetas,
    caben,
    // Deja la pista en su lugar sin animar: centrada si caben todas; si no, con la tarjeta i al frente.
    acomodar(i = Math.round(giro.objetivo())) { giro.fijar(centro() ?? i); },
    ir(i) { if (centro() === null) giro.ir(i); },
    soltarCursor() { cursor = null; iluminar(); },
    destruir() { fin.abort(); medida?.disconnect(); }
  };
  return pista;
}

// Dibujos de las tarjetas de vista, con la misma cuadrícula y trazo que los de la rueda.
const D = {
  curva: '<path d="M20 86h120M20 14v72"/><path class="f" d="M28 74l28-18 26 8 28-30 22-12"/>',
  gantt: '<rect x="14" y="14" width="132" height="72"/><path d="M14 28h132M40 14v72M66 14v72M92 14v72M118 14v72"/><path class="f" d="M42 33h48v10H42zM68 50h48v10H68zM94 67h22v10H94z"/>',
  lista: '<rect x="34" y="14" width="92" height="72"/><path class="f" d="M48 34l7 7 13-13M48 60l7 7 13-13"/><path d="M80 36h32M80 62h32"/>',
  sello: '<path d="M80 12l52 20v24c0 18-22 28-52 34-30-6-52-16-52-34V32z"/><path class="f" d="M58 50l15 15 30-30"/>',
  personas: '<circle cx="62" cy="34" r="14"/><circle cx="104" cy="34" r="14"/><path d="M34 84c0-18 12-28 28-28s28 10 28 28M88 58c20-4 38 8 38 26"/>',
  avance: '<rect x="22" y="38" width="116" height="24"/><path class="f" d="M22 38h74v24H22z"/>',
  alerta: '<path d="M80 12l58 76H22z"/><path class="f" d="M80 40v24M80 74v2"/>',
  foto: '<rect x="26" y="26" width="108" height="60"/><circle class="f" cx="80" cy="56" r="18"/><path d="M58 26l8-12h28l8 12"/>',
  rombo: '<path d="M80 8l42 42-42 42-42-42z"/><path class="f" d="M62 34h36v32H62z"/><path d="M62 50h36"/>',
  barras: '<path d="M36 86h88"/><path d="M48 86V58h16v28zM72 86V38h16v48z"/><path class="f" d="M96 86V20h16v66z"/>',
  matriz: '<rect x="24" y="16" width="112" height="68"/><path class="f" d="M24 32h112"/><path d="M24 50h112M24 67h112M60 16v68M98 16v68"/>'
};
// Selecciones de la app que se muestran como tarjetas con flujo. Conservan sus botones, sus atributos y su lógica: aquí solo
// cambia la forma. tamano: grande (como la rueda, para vistas sobre una tabla), media (con un número) o baja (una línea).
// cartas: dibujo y texto de cada botón, según su clave (data-id o data-vista).
export const GRUPOS = [
  {selector: '.lpCycleNav', boton: 'button', tamano: 'grande', cartas: {
    resumen: {dibujo: D.curva, texto: 'Indicadores de la semana'}, planificacion: {dibujo: D.gantt, texto: 'Actividades y compromisos'},
    ejecucion: {dibujo: D.lista, texto: 'Avance y asistencia'}, revision: {dibujo: D.sello, texto: 'Verificar y cerrar'}}},
  {selector: '.lpCycleSubnav', boton: 'button', tamano: 'grande', cartas: {
    checklist: {dibujo: D.lista, texto: 'Lista para ejecutar'}, attendance: {dibujo: D.personas, texto: 'Personal del día'}, execution: {dibujo: D.avance, texto: 'Cantidad ejecutada'},
    restrictions: {dibujo: D.alerta, texto: 'Lo que impide avanzar'}, evidence: {dibujo: D.foto, texto: 'Fotos y respaldos'}, review: {dibujo: D.sello, texto: 'Revisar y cerrar'}}},
  {selector: '.subVistas', boton: '[role=tab]', tamano: 'grande', cartas: {
    recinto: {dibujo: D.rombo, texto: 'Estado de cada recinto'}, observaciones: {dibujo: D.foto, texto: 'Registradas en obra'}, valorizado: {dibujo: D.barras, texto: 'Metros por partida'},
    matriz: {dibujo: D.matriz, texto: 'Todos los protocolos'}, criticos: {dibujo: D.alerta, texto: 'Abiertos hace mucho'}}},
  {selector: '.lpPlanChooser [role=radiogroup]', boton: '[role=radio]', tamano: 'grande'},
  {selector: '.obsStateTabs', boton: 'button', tamano: 'media'},
  {selector: '.lpDays', boton: 'button', tamano: 'media'},
  {selector: '.planTypes:not([data-sin-flujo])', boton: 'button', tamano: 'baja'},
  {selector: '.filterTiposPlano', boton: 'button', tamano: 'baja'},
  {selector: '.lpSpatialModes', boton: 'button', tamano: 'baja'},
  // Formularios y listas. soloVisibles: la búsqueda de la lista esconde filas.
  {selector: '.jerPasos', boton: 'button', tamano: 'baja'},
  {selector: '.jerGente', boton: '.jerPersona', tamano: 'media'},
  {selector: '.levOpciones', boton: 'button', tamano: 'baja'},
  {selector: '.phGrupo[role=group]', boton: 'button', tamano: 'baja'},
  {selector: '.cfOrden', boton: 'button', tamano: 'baja'},
  {selector: '.cfLista', boton: 'label', tamano: 'baja'},
  {selector: '.matrixGroup > div', boton: '.matrixTypeChoice', tamano: 'media'},
  {selector: '.hojaLista', boton: 'button', tamano: 'media', soloVisibles: true}
];
// Listas desplegables que quedan fuera: las del panel lateral antiguo, que ya no se muestra.
export const SIN_FLUJO = '.left, [data-sin-flujo]';
export const claveDe = b => b.dataset.id ?? b.dataset.vista ?? '';
// Posición de la tarjeta activa, o -1 si ninguna lo está.
export const indiceActivo = botones => botones.findIndex(b => ['aria-pressed', 'aria-selected', 'aria-checked'].some(a => b.getAttribute(a) === 'true'));
// Opciones de una lista desplegable: si cambian (valores, textos o bloqueos), sus tarjetas se vuelven a armar.
export const firmaDeSelect = select => [select.disabled, ...[...select.options].map(o => [o.value, o.text, o.disabled].join('|'))].join('\n');

const armadas = new WeakMap(), desplegables = new WeakMap(), ultimoLugar = new Map();
function vestir(boton, carta) {
  const titulo = boton.textContent.trim();
  boton.replaceChildren();
  boton.insertAdjacentHTML('beforeend', `<svg class="panelArt" viewBox="0 0 160 100" aria-hidden="true">${carta.dibujo}</svg>`);
  const fuerte = document.createElement('strong'), chico = document.createElement('small');
  fuerte.textContent = titulo; chico.textContent = carta.texto;
  boton.append(fuerte, chico);
}
// Vuelve flujo un grupo de botones. Si la pantalla redibujó el grupo, parte donde estaba y se desliza a la tarjeta activa.
// Más de LARGA opciones no se recorren de a una: van en una lista vertical (unas 8 por pantalla) con buscador. Las tarjetas
// de flujo siguen para módulos, vistas y listas cortas.
export const LARGA = 8;
export const esLarga = n => n > LARGA;
const normal = s => String(s || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
// Buscador de una lista larga. Si la pantalla ya trae el suyo (soloVisibles, como la lista de protocolos), no se agrega.
function buscadorDe(contenedor, botones, nombre) {
  if (contenedor.previousElementSibling?.classList.contains('flujoBuscar')) return;
  const input = document.createElement('input');
  input.type = 'search'; input.className = 'flujoBuscar'; input.autocomplete = 'off';
  input.placeholder = 'Buscar entre ' + botones.length + ' opciones…'; input.setAttribute('aria-label', 'Buscar ' + (nombre || 'opción'));
  input.oninput = () => { const q = normal(input.value.trim()); for (const b of contenedor.querySelectorAll('.ruedaTarjeta')) b.hidden = !!q && !normal(b.textContent).includes(q); };
  contenedor.before(input);
}
function armarLarga(contenedor, grupo, todos) {
  armadas.get(contenedor)?.destruir(); armadas.delete(contenedor);
  contenedor.classList.add('ruedaPista', 'conFlujo', 'flujoLargo', 'flujo-' + grupo.tamano);
  todos.forEach(b => { b.classList.add('ruedaTarjeta'); b.style.removeProperty('transform'); });
  if (!grupo.soloVisibles) buscadorDe(contenedor, todos, contenedor.getAttribute('aria-label'));
  contenedor.querySelector('.ruedaTarjeta:is([aria-pressed=true],[aria-selected=true],[aria-checked=true])')?.scrollIntoView?.({block: 'nearest'});
}
function armar(contenedor, grupo, forzar = false) {
  const todos = [...contenedor.querySelectorAll(grupo.boton)], botones = grupo.soloVisibles ? todos.filter(b => !b.closest('[hidden]')) : todos;
  if (!forzar && (!todos.length || todos.every(b => b.classList.contains('ruedaTarjeta')))) return;
  if (esLarga(todos.length)) { armarLarga(contenedor, grupo, todos); return; }
  armadas.get(contenedor)?.destruir();
  contenedor.classList.add('ruedaPista', 'conFlujo', 'flujo-' + grupo.tamano);
  todos.forEach(b => { if (b.classList.contains('ruedaTarjeta')) return; b.classList.add('ruedaTarjeta'); const carta = grupo.cartas?.[claveDe(b)]; if (carta) vestir(b, carta); });
  const activo = Math.max(0, indiceActivo(botones)), previo = ultimoLugar.get(grupo.selector);
  const pista = crearPista(contenedor, {inicial: previo ?? activo, conRueda: false, lista: botones});
  armadas.set(contenedor, pista);
  pista.acomodar(Math.min(previo ?? activo, Math.max(0, botones.length - 1)));
  pista.ir(activo);
  ultimoLugar.set(grupo.selector, activo);
}
// Una búsqueda escondió o mostró filas: la pista se vuelve a armar con las que quedan.
export function rearmarFlujo(contenedor) {
  const grupo = contenedor && GRUPOS.find(g => contenedor.matches(g.selector));
  if (grupo) armar(contenedor, grupo, true);
}
// Lista desplegable: se conserva en la página, oculta, con su valor y sus avisos. Las tarjetas la manejan por dentro, así
// cada pantalla sigue leyendo su select y escuchando sus cambios como siempre.
function marcarOpcion(select, caja) { caja.querySelectorAll('[data-valor]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.valor === select.value))); }
function armarSelect(select) {
  if (select.multiple || !select.options.length || select.closest(SIN_FLUJO)) return;
  const firma = firmaDeSelect(select), previo = desplegables.get(select);
  if (previo?.firma === firma) { if (previo.caja.querySelector('[aria-pressed=true]')?.dataset.valor !== select.value) marcarOpcion(select, previo.caja); return; }
  previo?.pista.destruir();
  if (previo?.caja.previousElementSibling?.classList.contains('flujoBuscar')) previo.caja.previousElementSibling.remove();
  previo?.caja.remove();
  const caja = document.createElement('div');
  caja.className = 'ruedaPista conFlujo flujo-baja flujoLista'; caja.setAttribute('role', 'group');
  const nombre = select.getAttribute('aria-label') || select.title || select.closest('label')?.firstChild?.textContent?.trim();
  if (nombre) caja.setAttribute('aria-label', nombre);
  for (const o of select.options) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ruedaTarjeta'; b.dataset.valor = o.value; b.textContent = o.text; b.disabled = o.disabled || select.disabled;
    b.onclick = () => { select.value = o.value; marcarOpcion(select, caja); select.dispatchEvent(new Event('input', {bubbles: true})); select.dispatchEvent(new Event('change', {bubbles: true})); };
    caja.append(b);
  }
  select.classList.add('selectConFlujo'); select.after(caja); select.setAttribute('tabindex', '-1');
  marcarOpcion(select, caja);
  const activo = Math.max(0, [...select.options].findIndex(o => o.value === select.value));
  if (esLarga(select.options.length)) {
    caja.classList.add('flujoLargo'); buscadorDe(caja, [...caja.children], nombre);
    desplegables.set(select, {firma, caja, pista: {destruir() {}}});
  } else {
    const pista = crearPista(caja, {inicial: activo, conRueda: false});
    pista.acomodar(activo);
    desplegables.set(select, {firma, caja, pista});
  }
  select.addEventListener('change', () => { if (select.isConnected) marcarOpcion(select, caja); });
}
function revisar() {
  for (const grupo of GRUPOS) document.querySelectorAll(grupo.selector).forEach(c => armar(c, grupo));
  document.querySelectorAll('select').forEach(armarSelect);
}
// Mira la página y arma cada grupo apenas aparece, sin que cada pantalla tenga que pedirlo. El plano (SVG) no cuenta.
export function activarFlujos() {
  let pendiente = false;
  const revisarLuego = () => { if (pendiente) return; pendiente = true; requestAnimationFrame(() => { pendiente = false; revisar(); }); };
  new MutationObserver(cambios => { if (cambios.some(c => !(c.target instanceof SVGElement))) revisarLuego(); }).observe(document.body, {childList: true, subtree: true});
  revisar();
}
