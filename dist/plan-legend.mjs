import {IMP_STATES, IMP_ARTIFACT_COLORS} from './impermeabilizacion-model.mjs';
import {ESTADOS, ORDEN} from './puertas-model.mjs';

export function renderPlanLegend({type, pilotDoors, materials, layerLegend, esc}) {
  const swatches = entries => `<ul class="planLegendItems">${entries.map(({name, color}) =>
    `<li><i style="background:${esc(color)}" aria-hidden="true"></i>${esc(name)}</li>`).join('')}</ul>`;
  if (type === 'waterproofing') {
    return `<p>Consulta el alcance marcado en el <a href="source/imp-s01.pdf#page=1" target="_blank" rel="noopener">PDF original IMP ↗</a>.</p>
      <h3>Avance registrado en ATLAS</h3>${swatches(Object.values(IMP_STATES))}
      <h3>Instalación de artefactos por recinto</h3>${swatches(Object.values(IMP_ARTIFACT_COLORS))}`;
  }
  if (type === 'doors') {
    return pilotDoors
      ? '<p>Toca una etiqueta para consultar el tipo y la llave. El borde azul identifica una etiqueta seleccionable y el relleno ámbar indica la puerta seleccionada.</p><p><a href="doors/puertas-unidas.pdf" target="_blank" rel="noopener">Abrir PDF unido de Puertas ↗</a></p>'
      : swatches(ORDEN.map(key => ({name: ESTADOS[key].nombre, color: ESTADOS[key].color})));
  }
  if (type === 'floors') {
    return `<h3>Códigos de pavimentos de Arquitectura</h3><p><a href="source/pav-s01.pdf#page=1" target="_blank" rel="noopener">Abrir PDF original de Pavimentos ↗</a></p>
      <dl class="planLegendCodes">${materials.filter(m => m.category === 'Pavimentos').map(m =>
        `<dt>${esc(m.code)}</dt><dd>${esc(m.description)}</dd>`).join('')}</dl>`;
  }
  return layerLegend?.length
    ? `<h3>Colores de consulta</h3>${swatches(layerLegend.map(item => ({name: item.nombre, color: item.color})))}`
    : '<p>Sin categorías documentadas para la vista actual.</p>';
}
