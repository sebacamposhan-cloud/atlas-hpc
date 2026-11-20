// Hojas que suben desde abajo en terreno (celular y tablet vertical), con un asa arriba para llevarlas entre alturas:
// baja (lo esencial y el plano a la vista), media y completa. Arrastrar el asa sube o baja la hoja y al soltar queda en la
// altura más cercana en esa dirección; tocar el asa alterna entre media y completa (o sube de baja a media); con el
// teclado, flechas arriba y abajo. Bajar de la altura más baja llama a alBajar (por ejemplo, la ficha queda en su franja).
// La altura va en la variable --alto-hoja de la hoja y en data-altura; cada hoja de estilos decide qué muestra en cada una.
// Al cambiar de altura se avisa con «atlas-hoja-altura», para que el plano vuelva a encuadrar el recinto elegido.
export const ORDEN = ['baja', 'media', 'completa'];

// alturas: {baja?, media?, completa?} en px para un alto disponible dado. Devuelve [[nombre, px]] de menor a mayor.
export function alturasEn(alturas, alto) {
  return ORDEN.filter(n => typeof alturas[n] === 'function').map(n => [n, Math.max(60, Math.round(Math.min(alto, alturas[n](alto))))]).sort((a, b) => a[1] - b[1]);
}
// Altura al soltar: con un arrastre claro (más de 40 px) pasa a la siguiente en esa dirección; si no, la más cercana.
// null = bajó de la más baja (la hoja se baja o se cierra).
export function alturaAlSoltar(lista, inicio, actual) {
  if (!lista.length) return null;
  const delta = actual - inicio;
  if (delta < -40) { const menor = [...lista].reverse().find(([, px]) => px < inicio - 20); return menor ? menor[0] : actual < lista[0][1] * .7 ? null : lista[0][0]; }
  if (delta > 40) { const mayor = lista.find(([, px]) => px > inicio + 20); return (mayor || lista.at(-1))[0]; }
  return lista.reduce((a, b) => Math.abs(b[1] - actual) < Math.abs(a[1] - actual) ? b : a)[0];
}
// Toque en el asa: de baja a media, de media a completa y de completa a media.
export function alturaAlTocar(lista, actual) {
  const nombres = lista.map(([n]) => n), i = nombres.indexOf(actual);
  if (i < 0) return nombres[0] || null;
  if (actual === 'completa') return nombres.includes('media') ? 'media' : nombres[0];
  return nombres[i + 1] || nombres[i];
}

// hoja: el elemento. activa(): si esta hoja usa alturas ahora (por ejemplo, solo en el celular). alto(): alto disponible.
// alCambiar(nombre, px): después de fijar una altura. alContenido(hoja): cuando su contenido se reescribe.
export function hojaConAlturas(hoja, {alturas, inicial = 'media', activa = () => true, alto = () => innerHeight, alBajar = null, alCambiar = () => {}, alContenido = null, etiqueta = 'Arrastra para agrandar o achicar'} = {}) {
  const asa = document.createElement('button');
  asa.type = 'button'; asa.className = 'asaHoja'; asa.setAttribute('aria-label', etiqueta); asa.title = etiqueta;
  asa.innerHTML = '<span aria-hidden="true"></span>';
  // El asa va primera aunque la hoja reescriba su contenido.
  let poniendo = false;
  const poner = () => { if (poniendo) return; poniendo = true; if (hoja.firstChild !== asa) hoja.prepend(asa); poniendo = false; };
  new MutationObserver(cambios => {
    poner();
    if (alContenido && cambios.some(c => [...c.addedNodes].some(n => n !== asa))) try { alContenido(hoja); } catch {}
  }).observe(hoja, {childList: true});
  poner();

  const lista = () => alturasEn(alturas, alto());
  const pxDe = nombre => lista().find(([n]) => n === nombre)?.[1];
  const avisar = () => window.dispatchEvent(new CustomEvent('atlas-hoja-altura', {detail: {hoja, altura: hoja.dataset.altura || null}}));
  function soltarEstilo() { hoja.style.removeProperty('--alto-hoja'); delete hoja.dataset.altura; }
  function fijar(nombre = inicial) {
    if (!activa()) { soltarEstilo(); return null; }
    const px = pxDe(nombre) ?? pxDe(inicial) ?? lista()[0]?.[1];
    if (px == null) return null;
    const real = lista().find(([, v]) => v === px)[0];
    // Sin cambio no se avisa: quien escucha puede volver a dibujar la hoja y eso la volvería a medir.
    if (hoja.dataset.altura === real && hoja.style.getPropertyValue('--alto-hoja') === px + 'px') return real;
    hoja.style.setProperty('--alto-hoja', px + 'px'); hoja.dataset.altura = real;
    try { alCambiar(real, px); } catch {}
    avisar();
    return real;
  }
  const actual = () => hoja.dataset.altura || null;

  let inicio = null;
  asa.addEventListener('pointerdown', e => {
    if (!activa() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    inicio = {y: e.clientY, h: hoja.getBoundingClientRect().height, movio: false};
    asa.setPointerCapture(e.pointerId); hoja.classList.add('arrastrando'); e.preventDefault();
  });
  asa.addEventListener('pointermove', e => {
    if (!inicio) return;
    const dy = e.clientY - inicio.y; if (Math.abs(dy) > 6) inicio.movio = true;
    if (inicio.movio) hoja.style.setProperty('--alto-hoja', Math.max(40, Math.min(alto(), inicio.h - dy)) + 'px');
  });
  const soltar = e => {
    if (!inicio) return;
    const {h, movio} = inicio; inicio = null; hoja.classList.remove('arrastrando');
    if (!movio) { const sig = alturaAlTocar(lista(), actual()); if (sig) fijar(sig); return; }
    const ahora = hoja.getBoundingClientRect().height, destino = alturaAlSoltar(lista(), h, ahora);
    if (destino === null && alBajar) { fijar(lista()[0][0]); alBajar(); return; }
    fijar(destino || lista()[0][0]);
  };
  asa.addEventListener('pointerup', soltar); asa.addEventListener('pointercancel', soltar);
  // El clic del teclado (Enter o espacio) llega sin pointerdown.
  asa.addEventListener('click', e => { if (e.detail === 0 && activa()) { const sig = alturaAlTocar(lista(), actual()); if (sig) fijar(sig); } });
  asa.addEventListener('keydown', e => {
    if (!activa() || !['ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault();
    const nombres = lista().map(([n]) => n), i = nombres.indexOf(actual());
    if (e.key === 'ArrowUp') fijar(nombres[Math.min(nombres.length - 1, i + 1)]);
    else if (i <= 0 && alBajar) alBajar(); else fijar(nombres[Math.max(0, i - 1)]);
  });
  // Al girar la tablet o cambiar el tamaño de la ventana, la misma altura con la medida nueva.
  let espera = 0;
  addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(() => { if (actual() || activa()) { if (activa() && actual()) fijar(actual()); else if (!activa()) soltarEstilo(); } }, 120); });
  return {asa, fijar, actual, soltar: soltarEstilo};
}
