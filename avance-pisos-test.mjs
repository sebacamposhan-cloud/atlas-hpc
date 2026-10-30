import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodePma} from './dist/pma-model.mjs';
import * as M from './dist/avance-model.mjs';

// Avance por partida en los cuatro pisos, en m² y sin valorización: clave por piso, recintos del PMA de cada piso,
// m² ejecutados y pendientes, y partidas de cada terminación del rombo.
const pma = decodePma(JSON.parse(fs.readFileSync('dist/pma/catalog.json'))), sinPrecios = new Map();
assert.equal(M.keyFor(' 1.2.3 '), 'N-1|1.2.3', 'el −1 conserva su clave');
assert.equal(M.keyFor('1.2.3', 'N02'), 'N02|1.2.3');
const esperado = {'N-1': 'A-S01', N01: 'A-N01', N02: 'A-N02', N03: 'A-N03'}, conteo = {};
for (const [piso, nivelPma] of Object.entries(esperado)) {
  const rep = M.reporteAvance(pma, sinPrecios, [], piso);
  assert.equal(rep.level, piso);
  assert.equal(rep.filas.length, pma.main.filter(r => r.level === nivelPma).length, piso + ': un recinto por fila del PMA de su piso');
  assert(rep.partidas.length > 1000, piso + ': partidas generadas');
  assert(rep.partidas.every(n => n.total == null && n.ejecutado == null), piso + ': sin precios no hay montos');
  assert(rep.partidas.filter(n => n.cantidad != null).every(n => n.m2Ejecutado === 0 && n.m2Pendiente === n.cantidad), piso + ': sin registros, todo pendiente');
  conteo[piso] = rep.filas.length;
}
// Un registro del piso 2: m² ejecutados = superficie × %, pendientes = el resto; la clave lleva el piso.
const rep2 = M.reporteAvance(pma, sinPrecios, [], 'N02'), fila = rep2.filas.find(f => f.nodos.some(n => n.tipo === 'partida' && n.cantidad > 10 && /^6\.1\./.test(n.item)));
const pav = fila.nodos.find(n => n.tipo === 'partida' && n.cantidad > 10 && /^6\.1\./.test(n.item));
const reg = {key: M.keyFor(fila.code, 'N02'), code: fila.code, level: 'N02', version: 1, at: '2026-10-30T12:00:00Z', responsable: 'Jefe de terreno', fecha: '2026-10-30', protocolos: {},
  partidas: {[pav.id]: {estado: 'En ejecución', pct: 40, conformidad: 'Sin revisar', falta: '', obs: []}}};
assert.deepEqual(M.validarRegistro(reg, fila.nodos), []);
assert(M.validarRegistro({...reg, key: M.keyFor(fila.code)}, fila.nodos).length, 'la clave debe ser la del piso del registro');
assert(M.validarRegistro({...reg, level: 'N09', key: 'N09|' + fila.code}, fila.nodos).length, 'piso desconocido');
const conAvance = M.reporteAvance(pma, sinPrecios, [reg], 'N02').filas.find(f => f.code === fila.code).nodos.find(n => n.id === pav.id);
assert.equal(conAvance.m2Ejecutado, pav.cantidad * .4);
assert.equal(conAvance.m2Pendiente, pav.cantidad - pav.cantidad * .4);
assert.equal(M.reporteAvance(pma, sinPrecios, [reg], 'N03').filas.find(f => f.code === fila.code)?.registro, undefined, 'un registro del 2 no aparece en el 3');
assert.equal(M.avanceFisico(M.reporteAvance(pma, sinPrecios, [reg], 'N02').filas.find(f => f.code === fila.code).nodos), 40 / fila.nodos.filter(n => n.tipo === 'partida').length);

// Partidas de cada terminación del rombo: pavimento con su sobrelosa e impermeabilización, cielo con pintura o cenefa,
// cada muro con el tabique y sellos comunes y lo de su código.
const n1 = M.reporteAvance(pma, sinPrecios, [], 'N-1').filas, humedo = n1.find(f => String(f.row.CIE).trim() === '202' && f.nodos.some(n => n.item === '4.3.1'));
const items = (f, campo) => M.partidasDeTerminacion(f.nodos, campo, f.row).map(n => n.item).sort();
assert(items(humedo, 'PAV').includes('4.3.1') && items(humedo, 'PAV').includes('2.6'), 'recinto húmedo: impermeabilización y sobrelosa con el pavimento');
assert(items(humedo, 'CIE').every(i => /^6\.(3|4\.2|10\.4)/.test(i)), 'cielo: solo partidas de cielo');
const pintado = n1.find(f => ['11', '12'].includes(String(f.row.M1).trim()));
assert.deepEqual(items(pintado, 'M1').filter(i => /^(5\.1|5\.3|6\.2\.2)$/.test(i)), ['5.1', '5.3', '6.2.2'], 'muro pintado: tabique, sellos y empaste');
assert(!items(pintado, 'M1').some(i => /^6\.(1|3)\./.test(i)), 'un muro no trae pavimentos ni cielos');
const todas = new Set(['PAV', 'CIE', 'M1', 'M2', 'M3', 'M4'].flatMap(c => M.partidasDeTerminacion(pintado.nodos, c, pintado.row).map(n => n.id)));
assert.equal(todas.size, pintado.nodos.filter(n => n.tipo === 'partida').length, 'cada partida del recinto pertenece a alguna terminación');
// Terminaciones sin ítem del itemizado (caucho disipativo 109, cielos mixtos, epóxica de asepsia alta, paneles): se
// registran como partida de la terminación con el nombre del PMA; solo quedan fuera las sin especificar (S/E, N/A).
for (const piso of ['N-1', 'N01', 'N02', 'N03']) {
  const filas = M.reporteAvance(pma, sinPrecios, [], piso).filas;
  assert(filas.flatMap(f => f.sinPartida).every(s => /S\/E|N\/A|sin dato/.test(s)), piso + ': ' + [...new Set(filas.flatMap(f => f.sinPartida))].join(', '));
}
const n2 = M.reporteAvance(pma, sinPrecios, [], 'N02').filas, caucho = n2.find(f => String(f.row.PAV).trim() === '109').nodos.find(n => n.id === 'T-PAV-109');
assert.deepEqual([caucho.item, caucho.unidad, caucho.prereq.includes('P-NIV-RES'), caucho.cantidad > 0], ['PMA 109', 'm2', true, true]);
assert.match(caucho.nombre, /caucho/i);
const epoxico = n2.find(f => ['M1', 'M2', 'M3', 'M4'].some(k => String(f.row[k]).trim() === '13')), muro13 = epoxico.nodos.find(n => n.id === 'T-MURO-13');
assert.deepEqual([muro13.prereq, muro13.cantidad], [['6.2.2'], null], 'epóxica de muro: después del empaste, sin m² de muro');
assert(['5.1', '5.3', '6.2.2'].every(i => epoxico.nodos.some(n => n.item === i)), 'su cadena: tabique, sellos y empaste');
assert.deepEqual(M.revision(M.reporteAvance(pma, sinPrecios, [], 'N02'), sinPrecios).sinProtocolo, [], 'paneles y terminaciones nuevas con su previo o inicio de cadena');
console.log(JSON.stringify({checks: 'passed', scope: 'Avance por partida en los cuatro pisos sin valorización: clave piso|código (−1 compatible), recintos del PMA de cada piso, m² ejecutados y pendientes, validación del piso y partidas de cada terminación del rombo.', recintos: conteo}));
