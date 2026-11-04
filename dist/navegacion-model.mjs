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
// Íconos de los botones flotantes (trazo de 24 unidades). Observaciones lleva la cámara.
const trazo = cuerpo => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cuerpo}</svg>`;
export const ICONOS = {
  avance: trazo('<path d="M4 20h16"/><path d="M7 20v-6M12 20V6M17 20v-9"/>'),
  observaciones: trazo('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  resumen: trazo('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 10h16M4 15h16M10 10v10"/>'),
  tipos: trazo('<path d="M9 4h6v3H9z"/><path d="M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3"/><path d="m9 14 2 2 4-4"/>'),
  criticos: trazo('<path d="M12 4 3 20h18z"/><path d="M12 10v5M12 18v.01"/>'),
  proyectos: trazo('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h16M12 4v16"/><path d="M6.5 6.5h3v3h-3zM14.5 14.5h3v3h-3z" fill="currentColor"/>'),
  filtros: trazo('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  mas: trazo('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  cerrar: trazo('<path d="M6 6l12 12M18 6 6 18"/>')
};
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
