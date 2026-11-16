// Paneles de la derecha que se agrandan arrastrando su borde, en escritorio. La ficha del recinto (rombo), las hojas de
// funciones, los protocolos y el resumen del piso comparten el mismo ancho (--detail): agrandar uno los agranda todos y el
// plano se acomoda. Un asa visible en el borde izquierdo del panel abierto se arrastra con el mouse; doble clic alterna
// entre ancho amplio y normal; con el teclado, flechas izquierda y derecha. El ancho queda guardado en el equipo.
// En el celular los paneles van a pantalla completa y el asa no aparece (escritorio.css).
const CLAVE = 'atlas-ficha-ancho', PANELES = ['.right', '#hojaFuncion', '#protocolPanel', '#resumenPiso'];
export const MINIMO = 310, MAXIMO = .75, AMPLIO = .6;
export const anchoPermitido = (w, ventana) => Math.round(Math.max(MINIMO, Math.min(ventana * MAXIMO, w)));
// Doble clic: si el panel es angosto pasa a amplio; si ya es amplio vuelve al ancho normal de la hoja de estilos.
export const alternar = (w, ventana) => w < ventana * AMPLIO - 20 ? anchoPermitido(ventana * AMPLIO, ventana) : null;

const visible = el => !!el && el.offsetWidth > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
const anchoActual = () => { for (const s of PANELES) { const el = document.querySelector(s); if (visible(el)) return el.getBoundingClientRect().width; } return null; };
export function fijarAncho(w) {
  if (w === null) { document.body.style.removeProperty('--detail'); return null; }
  const v = anchoPermitido(w, innerWidth); document.body.style.setProperty('--detail', (100 * v / innerWidth).toFixed(2) + 'vw'); return v;
}
const guardar = w => { try { if (w === null) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, String(w / innerWidth)); } catch {} };
export function restaurarAncho() { try { const f = Number(localStorage.getItem(CLAVE)); if (f > 0 && f < 1) fijarAncho(f * innerWidth); } catch {} }

// asa: el elemento que se arrastra. alTerminar: se llama al soltar (por ejemplo, para volver a pedir los mosaicos del plano).
export function conectarAsa(asa, alTerminar = () => {}) {
  let inicio = null;
  const terminar = w => { guardar(w); alTerminar(); };
  asa.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; const w = anchoActual(); if (w === null) return;
    inicio = {x: e.clientX, w}; asa.setPointerCapture(e.pointerId); document.body.classList.add('ajustandoPanel'); e.preventDefault();
  });
  asa.addEventListener('pointermove', e => { if (inicio) fijarAncho(inicio.w + inicio.x - e.clientX); });
  const soltar = () => { if (!inicio) return; inicio = null; document.body.classList.remove('ajustandoPanel'); terminar(anchoActual()); };
  asa.addEventListener('pointerup', soltar); asa.addEventListener('pointercancel', soltar);
  asa.addEventListener('dblclick', () => { const w = anchoActual(); if (w === null) return; const nuevo = alternar(w, innerWidth); fijarAncho(nuevo); terminar(nuevo === null ? null : anchoActual()); });
  asa.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault();
    const w = anchoActual(); if (w === null) return; fijarAncho(w + (e.key === 'ArrowLeft' ? 40 : -40)); terminar(anchoActual());
  });
}
