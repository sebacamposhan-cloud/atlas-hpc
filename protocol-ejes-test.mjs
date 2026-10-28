import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leerEjes, crearGrilla, ubicarEjes, numeroProtocolo, textoMedidas, motivoSinUbicar} from './dist/protocol-ejes.mjs';
import {decodeMatrixRows} from './dist/protocol-model.mjs';
import {onProtocolFloor} from './dist/protocol-scope.mjs';

// Protocolos de la matriz ubicados por sus ejes: lectura de la columna EJES, grilla del DWG y cobertura con los registros reales.

// 1. Lectura: el orden, el texto final y la falta de la A del edificio no cambian los ejes; lo no leído se informa.
assert.deepEqual(leerEjes('AD-AG/A3-A5'), {letras: ['AD', 'AG'], numeros: ['A3', 'A5'], ignorado: ''});
assert.deepEqual(leerEjes('A3-A5/AD-AG'), {letras: ['AD', 'AG'], numeros: ['A3', 'A5'], ignorado: ''});
assert.deepEqual(leerEjes('AQ-AW/A5-A10 REGULARIZACION'), {letras: ['AQ', 'AW'], numeros: ['A5', 'A10'], ignorado: 'REGULARIZACION'});
assert.deepEqual(leerEjes('AO-A4 Aislador Tipo A1 Placa Superior'), {letras: ['AO'], numeros: ['A4'], ignorado: 'Aislador Tipo A1 Placa Superior'}, 'el «A1» del tipo no es un eje');
assert.deepEqual(leerEjes('A0-A3 a AD-AF'), {letras: ['AD', 'AF'], numeros: ['A0', 'A3'], ignorado: ''});
assert.deepEqual(leerEjes('B-O/4-5'), {letras: ['AB', 'AO'], numeros: ['A4', 'A5'], ignorado: ''});
assert.deepEqual(leerEjes('AB-AI/A1A11'), {letras: ['AB', 'AI'], numeros: ['A1', 'A11'], ignorado: ''});
assert.deepEqual(leerEjes('Voladizo AW/A4-A11'), {letras: ['AW'], numeros: ['A4', 'A11'], ignorado: 'Voladizo'});
assert.equal(leerEjes('Nucleo N4P AM-AN/A1-A2').ignorado, 'Nucleo N4P');
assert.equal(leerEjes('AD-AE/A1-A2 N1T').ignorado, 'N1T');
assert.equal(leerEjes('AJ-AF/A9-A12 (Colada 5.1)').ignorado, '(Colada 5.1)');
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
// Medidas: el vano de la grilla es 8,2 m (464,9 unidades × 1,764 cm).
assert(Math.abs(g.separacion * g.metros - 8.2) < 0.01);
assert.deepEqual(zona.medidas.lados.map(v => Math.round(v * 10) / 10).sort((a, b) => a - b), [16.4, 24.6]);
// Primero el largo entre los ejes con letra (AD–AG) y luego entre los numerados (A3–A5), en el orden de la etiqueta.
assert(Math.abs(zona.medidas.area - 403.4) < 0.5); assert.equal(textoMedidas(zona), '24,6 × 16,4 m · 403,4 m²');
const pilar = ubicarEjes('AC-A2', g);
assert.equal(pilar.tipo, 'punto'); assert.deepEqual(pilar.punto.map(Math.round), [x('A2'), y('AC')].map(Math.round)); assert.equal(textoMedidas(pilar), 'pilar del cruce');
const tramo = ubicarEjes('AH/A1-A2', g);
assert.equal(tramo.tipo, 'tramo'); assert.deepEqual(tramo.linea.map(p => p.map(Math.round)), [[x('A1'), y('AH')], [x('A2'), y('AH')]].map(p => p.map(Math.round)), 'el tramo va exactamente sobre AH');
assert.equal(textoMedidas(tramo), 'tramo de 8,2 m');
assert.equal(ubicarEjes('AO-AV', g).tipo, 'franja');
const aproximada = ubicarEjes('A12B/AA-AJ', g);
assert.equal(aproximada.estado, 'ok'); assert.deepEqual(aproximada.aproximados, [{id: 'A12B', base: 'A12'}]);
assert.equal(ubicarEjes('AD-AE/A1-A2 N1T', g).ignorado, 'N1T');
assert.deepEqual(ubicarEjes('AZ/A3-A4', g), {estado: 'faltan', faltan: ['AZ'], ignorado: ''});
assert.equal(ubicarEjes('Descrito en monografia', g).estado, 'sin-ejes');
// Motivo explícito de los que no se dibujan.
assert.equal(motivoSinUbicar(null, ubicarEjes(null, g)), 'La celda EJES está vacía en la matriz.');
assert.equal(motivoSinUbicar('Nucleo N6P', ubicarEjes('Nucleo N6P', g)), 'El texto no nombra ejes del edificio A (AA…AW con A0…A12).');
assert.equal(motivoSinUbicar('AZ/A3-A4', ubicarEjes('AZ/A3-A4', g)), 'Nombra ejes que no están en la grilla del plano: AZ.');
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
