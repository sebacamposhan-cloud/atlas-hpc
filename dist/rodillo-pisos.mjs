// Rodillo de pisos de la hoja «Tus pisos», como el de una máquina tragamonedas: se ven tres pisos y el del centro queda
// en la ventana, grande y en azul. Se gira con el dedo, el mouse, la rueda o las flechas, un piso a la vez y con encaje.
// Tocar el piso de la ventana lo abre; tocar uno de arriba o de abajo lo trae a la ventana.
import {crearFluido, arrastrar} from './fluido.mjs';

const quietud = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Lugar de cada piso según su distancia «d» a la ventana (en pisos): sube o baja curvándose como un tambor.
export function lugarEnRodillo(d, alto) {
  const a = Math.max(-1.8, Math.min(1.8, d));
  return {y: Math.sin(a * Math.PI / 4) * alto * 1.32, giro: -a * 34, escala: 1 - Math.min(1, Math.abs(a)) * .2, opacidad: Math.max(0, 1 - Math.abs(a) * .5), visible: Math.abs(d) < 1.75};
}

// elemento: contenedor con los pisos (.rodilloPiso) en orden, el más alto primero.
// alCambiar(i): cambió el piso de la ventana. alElegir(i): se tocó el piso de la ventana.
export function crearRodillo(elemento, {inicial = 0, alCambiar = () => {}, alElegir = () => {}}) {
  const pisos = [...elemento.querySelectorAll('.rodilloPiso')];
  const alto = () => pisos[0]?.offsetHeight || 76;
  let posiciones = [];
  function pintar() {
    const h = alto();
    pisos.forEach((p, i) => {
      const d = i - (posiciones[i] ?? inicial), l = lugarEnRodillo(d, h);
      p.style.visibility = l.visible ? '' : 'hidden';
      p.style.transform = `translateY(${l.y.toFixed(1)}px) rotateX(${l.giro.toFixed(1)}deg) scale(${l.escala.toFixed(3)})`;
      p.style.opacity = l.opacidad.toFixed(2);
      p.style.zIndex = String(10 - Math.round(Math.abs(d) * 2));
      const alCentro = Math.abs(d) < .5;
      p.classList.toggle('alCentro', alCentro);
      p.setAttribute('aria-selected', String(alCentro));
      p.tabIndex = alCentro ? 0 : -1;
    });
  }
  const giro = crearFluido({cantidad: pisos.length, inicial, quieto: quietud, alCambiar: i => alCambiar(i), dibujar: p => { posiciones = p; pintar(); }});
  arrastrar(elemento, giro, {eje: 'y', paso: () => alto() * .9 || 1, sentido: -1});
  pisos.forEach((p, i) => p.addEventListener('click', () => { if (i === giro.indice() && Math.abs(giro.objetivo() - i) < .5) alElegir(i); else giro.ir(i); }));
  elemento.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = Math.max(0, Math.min(pisos.length - 1, giro.indice() + (e.key === 'ArrowDown' ? 1 : -1)));
      giro.ir(i); pisos[i].focus({preventScroll: true});
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alElegir(giro.indice()); }
  });
  giro.fijar(inicial);
  return {indice: () => giro.indice(), ir: i => giro.ir(i)};
}
