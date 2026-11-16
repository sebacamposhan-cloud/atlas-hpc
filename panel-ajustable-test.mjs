// Ancho de los paneles de la derecha al arrastrar su asa: límites (mínimo 310 px, máximo 75 % de la ventana) y doble clic
// que alterna entre amplio (60 %) y el ancho normal de la hoja de estilos.
import assert from 'node:assert/strict';
import {anchoPermitido, alternar, MINIMO, MAXIMO, AMPLIO} from './dist/panel-ajustable.mjs';

assert.equal(anchoPermitido(100, 1366), MINIMO, 'no se achica bajo el mínimo legible');
assert.equal(anchoPermitido(5000, 1366), Math.round(1366 * MAXIMO), 'deja siempre a la vista una parte del plano');
assert.equal(anchoPermitido(700, 1366), 700);
assert.equal(alternar(546, 1366), Math.round(1366 * AMPLIO), 'angosto → amplio');
assert.equal(alternar(820, 1366), null, 'amplio → vuelve al ancho normal');
console.log('Paneles ajustables: mínimo legible, máximo que deja ver el plano y doble clic entre amplio y normal: passed');
