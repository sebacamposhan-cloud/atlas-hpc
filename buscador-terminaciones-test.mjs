import assert from 'node:assert/strict';
import {leerConsulta, filasConsulta} from './dist/buscador-terminaciones.mjs';

// La primera palabra elige la familia; con tres letras basta y no importan tildes ni mayúsculas.
assert.equal(leerConsulta('cie')?.tipo, 'CIE');
assert.equal(leerConsulta('Cielos 205')?.tipo, 'CIE');
assert.equal(leerConsulta('cie 205')?.resto, '205');
assert.equal(leerConsulta('pav')?.tipo, 'PAV');
assert.equal(leerConsulta('PAVIMENTO vinilico')?.tipo, 'PAV');
assert.equal(leerConsulta('muro')?.tipo, 'walls');
assert.equal(leerConsulta('pint')?.tipo, 'paint');
assert.equal(leerConsulta('asepsia alta')?.tipo, 'asepsis');
assert.equal(leerConsulta('sector 2')?.tipo, 'sector');
assert.equal(leerConsulta('Sectores')?.tipo, 'sector');
// «piso» con un número es un piso del hospital, no pavimentos; con texto sí son pavimentos.
assert.equal(leerConsulta('piso 2'), null);
assert.equal(leerConsulta('piso -1'), null);
assert.equal(leerConsulta('piso vinilico')?.tipo, 'PAV');
// Búsquedas de recintos no abren la lista.
for (const texto of ['', 'ba', 'pasillo', 'box 12', '2.1.03', 'sala de estar']) assert.equal(leerConsulta(texto), null, texto);

// El resto del texto filtra por código o nombre, sin tildes.
const etiqueta = (tipo, clave) => tipo === 'sector' ? 'Sector ' + clave : clave + ' · ' + {105: 'Pav. Vinílico Homogéneo', 109: 'Pavimento caucho', 101: 'Baldosa'}[clave];
const pav = [['105', 158], ['109', 48], ['101', 40]];
assert.deepEqual(filasConsulta(leerConsulta('pav'), pav, etiqueta).map(([k]) => k), ['105', '109', '101']);
assert.deepEqual(filasConsulta(leerConsulta('pav vinilico'), pav, etiqueta).map(([k]) => k), ['105']);
assert.deepEqual(filasConsulta(leerConsulta('pav 109'), pav, etiqueta).map(([k]) => k), ['109']);
assert.deepEqual(filasConsulta(leerConsulta('pav madera'), pav, etiqueta), []);
assert.deepEqual(filasConsulta(leerConsulta('sector 2'), [['1', 90], ['2', 101], ['3', 139]], etiqueta).map(([k]) => k), ['2']);
assert.deepEqual(filasConsulta(null, pav, etiqueta), []);

console.log('buscador-terminaciones-test: ok');
