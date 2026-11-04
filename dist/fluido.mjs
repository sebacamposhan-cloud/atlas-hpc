// Movimiento fluido, como agua: lo tomas, te sigue con suavidad, al soltar sigue un poco y frena solo. Cada elemento llega
// con un leve retraso según su distancia, y eso forma la onda. Lo usan la rueda de Control de obra y los pisos apilados.
const ROZAMIENTO = .93, RESORTE = .2, RETRASO = .55, ELASTICO = .3, VELOCIDAD_MINIMA = .006, MARGEN = .0005;

// dibujar(posiciones): una posición por elemento, en unidades de elemento. alCambiar(i): cambió el elemento más cercano.
export function crearFluido({cantidad, inicial = 0, dibujar, alCambiar = () => {}, cuadro = f => requestAnimationFrame(f), quieto = () => false}) {
  const ultimo = cantidad - 1, tope = v => Math.max(0, Math.min(ultimo, v)), asentar = v => Math.round(tope(v));
  // Pasado el borde se resiste, como una cuerda elástica.
  const estirar = v => v < 0 ? v * ELASTICO : v > ultimo ? ultimo + (v - ultimo) * ELASTICO : v;
  const pos = Array.from({length: cantidad}, () => inicial);
  let objetivo = inicial, velocidad = 0, tomado = false, pendiente = false, indice = asentar(inicial);
  const pedir = () => { if (!pendiente) { pendiente = true; cuadro(paso); } };
  function paso() {
    pendiente = false;
    if (!tomado && velocidad) {
      objetivo += velocidad; velocidad *= ROZAMIENTO;
      if (Math.abs(velocidad) < VELOCIDAD_MINIMA || objetivo < 0 || objetivo > ultimo) { velocidad = 0; objetivo = asentar(objetivo); }
    }
    const meta = estirar(objetivo);
    let sigue = tomado || velocidad !== 0;
    for (let i = 0; i < cantidad; i++) {
      const n = quieto() ? meta : pos[i] + (meta - pos[i]) * RESORTE / (1 + RETRASO * Math.abs(i - meta));
      pos[i] = Math.abs(meta - n) < MARGEN ? meta : n;
      if (pos[i] !== meta) sigue = true;
    }
    const cercano = asentar(meta);
    if (cercano !== indice) { indice = cercano; alCambiar(cercano); }
    dibujar(pos);
    if (sigue) pedir();
  }
  return {
    indice: () => indice,
    objetivo: () => objetivo,
    tomar() { tomado = true; velocidad = 0; pedir(); },
    llevar(v) { objetivo = v; pedir(); },
    soltar(v = 0) { tomado = false; velocidad = quieto() ? 0 : v; if (!velocidad) objetivo = asentar(objetivo); pedir(); },
    ir(i) { tomado = false; velocidad = 0; objetivo = tope(i); pedir(); },
    fijar(i) { tomado = false; velocidad = 0; objetivo = tope(i); indice = asentar(i); pos.fill(objetivo); dibujar(pos); },
    redibujar() { dibujar(pos); }
  };
}

// Conecta un fluido al mouse, al dedo y a la rueda del mouse. sentido: 1 si el elemento sigue a la mano, -1 si avanza al revés.
export function arrastrar(elemento, fluido, {eje = 'x', paso, sentido = -1}) {
  const lugar = e => eje === 'x' ? e.clientX : e.clientY;
  let toque = null, soltado = -1e9, espera = 0;
  elemento.addEventListener('pointerdown', e => { if (!e.button) toque = {id: e.pointerId, inicio: lugar(e), base: fluido.objetivo(), movido: false, marcas: [[e.timeStamp, lugar(e)]]}; });
  elemento.addEventListener('pointermove', e => {
    if (!toque || e.pointerId !== toque.id) return;
    const d = lugar(e) - toque.inicio;
    if (!toque.movido) {
      if (Math.abs(d) < 6) return;
      toque.movido = true; elemento.setPointerCapture(e.pointerId); elemento.classList.add('tomado'); fluido.tomar();
    }
    fluido.llevar(toque.base + sentido * d / paso());
    toque.marcas.push([e.timeStamp, lugar(e)]);
    while (toque.marcas.length > 2 && e.timeStamp - toque.marcas[0][0] > 100) toque.marcas.shift();
  });
  const fin = e => {
    if (!toque || e.pointerId !== toque.id) return;
    const {movido, marcas} = toque; toque = null;
    if (!movido) return;
    elemento.classList.remove('tomado'); soltado = e.timeStamp;
    const [t0, p0] = marcas[0], [t1, p1] = marcas.at(-1), ms = t1 - t0;
    fluido.soltar(ms > 0 && e.timeStamp - t1 < 80 ? sentido * (p1 - p0) / ms * 16.7 / paso() : 0);
  };
  elemento.addEventListener('pointerup', fin);
  elemento.addEventListener('pointercancel', fin);
  // Un arrastre no debe contar como toque sobre lo que quedó bajo el puntero.
  elemento.addEventListener('click', e => { if (e.timeStamp - soltado < 350) { e.preventDefault(); e.stopPropagation(); } }, true);
  elemento.addEventListener('wheel', e => {
    e.preventDefault();
    fluido.tomar(); fluido.llevar(fluido.objetivo() + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * .6 / paso());
    clearTimeout(espera); espera = setTimeout(() => fluido.soltar(), 130);
  }, {passive: false});
}
