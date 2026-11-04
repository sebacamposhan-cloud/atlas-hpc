import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TARJETAS, tarjeta, momentanea, tituloNavegacion, leerMemoria, guardarMemoria, aRetomar, paradaCercana, CLAVE_MEMORIA} from './dist/navegacion-model.mjs';
import {palancaHTML} from './dist/palanca.mjs';

const almacen = (inicial = {}) => { const d = {...inicial}; return {getItem: k => d[k] ?? null, setItem: (k, v) => { d[k] = v; }, d}; };

// Tarjetas: Last Planner abre su panel sin botones; las demás devuelven el plano con sus funciones.
assert.deepEqual(TARJETAS.map(t => t.id), ['lastplanner', 'recintos', 'protocolos', 'herramientas']);
assert.equal(tarjeta('lastplanner').panel, 'lastplanner');
assert.equal(tarjeta('lastplanner').funciones.length, 0);
assert.deepEqual(tarjeta('recintos').funciones.map(([id]) => id), ['avance', 'observaciones', 'resumen']);
assert.deepEqual(tarjeta('herramientas').funciones.map(([, nombre]) => nombre), ['Proyectos', 'Filtros y capas', 'Más']);
assert.equal(tarjeta('inexistente'), null);
assert.equal(tituloNavegacion('recintos', 'observaciones'), 'Recintos · Observaciones');
assert.equal(tituloNavegacion('protocolos', null), 'Protocolos');
assert.equal(tituloNavegacion(null, null), 'Plano');

// Memoria: recuerda piso y función; ignora datos dañados, funciones momentáneas y tarjetas sin funciones.
assert.deepEqual(leerMemoria(almacen()), {piso: null, tarjeta: null, funcion: null});
assert.deepEqual(leerMemoria(almacen({[CLAVE_MEMORIA]: '{mal'})), {piso: null, tarjeta: null, funcion: null});
const a = almacen();
guardarMemoria(a, {piso: 'N02'}); guardarMemoria(a, {tarjeta: 'recintos', funcion: 'observaciones'});
assert.deepEqual(leerMemoria(a), {piso: 'N02', tarjeta: 'recintos', funcion: 'observaciones'});
assert.equal(leerMemoria(almacen({[CLAVE_MEMORIA]: JSON.stringify({tarjeta: 'recintos', funcion: 'resumen'})})).funcion, null);
assert.equal(leerMemoria(almacen({[CLAVE_MEMORIA]: JSON.stringify({tarjeta: 'lastplanner', funcion: 'x'})})).tarjeta, null);
assert.equal(leerMemoria(almacen({[CLAVE_MEMORIA]: JSON.stringify({tarjeta: 'recintos', funcion: 'criticos'})})).funcion, null);
assert.ok(['resumen', 'proyectos', 'filtros', 'mas'].every(momentanea));
assert.equal(momentanea('avance'), false);
guardarMemoria({getItem: () => null, setItem: () => { throw Error('sin espacio'); }}, {piso: 'N01'});

// Al entrar se retoma lo que pinta el plano; una lista no se abre sola y Herramientas no se retoma.
assert.deepEqual(aRetomar({tarjeta: 'recintos', funcion: 'avance'}), {tarjeta: 'recintos', funcion: 'avance'});
assert.deepEqual(aRetomar({tarjeta: 'protocolos', funcion: 'tipos'}), {tarjeta: 'protocolos', funcion: null});
assert.deepEqual(aRetomar({tarjeta: 'herramientas', funcion: null}), {tarjeta: null, funcion: null});

// Palanca: la parada es la del tramo donde se suelta, sin salirse del riel.
assert.equal(paradaCercana(10, 174, 3), 0);
assert.equal(paradaCercana(90, 174, 3), 1);
assert.equal(paradaCercana(170, 174, 3), 2);
assert.equal(paradaCercana(-20, 174, 3), 0);
assert.equal(paradaCercana(400, 174, 3), 2);
assert.equal(paradaCercana(120, 174, 2), 1);
assert.equal(paradaCercana(50, 0, 3), 0);

// La palanca son botones normales: marca el valor, conserva el dato y muestra por qué una parada no se puede usar.
const html = palancaHTML({titulo: 'Revisión', valor: 'Sin revisar', opciones: [{valor: 'Sin revisar', atributo: 'data-p-rev'}, {valor: 'Conforme', atributo: 'data-p-rev', bloqueo: 'Primero márcala instalada.'}]});
assert.match(html, /--n:2;--i:0/);
assert.match(html, /data-p-rev="Sin revisar" aria-pressed="true"/);
assert.match(html, /data-p-rev="Conforme" aria-pressed="false" disabled data-bloqueo="Primero márcala instalada\."/);
assert.match(palancaHTML({titulo: 'Protocolo', valor: 'Liberado', opciones: [{valor: 'Pendiente', atributo: 'data-prot', dato: 'P-1|Pendiente'}, {valor: 'Liberado', atributo: 'data-prot', dato: 'P-1|Liberado'}]}), /--i:1.*data-prot="P-1\|Liberado" aria-pressed="true"/s);

// Portada y barra: sin barra lateral, con la rueda y sin copias de botones.
const index = fs.readFileSync('dist/index.html', 'utf8'), app = fs.readFileSync('dist/app.js', 'utf8');
assert.ok(!index.includes('appSidebar'));
assert.ok(!app.includes('sideProject'));
assert.ok(index.includes('href="navegacion.css"'));
assert.ok(index.includes('id="bottomObra"') && index.includes('id="pisoContinuar"'));
assert.ok(!index.includes('<button data-module'));
assert.ok(index.indexOf('navegacion.css') > index.indexOf('gerencial.css'), 'navegacion.css debe cargarse después del tema');

// Colores: solo los del tema, sin bordes redondeados ni sombras.
const css = fs.readFileSync('dist/navegacion.css', 'utf8').replace(/\/\* Portada:[\s\S]*?(?=\/\* Menú del recinto)/, '');
assert.ok(!/border-radius|box-shadow|gradient\((?!#fff)/.test(css.replace(/linear-gradient\(#fff, #fff\)/g, '')));
assert.deepEqual([...new Set(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{3,8}\b(?=[;, )])/gi) || [])].filter(c => c.toLowerCase() !== '#fff'), []);

// Sin conexión: los archivos nuevos van en el núcleo de la app.
const prepare = fs.readFileSync('scripts/prepare-offline.mjs', 'utf8');
assert.ok(prepare.includes("walk('pisos3d')"));
for (const piso of ['n-1', 'n01', 'n02', 'n03']) for (const color of ['blanco', 'azul']) assert.ok(fs.statSync(`dist/pisos3d/${piso}-${color}.png`).size > 10000, piso + color);
for (const nombre of ['navegacion.css', 'navegacion.mjs', 'navegacion-model.mjs', 'palanca.mjs']) assert.ok(prepare.includes(`'${nombre}'`), nombre);
console.log('navegacion-test: ok');
