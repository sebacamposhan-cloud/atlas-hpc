// All coordinates come from the existing viewer; annotations add no new geometry.
// Cada recinto se pinta con el color de su estado (proyectos) o, al comparar cortes, con el tipo de cambio (ver markingItems).
import {markingItems, CAMBIOS} from './marking-model.mjs';
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
export function markingLegend(doc, comparacion = null) {
  const nombreEstado = id => doc.estados?.find(e => e.id === id)?.nombre;
  const lineas = ['Documento: ' + doc.name, 'Realizado por: ' + doc.author, 'Propósito: ' + doc.purpose,
    'Arquitectura / ' + doc.level, 'Creado: ' + doc.createdAt, 'Actualizado: ' + doc.updatedAt];
  if (comparacion) {
    lineas.push(`Comparación: ${comparacion.antes.nombre} -> ${comparacion.despues.nombre}`,
      ...Object.entries(CAMBIOS).map(([k, c]) => `${c.nombre}: ${comparacion.resultado.totales[k]} recintos`),
      ...comparacion.resultado.porEstado.map(e => `${e.nombre}: ${e.antes} -> ${e.despues} recintos` + (e.m2Antes || e.m2Despues ? ` (${e.m2Antes.toFixed(1)} -> ${e.m2Despues.toFixed(1)} m2)` : '')),
      ...comparacion.resultado.filas.filter(f => f.cambio !== 'igual').map(f => `${CAMBIOS[f.cambio].nombre}: ${f.code} - ${f.name} | ${nombreEstado(f.antes) || 'sin marcar'} -> ${nombreEstado(f.despues) || 'sin marcar'}`));
    return lineas;
  }
  if (doc.schema === 2) lineas.push('Leyenda: ' + doc.estados.map(e => `${e.nombre} (${doc.rooms.filter(r => r.estado === e.id).length})`).join(' / '));
  return [...lineas, ...doc.rooms.map(room => `${room.number}. ${room.code} - ${room.name}${nombreEstado(room.estado) ? ' [' + nombreEstado(room.estado) + ']' : ''} | ${room.source} / ${room.revision}`)];
}
