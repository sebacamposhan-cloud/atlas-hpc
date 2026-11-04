// Navegación de Atlas: primero se elige el módulo (Control, Plano o Protocolos) y después el piso. Cada módulo tiene sus
// tarjetas con flujo. Control y Protocolos no dependen del plano: sus tarjetas son su pantalla de inicio. En Plano, la rueda
// sube sobre el plano. Cada tarjeta abre un panel o devuelve el plano con sus botones de función, para que no se mezclen.
// Sin DOM: lo prueba navegacion-test.mjs.
const HOJA = '<rect x="44" y="12" width="72" height="76"/><path class="f" d="M44 12h72v14H44z"/><path d="M58 42l5 5 9-9M58 64l5 5 9-9M82 43h22M82 65h22"/>';
const DESLIZADORES = '<path d="M30 28h100M30 50h100M30 72h100"/><rect class="f" x="52" y="21" width="16" height="14"/><rect class="f" x="96" y="43" width="16" height="14"/><rect class="f" x="66" y="65" width="16" height="14"/>';

export const MODULOS = [
  {id: 'control', titulo: 'Control', texto: 'Gestión, avance, actividades y estado de obra',
    dibujo: '<path d="M36 86h88"/><path d="M48 86V58h16v28zM72 86V38h16v48z"/><path class="f" d="M96 86V20h16v66z"/>'},
  {id: 'plano', titulo: 'Plano', texto: 'Visualización de planos, capas y recintos',
    dibujo: '<path d="M80 12l54 24-54 24-54-24z"/><path class="f" d="M26 52l54 24 54-24"/><path d="M26 68l54 24 54-24"/>'},
  {id: 'protocolos', titulo: 'Protocolos', texto: 'Revisión de protocolos, terminaciones y cumplimiento', dibujo: HOJA}
];
export const moduloDe = id => MODULOS.find(m => m.id === id) || null;
// Control y Protocolos parten en sus tarjetas; Plano parte en el plano.
export const conPortada = id => id !== 'plano';

// panel: abre un panel de pantalla completa. accion: hace algo sobre el plano. grupo y funcion: abre esa función de un grupo.
// oculta: no sale en la rueda; solo agrupa los botones flotantes de sus tarjetas.
export const TARJETAS = [
  {id: 'lastplanner', modulo: 'control', titulo: 'Last Planner', texto: 'Planificación y seguimiento semanal', panel: 'lastplanner', funciones: [],
    dibujo: '<rect x="14" y="14" width="132" height="72"/><path d="M14 28h132M40 14v72M66 14v72M92 14v72M118 14v72"/><path class="f" d="M42 33h48v10H42zM68 50h48v10H68zM94 67h22v10H94z"/>'},
  {id: 'resumen', modulo: 'control', titulo: 'Avance', texto: 'Resumen de avance y observaciones', panel: 'avance', vista: 'recinto', funciones: [],
    dibujo: '<path d="M20 86h120M20 14v72"/><path class="f" d="M28 74l28-18 26 8 28-30 22-12"/>'},
  {id: 'herramientas', modulo: 'control', titulo: 'Herramientas', texto: 'Proyectos y más', funciones: [['proyectos', 'Proyectos'], ['mas', 'Más']], dibujo: DESLIZADORES},
  {id: 'recintos', modulo: 'plano', titulo: 'Recintos', texto: 'Avance y observaciones', funciones: [['avance', 'Avance'], ['observaciones', 'Observaciones'], ['resumen', 'Resumen']],
    dibujo: '<path d="M80 8l42 42-42 42-42-42z"/><path class="f" d="M62 34h36v32H62z"/><path d="M62 50h36"/>'},
  {id: 'capas', modulo: 'plano', titulo: 'Filtros y capas', texto: 'Qué se ve en el plano', accion: 'filtros', funciones: [], dibujo: DESLIZADORES},
  {id: 'tipos', modulo: 'protocolos', titulo: 'Por tipo', texto: 'Protocolos abiertos de este piso', grupo: 'protocolos', funcion: 'tipos', funciones: [], dibujo: HOJA},
  {id: 'criticos', modulo: 'protocolos', titulo: 'Críticos', texto: 'Más de un año abiertos', grupo: 'protocolos', funcion: 'criticos', funciones: [],
    dibujo: '<path d="M80 12l58 76H22z"/><path class="f" d="M80 40v24M80 74v2"/>'},
  {id: 'matriz', modulo: 'protocolos', titulo: 'Resumen', texto: 'Matriz de protocolos del piso', panel: 'matrix', vista: 'matriz', funciones: [],
    dibujo: '<rect x="24" y="16" width="112" height="68"/><path class="f" d="M24 32h112"/><path d="M24 50h112M24 67h112M60 16v68M98 16v68"/>'},
  {id: 'protocolos', modulo: 'protocolos', oculta: true, titulo: 'Protocolos', texto: '', funciones: [['tipos', 'Por tipo'], ['criticos', 'Críticos'], ['resumen', 'Resumen']], dibujo: ''}
];
// Libreta de la jerarquía de obra (jerarquia-model.mjs). Solo aparece con un perfil activo: sin perfil, Control no la muestra.
export const TARJETA_TAREAS = {id: 'tareas', modulo: 'control', titulo: 'Mis tareas', texto: 'Lo que te asignaron y lo de tu equipo', funciones: [['mias', 'Mis tareas'], ['asignar', 'Asignar'], ['equipo', 'Mi equipo']],
  dibujo: '<rect x="40" y="10" width="80" height="80"/><path class="f" d="M40 10h14v80H40z"/><path d="M64 32l5 5 9-9M64 54l5 5 9-9M64 76h0"/><path d="M84 34h24M84 56h24M64 76h44"/>'};
// Tarjetas y funciones que ve cada nivel. funciones = funcionesDe(perfil) de jerarquia-model.mjs; null = como hoy.
export function tarjetasPara(funciones) {
  if (!funciones) return TARJETAS;
  const todas = [TARJETA_TAREAS, ...TARJETAS];
  return funciones.tarjetas.map(id => todas.find(t => t.id === id)).filter(Boolean)
    .map(t => t.id === 'tareas' ? {...t, funciones: t.funciones.filter(([f]) => funciones.tareas.includes(f))} : funciones.funciones[t.id] ? {...t, funciones: t.funciones.filter(([f]) => funciones.funciones[t.id].includes(f))} : t)
    .filter(t => t.panel || t.accion || t.grupo || t.funciones.length);
}
// Tarjetas que se ven en la rueda de un módulo.
export const cartasDelModulo = (lista, idModulo) => lista.filter(t => t.modulo === idModulo && !t.oculta);
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
  mias: trazo('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="m8.5 9 1.5 1.5 3-3M8.5 15.5l1.5 1.5 3-3"/>'),
  asignar: trazo('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M18 8v6M15 11h6"/>'),
  equipo: trazo('<circle cx="8" cy="8" r="2.8"/><circle cx="16" cy="8" r="2.8"/><path d="M3 19a5 5 0 0 1 10 0M11 19a5 5 0 0 1 10 0"/>'),
  cerrar: trazo('<path d="M6 6l12 12M18 6 6 18"/>')
};
// Abren algo por un momento y no cambian la función activa del plano.
const MOMENTANEAS = new Set(['resumen', 'proyectos', 'filtros', 'mas', 'mias', 'asignar', 'equipo']);
export const tarjeta = id => TARJETAS.find(t => t.id === id) || (id === 'tareas' ? TARJETA_TAREAS : null);
export const momentanea = funcion => MOMENTANEAS.has(funcion);
export const funcionDe = (idTarjeta, idFuncion) => tarjeta(idTarjeta)?.funciones.find(([id]) => id === idFuncion) || null;

export function tituloNavegacion(idTarjeta, idFuncion, idModulo = null) {
  const t = tarjeta(idTarjeta), f = funcionDe(idTarjeta, idFuncion);
  return !t ? moduloDe(idModulo)?.titulo || 'Plano' : f && f[1] !== t.titulo ? t.titulo + ' · ' + f[1] : t.titulo;
}

// Lo último elegido en este equipo: el módulo y el piso quedan marcados al entrar, y la función del plano se retoma.
export const CLAVE_MEMORIA = 'atlas-navegacion-v1';
export function leerMemoria(almacen) {
  let v = null;
  try { v = JSON.parse(almacen.getItem(CLAVE_MEMORIA) || 'null'); } catch { return {piso: null, tarjeta: null, funcion: null, modulo: null, pisos: []}; }
  const piso = typeof v?.piso === 'string' ? v.piso : null, t = tarjeta(v?.tarjeta);
  const conFunciones = t && t.funciones.length ? t.id : null;
  return {piso, tarjeta: conFunciones, funcion: conFunciones && funcionDe(conFunciones, v?.funcion) && !momentanea(v.funcion) ? v.funcion : null, modulo: moduloDe(v?.modulo)?.id || null, pisos: Array.isArray(v?.pisos) ? v.pisos.filter(p => typeof p === 'string') : []};
}
export function guardarMemoria(almacen, cambio) {
  const v = {...leerMemoria(almacen), ...cambio};
  try { almacen.setItem(CLAVE_MEMORIA, JSON.stringify(v)); } catch {}
  return v;
}
// Al entrar a Plano solo se retoma lo que pinta el plano.
export function aRetomar({tarjeta: idTarjeta, funcion}) {
  return idTarjeta === 'recintos' ? {tarjeta: idTarjeta, funcion} : {tarjeta: null, funcion: null};
}

// Dirección de un piso dentro de un módulo. Plano es lo que abre un enlace directo, así que no se escribe.
// pisos: los elegidos, si son varios. La página siempre carga un solo piso, el que se está viendo.
export function consultaPiso({nivel, modulo = null, pisos = []}) {
  const q = new URLSearchParams({nivel});
  if (modulo && modulo !== 'plano') q.set('modulo', modulo);
  if (pisos.length > 1) q.set('pisos', pisos.join(','));
  return '?' + q;
}
export function leerConsulta(busqueda) {
  const q = new URLSearchParams(busqueda);
  return {nivel: q.get('nivel'), modulo: moduloDe(q.get('modulo'))?.id || null, pisos: (q.get('pisos') || '').split(',').filter(Boolean)};
}
// Los pisos elegidos, en el orden del edificio.
export const pisosEnOrden = (elegidos, orden) => orden.filter(id => elegidos.includes(id));
// Piso que se abre: el que ya está cargado si es uno de los elegidos, para no recargar sin necesidad.
export const pisoParaAbrir = (elegidos, cargado) => elegidos.includes(cargado) ? cargado : elegidos[0] || null;

// Parada de la palanca más cercana a una posición (px) del riel, sin salirse de las paradas.
export function paradaCercana(posicion, largoRiel, paradas) {
  if (paradas < 2 || !(largoRiel > 0)) return 0;
  const paso = largoRiel / paradas;
  return Math.max(0, Math.min(paradas - 1, Math.floor(posicion / paso)));
}
