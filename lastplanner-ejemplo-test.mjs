import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import * as M from './dist/lastplanner-model.mjs';
import {generarEjemplo, esEjemplo, PISOS_EJEMPLO} from './dist/lastplanner-ejemplo.mjs';

// Datos de ejemplo ficticios para presentar el Last Planner: válidos, distintos por piso y fáciles de quitar.
const salas = Object.fromEntries([['N-1', 'dist/runtime.json'], ['N01', 'dist/n01/runtime.json'], ['N02', 'dist/n02/runtime.json'], ['N03', 'dist/n03/runtime.json']]
  .map(([piso, archivo]) => [piso, [...new Map(decodeRuntime(JSON.parse(fs.readFileSync(archivo))).data.rooms.map(r => [r.id, {id: r.id, code: r.code, name: r.name, sector: r.sector}])).values()]]));
const hoy = '2026-10-30', semana = M.semanaDe(hoy), {actividades, reuniones} = generarEjemplo(salas, hoy);
assert.equal(JSON.stringify(generarEjemplo(salas, hoy)), JSON.stringify({actividades, reuniones}), 'misma fecha, mismo ejemplo');
assert([...actividades, ...reuniones].every(esEjemplo), 'todo lleva el prefijo demo-');
actividades.forEach(M.validarActividad); reuniones.forEach(M.validarReunion);
assert.equal(new Set(actividades.map(a => a.id)).size, actividades.length);

const esperados = {'N-1': ['Spotless', 'Valencia', 'DAC-Controls', 'Miranda', 'Teisa', 'Pavitec', 'STI'], N01: ['Spotless', 'STI', 'Valencia', 'DAC-Controls', 'Construlyl', 'Teisa', 'Pavitec'],
  N02: ['Grupsa', 'Miranda', 'Valencia', 'DAC-Controls', 'Teisa', 'Spotless', 'STI'], N03: ['Protego', 'Construlyl', 'Spotless', 'STI', 'Pavitec', 'DAC-Controls', 'Valencia']};
const seriePorPiso = {};
for (const piso of Object.keys(PISOS_EJEMPLO)) {
  const delPiso = actividades.filter(a => a.level === piso), ids = new Set(salas[piso].map(s => s.id));
  assert(delPiso.length > 80, piso + ' con actividades suficientes');
  assert(delPiso.every(a => a.recintos.every(r => ids.has(r.id))), piso + ': recintos reales del piso');
  assert(delPiso.every(a => esperados[piso].includes(a.responsable)), piso + ': solo sus subcontratos de terminaciones');
  // PPC de las semanas cerradas según el carácter del piso.
  const serie = M.seriePPC(delPiso, M.moverSemana(semana, -1), 8);
  serie.forEach((s, i) => { assert(s.cerrada, piso + ' semana cerrada'); assert(Math.abs(s.ppc - PISOS_EJEMPLO[piso].ppc[i]) < .07, `${piso} ${s.semana}: PPC ${s.ppc} cerca de ${PISOS_EJEMPLO[piso].ppc[i]}`); });
  seriePorPiso[piso] = serie.map(s => Math.round(s.ppc * 100)).join(',');
  // Semana en curso, reprogramaciones, próximas semanas y plan intermedio.
  const actual = delPiso.filter(a => a.semana === semana);
  assert(actual.some(a => a.estado === 'En ejecución') && actual.some(a => a.origen), piso + ': semana en curso con trabajo en ejecución y saldos reprogramados');
  assert(delPiso.filter(a => a.semana > semana).every(a => a.estado === 'Planificada'));
  assert.equal(delPiso.filter(a => !a.semana).length, 4, piso + ': plan intermedio');
  const causas = M.causas(delPiso);
  assert(causas.length >= 2 && causas.find(c => c.causa === PISOS_EJEMPLO[piso].causas[0])?.n === causas[0].n, `${piso}: la causa principal es ${PISOS_EJEMPLO[piso].causas[0]} (${causas.map(c => c.causa + ' ' + c.n).join(', ')})`);
}
assert.equal(new Set(Object.values(seriePorPiso)).size, 4, 'cada piso tiene su propia curva de PPC');
assert(actividades.filter(a => a.responsable === 'Grupsa').every(a => a.level === 'N02') && actividades.filter(a => a.responsable === 'Protego').every(a => a.level === 'N03'));
// Buen rendimiento: Grupsa (correderas UCI, piso 2) y Protego (cortafuego, piso 3) rinden sobre lo planificado.
for (const [quien, plan] of [['Grupsa', 1.5], ['Protego', 1.2]]) {
  const g = M.rendimientosPorActividad(actividades.filter(a => a.responsable === quien))[0];
  assert(g.porPersonaDia > plan * 1.1, `${quien} rinde ${g.porPersonaDia.toFixed(2)} contra ${plan} planificado`);
}
const rr = M.resumenRestricciones(actividades, hoy);
assert(rr.vencidas > 0 && rr.pendientes > rr.vencidas && rr.liberadas > 0 && rr.bloqueadas > 0 && rr.listas > 0, 'restricciones vencidas, pendientes y liberadas');

// Reuniones: ocho lunes con asistencia realista, frentes de los cuatro pisos y acuerdos que pasan hasta cumplirse.
assert.equal(reuniones.length, 8);
assert(reuniones.every(r => { const a = M.asistencia(r).pct; return a > .65 && a <= 1; }));
assert.deepEqual([...new Set(reuniones.flatMap(r => r.frentes.map(f => f.level)))].sort(), ['N-1', 'N01', 'N02', 'N03']);
assert(reuniones.at(-1).acuerdos.some(c => !c.cumplido) && reuniones.some(r => r.acuerdos.some(c => c.cumplido)));
// Personas inventadas: ningún nombre del LPS real de obra gruesa entregado como referencia.
const texto = JSON.stringify({actividades, reuniones});
for (const nombre of ['Juan Torres', 'Juan González', 'Rodrigo Rojas', 'Sergio', 'Efrain', 'Katherinne', 'Milenka', 'Miriam']) assert(!texto.includes(nombre), nombre);
console.log(JSON.stringify({checks: 'passed', scope: 'Ejemplo del Last Planner: válido y determinista, prefijo demo-, recintos reales y subcontratos de terminaciones por piso, curva de PPC propia de cada piso, Grupsa y Protego sobre su rendimiento, semana en curso con reprogramaciones, restricciones vencidas/pendientes/liberadas, plan intermedio y reuniones con asistencia, frentes y acuerdos.',
  actividades: actividades.length, reuniones: reuniones.length, ppc: seriePorPiso}));
