// All coordinates come from the existing viewer; annotations add no new geometry.
export function createMarkingOverlay(ctx) {
  const svg = document.getElementById('svg'), overlay = document.getElementById('markingOverlay');
  function render() {
    const doc = ctx.active();
    if (!doc) {overlay.replaceChildren(); return;}
    const px = 1 / (svg.getScreenCTM()?.a || 1);
    overlay.innerHTML = doc.rooms.map(mark => {
      const room = ctx.room(mark.id); if (!room) return '';
      const path = ctx.path(room.id), [x, y] = ctx.position(room);
      return `${path ? `<path data-marked-id="${ctx.esc(mark.id)}" d="${path}" fill="${doc.color}" fill-opacity=".35" stroke="${doc.color}" stroke-width="${ctx.focused() === mark.id ? 3 : 1.5}" vector-effect="non-scaling-stroke" fill-rule="evenodd"/>` : ''}
        <g transform="translate(${x} ${y})"><circle r="${12 * px}" fill="${doc.color}" stroke="white" stroke-width="${2 * px}"/><text text-anchor="middle" dominant-baseline="central" fill="white" font-size="${12 * px}" font-weight="700">${mark.number}</text></g>`;
    }).join('');
  }
  new MutationObserver(render).observe(svg, {attributes: true, attributeFilter: ['viewBox']});
  new ResizeObserver(render).observe(svg);
  function draw(canvas, doc, scope) {
    if (!doc) return;
    canvas.save(); const radius = scope[2] / 120;
    for (const mark of doc.rooms) {
      const room = ctx.room(mark.id); if (!room) continue;
      const path = ctx.path(room.id), [x, y] = ctx.position(room);
      if (path) {
        canvas.fillStyle = doc.color; canvas.globalAlpha = .35; canvas.fill(new Path2D(path), 'evenodd');
        canvas.globalAlpha = 1; canvas.strokeStyle = doc.color; canvas.lineWidth = radius / 12; canvas.stroke(new Path2D(path));
      }
      canvas.fillStyle = doc.color; canvas.beginPath(); canvas.arc(x, y, radius, 0, Math.PI * 2); canvas.fill();
      canvas.fillStyle = 'white'; canvas.font = `bold ${radius * 1.2}px sans-serif`; canvas.textAlign = 'center'; canvas.textBaseline = 'middle'; canvas.fillText(String(mark.number), x, y);
    }
    canvas.restore();
  }
  return {render, draw};
}
export function markingLegend(doc) {
  return ['Documento: ' + doc.name, 'Realizado por: ' + doc.author, 'Propósito: ' + doc.purpose,
    'Arquitectura / ' + doc.level, 'Creado: ' + doc.createdAt, 'Actualizado: ' + doc.updatedAt,
    ...doc.rooms.map(room => `${room.number}. ${room.code} - ${room.name} | ${room.source} / ${room.revision}`)];
}
