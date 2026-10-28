import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leerEjes, crearGrilla, ubicarEjes, numeroProtocolo} from './dist/protocol-ejes.mjs';
import {decodeMatrixRows} from './dist/protocol-model.mjs';
import {onProtocolFloor} from './dist/protocol-scope.mjs';

// Protocolos de la matriz ubicados por sus ejes: lectura de la columna EJES, grilla del DWG y cobertura con los registros reales.

// 1. Lectura: el orden, el texto final y la falta de la A del edificio no cambian los ejes.
assert.deepEqual(leerEjes('AD-AG/A3-A5'), {letras: ['AD', 'AG'], numeros: ['A3', 'A5']});
assert.deepEqual(leerEjes('A3-A5/AD-AG'), {letras: ['AD', 'AG'], numeros: ['A3', 'A5']});
assert.deepEqual(leerEjes('AQ-AW/A5-A10 REGULARIZACION'), {letras: ['AQ', 'AW'], numeros: ['A5', 'A10']});
assert.deepEqual(leerEjes('AO-A4 Aislador Tipo A1 Placa Superior'), {letras: ['AO'], numeros: ['A4']}, 'el «A1» del tipo no es un eje');
assert.deepEqual(leerEjes('A0-A3 a AD-AF'), {letras: ['AD', 'AF'], numeros: ['A0', 'A3']});
assert.deepEqual(leerEjes('B-O/4-5'), {letras: ['AB', 'AO'], numeros: ['A4', 'A5']});
assert.deepEqual(leerEjes('AB-AI/A1A11'), {letras: ['AB', 'AI'], numeros: ['A1', 'A11']});
assert.deepEqual(leerEjes('Voladizo AW/A4-A11'), {letras: ['AW'], numeros: ['A4', 'A11']});
for (const sin of ['S/N', 'Linea 1_138', 'Descrito en monografia', 'BG-BG2/B4-B8', '', null]) assert.equal(leerEjes(sin), null, String(sin));

// 2. Grilla de cada piso: los mismos 40 ejes del edificio A; letras horizontales y números verticales, cada 8,2 m.
const grillas = {};
for (const piso of ['n01', 'n02', 'n03']) {
  const datos = JSON.parse(readFileSync(`dist/${piso}/ejes.json`, 'utf8'));
  assert.equal(datos.schema, 1);
  assert.equal(datos.ejes.length, 40, piso);
  grillas[piso] = crearGrilla(datos);
  for (const id of ['AA', 'AD', 'AH', 'AO1', 'AW', 'A0', 'A3', "A3'", 'A12']) assert(grillas[piso].ejes.has(id), piso + ' ' + id);
  for (const e of grillas[piso].ejes.values()) assert(e.tipo === 'letra' ? Math.abs(e.u[1]) < 1e-6 : Math.abs(e.u[0]) < 1e-6, piso + ' ' + e.id + ' no es ortogonal');
  assert(Math.abs(grillas[piso].separacion - 464.9) < 1, piso + ' separación');
}
const g = grillas.n01, x = id => g.ejes.get(id).a[0], y = id => g.ejes.get(id).a[1];

// 3. Encuadre: zona entre los ejes extremos, tramo a lo largo de un eje, pilar en un cruce y franja de un solo tipo.
const zona = ubicarEjes('AD-AG/A3-A5', g);
assert.equal(zona.tipo, 'zona'); assert.equal(zona.etiqueta, 'AD–AG / A3–A5'); assert.equal(zona.aproximado, false);
assert.deepEqual(zona.caja.map(v => Math.round(v)), [x('A3'), y('AD'), x('A5') - x('A3'), y('AG') - y('AD')].map(Math.round));
assert.deepEqual(ubicarEjes('A5-A3/AG-AD', g).poligono.flat().map(Math.round).sort(), zona.poligono.flat().map(Math.round).sort(), 'el orden de los ejes no importa');
const pilar = ubicarEjes('AC-A2', g);
assert.equal(pilar.tipo, 'punto'); assert.deepEqual(pilar.centro.map(Math.round), [x('A2'), y('AC')].map(Math.round));
const tramo = ubicarEjes('AH/A1-A2', g);
assert.equal(tramo.tipo, 'tramo'); assert(Math.abs(tramo.centro[1] - y('AH')) < 1 && tramo.caja[2] > 400 && tramo.caja[3] < 80);
assert.equal(ubicarEjes('AO-AV', g).tipo, 'franja');
const aproximada = ubicarEjes('A12B/AA-AJ', g);
assert.equal(aproximada.estado, 'ok'); assert.equal(aproximada.aproximado, true);
assert.deepEqual(ubicarEjes('AZ/A3-A4', g), {estado: 'faltan', faltan: ['AZ']});
assert.equal(ubicarEjes('Descrito en monografia', g).estado, 'sin-ejes');
// Todos los pisos comparten coordenadas del modelo: el mismo protocolo cae en la misma zona relativa a sus ejes.
for (const piso of ['n02', 'n03']) { const z = ubicarEjes('AD-AG/A3-A5', grillas[piso]), gp = grillas[piso]; assert(Math.abs(z.caja[0] - gp.ejes.get('A3').a[0]) < 0.01 && Math.abs(z.caja[1] - gp.ejes.get('AD').a[1]) < 0.01, piso); }

// 4. Número de protocolo a tres cifras.
assert.deepEqual(['7', '60', '1416', ' ', '12-B', null].map(numeroProtocolo), ['007', '060', '1416', 's/n', '12-B', 's/n']);

// 5. Registros reales de la matriz: cuánto se ubica en cada piso (los anulados no se dibujan; se cuentan aparte).
const catalog = JSON.parse(readFileSync('dist/protocols/catalog.json', 'utf8')), filas = [];
for (const type of catalog.types) filas.push(...decodeMatrixRows(JSON.parse(readFileSync('dist/protocols/' + type.file, 'utf8')), catalog, type));
const cobertura = {};
for (const [piso, minimo] of [['N01', 0.8], ['N02', 0.94], ['N03', 0.94]]) {
  const delPiso = filas.filter(f => onProtocolFloor(f.level, piso) && String(f.state ?? '').trim() !== 'NULO');
  const ubicados = delPiso.filter(f => ubicarEjes(f.axes, grillas[piso.toLowerCase()]).estado === 'ok').length;
  cobertura[piso] = `${ubicados}/${delPiso.length}`;
  assert(ubicados / delPiso.length >= minimo, `${piso}: ${ubicados} de ${delPiso.length}`);
}
console.log('Protocolos por ejes: lectura de EJES, grilla DWG de N01–N03 (40 ejes, ortogonal), zona/tramo/pilar/franja, aproximación A12B→A12, número 001 y cobertura real ' + JSON.stringify(cobertura) + ' validados.');
