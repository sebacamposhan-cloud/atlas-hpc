// Filtros de columna como en Excel: el encabezado abre un menú con orden, búsqueda y casillas por valor, cada una con
// cuántas filas quedan según los demás filtros. Reemplaza las cajas de filtros de los paneles. Arriba, reglas puras
// (probadas en column-filters-test.mjs); abajo, el menú en la página. El estado {filtros, orden} lo guarda cada panel
// para que sobreviva a sus redibujos.
export const VACIO = '(Vacías)';
const comparar = (a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'es', {numeric: true, sensitivity: 'base'});
const normal = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

// Valores de una fila en una columna: un texto o una lista (la fila cumple si alguno está elegido).
export function valoresDe(columna, fila) {
  const v = columna.valor(fila), lista = (Array.isArray(v) ? v : [v]).map(x => x == null || x === '' ? VACIO : String(x));
  return lista.length ? lista : [VACIO];
}
export const filtrada = (estado, key) => Array.isArray(estado.filtros?.[key]);
export function filtrar(filas, columnas, estado, excepto = null) {
  const activas = columnas.filter(c => c.key !== excepto && filtrada(estado, c.key)).map(c => [c, new Set(estado.filtros[c.key])]);
  return activas.length ? filas.filter(f => activas.every(([c, elegidos]) => valoresDe(c, f).some(v => elegidos.has(v)))) : filas;
}
export function ordenar(filas, columnas, estado) {
  const o = estado.orden, c = o && columnas.find(c => c.key === o.key);
  if (!c) return filas;
  // Las celdas vacías quedan al final en ambos sentidos, como en Excel.
  const clave = c.orden || (f => valoresDe(c, f)[0]), signo = o.dir === 'desc' ? -1 : 1, vacia = v => v == null || v === '' || v === VACIO;
  return filas.map((f, i) => [f, clave(f), i]).sort((a, b) => vacia(a[1]) - vacia(b[1]) || comparar(a[1], b[1]) * signo || a[2] - b[2]).map(x => x[0]);
}
export const aplicar = (filas, columnas, estado) => ordenar(filtrar(filas, columnas, estado), columnas, estado);
// Opciones del menú: los valores de las filas que pasan los demás filtros (como Excel), con su conteo; también los ya
// elegidos aunque hoy no tengan filas. Orden fijo si la columna lo da (estados), si no alfabético; «(Vacías)» al final.
export function opciones(filas, columnas, estado, key) {
  const c = columnas.find(c => c.key === key), cuenta = new Map();
  for (const f of filtrar(filas, columnas, estado, key)) for (const v of new Set(valoresDe(c, f))) cuenta.set(v, (cuenta.get(v) || 0) + 1);
  for (const v of estado.filtros?.[key] || []) if (!cuenta.has(v)) cuenta.set(v, 0);
  const fijo = c.opciones ? new Map(c.opciones.map((v, i) => [v, i])) : null, puesto = v => fijo?.has(v) ? fijo.get(v) : Infinity;
  return [...cuenta].map(([valor, n]) => ({valor, n, etiqueta: valor === VACIO ? VACIO : c.etiqueta ? c.etiqueta(valor) : valor}))
    .sort((a, b) => (a.valor === VACIO) - (b.valor === VACIO) || puesto(a.valor) - puesto(b.valor) || comparar(a.valor, b.valor) * (c.opcionesDesc ? -1 : 1));
}
// Elegir todos los valores disponibles equivale a no filtrar.
export function fijar(estado, key, elegidos, disponibles) {
  estado.filtros ||= {};
  const todos = disponibles.every(v => elegidos.includes(v)) && elegidos.every(v => disponibles.includes(v));
  if (todos) delete estado.filtros[key]; else estado.filtros[key] = [...elegidos];
}
export const activos = (columnas, estado) => columnas.filter(c => filtrada(estado, c.key)).length;
// Busca en la lista del menú sin tildes ni mayúsculas.
export const coincide = (texto, busqueda) => normal(texto).includes(normal(busqueda).trim());

// ---------- Menú en la página ----------
let abierto = null;
const cerrarAbierto = () => abierto?.cerrar();
globalThis.addEventListener?.('resize', cerrarAbierto);
const icono = activo => activo
  ? '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5z"/></svg>'
  : '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 6 5 5 5-5"/></svg>';

// columnas: [{key, titulo, valor(fila), etiqueta?(valor), orden?(fila), opciones?, filtro?: false, ordenTextos?: [asc, desc], clase?}]
export function crearFiltrosColumna({id, columnas, estado, esc, alCambiar}) {
  estado.filtros ||= {}; if (estado.orden === undefined) estado.orden = null;
  const col = key => columnas.find(c => c.key === key);
  const boton = c => {
    const f = filtrada(estado, c.key), o = estado.orden?.key === c.key ? estado.orden.dir : '';
    return `<button type="button" class="cfBoton${f ? ' cfActivo' : ''}" data-cf="${esc(c.key)}" data-cf-tabla="${esc(id)}" aria-haspopup="dialog" aria-expanded="false" title="${f ? 'Filtrada · ' : ''}Filtrar u ordenar por ${esc(c.titulo)}"><span>${esc(c.titulo)}</span>${o ? `<i aria-label="${o === 'asc' ? 'orden ascendente' : 'orden descendente'}">${o === 'asc' ? '↑' : '↓'}</i>` : ''}${icono(f)}</button>`;
  };
  let filasBase = [];
  function abrir(b) {
    cerrarAbierto();
    const c = col(b.dataset.cf); if (!c) return;
    const lista = opciones(filasBase, columnas, estado, c.key), disponibles = lista.map(o => o.valor), elegidos = new Set(filtrada(estado, c.key) ? estado.filtros[c.key] : disponibles);
    const [asc, desc] = c.ordenTextos || ['Ordenar de A a Z', 'Ordenar de Z a A'];
    const menu = document.createElement('div');
    menu.className = 'cfMenu'; menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Filtrar por ' + c.titulo);
    menu.innerHTML = `<div class="cfTitulo"><b>${esc(c.titulo)}</b><button type="button" data-cf-x aria-label="Cerrar">×</button></div>
      <div class="cfOrden"><button type="button" data-cf-o="asc" aria-pressed="${estado.orden?.key === c.key && estado.orden.dir === 'asc'}">↑ ${esc(asc)}</button><button type="button" data-cf-o="desc" aria-pressed="${estado.orden?.key === c.key && estado.orden.dir === 'desc'}">↓ ${esc(desc)}</button></div>
      <input type="search" class="cfBuscar" placeholder="Buscar" aria-label="Buscar en ${esc(c.titulo)}" autocomplete="off">
      <div class="cfLista" role="group" aria-label="Valores de ${esc(c.titulo)}"></div>
      <div class="cfPie"><button type="button" data-cf-borrar ${filtrada(estado, c.key) ? '' : 'disabled'}>Borrar filtro</button><button type="button" class="primary" data-cf-ok>Aceptar</button></div>`;
    // Dentro de un diálogo modal, el menú va en el diálogo (fuera de él no se puede tocar).
    (b.closest('dialog[open]') || document.body).append(menu);
    const buscar = menu.querySelector('.cfBuscar'), cuerpo = menu.querySelector('.cfLista'), ok = menu.querySelector('[data-cf-ok]');
    const visibles = () => lista.filter(o => coincide(o.etiqueta, buscar.value));
    function pintar() {
      const v = visibles(), todos = v.length && v.every(o => elegidos.has(o.valor)), algunos = v.some(o => elegidos.has(o.valor));
      cuerpo.innerHTML = (v.length ? `<label class="cfTodos"><input type="checkbox" ${todos ? 'checked' : ''} data-cf-todos> <span>(Seleccionar todo${buscar.value.trim() ? ' lo encontrado' : ''})</span></label>` : '<p class="cfNada">Sin coincidencias.</p>')
        + v.slice(0, 400).map((o, i) => `<label><input type="checkbox" data-cf-i="${lista.indexOf(o)}" ${elegidos.has(o.valor) ? 'checked' : ''}> <span>${esc(o.etiqueta)}</span><b>${o.n}</b></label>`).join('')
        + (v.length > 400 ? `<p class="cfNada">Y ${v.length - 400} valores más: escribe para encontrarlos.</p>` : '');
      const todosInput = cuerpo.querySelector('[data-cf-todos]'); if (todosInput) todosInput.indeterminate = !todos && algunos;
      ok.disabled = !v.some(o => elegidos.has(o.valor));
    }
    cuerpo.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.cfTodos !== undefined) for (const o of visibles()) t.checked ? elegidos.add(o.valor) : elegidos.delete(o.valor);
      else if (t.dataset.cfI !== undefined) { const v = lista[+t.dataset.cfI].valor; t.checked ? elegidos.add(v) : elegidos.delete(v); }
      pintar();
    });
    buscar.oninput = pintar;
    const cerrar = (foco = true) => {
      if (abierto?.menu !== menu) return; abierto = null; menu.remove(); b.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', fuera, true); document.removeEventListener('scroll', alDesplazar, true);
      if (foco) (b.isConnected ? b : document.querySelector(`[data-cf-tabla="${CSS.escape(id)}"][data-cf="${CSS.escape(c.key)}"]`))?.focus({preventScroll: true});
    };
    // alCambiar puede redibujar de forma asíncrona: el foco vuelve al encabezado nuevo cuando termina.
    const cambiar = () => { cerrar(false); Promise.resolve(alCambiar()).then(() => requestAnimationFrame(() => document.querySelector(`[data-cf-tabla="${CSS.escape(id)}"][data-cf="${CSS.escape(c.key)}"]`)?.focus({preventScroll: true}))); };
    const fuera = e => { if (!menu.contains(e.target) && e.target !== b && !b.contains(e.target)) cerrar(false); };
    const alDesplazar = e => { if (!menu.contains(e.target)) cerrar(false); };
    menu.querySelector('[data-cf-x]').onclick = () => cerrar();
    menu.querySelectorAll('[data-cf-o]').forEach(o => o.onclick = () => { const dir = o.dataset.cfO; estado.orden = estado.orden?.key === c.key && estado.orden.dir === dir ? null : {key: c.key, dir}; cambiar(); });
    menu.querySelector('[data-cf-borrar]').onclick = () => { delete estado.filtros[c.key]; cambiar(); };
    // Con una búsqueda escrita, Aceptar deja solo lo encontrado que está marcado (igual que Excel).
    ok.onclick = () => { const v = buscar.value.trim() ? visibles() : lista; fijar(estado, c.key, v.filter(o => elegidos.has(o.valor)).map(o => o.valor), disponibles); cambiar(); };
    menu.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); }
      else if (e.key === 'Enter' && e.target === buscar && !ok.disabled) { e.preventDefault(); ok.click(); }
    });
    // Debajo del encabezado en pantallas anchas; en el celular, hoja inferior (CSS).
    const r = b.getBoundingClientRect(), ancho = Math.min(300, innerWidth - 16);
    if (innerWidth > 700) {
      menu.style.left = Math.max(8, Math.min(r.left, innerWidth - ancho - 8)) + 'px';
      const arriba = r.bottom + 4, alto = innerHeight - arriba - 8;
      if (alto < 260 && r.top > alto) { menu.style.bottom = (innerHeight - r.top + 4) + 'px'; menu.style.maxHeight = (r.top - 12) + 'px'; }
      else { menu.style.top = arriba + 'px'; menu.style.maxHeight = alto + 'px'; }
    }
    abierto = {menu, cerrar};
    b.setAttribute('aria-expanded', 'true');
    pintar();
    setTimeout(() => { document.addEventListener('pointerdown', fuera, true); document.addEventListener('scroll', alDesplazar, true); }, 0);
    (innerWidth > 700 ? buscar : menu.querySelector('[data-cf-x]')).focus({preventScroll: true});
  }
  return {
    estado,
    aplicar: filas => aplicar(filas, columnas, estado),
    // Celdas de encabezado; las columnas con filtro: false (acciones) quedan como texto.
    cabecera: () => columnas.map(c => `<th${c.clase ? ` class="${c.clase}"` : ''}>${c.filtro === false ? esc(c.titulo) : boton(c)}</th>`).join(''),
    th: (key, atributos = '') => { const c = col(key); return `<th${atributos}>${c.filtro === false ? esc(c.titulo) : boton(c)}</th>`; },
    // En el celular las tablas pasan a fichas sin encabezado: la misma botonera, visible solo ahí.
    barra: () => `<div class="cfBarra" role="group" aria-label="Filtrar u ordenar por columna">${columnas.filter(c => c.filtro !== false).map(boton).join('')}</div>`,
    activos: () => activos(columnas, estado),
    limpiar: () => { const n = activos(columnas, estado); return n ? `<button type="button" class="cfLimpiar" data-cf-limpiar="${esc(id)}">Quitar ${n === 1 ? 'el filtro' : `los ${n} filtros`}</button>` : ''; },
    conectar(root, filas) {
      filasBase = filas;
      root.querySelectorAll(`[data-cf-tabla="${CSS.escape(id)}"]`).forEach(b => { b.onclick = () => abierto?.menu && b.getAttribute('aria-expanded') === 'true' ? abierto.cerrar() : abrir(b); });
      root.querySelectorAll(`[data-cf-limpiar="${CSS.escape(id)}"]`).forEach(b => { b.onclick = () => { estado.filtros = {}; alCambiar(); }; });
    }
  };
}
