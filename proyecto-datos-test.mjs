import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PROPOSITOS, PERSONALIZADO, separarProposito, leerProposito, propositoHTML} from './dist/proyecto-datos.mjs';

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// Propósito: de la lista, o personalizado con texto propio.
assert.ok(PROPOSITOS.includes('Avance de obra') && PROPOSITOS.includes('Levantamiento') && PROPOSITOS.includes('Producción') && PROPOSITOS.includes('Comparación entre cortes'));
assert.deepEqual(separarProposito('Producción'), {tipo: 'Producción', otro: ''});
assert.deepEqual(separarProposito('Entrega de pisos al mandante'), {tipo: PERSONALIZADO, otro: 'Entrega de pisos al mandante'});
assert.deepEqual(separarProposito('', 'Levantamiento'), {tipo: 'Levantamiento', otro: ''});
assert.deepEqual(separarProposito(undefined), {tipo: 'Avance de obra', otro: ''});
assert.equal(leerProposito({purposeTipo: 'Levantamiento', purposeOtro: 'se ignora'}), 'Levantamiento');
assert.equal(leerProposito({purposeTipo: PERSONALIZADO, purposeOtro: '  Recepción  '}), 'Recepción');
assert.throws(() => leerProposito({purposeTipo: PERSONALIZADO, purposeOtro: ' '}), /personalizado/);
assert.throws(() => leerProposito({purposeTipo: 'Otra cosa'}), /Elige/);

// Campo: lista desplegable con «Personalizado» al final; la línea de texto solo se ve con «Personalizado».
const nuevo = propositoHTML(undefined, esc, 'Levantamiento');
assert.ok(nuevo.includes('<select name="purposeTipo"') && nuevo.includes('<option value="Levantamiento" selected>'));
assert.ok(/class="propositoOtro" hidden/.test(nuevo));
const propio = propositoHTML('Para "entrega"', esc);
assert.ok(propio.includes(`<option value="${PERSONALIZADO}" selected>`) && propio.includes('value="Para &quot;entrega&quot;"') && !/class="propositoOtro" hidden/.test(propio));

// Formularios: sin «Quién lo realizó» ni el texto libre de propósito; el autor es la sesión.
const marking = fs.readFileSync('dist/marking.mjs', 'utf8'), lev = fs.readFileSync('dist/levantamiento.mjs', 'utf8');
for (const [nombre, src] of [['marking', marking], ['levantamiento', lev]]) {
  assert.ok(!src.includes('name="author"') && !src.includes('name="purpose"') && !src.includes('Quién lo realiz'), nombre + ': sin autor ni propósito escrito');
  assert.ok(src.includes('propositoHTML(') && src.includes('leerProposito(') && src.includes("exigirFirma('Inicia sesión en Atlas para crear el proyecto.')"), nombre);
}
assert.ok(!marking.includes('name="autor"'), 'el corte se firma con la sesión');
assert.ok(lev.includes('<label>Nombre del proyecto *<input name="name" required maxlength="160" value="${esc(doc?.name || \'\')}"'), 'el nombre se edita también en un proyecto existente');
assert.ok(lev.includes('Datos y columnas</button>'));
assert.ok(fs.readFileSync('scripts/prepare-offline.mjs', 'utf8').includes("'proyecto-datos.mjs'"));
console.log('proyecto-datos-test: ok');
