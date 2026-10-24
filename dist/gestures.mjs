// Capture the screen transform once per gesture; moves use only arithmetic.
const midpoint = (a, b) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
export function startPan(view, matrix, p) {
  return {view: view.slice(), x: p.x, y: p.y, scaleX: matrix.a, scaleY: matrix.d};
}
export function panView(start, p) {
  return [start.view[0] - (p.x - start.x) / start.scaleX,
    start.view[1] - (p.y - start.y) / start.scaleY, ...start.view.slice(2)];
}
export function startPinch(view, matrix, a, b) {
  const center = midpoint(a, b);
  return {view: view.slice(), center, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    scaleX: matrix.a, scaleY: matrix.d,
    anchor: {x: (center.x - matrix.e) / matrix.a, y: (center.y - matrix.f) / matrix.d}};
}
export function pinchView(start, a, b, maxWidth) {
  const center = midpoint(a, b), distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  const width = Math.max(40, Math.min(maxWidth, start.view[2] * start.distance / distance));
  const ratio = width / start.view[2];
  return [start.anchor.x - (start.anchor.x - start.view[0]) * ratio - (center.x - start.center.x) / start.scaleX * ratio,
    start.anchor.y - (start.anchor.y - start.view[1]) * ratio - (center.y - start.center.y) / start.scaleY * ratio,
    width, start.view[3] * ratio];
}
