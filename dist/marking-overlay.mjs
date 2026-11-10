// All coordinates come from the existing viewer; annotations add no new geometry.
// Cada recinto se pinta con el color de su estado (proyectos) o, al comparar cortes, con el tipo de cambio (ver markingItems).
import {markingItems, CAMBIOS, esLevantamiento} from './marking-model.mjs';
import {leyenda as leyendaLevantamiento, categoria} from './levantamiento-model.mjs';
export function createMarkingOverlay(ctx) {
  const svg = document.getElementById('svg'), overlay = document.getElementById('markingOverlay');
  const elementos = doc => ctx.items ? ctx.items() : markingItems(doc);
  function render() {
    const doc = ctx.active();
    if (!doc) {overlay.replaceChildren(); return;}
    const px = 1 / (svg.getScreenCTM()?.a || 1);
    overlay.innerHTML = elementos(doc).map(item => {
      const room = ctx.room(item.id); if (!room) return '';
      const path = ctx.path(room.id), [x, y] = ctx.position(room);
      return `${path ? `<path data-marked-id="${ctx.esc(item.id)}" d="${path}" fill="${item.color}" fill-opacity="${item.opacity}" stroke="${item.color}" stroke-width="${ctx.focused() === item.id ? 3 : 1.5}" vector-effect="non-scaling-stroke" fill-rule="evenodd"/>` : ''}
        ${item.number == null ? '' : `<g transform="translate(${x} ${y})"><circle r="${12 * px}" fill="${item.color}" stroke="white" stroke-width="${2 * px}"/><text text-anchor="middle" dominant-baseline="central" fill="white" font-size="${12 * px}" font-weight="700">${item.number}</text></g>`}`;
    }).join('');
  }
  new MutationObserver(render).observe(svg, {attributes: true, attributeFilter: ['viewBox']});
  new ResizeObserver(render).observe(svg);
  function draw(canvas, doc, scope, items = doc ? markingItems(doc) : []) {
    if (!doc) return;
    canvas.save(); const radius = scope[2] / 120;
    for (const item of items) {
      const room = ctx.room(item.id); if (!room) continue;
      const path = ctx.path(room.id), [x, y] = ctx.position(room);
      if (path) {
        canvas.fillStyle = item.color; canvas.globalAlpha = item.opacity; canvas.fill(new Path2D(path), 'evenodd');
        canvas.globalAlpha = 1; canvas.strokeStyle = item.color; canvas.lineWidth = radius / 12; canvas.stroke(new Path2D(path));
      }
      if (item.number == null) continue;
      canvas.fillStyle = item.color; canvas.beginPath(); canvas.arc(x, y, radius, 0, Math.PI * 2); canvas.fill();
      canvas.fillStyle = 'white'; canvas.font = `bold ${radius * 1.2}px sans-serif`; canvas.textAlign = 'center'; canvas.textBaseline = 'middle'; canvas.fillText(String(item.number), x, y);
    }
    canvas.restore();
  }
  return {render, draw};
}

// ---------- Exportación de un proyecto ----------
// El plano lleva abajo a la izquierda el piso en grande con la simbología de colores; la segunda hoja del PDF es una
// tabla de recintos con el estado con que cada uno está pintado.
export const codigoPiso = level => level === 'N-1' ? 'S01' : String(level ?? '');
// Datos de la exportación: simbología ({nombre, color, n}) y tabla (columnas, anchos relativos y filas). Una celda puede
// ser texto o {texto, color}. enlazado: estado del rombo para columnas enlazadas; nombreRecinto(code): nombre del plano.
export function datosExportacion(doc, comparacion = null, enlazado = null, nombreRecinto = () => '') {
  const base = {piso: codigoPiso(doc.level), titulo: doc.name, autor: doc.author, proposito: doc.purpose, actualizado: doc.updatedAt};
  if (esLevantamiento(doc)) {
    const vista = doc.columnas.find(c => c.id === doc.vista)?.nombre || 'Listo para instalar';
    return {...base, tipo: 'Levantamiento', detalle: 'Plano coloreado por: ' + vista,
      leyenda: leyendaLevantamiento(doc, doc.filas, enlazado).filter(e => e.n).map(e => ({nombre: e.nombre, color: e.color, n: e.n})),
      columnas: ['Código', 'Recinto', vista], anchos: [2, 5, 3],
      filas: doc.filas.map(f => { const c = categoria(doc, f, enlazado); return [f.code, f.name || nombreRecinto(f.code) || '', {texto: c?.nombre || 'Sin dato', color: c?.color || '#ffffff'}]; })};
  }
  const estados = doc.estados || [], estado = id => { const e = estados.find(e => e.id === id); return e ? {texto: e.nombre, color: e.color} : {texto: 'Sin marcar', color: '#ffffff'}; };
  if (comparacion) {
    const r = comparacion.resultado;
    return {...base, tipo: 'Comparación de cortes', detalle: `De «${comparacion.antes.nombre}» a «${comparacion.despues.nombre}»`,
      leyenda: Object.entries(CAMBIOS).map(([k, c]) => ({nombre: c.nombre, color: c.color, n: r.totales[k]})),
      columnas: ['Código', 'Recinto', 'Antes', 'Después', 'Cambio'], anchos: [2, 4, 2.4, 2.4, 2],
      filas: r.filas.map(f => [f.code, f.name, estado(f.antes), estado(f.despues), {texto: CAMBIOS[f.cambio].nombre, color: CAMBIOS[f.cambio].color}])};
  }
  const conEstados = estados.length > 0;
  return {...base, tipo: 'Proyecto', detalle: '',
    leyenda: conEstados ? estados.map(e => ({nombre: e.nombre, color: e.color, n: doc.rooms.filter(r => r.estado === e.id).length})) : [{nombre: doc.name, color: doc.color, n: doc.rooms.length}],
    columnas: ['N°', 'Código', 'Recinto', ...(conEstados ? ['Estado'] : [])], anchos: [.8, 2, 4.6, ...(conEstados ? [2.6] : [])],
    filas: doc.rooms.map(room => [String(room.number), room.code, room.name, ...(conEstados ? [estado(room.estado)] : [])])};
}
// Rótulo del plano exportado (PDF y PNG): piso en grande y simbología, en un recuadro abajo a la izquierda. Va en una
// franja blanca que se agrega bajo el plano (altoRotulo) para no tapar recintos. u: unidad = 1 % del lado menor del plano.
const FILAS_ROTULO = 6;
export const altoRotulo = (leyenda, u) => 3 * u + 3.2 * u + Math.max(9 * u * .78, Math.min(FILAS_ROTULO, leyenda.length) * 3 * u);
export function dibujarRotulo(g, ancho, alto, piso, leyenda, u = Math.min(ancho, alto) / 100) {
  const margen = 2 * u, pad = 1.6 * u, letraPiso = 9 * u, letra = 2.1 * u, linea = 3 * u, caja = 1.9 * u, porColumna = FILAS_ROTULO;
  const nombres = leyenda.map(e => e.nombre.length > 42 ? e.nombre.slice(0, 41) + '…' : e.nombre);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.font = `bold ${letraPiso}px Arial, Helvetica, sans-serif`; const anchoPiso = g.measureText(piso).width;
  g.font = `${letra}px Arial, Helvetica, sans-serif`;
  const columnas = []; for (let i = 0; i < nombres.length; i += porColumna) columnas.push(nombres.slice(i, i + porColumna));
  const anchos = columnas.map(c => caja + .8 * u + Math.max(...c.map(n => g.measureText(n).width)));
  const filas = Math.min(porColumna, nombres.length), altoCaja = 2 * pad + Math.max(letraPiso * .78, filas * linea);
  const anchoCaja = pad + anchoPiso + (columnas.length ? 2 * pad + anchos.reduce((s, a) => s + a, 0) + (columnas.length - 1) * pad : 0) + pad;
  const x0 = margen, y0 = alto - margen - altoCaja, medio = y0 + altoCaja / 2;
  g.fillStyle = '#ffffff'; g.fillRect(x0, y0, anchoCaja, altoCaja); g.strokeStyle = '#1b2a56'; g.lineWidth = Math.max(1, .18 * u); g.strokeRect(x0, y0, anchoCaja, altoCaja);
  g.fillStyle = '#000000'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `bold ${letraPiso}px Arial, Helvetica, sans-serif`; g.fillText(piso, x0 + pad, medio + letraPiso * .04);
  g.font = `${letra}px Arial, Helvetica, sans-serif`; g.lineWidth = Math.max(1, .1 * u);
  let x = x0 + pad + anchoPiso + 2 * pad;
  columnas.forEach((col, c) => {
    col.forEach((nombre, i) => {
      const y = medio - filas * linea / 2 + linea * (i + .5), e = leyenda[c * porColumna + i];
      g.fillStyle = e.color; g.fillRect(x, y - caja / 2, caja, caja); g.strokeStyle = '#000000'; g.strokeRect(x, y - caja / 2, caja, caja);
      g.fillStyle = '#000000'; g.fillText(nombre, x + caja + .8 * u, y);
    });
    x += anchos[c] + pad;
  });
  g.restore();
  return {x: x0, y: y0, ancho: anchoCaja, alto: altoCaja};
}
// Hojas A4 con el encabezado del proyecto, la simbología con cantidades y la tabla de recintos (encabezado repetido en
// cada hoja). pie: {alcance, nota, fuentes}. Devuelve cuántas hojas agregó.
export async function paginasProyecto(pdf, PDFLib, info, pie = {}) {
  const {StandardFonts, rgb} = PDFLib, normal = await pdf.embedFont(StandardFonts.Helvetica), negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, mx = 40, util = W - 2 * mx, piso = 64;
  const limpio = s => String(s ?? '').replace(/[−–—]/g, '-').replace(/…/g, '...').replace(/\s+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '-').trim();
  const tinta = hex => { const [r, g, b] = (/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff').slice(1).match(/../g).map(v => parseInt(v, 16) / 255); return rgb(r, g, b); };
  const marca = tinta('#1b2a56'), negro = rgb(0, 0, 0), gris = rgb(.35, .35, .35), regla = rgb(.55, .55, .55);
  const cabe = (texto, ancho, size, font = normal) => { let t = limpio(texto); if (font.widthOfTextAtSize(t, size) <= ancho) return t; while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > ancho) t = t.slice(0, -1); return t.trimEnd() + '...'; };
  const partir = (texto, ancho, size, font = normal) => { const lineas = []; let l = ''; for (const p of limpio(texto).split(' ')) { if (l && font.widthOfTextAtSize(l + ' ' + p, size) > ancho) { lineas.push(l); l = p; } else l += (l ? ' ' : '') + p; } if (l) lineas.push(l); return lineas; };
  const muestra = (p, x, y, lado, color) => p.drawRectangle({x, y, width: lado, height: lado, color: tinta(color), borderColor: negro, borderWidth: .5});
  const paginas = []; let p, y;
  const nueva = () => { p = pdf.addPage([W, H]); paginas.push(p); y = H - 46; };
  const total = info.anchos.reduce((s, a) => s + a, 0), anchos = info.anchos.map(a => a / total * util), xs = anchos.map((_, i) => mx + anchos.slice(0, i).reduce((s, a) => s + a, 0));
  const cabecera = () => {
    p.drawRectangle({x: mx, y: y - 20, width: util, height: 20, color: marca});
    info.columnas.forEach((c, i) => p.drawText(cabe(c.toUpperCase(), anchos[i] - 10, 8, negrita), {x: xs[i] + 5, y: y - 13.5, size: 8, font: negrita, color: rgb(1, 1, 1)}));
    y -= 20;
  };
  // Encabezado: piso en grande, nombre del proyecto y sus datos.
  nueva();
  const anchoPiso = negrita.widthOfTextAtSize(limpio(info.piso), 34), xt = mx + anchoPiso + 14;
  p.drawText(limpio(info.piso), {x: mx, y: y - 24, size: 34, font: negrita, color: negro});
  p.drawText(cabe(info.titulo, W - mx - xt, 15, negrita), {x: xt, y: y - 8, size: 15, font: negrita, color: negro});
  p.drawText(cabe([info.tipo, pie.alcance, info.detalle].filter(Boolean).join(' · '), W - mx - xt, 9), {x: xt, y: y - 23, size: 9, font: normal, color: gris});
  y -= 38; p.drawLine({start: {x: mx, y}, end: {x: W - mx, y}, thickness: 1.5, color: marca}); y -= 16;
  const fecha = new Date(info.actualizado), cuando = Number.isFinite(+fecha) ? fecha.toLocaleString('es-CL', {dateStyle: 'short', timeStyle: 'short'}) : '';
  for (const [rotulo, valor] of [['Realizado por', info.autor], ['Actualizado', cuando], ['Propósito', info.proposito]]) {
    if (!limpio(valor)) continue;
    p.drawText(limpio(rotulo), {x: mx, y, size: 9, font: negrita, color: negro});
    for (const l of partir(valor, util - 80, 9).slice(0, 3)) { p.drawText(l, {x: mx + 80, y, size: 9, font: normal, color: negro}); y -= 13; }
  }
  // Simbología con cantidades, en una o más líneas.
  y -= 4; let x = mx;
  for (const e of info.leyenda) {
    const texto = cabe(`${e.nombre} (${e.n})`, 220, 9), ancho = 9 + 5 + normal.widthOfTextAtSize(texto, 9) + 16;
    if (x + ancho > W - mx && x > mx) { x = mx; y -= 15; }
    muestra(p, x, y - 1.5, 9, e.color); p.drawText(texto, {x: x + 14, y, size: 9, font: normal, color: negro}); x += ancho;
  }
  y -= 20;
  // Tabla.
  cabecera();
  for (const fila of info.filas) {
    if (y - 18 < piso) { nueva(); p.drawText(cabe(`${info.piso} · ${info.titulo}`, util, 9, negrita), {x: mx, y, size: 9, font: negrita, color: negro}); y -= 10; cabecera(); }
    fila.forEach((celda, i) => {
      const conColor = celda && typeof celda === 'object', dx = conColor ? 17 : 5;
      if (conColor) muestra(p, xs[i] + 5, y - 13, 8, celda.color);
      p.drawText(cabe(conColor ? celda.texto : celda, anchos[i] - dx - 5, 9, i === 0 ? negrita : normal), {x: xs[i] + dx, y: y - 12, size: 9, font: i === 0 ? negrita : normal, color: negro});
    });
    y -= 18; p.drawLine({start: {x: mx, y}, end: {x: W - mx, y}, thickness: .5, color: regla});
  }
  if (!info.filas.length) { p.drawText('Sin recintos.', {x: mx + 5, y: y - 12, size: 9, font: normal, color: gris}); y -= 18; }
  // Fuentes del plano, al final.
  if (pie.fuentes) { y -= 16; for (const l of partir('Fuentes: ' + pie.fuentes, util, 7.5)) { if (y < piso) nueva(); p.drawText(l, {x: mx, y, size: 7.5, font: normal, color: gris}); y -= 10; } }
  paginas.forEach((pagina, i) => {
    const n = `Hoja ${i + 1} de ${paginas.length}`;
    pagina.drawLine({start: {x: mx, y: 44}, end: {x: W - mx, y: 44}, thickness: .5, color: regla});
    pagina.drawText(cabe(pie.nota || '', util - 80, 7.5), {x: mx, y: 32, size: 7.5, font: normal, color: gris});
    pagina.drawText(n, {x: W - mx - normal.widthOfTextAtSize(n, 7.5), y: 32, size: 7.5, font: normal, color: gris});
  });
  return paginas.length;
}
