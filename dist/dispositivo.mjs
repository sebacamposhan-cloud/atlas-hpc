// Terreno o escritorio. Escritorio es una pantalla de 1024 px o más manejada con mouse; todo lo demás (celular o tablet)
// es terreno. Marca <body class="escritorio"> y lo vuelve a marcar si cambia (al girar una tablet o achicar la ventana):
// terreno.css esconde en terreno lo que lleva data-oficina, y escritorio.css arma los tres paneles.
const consulta = typeof matchMedia === 'function' ? matchMedia('(min-width:1024px) and (pointer:fine)') : null;
export const esEscritorio = () => !!consulta?.matches;
const avisos = new Set();
// Llama a fn cada vez que se pasa de terreno a escritorio o al revés.
export const alCambiarDispositivo = fn => { avisos.add(fn); return () => avisos.delete(fn); };
function marcar() {
  if (!document.body) { document.addEventListener('DOMContentLoaded', marcar, {once: true}); return; }
  document.body.classList.toggle('escritorio', esEscritorio());
  document.body.classList.toggle('terreno', !esEscritorio());
}
if (typeof document !== 'undefined') {
  marcar();
  consulta?.addEventListener?.('change', () => { marcar(); avisos.forEach(fn => { try { fn(esEscritorio()); } catch {} }); });
}
