// Acciones de un proyecto abierto como botones flotantes a la izquierda del plano, igual que Avance, Observaciones y
// Resumen de Recintos (navegacion.mjs). Reemplazan la fila de botones y el pie del panel, que en el celular quedaban
// apretados o tapados por la barra de abajo. Cada botón conserva su id, así marking.mjs y levantamiento.mjs los conectan
// como antes. El panel queda con el nombre, «Colorear por», los estados y la lista.
import {ICONOS} from './navegacion-model.mjs';

const trazo = cuerpo => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cuerpo}</svg>`;
export const ICONOS_PROYECTO = {
  proyectos: ICONOS.proyectos,
  columnas: ICONOS.filtros,
  tabla: ICONOS.resumen,
  excel: trazo('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="m9 11 5 6M14 11l-5 6"/>'),
  respaldo: trazo('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><path d="M8 20v-6h8v6"/>'),
  exportar: trazo('<rect x="4" y="5" width="16" height="12" rx="1"/><path d="m4 15 5-5 4 4 2-2 5 5"/><path d="M12 20v-4"/>'),
  estados: trazo('<path d="M9 6 3 12l6 6"/><path d="M3 12h14a4 4 0 0 1 4 4v2"/>'),
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// acciones: [[id, nombre, icono, atributos]]; atributos opcionales, por ejemplo 'data-wait-save'.
export function funcionesProyecto(acciones) {
  return `<nav class="proyectoFunciones" aria-label="Acciones del proyecto">${acciones.map(([id, nombre, icono, extra = ''], i) =>
    `<button type="button" id="${id}" class="funcionFlotante" style="--n:${i}" ${extra}><span class="funcionCirculo">${ICONOS_PROYECTO[icono] || ''}</span><span class="funcionNombre">${esc(nombre)}</span></button>`).join('')}</nav>`;
}
// «Ampliar» del celular: el panel abre a media pantalla y puede ocupar toda la pantalla para leer la lista.
export const botonAmpliar = () => '<button type="button" id="markingAmpliar" class="markingAmpliar" aria-pressed="false">Ampliar</button>';
export function conectarAmpliar(panel, alCambiar = () => {}) {
  const b = panel.querySelector('#markingAmpliar'); if (!b) return;
  const pintar = () => { const amplio = panel.classList.contains('amplio'); b.textContent = amplio ? '← Plano' : 'Ampliar'; b.setAttribute('aria-pressed', String(amplio)); };
  pintar();
  b.onclick = () => { panel.classList.toggle('amplio'); document.body.classList.toggle('markingAmplio', panel.classList.contains('amplio')); pintar(); alCambiar(); };
}
