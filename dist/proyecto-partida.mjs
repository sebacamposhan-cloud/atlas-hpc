// Proyecto de una partida de la planilla de avance (levantamiento): una columna «Estado <partida>» enlazada a la planilla
// («P:<familia>»), así el plano y la tabla se actualizan con cada carga y con lo marcado en terreno. La hoja de ruta
// agrega «Hoja de ruta» (Pendiente / Hecho) y el detalle de lo que falta en cada recinto.
import * as L from './levantamiento-model.mjs';
import {NOMBRE_FAMILIA} from './planilla-avance-model.mjs';

// Unidad de la cantidad de cada partida en la planilla (m² salvo las lineales).
export const UNIDAD_FAMILIA = {cortafuego: 'ml', cenefa: 'ml', retorno: 'ml'};
export const unidadFamilia = familia => UNIDAD_FAMILIA[familia] || 'm²';
// Partidas de la planilla que alimentan el avance del rombo (las demás quedan para más adelante).
export const FAMILIAS_AVANCE = ['cieloDuro', 'cieloModular', 'cenefa', 'pinturaCielo', 'pinturaMuro', 'pavimento', 'vinilico', 'baldosa', 'resina', 'epoxico', 'retorno', 'sobrelosa', 'imper', 'porcelanato', 'hpl', 'cortafuego'];
const numero = v => v.toLocaleString('es-CL', {maximumFractionDigits: 1});
const fechaCorta = iso => iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4);
export function detalleRecinto(afam, f) {
  const etapas = afam.etapas.map((e, k) => `${e} ${Math.round(100 * (f.et[k] ?? 0))} %`).join(' · ');
  return `${etapas}${etapas ? ' · ' : ''}pendiente ${numero(f.pendiente)} ${unidadFamilia(afam.familia)}`;
}

// afam: avanceFamilia(...) de planilla-avance-model.mjs. filas: los recintos que entran (todos o los elegidos).
export function proyectoPartida(afam, {nivel, autor, docId, filas = afam.filas, hojaDeRuta = false, at = new Date().toISOString()}) {
  const nombre = afam.nombre || NOMBRE_FAMILIA[afam.familia] || afam.familia;
  const opciones = afam.categorias.map((n, i) => ({id: 'o' + String(i + 1).padStart(2, '0'), nombre: n, color: afam.colores[n]}));
  const idDe = new Map(opciones.map(o => [o.nombre, o.id]));
  const columnas = [{id: 'c01', nombre: ('Estado ' + nombre.toLowerCase()).slice(0, 80), tipo: 'lista', enlace: 'P:' + afam.familia, opciones}];
  if (hojaDeRuta) columnas.push({id: 'c02', nombre: 'Hoja de ruta', tipo: 'estado', enlace: null, opciones: [{id: 'o01', nombre: 'Pendiente', color: '#c26a00'}, {id: 'o02', nombre: 'Hecho', color: '#2e9e5b', final: true}]},
    {id: 'c03', nombre: 'Detalle', tipo: 'texto', enlace: null});
  const doc = L.nuevoLevantamiento({name: hojaDeRuta ? `Hoja de ruta · ${nombre} · ${fechaCorta(at)}` : `Avance · ${nombre}`, author: autor,
    purpose: hojaDeRuta ? `${filas.length} recintos con ${nombre.toLowerCase()} pendiente, para planificar el trabajo. El estado se actualiza con la planilla de la oficina y lo marcado en terreno.`
      : `Estado de ${nombre.toLowerCase()} por recinto según la planilla de la oficina y lo marcado en terreno.`, columnas}, nivel, docId, at);
  const filasDoc = filas.map(f => ({code: f.code, name: f.name || '', valores: {
    ...(idDe.has(f.categoria) ? {c01: idDe.get(f.categoria)} : {}), ...(hojaDeRuta ? {c02: 'o01', c03: detalleRecinto(afam, f).slice(0, 2000)} : {})}}));
  return L.validarLevantamiento({...doc, vista: 'c01', filas: filasDoc});
}
