// Navegación de terreno: Control de obra es una rueda de tarjetas sobre el plano. Cada tarjeta devuelve el plano con sus
// botones de función, para que las funciones no se mezclen. Last Planner es para jefatura y abre su panel tal como está.
// Sin DOM: lo prueba navegacion-test.mjs.
export const TARJETAS = [
  {id: 'lastplanner', titulo: 'Last Planner', texto: 'Planificación y seguimiento semanal', panel: 'lastplanner', funciones: [],
    dibujo: '<rect x="14" y="14" width="132" height="72"/><path d="M14 28h132M40 14v72M66 14v72M92 14v72M118 14v72"/><path class="f" d="M42 33h48v10H42zM68 50h48v10H68zM94 67h22v10H94z"/>'},
  {id: 'recintos', titulo: 'Recintos', texto: 'Avance y observaciones', funciones: [['avance', 'Avance'], ['observaciones', 'Observaciones'], ['resumen', 'Resumen']],
    dibujo: '<path d="M80 8l42 42-42 42-42-42z"/><path class="f" d="M62 34h36v32H62z"/><path d="M62 50h36"/>'},
  {id: 'protocolos', titulo: 'Protocolos', texto: 'Por tipo y críticos', funciones: [['tipos', 'Por tipo'], ['criticos', 'Críticos'], ['resumen', 'Resumen']],
    dibujo: '<rect x="44" y="12" width="72" height="76"/><path class="f" d="M44 12h72v14H44z"/><path d="M58 42l5 5 9-9M58 64l5 5 9-9M82 43h22M82 65h22"/>'},
  {id: 'herramientas', titulo: 'Herramientas', texto: 'Proyectos, filtros y capas', funciones: [['proyectos', 'Proyectos'], ['filtros', 'Filtros y capas'], ['mas', 'Más']],
    dibujo: '<path d="M30 28h100M30 50h100M30 72h100"/><rect class="f" x="52" y="21" width="16" height="14"/><rect class="f" x="96" y="43" width="16" height="14"/><rect class="f" x="66" y="65" width="16" height="14"/>'}
];
// Abren algo por un momento y no cambian la función activa del plano.
const MOMENTANEAS = new Set(['resumen', 'proyectos', 'filtros', 'mas']);
export const tarjeta = id => TARJETAS.find(t => t.id === id) || null;
export const momentanea = funcion => MOMENTANEAS.has(funcion);
export const funcionDe = (idTarjeta, idFuncion) => tarjeta(idTarjeta)?.funciones.find(([id]) => id === idFuncion) || null;

export function tituloNavegacion(idTarjeta, idFuncion) {
  const t = tarjeta(idTarjeta), f = funcionDe(idTarjeta, idFuncion);
  return !t ? 'Plano' : f ? t.titulo + ' · ' + f[1] : t.titulo;
}

// Lo último elegido en este equipo: el piso queda marcado en la portada y la función se retoma al entrar.
export const CLAVE_MEMORIA = 'atlas-navegacion-v1';
export function leerMemoria(almacen) {
  let v = null;
  try { v = JSON.parse(almacen.getItem(CLAVE_MEMORIA) || 'null'); } catch { return {piso: null, tarjeta: null, funcion: null}; }
  const piso = typeof v?.piso === 'string' ? v.piso : null, t = tarjeta(v?.tarjeta);
  const conFunciones = t && t.funciones.length ? t.id : null;
  return {piso, tarjeta: conFunciones, funcion: conFunciones && funcionDe(conFunciones, v?.funcion) && !momentanea(v.funcion) ? v.funcion : null};
}
export function guardarMemoria(almacen, cambio) {
  const v = {...leerMemoria(almacen), ...cambio};
  try { almacen.setItem(CLAVE_MEMORIA, JSON.stringify(v)); } catch {}
  return v;
}
// Al entrar a un piso solo se retoma lo que pinta el plano. Lo que abre una lista (Protocolos) deja sus botones, sin abrirla.
export function aRetomar({tarjeta: idTarjeta, funcion}) {
  if (idTarjeta === 'recintos') return {tarjeta: idTarjeta, funcion};
  if (idTarjeta === 'protocolos') return {tarjeta: idTarjeta, funcion: null};
  return {tarjeta: null, funcion: null};
}

// Parada de la palanca más cercana a una posición (px) del riel, sin salirse de las paradas.
export function paradaCercana(posicion, largoRiel, paradas) {
  if (paradas < 2 || !(largoRiel > 0)) return 0;
  const paso = largoRiel / paradas;
  return Math.max(0, Math.min(paradas - 1, Math.floor(posicion / paso)));
}
