import assert from 'node:assert/strict';
import * as M from './dist/observaciones-model.mjs';
import {figurasSVG, capaMarcas} from './dist/photo-marks.mjs';

// Marcas sobre fotos: figuras válidas guardadas en la referencia de la foto, sin tocar la foto original.
const at = '2026-10-30T15:00:00.000Z', autor = 'Jefa de calidad';
const room = {id: 'r1', code: '8.2.3.3.1-1', name: 'Depósito transitorio'}, source = {code: 'A-503', revision: 'B'};
let o = M.nuevaObservacion({descripcion: 'Interferencia de estructura con red húmeda', categoria: 'Cielo', terminacion: 'CIE', autor}, room, source, 'N03', 'obs-1', at);
o = M.validarObservacion({...o, fotos: [{id: 'f1', tipo: 'antes', at, autor}, {id: 'f2', tipo: 'antes', at, autor}]});
const circulo = {t: 'circulo', c: '#2fd84a', g: 8, p: [[.3, .2], [.7, .65]]}, flecha = {t: 'flecha', c: '#e3262f', g: 5, p: [[.1, .9], [.45, .5]]};
const trazo = {t: 'trazo', c: '#ffd400', g: 14, p: [[.2, .2], [.25, .22], [.3, .3]]};
assert.deepEqual(M.validarMarcas([circulo, flecha, trazo]), [circulo, flecha, trazo]);
for (const mala of [{...circulo, t: 'estrella'}, {...circulo, c: '#123456'}, {...circulo, g: 1}, {...circulo, p: [[.3, .2]]}, {...circulo, p: [[.3, .2], [1.2, .5]]}, {...flecha, p: [[0, 0], [1, 1], [.5, .5]]}, {...trazo, p: Array.from({length: 401}, () => [.5, .5])}])
  assert.throws(() => M.validarMarcas([mala]), /Marca de foto/);
assert.throws(() => M.validarMarcas(Array.from({length: M.MAX_MARCAS + 1}, () => circulo)), /Máximo 30/);

// Marcar una foto guardada: nueva versión, la otra foto intacta, entrada de actividad con la foto.
const r = M.marcarFoto(o, 'f1', [circulo, flecha], {autor, at: '2026-10-30T16:00:00.000Z'});
assert.equal(r.observacion.version, o.version + 1);
assert.deepEqual(r.observacion.fotos.map(f => f.marcas?.length ?? 0), [2, 0]);
assert.deepEqual([r.historial.accion, r.historial.detalle, r.historial.fotoIds], ['foto', 'Marcó una foto (2 figuras)', ['f1']]);
// Quitar todas las marcas deja la referencia como antes (sin campo marcas).
const sin = M.marcarFoto(r.observacion, 'f1', [], {autor});
assert.equal('marcas' in sin.observacion.fotos[0], false);
assert.equal(sin.historial.detalle, 'Quitó las marcas de una foto');
assert.throws(() => M.marcarFoto(o, 'f9', [circulo], {autor}), /ya no está/);
assert.throws(() => M.marcarFoto(o, 'f1', [circulo], {autor: ''}), /quién marca/);
// Una observación con marcas inválidas no se guarda ni se importa.
assert.throws(() => M.validarObservacion({...o, fotos: [{id: 'f1', tipo: 'antes', at, autor, marcas: [{...circulo, c: 'red'}]}]}), /Marca de foto/);
// Las fotos agregadas en el seguimiento pueden llevar sus marcas.
const seg = M.registrarSeguimiento(o, {autor, comentario: 'Se marca la zona', fotos: [{id: 'f3', tipo: 'despues', at, autor, marcas: [trazo]}], at});
assert.deepEqual(seg.observacion.fotos.at(-1).marcas, [trazo]);

// Dibujo SVG: coordenadas en un lienzo de 1000 de ancho con el alto proporcional de la foto, contorno oscuro debajo.
const svg = capaMarcas([circulo], 1600, 1200, 'slice');
assert.match(svg, /viewBox="0 0 1000 750"/);
assert.match(svg, /preserveAspectRatio="xMidYMid slice"/);
assert.match(figurasSVG([circulo], 750), /<ellipse cx="500" cy="318.75" rx="200" ry="168.75"\/>/);
assert.match(figurasSVG([{...circulo, t: 'rect'}], 750), /<rect x="300" y="150" width="400" height="337.5"\/>/);
assert.match(figurasSVG([flecha], 750), /^<g fill="none".*stroke="#000".*stroke="#e3262f" stroke-width="5"><path d="M100 675L450 375M/);
assert.match(figurasSVG([trazo], 750), /<polyline points="200,150 250,165 300,225"\/>/);
assert.equal(capaMarcas([], 1600, 1200), '');
console.log(JSON.stringify({checks: 'passed', scope: 'Marcas sobre fotos: círculo, rectángulo, flecha y mano alzada con colores y grosores válidos, máximo por foto, marcar y desmarcar una foto guardada con su versión y actividad, fotos de seguimiento con marcas y dibujo SVG proporcional a la foto.'}));
