// Marco de Atlas de un nivel dibujado desde DWG: misma escala que el nivel −1 (puntos PDF de una lámina 1:50) y eje Y hacia abajo.
// N02 conserva el marco de data/n02/plano.json para que sus contornos actuales sigan calzando.
import fs from 'node:fs';
import path from 'node:path';
export const ESCALA = 72 / 2.54 / 50, MARGEN = 500; // unidades por cm; margen en cm
const r1 = v => Math.round(v * 10) / 10;
export function calcularMarco(repo, nivel, bounds) {
  const b = nivel === 'n02' ? JSON.parse(fs.readFileSync(path.join(repo, 'data/n02/plano.json'), 'utf8')).bounds : bounds;
  return {nivel, escala: ESCALA, ox: b[0] - MARGEN, oy: b[3] + MARGEN, width: r1((b[2] - b[0] + 2 * MARGEN) * ESCALA), height: r1((b[3] - b[1] + 2 * MARGEN) * ESCALA), bounds: b};
}
// cm del modelo -> unidades de Atlas
export const aAtlas = (m, [x, y]) => [r1((x - m.ox) * m.escala), r1((m.oy - y) * m.escala)];
