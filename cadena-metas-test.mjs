// Cadena Proyectos → Avance → Last Planner (dist/cadena-metas.mjs): el avance de las partidas del recinto llega a las
// marcas de la meta, y la meta queda «por confirmar» solo cuando todo su frente está instalado y conforme.
import assert from 'node:assert/strict';
import {estadoSuperficie, planMeta, GRUPOS_DE_TIPO} from './dist/cadena-metas.mjs';

const p = (pct, ejecucion, revision = 'Sin revisar') => ({pct, ejecucion, revision});
const resumen = grupos => ({grupos: Object.entries(grupos).map(([campo, partidas]) => ({campo, partidas}))});
let pruebas = 0;

// Superficies del frente → grupos del rombo.
assert.deepEqual(GRUPOS_DE_TIPO.recinto, ['PAV', 'CIE', 'M']); pruebas++;
const r = resumen({PAV: [p(100, 'Instalado', 'Conforme')], CIE: [p(50, 'En ejecución')], M: [p(100, 'Instalado'), p(0, 'No iniciado')]});
assert.deepEqual(estadoSuperficie(r, 'pavimentos'), {avance: 1, instalado: true, conforme: true}); pruebas++;
assert.deepEqual(estadoSuperficie(r, 'cielos'), {avance: .5, instalado: false, conforme: false}); pruebas++;
assert.deepEqual(estadoSuperficie(r, 'muros'), {avance: .5, instalado: false, conforme: false}); pruebas++;
assert.equal(estadoSuperficie(r, 'recinto').avance, .63); pruebas++;
assert.equal(estadoSuperficie(resumen({PAV: []}), 'pavimentos'), null, 'sin partidas en el PMA no hay dato'); pruebas++;
assert.equal(estadoSuperficie(null, 'muros'), null); pruebas++;
// «Instalado» pero sin revisar: avanza, no queda conforme.
assert.deepEqual(estadoSuperficie(resumen({PAV: [p(100, 'Instalado')]}), 'pavimentos'), {avance: 1, instalado: true, conforme: false}); pruebas++;

const meta = (estado = 'en_curso', marcas = {}) => ({estado, alcances: [{id: 'a', tipo: 'pavimentos'}, {id: 'b', tipo: 'cielos'}], marcas});
const conforme = {avance: 1, instalado: true, conforme: true}, instalado = {avance: 1, instalado: true, conforme: false};
// Instalado suma al avance de la meta, pero no la deja por confirmar.
assert.deepEqual(planMeta(meta(), new Map([['a', instalado], ['b', {avance: .4, instalado: false, conforme: false}]])), {marcas: {a: 1, b: .4}, porConfirmar: false}); pruebas++;
// Sin cambios no se vuelve a marcar (la cadena no entra en un ciclo).
assert.deepEqual(planMeta(meta('en_curso', {a: {avance: 1}, b: {avance: 1}}), new Map([['a', conforme], ['b', instalado]])).marcas, {}); pruebas++;
// Todo conforme: por confirmar.
assert.equal(planMeta(meta('en_curso', {a: {avance: 1}, b: {avance: 1}}), new Map([['a', conforme], ['b', conforme]])).porConfirmar, true); pruebas++;
// Una superficie sin datos en este equipo: no se da por conforme.
assert.equal(planMeta(meta(), new Map([['a', conforme]])).porConfirmar, false); pruebas++;
// Meta cerrada o por confirmar: no se toca. Meta sin frente: tampoco.
for (const estado of ['hecha', 'confirmada', 'anulada']) assert.deepEqual(planMeta(meta(estado), new Map([['a', conforme], ['b', conforme]])), {marcas: {}, porConfirmar: false});
pruebas++;
assert.deepEqual(planMeta({estado: 'asignada', alcances: [], marcas: {}}, new Map()), {marcas: {}, porConfirmar: false}); pruebas++;
// Una meta devuelta vuelve a avanzar y puede quedar por confirmar otra vez.
assert.equal(planMeta(meta('devuelta', {a: {avance: 1}, b: {avance: 1}}), new Map([['a', conforme], ['b', conforme]])).porConfirmar, true); pruebas++;

console.log(`Cadena de metas: ${pruebas} comprobaciones aprobadas (superficies, instalado, conforme, sin ciclos, estados cerrados).`);
