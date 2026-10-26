/* Selector de piso compartido por todas las vistas de Atlas.
   Para sumar un piso: agrega una línea a PISOS y publica su vista en dist/<ruta>.
   Cada vista marca dónde va el selector con <span data-selector-piso="ID"></span>. */
(function () {
  'use strict';
  var PISOS = [
    {id: 'N-1', nombre: 'Nivel −1', ruta: ''},
    {id: 'N02', nombre: 'Nivel 2', ruta: 'n02/'}
  ];
  // Raíz del sitio calculada desde este archivo, para que funcione igual desde / y desde /n02/.
  var raiz = document.currentScript.src.replace(/pisos\.js(?:[?#].*)?$/, '');
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
    select.value = marca.getAttribute('data-selector-piso');
    select.addEventListener('change', function () {
      var destino = PISOS.find(function (piso) { return piso.id === select.value; });
      if (destino) location.href = raiz + destino.ruta;
    });
    marca.replaceWith(select);
  });
  window.ATLAS_PISOS = PISOS;
})();
