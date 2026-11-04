import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TARJETAS, ICONOS, tarjeta, momentanea, tituloNavegacion, leerMemoria, guardarMemoria, aRetomar, paradaCercana, CLAVE_MEMORIA, tarjetasPara, TARJETA_TAREAS} from './dist/navegacion-model.mjs';
import {funcionesDe} from './dist/jerarquia-model.mjs';
import {crearFluido, crearOleaje, arrastrar} from './dist/fluido.mjs';
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

// Jerarquía de obra: sin perfil la rueda es la de siempre; con perfil, la libreta y lo de su nivel.
{
  const perfil = (nivel, extra = {}) => ({id: '00000000-0000-4000-8000-000000000001', nombre: 'Persona de ejemplo', cargo: '', nivel, area: 'linea', jefe: null, pisos: [], empresa: null, activo: true, ...extra});
  assert.equal(tarjetasPara(funcionesDe(null)), TARJETAS);
  assert.equal(tarjetasPara(funcionesDe(perfil(3, {activo: false}))), TARJETAS, 'un perfil inactivo no cambia nada');
  const capataz = tarjetasPara(funcionesDe(perfil(4)));
  assert.deepEqual(capataz.map(t => t.id), ['tareas', 'recintos', 'protocolos', 'herramientas']);
  assert.deepEqual(capataz[0].funciones.map(([id]) => id), ['mias']);
  assert.deepEqual(capataz[1].funciones.map(([id]) => id), ['avance', 'observaciones'], 'el resumen de gerencia no va al capataz');
  const jefe = tarjetasPara(funcionesDe(perfil(2)));
  assert.deepEqual(jefe.map(t => t.id), ['tareas', 'lastplanner', 'recintos', 'protocolos', 'herramientas']);
  assert.deepEqual(jefe[0].funciones.map(([id]) => id), ['mias', 'asignar', 'equipo']);
  assert.deepEqual(jefe.slice(1).map(t => t.funciones.length), TARJETAS.map(t => t.funciones.length), 'la jefatura conserva todas sus funciones');
  assert.deepEqual(tarjetasPara(funcionesDe(perfil(null, {area: 'calidad'})))[0].funciones.map(([id]) => id), ['equipo']);
  assert.equal(tituloNavegacion('tareas', 'mias'), 'Mis tareas');
  assert.equal(tituloNavegacion('tareas', 'asignar'), 'Mis tareas · Asignar');
  assert.equal(TARJETAS.some(t => t.id === TARJETA_TAREAS.id), false, 'la libreta no se agrega a la rueda de siempre');
  for (const [id] of TARJETA_TAREAS.funciones) assert.match(ICONOS[id] || '', /<svg/, id);
  assert.equal(momentanea('asignar'), true);
}

// Cada función tiene su ícono; Observaciones lleva la cámara.
for (const t of TARJETAS) for (const [id] of t.funciones) assert.match(ICONOS[id] || '', /<svg/, id);
assert.ok(ICONOS.cerrar);
assert.match(ICONOS.observaciones, /<circle/);

// Movimiento fluido: sigue, frena solo y queda exacto sobre un elemento.
function fluido(opciones = {}) {
  const cola = [], cambios = [];
  let ultimas = [];
  const f = crearFluido({cantidad: 4, inicial: 1, cuadro: q => cola.push(q), dibujar: p => { ultimas = [...p]; }, alCambiar: i => cambios.push(i), ...opciones});
  return {f, cambios, posiciones: () => ultimas, correr(max = 2000) { let n = 0; while (cola.length && n++ < max) cola.shift()(); return n; }};
}
{
  const a = fluido();
  a.f.tomar(); a.f.llevar(2.4); a.f.soltar(.08); a.correr();
  assert.equal(Number.isInteger(a.f.objetivo()), true);
  assert.ok(a.f.objetivo() >= 2 && a.f.objetivo() <= 3);
  assert.ok(a.posiciones().every(p => p === a.f.objetivo()), 'todos llegan al mismo punto');
  assert.deepEqual(a.cambios.at(-1), a.f.indice());
  // La onda: justo después de moverse, el elemento más lejano va más atrás que el más cercano.
  const b = fluido(); b.f.ir(3); b.correr(4);
  assert.ok(b.posiciones()[3] > b.posiciones()[0], 'el lejano llega después');
  b.correr();
  // Fuera del borde se resiste y vuelve al último elemento.
  const c = fluido(); c.f.tomar(); c.f.llevar(9); c.correr(60); assert.ok(c.posiciones()[3] < 9 && c.posiciones()[3] > 3); c.f.soltar(); c.correr(); assert.equal(c.f.objetivo(), 3);
  const e = fluido(); e.f.tomar(); e.f.llevar(-3); e.correr(5); e.f.soltar(.5); e.correr(); assert.equal(e.f.objetivo(), 0);
  // Con movimiento reducido salta directo y sin inercia.
  const d = fluido({quieto: () => true}); d.f.soltar(.5); d.f.ir(2); assert.ok(d.correr() <= 2); assert.deepEqual(d.posiciones(), [2, 2, 2, 2]);
  const g = fluido(); g.f.fijar(3); assert.deepEqual(g.posiciones(), [3, 3, 3, 3]); assert.equal(g.f.indice(), 3); assert.equal(g.cambios.length, 0);
}

// Si caben todas las tarjetas la rueda queda centrada: se mueve con la mano y vuelve al centro, sin quedar en otra tarjeta.
{
  const a = fluido({centro: () => 1.5});
  a.f.fijar(1.5); a.f.tomar(); a.f.llevar(3); a.correr(40);
  assert.ok(a.posiciones()[0] > 1.5 && a.posiciones()[0] < 3, 'se resiste');
  a.f.soltar(.4); a.correr();
  assert.deepEqual(a.posiciones(), [1.5, 1.5, 1.5, 1.5]);
  assert.equal(a.f.objetivo(), 1.5);
  // Se asienta rápido: menos de un segundo y medio a 60 cuadros por segundo.
  const r = fluido(); r.f.ir(3);
  assert.ok(r.correr() < 90);
  // Oleaje: se inclina hacia el cursor, el lejano llega después y al salir todo vuelve a cero.
  const cola = []; let x = [], fila = [], fuerza = [];
  const o = crearOleaje({cantidad: 4, cuadro: q => cola.push(q), dibujar: (a, b, c) => { x = [...a]; fila = [...b]; fuerza = [...c]; }});
  const correr = max => { let n = 0; while (cola.length && n++ < max) cola.shift()(); };
  o.mover(1, 0); correr(6);
  assert.ok(x[0] > x[3] && x[3] > 0, 'el cercano se mueve antes');
  correr(2000);
  assert.deepEqual(x, [1, 1, 1, 1]); assert.deepEqual(fuerza, [1, 1, 1, 1]); assert.deepEqual(fila, [0, 0, 0, 0]);
  o.soltar(); correr(2000);
  assert.deepEqual(x, [0, 0, 0, 0]); assert.deepEqual(fuerza, [0, 0, 0, 0]);
}

// Arrastrar avisa al soltar, para dejar fijo el piso que quedó elegido.
{
  const oyentes = {}, el = {classList: {add() {}, remove() {}}, setPointerCapture() {}, addEventListener(t, f) { oyentes[t] = f; }};
  let soltados = 0;
  const a = fluido();
  arrastrar(el, a.f, {eje: 'y', sentido: 1, paso: () => 100, alSoltar: () => soltados++});
  oyentes.pointerdown({button: 0, pointerId: 1, clientY: 0, timeStamp: 1});
  oyentes.pointerup({pointerId: 1, timeStamp: 2});
  assert.equal(soltados, 0, 'un toque sin moverse no es un arrastre');
  oyentes.pointerdown({button: 0, pointerId: 1, clientY: 0, timeStamp: 10});
  oyentes.pointermove({pointerId: 1, clientY: 100, timeStamp: 20});
  oyentes.pointerup({pointerId: 1, timeStamp: 30});
  assert.equal(soltados, 1);
}

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
assert.ok(index.includes('id="bottomObra"') && index.includes('id="pisoContinuar"') && index.includes('id="pisoAyuda"'));
assert.ok(!index.includes('<button data-module'));
// Sin conexión y Asistente van en la barra superior, no abajo ni en Herramientas.
assert.ok(!index.includes('bottomOffline') && index.includes('id="offlineOpen"'));
assert.ok(!fs.readFileSync('dist/navegacion.mjs', 'utf8').includes('assistantOpen'));
// Limpiar queda junto al zoom, no dentro de Herramientas.
assert.ok(!fs.readFileSync('dist/navegacion.mjs', 'utf8').includes("['reset'"));
assert.ok(!/\.toolbar #reset[^{]*\{ display: none/.test(fs.readFileSync('dist/navegacion.css', 'utf8')) && !fs.readFileSync('dist/navegacion.css', 'utf8').includes('.toolbar #planSettingsOpen, .toolbar #reset'));
assert.ok(index.indexOf('navegacion.css') > index.indexOf('gerencial.css'), 'navegacion.css debe cargarse después del tema');

// Menú del recinto: el tipo se ve en grande, los submenús llevan flecha y la búsqueda en celular solo ilumina.
assert.match(fs.readFileSync('dist/rombo.mjs', 'utf8'), /class="romboTipo"/);
assert.match(fs.readFileSync('dist/navegacion.css', 'utf8'), /\.protRecinto\[open\] > summary::after/);
assert.match(app, /selectRoom\(hallado\.id,true,\{abrir\}\)/);
assert.match(app, /const abrir=!fichaCompleta\(\)/);

// Colores: solo los del tema, sin bordes redondeados ni sombras.
const css = fs.readFileSync('dist/navegacion.css', 'utf8').replace(/\/\* Portada:[\s\S]*?(?=\/\* Menú del recinto)/, '').replace(/\/\* Flotantes:[\s\S]*?(?=\/\* Rueda de Control)/, '');
assert.ok(!/border-radius|box-shadow|gradient\((?!#fff)/.test(css.replace(/linear-gradient\(#fff, #fff\)/g, '')));
assert.deepEqual([...new Set(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{3,8}\b(?=[;, )])/gi) || [])].filter(c => c.toLowerCase() !== '#fff'), []);

// Sin conexión: los archivos nuevos van en el núcleo de la app.
const prepare = fs.readFileSync('scripts/prepare-offline.mjs', 'utf8');
assert.ok(prepare.includes("walk('pisos3d')"));
for (const piso of ['n-1', 'n01', 'n02', 'n03']) for (const color of ['blanco', 'azul']) assert.ok(fs.statSync(`dist/pisos3d/${piso}-${color}.png`).size > 10000, piso + color);
for (const nombre of ['navegacion.css', 'navegacion.mjs', 'navegacion-model.mjs', 'palanca.mjs', 'fluido.mjs']) assert.ok(prepare.includes(`'${nombre}'`), nombre);
console.log('navegacion-test: ok');
