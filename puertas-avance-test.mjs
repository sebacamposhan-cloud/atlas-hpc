// Plano de avance de puertas del N02 (dist/n02/puertas.json) y Proyecto tipo Puertas (dist/puertas-model.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from './dist/puertas-model.mjs';
import {MODELOS, FUENTE, modeloDe, descripcionDe, vanoDe} from './dist/puertas-modelos.mjs';
import {validateMarking, esPuertas, markingItems} from './dist/marking-model.mjs';

const catalogo = P.validarCatalogo(JSON.parse(fs.readFileSync('dist/n02/puertas.json', 'utf8')));
const {puertas, resumen, fuente, calce} = catalogo;

// Fuente y calce con el plano: los ejes del DWG caen sobre los del plano con menos de 10 unidades de diferencia (~18 cm).
assert.equal(catalogo.nivel, 'N02');
assert.equal(fuente.archivo, 'PUERTAS N02.dwg');
assert.match(fuente.sha256, /^[a-f0-9]{64}$/);
assert.ok(calce.x.ejes >= 10 && calce.y.ejes >= 10, 'calce con al menos 10 ejes por dirección');
assert.ok(calce.x.residuo < 10 && calce.y.residuo < 10, 'residuo del calce');
assert.ok(Math.abs(calce.x.k + calce.y.k) < 1, 'misma escala en X e Y (Y invertida)');

// Todo lo del plano de avance queda: 280 círculos de estado (ninguno se pierde) y los números de vano.
assert.equal(puertas.length, resumen.puertas);
assert.ok(puertas.length >= 368, 'cada llave del plano es una puerta');
const llaves = puertas.filter(p => p.llave);
assert.equal(new Set(llaves.map(p => p.llave)).size, llaves.length, 'llaves sin repetir');
assert.equal(resumen.circulos, 280);
const conEstado = puertas.filter(p => p.estado !== 'sin_registro');
assert.ok(conEstado.length >= 250, 'puertas con estado');
assert.ok(puertas.filter(p => p.vano).length >= 100, 'números de vano conservados');
assert.equal(puertas.filter(p => p.pletinas).length, 17, 'las 17 pletinas de Protego');
for (const p of puertas) {
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), p.id);
  if (p.contratista) assert.ok(P.CONTRATISTAS[p.contratista], p.id);
  if (p.modelo) assert.match(p.modelo, /^P[A-Z]{1,3}\d{1,2}[A-Za-z]{0,2}$/, p.id);
  if (p.ancho) assert.match(p.ancho, /^\d+,\d+ m$/, p.id);
}
// La puerta de la captura del plano: K2_N02_14, PI09c, 0,90 m, partida 6.6.1.3.4.
const k14 = puertas.find(p => p.llave === 'K2_N02_14');
assert.deepEqual([k14.modelo, k14.ancho, k14.partida], ['PI09c', '0,90 m', '6.6.1.3.4']);
assert.equal(puertas.find(p => p.llave === 'A2_N02_23').modelo, 'PI01c');
// Dentro del marco del plano del N02.
const marco = JSON.parse(fs.readFileSync('data/n02/marco.json', 'utf8')), enPlano = puertas.filter(p => !p.fuera);
assert.ok(enPlano.every(p => p.x >= 0 && p.y >= 0 && p.x <= marco.width && p.y <= marco.height), 'ubicación dentro del plano');
assert.ok(puertas.filter(p => p.fuera).every(p => !p.llave && p.revisar.some(r => /Fuera del plano/.test(r))), 'lo de otra zona del dibujo se conserva marcado');
assert.ok(puertas.filter(p => p.fuera).length <= 10);

// Proyecto tipo Puertas: parte con lo del plano y guarda solo los cambios, con quién y cuándo.
const doc = P.nuevoProyectoPuertas({name: 'Puertas · Nivel 2', author: 'Persona de ejemplo', purpose: 'Avance de puertas'}, catalogo, 'N02', 'proyecto-1', '2026-11-09T12:00:00.000Z');
assert.ok(esPuertas(doc));
assert.equal(validateMarking(doc), doc, 'Proyectos valida el tipo puertas');
assert.deepEqual(markingItems(doc), [], 'no pinta recintos');
const protego = puertas.find(p => p.contratista === 'Protego'), teisa = puertas.find(p => p.contratista === 'Teisa');
assert.deepEqual(P.opcionesDe(protego), ['no_instalada', 'pletinas', 'instalada']);
assert.deepEqual(P.opcionesDe(teisa), ['no_instalada', 'instalada', 'revisar']);
assert.equal(P.estadoDe(protego, doc), protego.estado, 'sin cambios manda el plano');
const marcado = P.marcarPuerta(doc, protego, 'instalada', {autor: 'Persona de ejemplo', at: '2026-11-09T13:00:00.000Z'});
assert.equal(P.estadoDe(protego, marcado), 'instalada');
assert.equal(P.cambioDe(protego, marcado).autor, 'Persona de ejemplo');
assert.throws(() => P.marcarPuerta(doc, teisa, 'pletinas', {autor: 'Persona de ejemplo'}), /no aplica/);
assert.throws(() => P.marcarPuerta(doc, teisa, 'instalada', {autor: ''}), /Inicia sesión/);
assert.throws(() => validateMarking({...doc, filas: {x: {estado: 'sin_registro', at: doc.createdAt, autor: 'a'}}}), /no se puede marcar/);
assert.throws(() => validateMarking({...doc, fuente: {archivo: 'x', sha256: 'no'}}), /Fuente/);

// Conteos, búsqueda y Excel.
const n = P.contar(puertas), nMarcado = P.contar(puertas, marcado);
assert.equal(Object.values(n).reduce((a, b) => a + b, 0), puertas.length);
if (protego.estado !== 'instalada') assert.equal(nMarcado.instalada, n.instalada + 1);
assert.ok(P.filtrar(puertas, {texto: 'K2_N02_14'}).some(p => p.llave === 'K2_N02_14'));
assert.ok(P.filtrar(puertas, {contratista: 'Teisa'}).every(p => p.contratista === 'Teisa'));
assert.ok(P.filtrar(puertas, {estados: new Set(['instalada'])}).every(p => p.estado === 'instalada'));
const filas = P.filasExcel(catalogo, marcado);
assert.equal(filas.length, puertas.length);
assert.ok(filas.every(f => f.length === P.ENCABEZADOS.length));
assert.ok(filas.some(f => f[1] === protego.llave && f[7] === 'Instalada' && f[11] === 'Persona de ejemplo'));

// Descripción del modelo, de la planilla de vanos de puertas (HPC-ARQ-FDI-224 Rev03): 72 modelos con sus variantes.
assert.equal(FUENTE.lamina, 'HPC-ARQ-FDI-224'); assert.equal(MODELOS.size, 72);
assert.deepEqual(modeloDe('PI01c'), {modelo: 'PI01c', familia: 'Puertas de madera llena', descripcion: 'Puerta simple abatir 90',
  variantes: [{item: '6.5.1.3', variante: 'SI', ancho: 966, alto: 2130}, {item: '6.5.1.3', variante: 'Con imposta opaca', ancho: 966, alto: 2680}, {item: '6.5.1.3', variante: 'Con imposta vidriada', ancho: 966, alto: 2680}]});
assert.equal(descripcionDe('PI08e'), 'Puerta cortafuegos de abatir con sentidos encontrados de doble hoja 120/120 · Puertas escape y cortafuego');
assert.equal(vanoDe(modeloDe('PT01b').variantes[0]), '1300 × 2155 mm');
assert.equal(modeloDe('PAS1'), null); assert.equal(descripcionDe(null), ''); // lo que la planilla no trae queda sin descripción
for (const m of MODELOS.values()) { assert.match(m.modelo, /^P[EIT]\d\d[a-l]$/); for (const v of m.variantes) assert.ok(/^\d+(\.\d+){3,4}$/.test(v.item) && v.ancho >= 700 && v.ancho <= 2500 && v.alto >= 2130 && v.alto <= 2780, m.modelo); }
// El vano de obra crece con el ancho de hoja que nombra la descripción (70 → 766, 90 → 966…): detecta filas corridas al transcribir.
for (const m of MODELOS.values()) { const hojas = (m.descripcion.match(/(\d{2,3})(?:\/(\d{2,3}))?$/) || []).slice(1).filter(Boolean).map(Number); if (!hojas.length) continue; const hoja = hojas.reduce((a, b) => a + b, 0) * 10; for (const v of m.variantes) assert.ok(v.ancho >= hoja && v.ancho <= hoja + 110, `${m.modelo}: ${v.ancho} con hojas de ${hoja}`); }
const conDescripcion = puertas.filter(p => modeloDe(p.modelo)).length;
assert.ok(conDescripcion >= 270, 'puertas del N02 con descripción de modelo: ' + conDescripcion);
assert.ok(P.filtrar(puertas, {texto: 'cortafuegos'}).length >= 15 && P.filtrar(puertas, {texto: 'cortafuegos'}).every(p => /^PI08/.test(p.modelo)), 'se busca por la descripción del modelo');
assert.equal(P.ENCABEZADOS[3], 'Descripción del modelo');
assert.ok(filas.some(f => f[2] === 'PI01c' && f[3] === 'Puerta simple abatir 90 · Puertas de madera llena'));

// Sin conexión: el plano de puertas va en el paquete del piso y sus módulos en el núcleo.
const prepare = fs.readFileSync('scripts/prepare-offline.mjs', 'utf8');
for (const nombre of ['puertas-model.mjs', 'puertas-modelos.mjs', 'puertas.mjs', 'puertas.css']) assert.ok(prepare.includes(`'${nombre}'`), nombre);
console.log(`puertas-avance-test: ok (${puertas.length} puertas, ${conEstado.length} con estado, ${puertas.filter(p => p.vano).length} con vano)`);
