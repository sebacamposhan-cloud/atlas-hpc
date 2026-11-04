// Palanca de estados, como una caja de cambios: un riel con paradas fijas y un pomo que se arrastra o se mueve tocando la
// parada. Cada parada es un botón normal: el pomo solo termina pulsándolo, así el guardado es el mismo de un toque.
import {paradaCercana} from './navegacion-model.mjs';

// opciones: [{valor, etiqueta?, atributo, dato?, bloqueo?}]; bloqueo es el motivo por el que esa parada no se puede usar.
export function palancaHTML({titulo, opciones, valor, esc = String}) {
  const elegida = Math.max(0, opciones.findIndex(o => o.valor === valor));
  const parada = o => `<button type="button" class="palancaParada" ${o.atributo}="${esc(o.dato ?? o.valor)}" aria-pressed="${o.valor === valor}"${o.bloqueo ? ` disabled data-bloqueo="${esc(o.bloqueo)}" title="${esc(o.bloqueo)}"` : ''}>${esc(o.etiqueta ?? o.valor)}</button>`;
  return `<div class="palanca" role="group" aria-label="${esc(titulo)}"><span class="palancaTitulo">${esc(titulo)}</span><div class="palancaRiel" style="--n:${opciones.length};--i:${elegida}"><span class="palancaPomo" data-palanca-pomo aria-hidden="true"></span>${opciones.map(parada).join('')}</div></div>`;
}

export function activarPalancas(raiz, {aviso = () => {}} = {}) {
  raiz.querySelectorAll('[data-palanca-pomo]').forEach(pomo => {
    const riel = pomo.closest('.palancaRiel'), paradas = [...riel.querySelectorAll('.palancaParada')];
    let arrastre = null;
    const posicion = e => e.clientY - riel.getBoundingClientRect().top;
    pomo.onpointerdown = e => {
      if (paradas.every(p => p.disabled && p.getAttribute('aria-pressed') !== 'true')) return;
      e.preventDefault(); pomo.setPointerCapture(e.pointerId);
      arrastre = {alto: riel.getBoundingClientRect().height};
      riel.classList.add('arrastrando');
    };
    pomo.onpointermove = e => {
      if (!arrastre) return;
      const y = Math.max(0, Math.min(arrastre.alto, posicion(e)));
      riel.style.setProperty('--y', y + 'px');
    };
    const soltar = e => {
      if (!arrastre) return;
      const i = paradaCercana(posicion(e), arrastre.alto, paradas.length), destino = paradas[i];
      arrastre = null; riel.classList.remove('arrastrando'); riel.style.removeProperty('--y');
      if (destino.disabled) { aviso(destino.dataset.bloqueo || 'Esta posición aún no se puede marcar.'); return; }
      if (destino.getAttribute('aria-pressed') !== 'true') { riel.style.setProperty('--i', i); destino.click(); }
    };
    pomo.onpointerup = soltar;
    pomo.onpointercancel = () => { arrastre = null; riel.classList.remove('arrastrando'); riel.style.removeProperty('--y'); };
    paradas.forEach((p, i) => p.addEventListener('click', () => { if (!p.disabled) riel.style.setProperty('--i', i); }));
  });
}
