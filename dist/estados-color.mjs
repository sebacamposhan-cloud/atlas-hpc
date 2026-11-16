// Un significado por color en toda Atlas: la misma etapa se pinta igual en el rombo, el avance, Last Planner y los
// reportes (recomendación de la revisión académica de 2026-11). El Anexo E-04 «Coordinación BIM» de la licitación del HPC
// pide que lo que está en ejecución vaya en amarillo; el rojo queda solo para problemas (observaciones o bloqueos).
// color: relleno pleno (rombo, chips, leyendas). tinte: relleno claro sobre el plano, que deja ver el dibujo debajo.
export const ESTADOS_COLOR = {
  sinRegistro: {nombre: 'Sin registro', color: '#ffffff', tinte: '#ffffff'},
  pendiente: {nombre: 'Pendiente o no iniciado', color: '#8c8c8c', tinte: '#d9d9d9'},
  ejecucion: {nombre: 'En ejecución', color: '#f2c200', tinte: '#fbe7a1'},
  revisar: {nombre: 'Terminado, por revisar', color: '#0f5499', tinte: '#c5d5ea'},
  problema: {nombre: 'Con observaciones o bloqueado', color: '#c21f1f', tinte: '#f0b6b6'},
  conforme: {nombre: 'Conforme o verificado', color: '#1a7f37', tinte: '#b8dec3'}
};

// Texto legible sobre cada color: blanco sobre los oscuros, negro sobre el amarillo, el blanco y los tintes.
const OSCUROS = new Set(['#8c8c8c', '#0f5499', '#c21f1f', '#1a7f37']);
export const textoSobre = color => OSCUROS.has(String(color).toLowerCase()) ? '#fff' : '#000';
