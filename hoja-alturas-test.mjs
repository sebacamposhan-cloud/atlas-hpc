// Hojas que suben desde abajo en terreno (dist/hoja-alturas.mjs): alturas disponibles, dónde queda al soltar el asa y
// qué hace un toque. Sin navegador; el arrastre real lo prueban los recorridos en Chrome.
import assert from 'node:assert/strict';
import {alturasEn, alturaAlSoltar, alturaAlTocar} from './dist/hoja-alturas.mjs';

let pruebas = 0;
// Ficha: media y completa; Más: baja, media y completa. Ninguna pasa del alto disponible y quedan ordenadas.
const ficha = alturasEn({media: a => a * .6, completa: a => a}, 812);
assert.deepEqual(ficha, [['media', 487], ['completa', 812]]); pruebas++;
const mas = alturasEn({completa: a => a, baja: a => a * .4, media: a => a * .62}, 694);
assert.deepEqual(mas.map(([n]) => n), ['baja', 'media', 'completa']); pruebas++;
assert.equal(alturasEn({media: a => a * 2}, 500)[0][1], 500); pruebas++;
assert.equal(alturasEn({baja: () => 10}, 500)[0][1], 60, 'una hoja nunca queda más baja que 60 px'); pruebas++;

// Soltar: un arrastre claro pasa a la siguiente altura en esa dirección; uno corto vuelve a la más cercana.
assert.equal(alturaAlSoltar(mas, 278, 330), 'media'); pruebas++;
assert.equal(alturaAlSoltar(mas, 430, 600), 'completa'); pruebas++;
assert.equal(alturaAlSoltar(mas, 694, 500), 'media'); pruebas++;
assert.equal(alturaAlSoltar(mas, 430, 445), 'media', 'un arrastre corto no cambia de altura'); pruebas++;
// Bajar desde la más baja: null (la hoja se cierra o la ficha queda en su franja), salvo que el arrastre sea corto.
assert.equal(alturaAlSoltar(mas, 278, 150), null); pruebas++;
assert.equal(alturaAlSoltar(mas, 278, 230), 'baja'); pruebas++;
assert.equal(alturaAlSoltar(ficha, 487, 220), null); pruebas++;
assert.equal(alturaAlSoltar([], 100, 50), null); pruebas++;

// Toque en el asa: de baja a media, de media a completa y de completa a media; sin altura, la primera.
assert.equal(alturaAlTocar(mas, 'baja'), 'media'); pruebas++;
assert.equal(alturaAlTocar(mas, 'media'), 'completa'); pruebas++;
assert.equal(alturaAlTocar(mas, 'completa'), 'media'); pruebas++;
assert.equal(alturaAlTocar(ficha, 'completa'), 'media'); pruebas++;
assert.equal(alturaAlTocar(mas, null), 'baja'); pruebas++;

console.log(`Hojas con alturas: ${pruebas} comprobaciones aprobadas (alturas, soltar el asa y tocarla).`);
