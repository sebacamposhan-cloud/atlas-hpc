import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {crearGrilla, ubicarEjes} from './dist/protocol-ejes.mjs';
import {tocaRecinto, recortar, protocolosDelRecinto, construirIndice} from './dist/protocolos-recinto.mjs';

// Casos sintéticos: escala del plano (1 unidad = 1,76 cm), recinto cuadrado y zonas, tramos y pilares.
const escala = 0.0176389, cm = v => v / 100 / escala;
const cuadro = (x, y, w, h) => [{polygon: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], holes: []}];
const zona = {tipo: 'zona', poligono: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]]};
assert(tocaRecinto(zona, cuadro(200, 200, 300, 300), escala), 'recinto dentro de la zona');
assert(tocaRecinto(zona, cuadro(-500, -500, 3000, 3000), escala), 'recinto que contiene la zona');
assert(tocaRecinto(zona, cuadro(900, 300, 400, 200), escala), 'recinto que cruza el borde');
assert(!tocaRecinto(zona, cuadro(1000 + cm(10), 0, 400, 400), escala), 'el vecino al otro lado del eje no cuenta');
assert(!tocaRecinto(zona, cuadro(1000 - cm(20), 0, 400, 400), escala), 'un muro que invade 20 cm no cuenta');
assert(tocaRecinto(zona, cuadro(1000 - cm(60), 0, 400, 400), escala), 'una superposición de 60 cm sí cuenta');
assert(tocaRecinto(zona, cuadro(-100, 400, 1200, 100), escala), 'franja que atraviesa la zona sin vértices dentro');
const tramo = {tipo: 'tramo', linea: [[1000, 0], [1000, 1000]]};
assert(tocaRecinto(tramo, cuadro(1000 + cm(30), 200, 300, 300), escala), 'tramo sobre el muro del recinto');
assert(tocaRecinto(tramo, cuadro(1000 - cm(330), 200, cm(300), 300), escala), 'tramo a 30 cm por el otro lado');
assert(!tocaRecinto(tramo, cuadro(1000 + cm(100), 200, 300, 300), escala), 'a 1 m del eje no cuenta');
const pilar = {tipo: 'punto', punto: [1000, 1000]};
assert(tocaRecinto(pilar, cuadro(1000 + cm(20), 1000 + cm(20), 300, 300), escala)); assert(!tocaRecinto(pilar, cuadro(1200, 1200, 300, 300), escala));
const r = recortar(zona.poligono, 17);
assert.deepEqual(r.map(p => p.map(Math.round)), [[17, 17], [983, 17], [983, 983], [17, 983]], 'recorte hacia adentro');
assert.deepEqual(recortar([[0, 0], [20, 0], [20, 20], [0, 20]], 17), [[0, 0], [20, 0], [20, 20], [0, 20]], 'una zona angosta se usa entera');

// Datos reales del piso 1: contornos del runtime (con el desplazamiento de su lámina) y grilla del DWG.
const rt = decodeRuntime(JSON.parse(fs.readFileSync('dist/n01/runtime.json'))), ejes = JSON.parse(fs.readFileSync('dist/n01/ejes.json')), grilla = crearGrilla(ejes);
const offset = new Map(rt.atlas.tiles.map(t => [t.id, t.offset]));
const anillos = room => { const [x, y] = offset.get(room.document_id) || [0, 0]; return room.polygon?.length ? [{polygon: room.polygon.map(p => [p[0] + x, p[1] + y]), holes: []}] : null; };
const conContorno = rt.data.rooms.filter(anillos);
const todoElPiso = ubicarEjes('AA-AW/A1-A12', grilla);
const cubiertos = conContorno.filter(room => tocaRecinto(todoElPiso, anillos(room), grilla.metros)).length;
assert(cubiertos / conContorno.length > .95, `AA-AW/A1-A12 abarca el piso completo (${cubiertos} de ${conContorno.length})`);
const urgencia = ubicarEjes('A6-A8/AB-AE', grilla), lactancia = conContorno.find(room => room.code === '5.1.3.1.11-1');
assert(tocaRecinto(urgencia, anillos(lactancia), grilla.metros), 'la Sala de Lactancia está entre A6-A8 y AB-AE');
const lejos = conContorno.find(room => { const c = anillos(room)[0].polygon[0]; return Math.abs(c[0] - urgencia.centro[0]) > 3000; });
assert(!tocaRecinto(urgencia, anillos(lejos), grilla.metros), 'un recinto lejano no recibe el folio');

// Índice real de la matriz para el piso 1: folios del recinto, sin anulados, con su tipo.
const catalogo = JSON.parse(fs.readFileSync('dist/protocols/catalog.json'));
const indice = await construirIndice(catalogo, ejes, tipo => JSON.parse(fs.readFileSync('dist/protocols/' + tipo.file)), 'N01');
assert(indice.ubicados.length > 1500 && indice.ubicados.every(p => p.estado !== 'NULO' && p.fila.level.includes('N01')));
const enLactancia = protocolosDelRecinto(indice, anillos(lactancia));
assert(enLactancia.some(p => p.tipo.code === 'ISMT-IS' && p.fila.folio === '6'), 'el folio 6 de ISMT-IS (A6-A8/AB-AE) cae en la Sala de Lactancia');
assert(enLactancia.every(p => tocaRecinto(p.u, anillos(lactancia), grilla.metros)));
console.log(JSON.stringify({checks: 'passed', scope: 'Protocolos por recinto: zona entre ejes con recorte de 30 cm (vecino al otro lado del eje excluido), tramo y pilar a menos de 60 cm, AA-AW/A1-A12 cubre el piso 1, cruce real de la matriz con la Sala de Lactancia.', piso1: {folios: indice.ubicados.length, sinUbicar: indice.sinUbicar, anulados: indice.anulados, enLactancia: enLactancia.length, cubiertosPorTodoElPiso: cubiertos + '/' + conContorno.length}}));
