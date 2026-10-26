/* Pisos de Atlas y selector de piso. Todos los pisos usan la misma interfaz; cambia solo el conjunto de datos.
   Para sumar un piso: genera sus datos en dist/<datos> (ver scripts/import-n02.mjs) y agrega una línea a PISOS.
   - datos: carpeta con runtime.json y geometry/ ('' para la raíz).
   - especialidades: tiene láminas de Cielos y Pavimentos (disciplines.json).
   El selector se coloca donde la página tenga <span data-selector-piso></span>. */
(function () {
  'use strict';
  var PISOS = [
    {id: 'N-1', nombre: 'Nivel −1', corto: '−1', datos: '', especialidades: true},
    {id: 'N02', nombre: 'Nivel 2', corto: '2', datos: 'n02/', especialidades: false}
  ];
  var pedido = new URLSearchParams(location.search).get('nivel');
  var actual = PISOS.find(function (piso) { return piso.id === pedido; }) || PISOS[0];
  // Raíz del sitio calculada desde este archivo, para que funcione desde cualquier ruta.
  var raiz = document.currentScript.src.replace(/pisos\.js(?:[?#].*)?$/, '');
  function direccion(piso, modulo) {
    return raiz + (piso === PISOS[0] ? '' : '?nivel=' + encodeURIComponent(piso.id)) + (modulo && modulo !== 'map' ? '#modulo=' + encodeURIComponent(modulo) : '');
  }
  document.querySelectorAll('[data-selector-piso]').forEach(function (marca) {
    var select = document.createElement('select');
    select.className = 'selectorPiso';
    select.setAttribute('aria-label', 'Piso');
    select.title = 'Cambiar de piso';
    PISOS.forEach(function (piso) {
      var opcion = document.createElement('option');
      opcion.value = piso.id;
      opcion.textContent = piso.nombre;
      select.appendChild(opcion);
    });
    select.value = actual.id;
    select.addEventListener('change', function () {
      var destino = PISOS.find(function (piso) { return piso.id === select.value; });
      // Se conserva el módulo abierto (dashboard, capas, etc.) al cambiar de piso.
      if (destino) location.href = direccion(destino, document.body.dataset.module);
    });
    marca.replaceWith(select);
  });
  window.ATLAS_PISOS = PISOS;
  window.ATLAS_PISO = actual;
})();
