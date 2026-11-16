// Paleta única de estados y encabezado común de reportes: un significado por color en el rombo, el avance y Last Planner,
// y cada reporte dice qué es, de qué obra y piso, cuándo y quién lo emitió, con cada color nombrado.
import assert from 'node:assert/strict';
import {ESTADOS_COLOR, textoSobre} from './dist/estados-color.mjs';
import {COLOR_PARTIDA} from './dist/room-progress-model.mjs';
import {PLAN_COLORS, PLAN_BORDES} from './dist/lastplanner-map.mjs';
import {encabezadoReporte, leyendaReporte, OBRA} from './dist/reporte-encabezado.mjs';

const C = ESTADOS_COLOR;
// Mismo significado, mismo color: en proceso/en ejecución = amarillo; por revisar = azul; problema = rojo; conforme = verde.
assert.equal(COLOR_PARTIDA['En proceso'], C.ejecucion.color);
assert.equal(PLAN_COLORS['En ejecución'], C.ejecucion.tinte);
assert.equal(COLOR_PARTIDA['Instalado · por revisar'], C.revisar.color);
assert.equal(PLAN_COLORS['Por verificar'], C.revisar.tinte);
assert.equal(COLOR_PARTIDA['Con observaciones'], C.problema.color);
assert.equal(PLAN_COLORS.Bloqueada, C.problema.tinte);
assert.equal(COLOR_PARTIDA['Instalado y conforme'], C.conforme.color);
assert.equal(PLAN_COLORS.Verificada, C.conforme.tinte);
assert.equal(COLOR_PARTIDA['No iniciado'], C.pendiente.color);
assert.equal(PLAN_COLORS.Pendiente, C.pendiente.tinte);
// El rojo queda solo para problemas.
assert.deepEqual(Object.keys(COLOR_PARTIDA).filter(e => COLOR_PARTIDA[e] === C.problema.color), ['Con observaciones']);
assert.deepEqual(Object.keys(PLAN_COLORS).filter(e => PLAN_COLORS[e] === C.problema.tinte), ['Bloqueada']);
// Cada estado del plano tiene borde, para leerse impreso en blanco y negro; el texto sobre el amarillo es negro.
assert.ok(Object.keys(PLAN_COLORS).every(e => PLAN_BORDES[e]));
assert.equal(textoSobre(C.ejecucion.color), '#000');
assert.equal(textoSobre(C.problema.color), '#fff');

// Encabezado: tipo, obra, piso, período, fecha, autor y significado; sin sesión lo dice en vez de dejarlo vacío.
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const h = encabezadoReporte({tipo: 'Compromiso y ejecución semanal', piso: 'Nivel 4', periodo: 'Semana 46', autor: 'Ana <QA>', emitido: '2026-11-16T12:00:00Z', significado: 'Para qué sirve.'}, esc);
for (const t of ['Compromiso y ejecución semanal', OBRA, 'Nivel 4', 'Semana 46', 'Ana &lt;QA&gt;', 'Para qué sirve.', '16-11-2026']) assert.ok(h.includes(t), 'falta ' + t);
assert.ok(encabezadoReporte({tipo: 'X'}, esc).includes('Sin sesión iniciada'));
// Leyenda: cada color con su nombre.
const l = leyendaReporte([{nombre: 'En ejecución', color: C.ejecucion.tinte, borde: '#9a7a00', detalle: 'avance parcial'}], esc);
assert.ok(l.includes('<b>En ejecución</b>') && l.includes(C.ejecucion.tinte) && l.includes('avance parcial') && l.includes('Qué significa cada color'));
console.log('Paleta única y encabezado de reportes: mismos colores por significado en rombo, avance y Last Planner, rojo solo para problemas, bordes para blanco y negro, encabezado con obra, piso, período, fecha y autor, y leyenda con nombres: passed');
