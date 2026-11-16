// Encabezado y leyenda comunes de los reportes de Atlas, para que cualquiera los entienda sin explicación (poka-yoke):
// qué reporte es, de qué obra y piso, qué período cubre, cuándo y quién lo emitió, y qué significa cada color, siempre
// con el nombre al lado del color. Sin DOM: lo prueba reporte-encabezado-test.mjs.
export const OBRA = 'Hospital Provincia Cordillera';

const fecha = d => new Date(d).toLocaleDateString('es-CL', {day: '2-digit', month: '2-digit', year: 'numeric'});
const hora = d => new Date(d).toLocaleTimeString('es-CL', {hour: '2-digit', minute: '2-digit'});

// tipo: «Compromiso y ejecución semanal». piso: «Nivel 4». periodo: texto libre. autor: quien emite (vacío si no hay sesión).
// significado: una frase que dice para qué sirve y cómo se lee. Se arma como un bloque propio y no como <header>, que en la
// app tiene el alto fijo de la barra superior.
export function encabezadoReporte({tipo, piso = '', periodo = '', autor = '', emitido = new Date(), significado = ''}, esc = String) {
  const lugar = [OBRA, piso, periodo].filter(Boolean).map(esc).join(' · ');
  return `<div class="reporteEncabezado"><h1>${esc(tipo)}</h1><p class="reporteLugar">${lugar}</p><p class="reporteEmision">Emitido el ${fecha(emitido)} a las ${hora(emitido)} por ${esc(autor || 'una cuenta sin sesión iniciada')}</p>${significado ? `<p class="reporteSignificado">${esc(significado)}</p>` : ''}</div>`;
}

// cifras: [{valor, nombre}]. Casillas grandes y legibles en vez de una frase con números.
export function cifrasReporte(cifras, esc = String) {
  return `<ul class="reporteCifras">${cifras.map(c => `<li><b>${esc(c.valor)}</b><span>${esc(c.nombre)}</span></li>`).join('')}</ul>`;
}

// items: [{nombre, color, borde?, detalle?}]. Cada color va con su nombre; el borde sirve para impresión en blanco y negro.
export function leyendaReporte(items, esc = String, titulo = 'Qué significa cada color') {
  const filas = items.map(i => `<li><i style="background:${esc(i.color)};border-color:${esc(i.borde || '#000')}"></i><b>${esc(i.nombre)}</b>${i.detalle ? ` <span>${esc(i.detalle)}</span>` : ''}</li>`).join('');
  return `<section class="reporteLeyenda" aria-label="${esc(titulo)}"><h2>${esc(titulo)}</h2><ul>${filas}</ul></section>`;
}
