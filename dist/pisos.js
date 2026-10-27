/* Pisos disponibles de Atlas. Todos los pisos usan la misma interfaz; cambia solo el conjunto de datos.
   Para sumar un piso: genera sus datos en dist/<datos> (ver scripts/dwg-plano/LEEME.md) y agrega una línea a PISOS.
   - datos: carpeta con runtime.json y geometry/ ('' para la raíz).
   - especialidades: tiene láminas de Cielos y Pavimentos (disciplines.json).
   El explorador visual se monta en floor-explorer.mjs. */
(function () {
  'use strict';
  var PISOS = [
    {id: 'N-1', nombre: 'Nivel −1', corto: '−1', datos: '', especialidades: true},
    {id: 'N01', nombre: 'Nivel 1', corto: '1', datos: 'n01/', especialidades: false},
    {id: 'N02', nombre: 'Nivel 2', corto: '2', datos: 'n02/', especialidades: false},
    {id: 'N03', nombre: 'Nivel 3', corto: '3', datos: 'n03/', especialidades: false}
  ];
  var pedido = new URLSearchParams(location.search).get('nivel');
  var actual = PISOS.find(function (piso) { return piso.id === pedido; }) || PISOS[0];
  // Raíz del sitio calculada desde este archivo, para que funcione desde cualquier ruta.
  var raiz = document.currentScript.src.replace(/pisos\.js(?:[?#].*)?$/, '');
  window.ATLAS_PISOS = PISOS;
  window.ATLAS_RAIZ = raiz;
  window.ATLAS_TARJETAS = ['N-1','N01','N02','N03'].map(function(id,index){
    var piso=PISOS.find(function(p){return p.id===id;});
    return {id:id,numero:['−1','1','2','3'][index],piso:piso||null};
  });
  window.ATLAS_PISO = actual;
})();
