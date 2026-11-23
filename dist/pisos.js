/* Pisos disponibles de Atlas. Todos los pisos usan la misma interfaz; cambia solo el conjunto de datos.
   Para sumar un piso: genera sus datos en dist/<datos> (ver scripts/dwg-plano/LEEME.md) y agrega una línea a PISOS.
   - datos: carpeta con runtime.json y geometry/ ('' para la raíz).
   - especialidades: tiene láminas de Cielos y Pavimentos (<datos>disciplines.json, con sus documentos ceilings/floors).
   - imp: código de su lámina de Impermeabilización (por ejemplo 's01'): impermeabilizacion/<imp>.json, el avance de
     artefactos impermeabilizacion/artefactos-<imp>.json y las teselas disciplines/imp-<imp>/ (scripts/imp/LEEME.md).
     Sin «imp», el piso no muestra Impermeabilización ni artefactos.
   - cielos: tiene sus láminas CIE leídas (<datos>cielos.json, scripts/cielos/extraer-cie.mjs): tipo de cielo y NCT por
     recinto como capas sobre Arquitectura y en el rombo.
   - puertas: tiene el plano de puertas por recinto (<datos>puertas.json, puertas.mjs).
   - puertasPiloto: tiene el catálogo piloto de puertas como tipo de plano (doors/catalog.json; hoy el −1).
   - pav: código del PDF original de Pavimentos (source/pav-<pav>.pdf) para la simbología. Sin él, la simbología lo avisa.
   - planos: otros planos unificados de una lámina (scripts/planos/generar-plano.py): {comp: Compartimentación (fuego),
     retornos: Pavimentos con retornos vinílicos}, cada uno el módulo de su malla. El que falta aparece desactivado.
   - cielosUnificado: Cielos como un solo plano con teselas (scripts/cielos/generar-mapa-s01.py el −1; generar-mapa-cie.py los demás): {mapa: módulo con la
     malla, lamina: código de la lámina}. Sin él, Cielos usa sus láminas o la capa «cielos».
   Todo lo especial de un piso depende de estas marcas, nunca de que sea el −1.
   El explorador visual se monta en floor-explorer.mjs. */
(function () {
  'use strict';
  var PISOS = [
    {id: 'N-1', nombre: 'Nivel −1', corto: '−1', datos: '', especialidades: true, imp: 's01', puertasPiloto: true, pav: 's01', cielosUnificado: {mapa: 'cie-s01-map.mjs', lamina: 'CIE-A-501'}, planos: {comp: 'comp-map.mjs'}},
    {id: 'N01', nombre: 'Nivel 1', corto: '1', datos: 'n01/', especialidades: false, cielos: true, cielosUnificado: {mapa: 'n01/cie-map.mjs', lamina: 'CIE-A-501'}, planos: {comp: 'n01/comp-map.mjs', retornos: 'n01/retornos-map.mjs'}},
    {id: 'N02', nombre: 'Nivel 2', corto: '2', datos: 'n02/', especialidades: false, cielos: true, puertas: true, cielosUnificado: {mapa: 'n02/cie-map.mjs', lamina: 'CIE-A-501'}, planos: {comp: 'n02/comp-map.mjs', retornos: 'n02/retornos-map.mjs'}},
    {id: 'N03', nombre: 'Nivel 3', corto: '3', datos: 'n03/', especialidades: false, cielos: true, cielosUnificado: {mapa: 'n03/cie-map.mjs', lamina: 'CIE-A-502'}, planos: {comp: 'n03/comp-map.mjs', retornos: 'n03/retornos-map.mjs'}},
    {id: 'N04', nombre: 'Nivel 4', corto: '4', datos: 'n04/', especialidades: false, cielos: true, cielosUnificado: {mapa: 'n04/cie-map.mjs', lamina: 'CIE-A-501'}, planos: {comp: 'n04/comp-map.mjs', retornos: 'n04/retornos-map.mjs'}}
  ];
  var pedido = new URLSearchParams(location.search).get('nivel');
  var actual = PISOS.find(function (piso) { return piso.id === pedido; }) || PISOS[0];
  // Raíz del sitio calculada desde este archivo, para que funcione desde cualquier ruta.
  var raiz = document.currentScript.src.replace(/pisos\.js(?:[?#].*)?$/, '');
  window.ATLAS_PISOS = PISOS;
  window.ATLAS_RAIZ = raiz;
  window.ATLAS_TARJETAS = ['N-1','N01','N02','N03','N04'].map(function(id,index){
    var piso=PISOS.find(function(p){return p.id===id;});
    return {id:id,numero:['−1','1','2','3','4'][index],piso:piso||null};
  });
  window.ATLAS_PISO = actual;
})();
