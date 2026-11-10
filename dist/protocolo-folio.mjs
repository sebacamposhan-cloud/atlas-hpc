// Ficha de un folio de la matriz de protocolos, la misma desde el plano, la lista por tipo y el recinto. Arriba lo que sirve
// en terreno (estado, días abierto, dónde, quién recibe, elaboración y cierre) y debajo, siempre a la vista, los 16 datos
// de la matriz tal cual: así nada se pierde al dejar la tabla grande solo en el escritorio. La matriz es documental: se
// consulta, no se edita, y sus estados son los del corte del Excel.
import {matrixDate} from './protocol-values.mjs';
import {stateLabels, stateColors} from './protocol-model.mjs';
import {numeroProtocolo, textoMedidas} from './protocol-ejes.mjs';

export const CAMPOS = [['item', 'Item gral'], ['specialty', 'Especialidad / actividad'], ['process', 'Partida / proceso'], ['code', 'Código'], ['folio', 'Folio'], ['element', 'Elemento'], ['level', 'Nivel'], ['axes', 'Ejes'], ['rooms', 'Recintos'], ['issued', 'Fecha de elaboración'], ['selfCheck', 'Autocontrol'], ['closed', 'Cerrado'], ['closedDate', 'Fecha de cierre'], ['month', 'Mes'], ['receiver', 'Recibe'], ['state', 'Estado']];
const FECHAS = new Set(['issued', 'closedDate']);
export const vacio = v => !String(v ?? '').trim() || String(v).trim() === 'null';
export const hoyChile = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const iso = /^\d{4}-\d{2}-\d{2}$/;
const dma = f => f.split('-').reverse().join('-');
// Fecha legible (dd-mm-aaaa) desde el serial de Excel; si la celda trae texto, el texto tal cual.
export function fecha(v, date1904 = false) { if (vacio(v)) return ''; const f = matrixDate(v, date1904); return !f ? '' : iso.test(f) ? dma(f) : String(f).trim(); }
// Días desde la elaboración de un folio abierto (null si está cerrado o si su fecha no es válida).
export function diasAbierto(fila, date1904 = false, hoy = hoyChile()) {
  if (String(fila.state ?? '').trim() !== 'ABIERTO') return null;
  const f = matrixDate(fila.issued, date1904);
  if (!iso.test(f || '')) return null;
  return Math.max(0, Math.round((Date.parse(hoy) - Date.parse(f)) / 864e5));
}
export function valorCampo(fila, campo, date1904 = false) {
  const v = fila[campo];
  if (vacio(v)) return '—';
  if (FECHAS.has(campo)) return fecha(v, date1904) || String(v).trim();
  if (campo === 'state') return stateLabels[String(v).trim()] || String(v).trim();
  return String(v).trim();
}
export const estadoDe = fila => String(fila.state ?? '').trim();
export const chipEstado = (fila, esc) => { const e = estadoDe(fila); return `<span class="folioChip" style="--c:${stateColors[e] || '#595959'}">${esc(stateLabels[e] || e || 'Sin estado')}</span>`; };
const textoDias = d => d === null ? '' : d === 0 ? 'abierto hoy' : d === 1 ? 'abierto hace 1 día' : `abierto hace ${d.toLocaleString('es-CL')} días`;

// u: ubicación del folio en el plano (protocol-ejes.mjs) o null. enPlano: muestra «Ver en el plano».
export function fichaFolioHTML({fila, tipo, u = null, date1904 = false, corte = '', hoy = hoyChile(), esc, enPlano = false}) {
  const d = diasAbierto(fila, date1904, hoy), dato = (n, v) => vacio(v) ? '' : `<div><dt>${n}</dt><dd>${esc(v)}</dd></div>`;
  const donde = u ? `${u.etiqueta}${textoMedidas(u) ? ' · ' + textoMedidas(u) : ''}` : (vacio(fila.axes) ? 'Sin ejes en la matriz' : 'Ejes: ' + String(fila.axes).trim());
  return `<div class="folioFicha">
    <p class="folioTitulo"><b>${esc(tipo?.code || fila.code || '')} · Folio ${esc(numeroProtocolo(fila.folio))}</b>${tipo?.name ? `<small>${esc(tipo.name)}</small>` : ''}</p>
    <p class="folioEstado">${chipEstado(fila, esc)}${d !== null ? `<b class="${d > 365 ? 'folioCritico' : ''}">${textoDias(d)}</b>` : ''}</p>
    <dl class="folioClave">${dato('Dónde', donde)}${dato('Recibe', fila.receiver)}${dato('Elemento', fila.element)}${dato('Elaborado', fecha(fila.issued, date1904))}${dato('Cerrado el', fecha(fila.closedDate, date1904))}</dl>
    ${enPlano ? '<button type="button" class="folioPlano" data-folio-plano>Ver en el plano</button>' : ''}
    <h4 class="folioSeccion">Todos los datos de la matriz · ${CAMPOS.length}</h4>
    <dl class="folioTodo">${CAMPOS.map(([k, n]) => `<div><dt>${n}</dt><dd>${esc(valorCampo(fila, k, date1904))}</dd></div>`).join('')}</dl>
    <p class="folioCorte">${corte ? 'Matriz al ' + esc(fecha(corte) || corte) + ' (corte del Excel)' : 'Matriz de protocolos'}${fila.sourceRow ? ' · fila ' + esc(fila.sourceRow) + ' del registro' : ''}. Se consulta, no se edita.</p>
  </div>`;
}
// Aviso fijo de la fecha de corte: en terreno se sabe que los estados no se actualizan en vivo.
export const avisoCorte = (corte, esc) => corte ? `<p class="folioAviso">Matriz al ${esc(fecha(corte) || corte)} · los estados son los del Excel a esa fecha.</p>` : '';
