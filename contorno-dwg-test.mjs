// Contornos de recintos desde los DWG (scripts/dwg-plano/contorno.mjs): relleno desde el rótulo con las puertas cerradas de
// jamba a jamba, rellenos de color del recinto, huecos y superficie auxiliar. Geometría sintética, en cm.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {crearContorno, numero} from './scripts/dwg-plano/contorno.mjs';

assert.equal(numero('1.234,5 m²'), 1234.5); assert.equal(numero('19,41'), 19.41); assert.equal(numero(''), null);
const rect = (x0, y0, x1, y1) => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
const caja = poly => { const xs = poly.filter((_, i) => i % 2 === 0), ys = poly.filter((_, i) => i % 2 === 1); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const cerca = (a, b, tol = 4.5) => Math.abs(a - b) <= tol;

// Dos recintos de 4 × 3 m separados por un muro de 15 cm (x de 400 a 415) con una puerta de 90 cm (y de 100 a 190).
// El muro se dibuja como en las láminas: dos tramos con sus caras y sus cabezas; el vano queda abierto.
const muros = [...rect(0, 0, 815, 300), ...rect(400, 0, 415, 100), ...rect(400, 190, 415, 300)];
// Sin puerta, el relleno pasa al recinto vecino: no se inventa un contorno.
const abierto = crearContorno(muros)([200, 150], 12);
assert.equal(abierto.estado, 'auxiliar'); assert.match(abierto.motivo, /se une con otro recinto/);
// La superficie auxiliar rodea al rótulo y no sale de los muros.
assert.ok(abierto.aux?.length >= 8);
const [ax0, ay0, ax1, ay1] = caja(abierto.aux); assert.ok(ax0 >= -3 && ay0 >= -3 && ax1 <= 818 && ay1 <= 303, 'auxiliar dentro de los muros');

// Con la puerta (origen en el centro del vano, eje del muro vertical), el vano se cierra de jamba a jamba.
const vanos = [{c: [407.5, 145], u: [0, 1], a: [-45, 45], v: [-90, 8]}];
const cerrar = [407.5, 97, 407.5, 193]; // recta que escribe extraer.mjs, 3 cm más larga por lado
const contorno = crearContorno([...muros, cerrar], {vanos});
for (const [p, x0, x1] of [[[200, 150], 0, 400], [[600, 150], 415, 815]]) {
  const r = contorno(p, 12);
  assert.equal(r.estado, 'ok'); assert.equal(r.metodo, 'relleno');
  assert.ok(Math.abs(r.areaM2 - 12) < .35, 'área ' + r.areaM2);
  // Recto frente a la puerta: un rectángulo de cuatro vértices sobre la cara del muro, sin entrar en el vano.
  assert.equal(r.poly.length, 8, 'cuatro vértices: ' + r.poly.join(' '));
  const [bx0, by0, bx1, by1] = caja(r.poly);
  assert.ok(cerca(bx0, x0) && cerca(bx1, x1) && cerca(by0, 0) && cerca(by1, 300), 'caja ' + [bx0, by0, bx1, by1]);
}
// Sin la lista de vanos, la recta cierra igual pero el contorno entra en el vano hasta el eje del muro.
assert.ok(crearContorno([...muros, cerrar])([200, 150], 12).poly.length > 8);

// Recinto chico: se admite hasta 1,5 m² de más; un pasillo largo no tiene ventana de búsqueda.
assert.equal(crearContorno(rect(0, 0, 200, 250))([100, 100], 3.6).estado, 'ok');
const pasillo = crearContorno(rect(0, 0, 12000, 240))([300, 120], 288);
assert.equal(pasillo.estado, 'ok'); assert.ok(caja(pasillo.poly)[2] > 11990);
// Contorno parcial y área fuera de rango.
assert.equal(crearContorno(rect(0, 0, 400, 300))([200, 150], 17).estado, 'parcial');
assert.equal(crearContorno(rect(0, 0, 400, 300))([200, 150], 40).estado, 'auxiliar');

// Pasillo en anillo alrededor de un núcleo: el núcleo sale como hueco y no cuenta en el área.
const anillo = crearContorno([...rect(0, 0, 1000, 1000), ...rect(300, 300, 700, 700)])([150, 150], 84);
assert.equal(anillo.estado, 'ok'); assert.equal(anillo.huecos.length, 1);
assert.ok(Math.abs(anillo.areaM2 - 84) < 1.5, 'área del anillo ' + anillo.areaM2);
const [hx0, hy0, hx1, hy1] = caja(anillo.huecos[0]); assert.ok(cerca(hx0, 300, 6) && cerca(hy0, 300, 6) && cerca(hx1, 700, 6) && cerca(hy1, 700, 6));

// Relleno de color del recinto (zona): manda sobre los muros y une los trozos de dos láminas que se traslapan.
// El recinto mide 10 × 3 m sin muro en sus extremos; la lámina A lo trae de x 0 a 600 y la B de 400 a 1000.
const zonas = [{lamina: 'A-501', color: 7, anillos: [[0, 0, 600, 0, 600, 300, 0, 300]]}, {lamina: 'A-502', color: 7, anillos: [[400, 0, 1000, 0, 1000, 300, 400, 300]]},
  {lamina: 'A-502', color: 7, anillos: [[1000, 0, 1500, 0, 1500, 300, 1000, 300]]}]; // vecino del mismo color: se tocan, no se traslapan
const conZonas = crearContorno([[0, 0, 1500, 0], [0, 300, 1500, 300]], {zonas});
const z = conZonas([200, 150], 30);
assert.equal(z.estado, 'ok'); assert.equal(z.metodo, 'zona'); assert.ok(Math.abs(z.areaM2 - 30) < .6, 'área de la zona ' + z.areaM2);
assert.ok(cerca(caja(z.poly)[2], 1000, 6), 'no se une con el vecino que solo toca');
assert.equal(conZonas([1200, 150], 15).metodo, 'zona');

// Los datos publicados: cada piso con contornos del DWG conserva sus recintos y los contornos calzan con su superficie.
const num = s => numero(s);
for (const [nivel, minimo] of [['n01', 300], ['n03', 245]]) {
  const {recintos, resumen} = JSON.parse(fs.readFileSync(`data/${nivel}/recintos.json`, 'utf8'));
  assert.ok(resumen.contornos >= minimo, `${nivel}: ${resumen.contornos} contornos`);
  const ok = recintos.filter(r => r.estado === 'ok' && num(r.superficie));
  const error = ok.reduce((t, r) => t + Math.abs(r.areaM2 / num(r.superficie) - 1), 0) / ok.length;
  assert.ok(error < .04, `${nivel}: error medio de área ${(100 * error).toFixed(1)} %`);
  for (const r of recintos) { assert.ok(r.estado === 'auxiliar' ? !r.poly : r.poly.length >= 6, r.codigo); assert.ok(r.estado !== 'auxiliar' || r.motivo, r.codigo); }
}
const extra = JSON.parse(fs.readFileSync('data/n02/recintos-extra.json', 'utf8')).recintos;
assert.equal(extra.length, 48); assert.ok(extra.every(r => r.estado === 'ok'), 'las 48 circulaciones y recintos técnicos del N02 cierran');
assert.ok(extra.filter(r => r.metodo === 'zona').length >= 40);
// N02: los recintos de plano.json se recalculan desde las láminas; el desfase con la planta general es el mismo en todo el piso.
const recalculo = JSON.parse(fs.readFileSync('data/n02/contornos-recalculados.json', 'utf8')), planoN02 = JSON.parse(fs.readFileSync('data/n02/plano.json', 'utf8'));
assert.equal(recalculo.resumen.recintos, planoN02.recintos.length); assert.ok(recalculo.resumen.recalculados >= 260, 'recalculados: ' + recalculo.resumen.recalculados);
assert.ok(Math.abs(recalculo.desfase[0] - 18.7) < 3 && Math.abs(recalculo.desfase[1] + 3.6) < 3, 'desfase ' + recalculo.desfase);
const errorN02 = planoN02.recintos.filter(r => recalculo.recintos[r.codigo]).reduce((t, r, _, l) => t + Math.abs(recalculo.recintos[r.codigo].areaM2 / num(r.superficie) - 1) / l.length, 0);
assert.ok(errorN02 < .03, 'error medio de área del N02: ' + (100 * errorN02).toFixed(1) + ' %');
const rtN02 = JSON.parse(fs.readFileSync('dist/n02/runtime.json', 'utf8')).catalog, metodo = rtN02.fields.indexOf('geometry_method');
assert.ok(rtN02.rows.filter(row => /relleno desde el rótulo|relleno de color del recinto/.test(rtN02.strings[row[metodo]])).length >= 300, 'recintos del N02 publicados con contorno recalculado');
console.log(`contorno-dwg-test: ok (N02: ${extra.length} agregados con contorno)`);
