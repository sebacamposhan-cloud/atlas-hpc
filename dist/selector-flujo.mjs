// Tarjetas con flujo: la misma rueda para todas las selecciones de Atlas. Se arrastran con el mouse o el dedo, con inercia,
// y el cursor ilumina en azul la tarjeta que tiene debajo. Si caben todas, la pista queda centrada y no gira: el cursor
// acerca la tarjeta sin desplazar el grupo. Si no caben (celular), la del centro queda de frente y las demás giran alrededor.
import {crearFluido, arrastrar, crearOleaje} from './fluido.mjs';

const quietud = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Una sola escucha de tamaño para todas las pistas; las que salieron de la página se olvidan.
const pistas = new Set();
if (typeof addEventListener === 'function') addEventListener('resize', () => { for (const p of pistas) { if (p.conectada()) p.acomodar(); else pistas.delete(p); } });

// elemento: contenedor con sus tarjetas adentro. alCambiar(i): cambió la tarjeta del centro al girar (solo si no caben todas).
export function crearPista(elemento, {inicial = 0, alCambiar = () => {}, tarjeta = '.ruedaTarjeta'} = {}) {
  const tarjetas = [...elemento.querySelectorAll(tarjeta)];
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
      t.style.transform = `translate(${(d * tramo + (lado[i] || 0) * h * 10).toFixed(1)}px, ${(-8 * h * cerca).toFixed(1)}px) rotateY(${(a * (abierta ? -12 : -24) * (1 - h * cerca)).toFixed(1)}deg) scale(${(1 - Math.abs(a) * (abierta ? .04 : .12) + .05 * h * cerca).toFixed(3)})`;
      t.classList.toggle('alCentro', !abierta && Math.abs(d) < .5);
    });
    if (cursor) iluminar();
  }
  const giro = crearFluido({cantidad: tarjetas.length, inicial, quieto: quietud, centro, alCambiar: i => { if (centro() === null) alCambiar(i); }, dibujar: p => { posiciones = p; pintar(); }});
  const oleaje = crearOleaje({cantidad: tarjetas.length, quieto: quietud, rapidez: .3, dibujar: (x, f, h) => { lado = x; fila = f; fuerza = h; pintar(); }});
  arrastrar(elemento, giro, {eje: 'x', paso: () => distancia() || 1});
  elemento.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    cursor = [e.clientX, e.clientY]; iluminar();
    if (e.buttons) return;
    const r = elemento.getBoundingClientRect(), medio = r.left + r.width / 2;
    oleaje.mover(Math.max(-1, Math.min(1, (e.clientX - medio) / (r.width / 2))), giro.objetivo() + (e.clientX - medio) / (distancia() || 1));
  });
  elemento.addEventListener('pointerleave', () => { cursor = null; iluminar(); oleaje.soltar(); });
  // Con las flechas del teclado se pasa de una tarjeta a otra.
  elemento.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const enfocada = tarjetas.indexOf(document.activeElement), siguiente = Math.max(0, Math.min(tarjetas.length - 1, (enfocada < 0 ? giro.indice() : enfocada) + (e.key === 'ArrowRight' ? 1 : -1)));
    if (centro() === null) giro.ir(siguiente);
    tarjetas[siguiente]?.focus({preventScroll: true});
  });
  const pista = {
    tarjetas,
    caben,
    conectada: () => elemento.isConnected,
    // Deja la pista en su lugar sin animar: centrada si caben todas; si no, con la tarjeta i al frente.
    acomodar(i = giro.indice()) { giro.fijar(centro() ?? i); },
    ir(i) { if (centro() === null) giro.ir(i); },
    soltarCursor() { cursor = null; iluminar(); }
  };
  pistas.add(pista);
  return pista;
}
