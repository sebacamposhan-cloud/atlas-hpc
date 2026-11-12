// Curva de avance: % acumulado de partidas instaladas por semana, real contra programado. Solo con registros reales.
const SEMANA = 7 * 864e5;
const fecha = d => Date.parse(d + 'T12:00:00Z'), dia = t => new Date(t).toISOString().slice(0, 10);
const uno = v => Math.round(v * 10) / 10;
const corta = d => d.slice(8, 10) + '/' + d.slice(5, 7);
// Curva real: partidas instaladas acumuladas según la fecha del registro de su recinto. Sin programa cargado, no hay línea programada.
export function curvaReal(fechas, total, hoy) {
  if (!total || !fechas.length) return [];
  const h = fecha(hoy), primera = Math.min(h, ...fechas.map(fecha)), semanas = Math.ceil((h - primera) / SEMANA) + 1;
  return Array.from({length: semanas + 1}, (_, i) => {
    const corte = h - (semanas - i) * SEMANA;
    return {fecha: dia(corte), programado: null, real: uno(100 * fechas.filter(f => fecha(f) <= corte).length / total)};
  });
}

export function resumenCurva(puntos) {
  const reales = puntos.filter(p => p.real !== null), hoy = reales.at(-1);
  if (!hoy) return null;
  return {fecha: hoy.fecha, real: hoy.real, programado: hoy.programado, brecha: hoy.programado === null ? null : uno(hoy.real - hoy.programado)};
}

const REAL = '#0f5499', PROGRAMADO = '#29a8df';
const pct = v => v === null ? '—' : String(v).replace('.', ',') + ' %';
function textoResumen(r) {
  if (r.brecha === null) return `<span><b>${pct(r.real)}</b> real</span>`;
  const brecha = Math.abs(r.brecha), lado = r.brecha < 0 ? 'bajo el programa' : r.brecha > 0 ? 'sobre el programa' : 'igual al programa';
  return `<span><b>${pct(r.real)}</b> real</span><span><b>${pct(r.programado)}</b> programado</span><span><b>${String(brecha).replace('.', ',')} puntos</b> ${lado}</span>`;
}

// Tarjeta del gráfico. Se dibuja al ancho real, para que los textos no se achiquen en el celular.
export function montarCurva(root, {puntos}, esc) {
  const r = resumenCurva(puntos), hayPrograma = puntos.some(p => p.programado !== null);
  root.innerHTML = `<div class="chartHeading"><h3>Avance real vs programado</h3><span>% de partidas instaladas</span></div>${!r ? '<p class="chartEmpty">El gráfico aparecerá cuando se instalen partidas registradas.</p>' : `<div class="curvaResumen">${textoResumen(r)}</div>${hayPrograma ? '<div class="curvaLeyenda"><span><i class="real"></i>Real</span><span><i class="programado"></i>Programado</span></div>' : '<p class="chartSubtitle">Falta cargar el programa de obra para compararlo.</p>'}<div class="curvaGrafico"><div class="curvaDato" hidden></div></div><details class="obsCerradas curvaTabla"><summary>Ver tabla</summary><div class="tableScroll"><table><thead><tr><th>Semana</th><th>Programado</th><th>Real</th></tr></thead><tbody>${puntos.map(p => `<tr><td>${esc(corta(p.fecha))}</td><td>${pct(p.programado)}</td><td>${pct(p.real)}</td></tr>`).join('')}</tbody></table></div></details>`}`;
  if (!r) return;
  const zona = root.querySelector('.curvaGrafico'), dato = zona.querySelector('.curvaDato');
  const pintar = () => {
    const w = Math.max(280, zona.clientWidth || 280), h = 230, m = {arriba: 16, derecha: 14, abajo: 26, izquierda: 42}, n = puntos.length;
    const x = i => m.izquierda + (n > 1 ? i / (n - 1) : 0) * (w - m.izquierda - m.derecha), y = v => m.arriba + (1 - v / 100) * (h - m.arriba - m.abajo);
    const linea = campo => puntos.flatMap((p, i) => p[campo] === null ? [] : [`${x(i).toFixed(1)} ${y(p[campo]).toFixed(1)}`]).map((c, i) => (i ? 'L' : 'M') + c).join('');
    const ultimo = puntos.reduce((u, p, i) => p.real !== null ? i : u, 0), cada = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(w / 80))));
    const ejeY = [0, 25, 50, 75, 100].map(v => `<line class="curvaGrilla" x1="${m.izquierda}" x2="${w - m.derecha}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.izquierda - 8}" y="${y(v) + 4}" text-anchor="end">${v} %</text>`).join('');
    const ejeX = puntos.map((p, i) => i % cada ? '' : `<text x="${x(i)}" y="${h - 8}" text-anchor="middle">${esc(corta(p.fecha))}</text>`).join('');
    const hoyX = x(ultimo), real = puntos[ultimo].real, prog = puntos[ultimo].programado;
    const marca = (v, color) => `<circle cx="${hoyX}" cy="${y(v)}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>`;
    // A la derecha del día de hoy si el texto cabe; si no, a su izquierda.
    const etiqueta = (texto, v, abajo) => { const izquierda = hoyX + 12 + texto.length * 7.2 > w; return `<text class="fuerte" x="${hoyX + (izquierda ? -9 : 9)}" y="${y(v) + (abajo ? 16 : -9)}" text-anchor="${izquierda ? 'end' : 'start'}">${texto}</text>`; };
    zona.querySelector('svg')?.remove();
    zona.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" tabindex="0" role="img" aria-label="Avance real ${pct(real)}${prog === null ? '' : ', programado ' + pct(prog)}">${ejeY}${ejeX}${hayPrograma ? `<line class="curvaHoy" x1="${hoyX}" x2="${hoyX}" y1="${m.arriba}" y2="${h - m.abajo}"/><text x="${hoyX}" y="${m.arriba - 5}" text-anchor="middle">Hoy</text><path d="${linea('programado')}" fill="none" stroke="${PROGRAMADO}" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}<path d="${linea('real')}" fill="none" stroke="${REAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${prog === null ? '' : marca(prog, PROGRAMADO) + etiqueta('Programado ' + pct(prog), prog, false)}${marca(real, REAL)}${etiqueta('Real ' + pct(real), real, prog !== null)}<line class="curvaCruz" y1="${m.arriba}" y2="${h - m.abajo}" visibility="hidden"/></svg>`);
    const svg = zona.querySelector('svg'), cruz = svg.querySelector('.curvaCruz');
    let actual = ultimo;
    const mostrar = i => {
      actual = Math.max(0, Math.min(n - 1, i));
      const p = puntos[actual], px = x(actual);
      cruz.setAttribute('x1', px); cruz.setAttribute('x2', px); cruz.setAttribute('visibility', 'visible');
      dato.replaceChildren();
      const fila = (nombre, valor) => { if (valor === null && nombre === 'Programado' && !hayPrograma) return; const f = document.createElement('div'), v = document.createElement('b'); v.textContent = pct(valor); f.append(v, ' ' + nombre); dato.append(f); };
      const t = document.createElement('small'); t.textContent = 'Semana del ' + corta(p.fecha); dato.append(t);
      fila('Real', p.real); fila('Programado', p.programado);
      dato.hidden = false; dato.style.left = Math.max(0, Math.min(w - 140, px + (px > w / 2 ? -148 : 8))) + 'px'; dato.style.top = '18px';
    };
    const ocultar = () => { cruz.setAttribute('visibility', 'hidden'); dato.hidden = true; };
    svg.addEventListener('pointermove', e => { const c = svg.getBoundingClientRect(), f = (e.clientX - c.left - m.izquierda) / Math.max(1, w - m.izquierda - m.derecha); mostrar(Math.round(f * (n - 1))); });
    svg.addEventListener('pointerleave', ocultar);
    svg.addEventListener('blur', ocultar);
    svg.addEventListener('focus', () => mostrar(ultimo));
    svg.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); mostrar(actual + (e.key === 'ArrowRight' ? 1 : -1)); } });
  };
  pintar();
  if (typeof ResizeObserver === 'function') {
    let ancho = zona.clientWidth;
    new ResizeObserver(() => { if (zona.isConnected && zona.clientWidth !== ancho) { ancho = zona.clientWidth; pintar(); } }).observe(zona);
  }
}
