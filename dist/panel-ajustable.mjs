// Paneles que se agrandan arrastrando su borde, en escritorio. Un asa visible en el borde se arrastra con el mouse; doble
// clic alterna entre un ancho alternativo y el normal de la hoja de estilos; con el teclado, flechas izquierda y derecha.
// El ancho queda guardado en el equipo. En el celular los paneles van a pantalla completa y las asas no aparecen.
// - Derecha (--detail): la ficha del recinto (rombo), las hojas de funciones, los protocolos, el resumen del piso y el
//   detalle de una observación comparten el ancho: agrandar uno los agranda todos y el plano se acomoda.
// - Izquierda (--izq): la barra de Módulos, Plano y Control; achicarla deja más plano a la vista.
export const MINIMO = 310, MAXIMO = .75, AMPLIO = .6;
const DERECHA = {variable: '--detail', clave: 'atlas-ficha-ancho', sentido: -1, unidad: 'vw', minimo: MINIMO, maximo: v => v * MAXIMO, alterno: v => v * AMPLIO,
  paneles: ['dialog.obsDetailDrawer[open]', '.right', '#hojaFuncion', '#protocolPanel', '#resumenPiso']};
const IZQUIERDA = {variable: '--izq', clave: 'atlas-barra-ancho', sentido: 1, unidad: 'px', minimo: 220, maximo: () => 460, alterno: () => 220, paneles: ['#ruedaObra']};

export const anchoPermitido = (w, ventana, lado = DERECHA) => Math.round(Math.max(lado.minimo, Math.min(lado.maximo(ventana), w)));
// Doble clic: si no está en el ancho alternativo, pasa a él; si ya está, vuelve al normal (null).
export const alternar = (w, ventana, lado = DERECHA) => { const a = anchoPermitido(lado.alterno(ventana), ventana, lado); return Math.abs(w - a) > 20 ? a : null; };
export const LADOS = {derecha: DERECHA, izquierda: IZQUIERDA};

const visible = el => !!el && el.offsetWidth > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
const anchoActual = lado => { for (const s of lado.paneles) { const el = document.querySelector(s); if (visible(el)) return el.getBoundingClientRect().width; } return null; };
function fijar(lado, w) {
  if (w === null) { document.body.style.removeProperty(lado.variable); return null; }
  const v = anchoPermitido(w, innerWidth, lado);
  document.body.style.setProperty(lado.variable, lado.unidad === 'vw' ? (100 * v / innerWidth).toFixed(2) + 'vw' : v + 'px');
  return v;
}
const guardar = (lado, w) => { try { if (w === null) localStorage.removeItem(lado.clave); else localStorage.setItem(lado.clave, String(lado.unidad === 'vw' ? w / innerWidth : w)); } catch {} };
export function restaurarAnchos() {
  for (const lado of [DERECHA, IZQUIERDA]) try { const f = Number(localStorage.getItem(lado.clave)); if (f > 0) fijar(lado, lado.unidad === 'vw' ? (f < 1 ? f * innerWidth : null) : f); } catch {}
}

// asa: el elemento que se arrastra. lado: 'derecha' o 'izquierda'. alTerminar: se llama al soltar (por ejemplo, para volver
// a pedir los mosaicos del plano, que cambió de tamaño).
export function conectarAsa(asa, alTerminar = () => {}, nombre = 'derecha') {
  const lado = LADOS[nombre]; let inicio = null;
  const terminar = w => { guardar(lado, w); alTerminar(); };
  asa.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; const w = anchoActual(lado); if (w === null) return;
    inicio = {x: e.clientX, w}; asa.setPointerCapture(e.pointerId); document.body.classList.add('ajustandoPanel'); e.preventDefault(); e.stopPropagation();
  });
  asa.addEventListener('pointermove', e => { if (inicio) fijar(lado, inicio.w + lado.sentido * (e.clientX - inicio.x)); });
  const soltar = () => { if (!inicio) return; inicio = null; document.body.classList.remove('ajustandoPanel'); terminar(anchoActual(lado)); };
  asa.addEventListener('pointerup', soltar); asa.addEventListener('pointercancel', soltar);
  asa.addEventListener('dblclick', e => { e.stopPropagation(); const w = anchoActual(lado); if (w === null) return; const nuevo = alternar(w, innerWidth, lado); fijar(lado, nuevo); terminar(nuevo === null ? null : anchoActual(lado)); });
  asa.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault();
    const w = anchoActual(lado); if (w === null) return; fijar(lado, w + (e.key === 'ArrowLeft' ? -40 : 40) * lado.sentido); terminar(anchoActual(lado));
  });
}

// Asa para un panel que reescribe su contenido (el detalle de una observación): se vuelve a poner cada vez que falta.
export function asaDentroDe(panel, alTerminar) {
  const asa = document.createElement('div');
  asa.className = 'asaPanel asaDentro'; asa.setAttribute('role', 'separator'); asa.setAttribute('aria-orientation', 'vertical'); asa.tabIndex = 0;
  asa.setAttribute('aria-label', 'Ancho del panel: arrastra hacia la izquierda para agrandarlo'); asa.title = 'Arrastra para agrandar o achicar · doble clic: amplio o normal';
  asa.innerHTML = '<span></span>'; conectarAsa(asa, alTerminar);
  const poner = () => { if (asa.parentNode !== panel) panel.prepend(asa); };
  new MutationObserver(poner).observe(panel, {childList: true}); poner();
  return asa;
}
