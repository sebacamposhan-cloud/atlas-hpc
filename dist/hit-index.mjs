import {inside} from './engine.mjs';

export function buildHitIndex(entries) {
  const cells = new Map(), size = 256;
  for (const {id, rings} of entries) {
    for (const {polygon, holes} of rings) {
      const xs = polygon.map(point => point[0]), ys = polygon.map(point => point[1]);
      const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const entry = {id, polygon, holes, box};
      for (let y = Math.floor(box[1] / size); y <= Math.floor(box[3] / size); y++) {
        for (let x = Math.floor(box[0] / size); x <= Math.floor(box[2] / size); x++) {
          const key = x + ',' + y;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(entry);
        }
      }
    }
  }

  function* matches({x, y}) {
    const cell = cells.get(Math.floor(x / size) + ',' + Math.floor(y / size)) || [];
    const point = [x, y];
    for (const {id, polygon, holes, box: [left, top, right, bottom]} of cell) {
      if (x < left || x > right || y < top || y > bottom) continue;
      if (inside(point, polygon) && !holes.some(hole => inside(point, hole))) yield id;
    }
  }
  const first = point => matches(point).next().value ?? null;
  first.candidates = point => [...new Set(matches(point))];
  return first;
}
