// Protocolos de la matriz que caen en un recinto. Cada folio del piso se ubica por sus ejes (protocol-ejes.mjs) y se
// cruza con el contorno del recinto:
// - una zona entre ejes abarca los recintos que se superponen con ella (AA-AW/A1-A12 abarca todo el piso). Se recorta
//   30 cm hacia adentro para no sumar el recinto vecino que solo toca el eje con su muro;
// - un tramo sobre un eje o un pilar en un cruce, los recintos a menos de 60 cm.
// Los anulados, los folios sin piso documentado y los que no nombran ejes ubicables no se asignan a ningún recinto.
import {nivel, datos} from './level.mjs';
import {crearGrilla, ubicarEjes, numeroProtocolo, textoMedidas} from './protocol-ejes.mjs';
import {decodeMatrixRows, stateLabels, stateColors, matrixDate} from './protocol-model.mjs';
import {onProtocolFloor, protocolFloors} from './protocol-scope.mjs';

const RECORTE_ZONA = 0.3, CERCANIA = 0.6; // metros

// ---------- Geometría ----------
const dentro = (p, pol) => { let c = false; for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) { const [xi, yi] = pol[i], [xj, yj] = pol[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const lado = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const cruzan = (a, b, c, d) => lado(a, b, c) * lado(a, b, d) < 0 && lado(c, d, a) * lado(c, d, b) < 0;
function aSegmento(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const entreSegmentos = (a, b, c, d) => cruzan(a, b, c, d) ? 0 : Math.min(aSegmento(a, c, d), aSegmento(b, c, d), aSegmento(c, a, b), aSegmento(d, a, b));
const bordes = pol => pol.map((p, i) => [p, pol[(i + 1) % pol.length]]);
// Polígono convexo recortado hacia adentro: cada lado se corre «d» hacia el centro y las esquinas se recalculan.
export function recortar(pol, d) {
  const n = pol.length, area = pol.reduce((s, p, i) => s + p[0] * pol[(i + 1) % n][1] - pol[(i + 1) % n][0] * p[1], 0) / 2, sentido = Math.sign(area) || 1;
  const lineas = bordes(pol).map(([a, b]) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * sentido, ny = (b[0] - a[0]) / L * sentido; return [[a[0] + nx * d, a[1] + ny * d], [b[0] + nx * d, b[1] + ny * d]]; });
  const corte = ([a, b], [c, d2]) => { const r = [b[0] - a[0], b[1] - a[1]], s = [d2[0] - c[0], d2[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return b; const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den; return [a[0] + r[0] * t, a[1] + r[1] * t]; };
  const nuevo = lineas.map((l, i) => corte(lineas[(i - 1 + n) % n], l));
  // Si algún lado se dio vuelta, la zona era más angosta que el recorte: se usa entera.
  const conserva = bordes(nuevo).every(([a, b], i) => { const [c, d] = bordes(pol)[i]; return (b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1]) > 0; });
  return conserva ? nuevo : pol;
}
// ¿El folio ubicado «u» cae en el recinto? anillos: [{polygon, holes}] del contorno; escala: metros por unidad del plano.
export function tocaRecinto(u, anillos, escala) {
  const cerca = CERCANIA / escala;
  const zona = u.poligono && recortar(u.poligono, RECORTE_ZONA / escala);
  for (const {polygon} of anillos || []) {
    if (!polygon?.length) continue;
    if (zona) {
      if (polygon.some(p => dentro(p, zona)) || zona.some(p => dentro(p, polygon))) return true;
      if (bordes(polygon).some(([a, b]) => bordes(zona).some(([c, d]) => cruzan(a, b, c, d)))) return true;
    } else if (u.linea) {
      const [a, b] = u.linea;
      if (dentro(a, polygon) || dentro(b, polygon) || bordes(polygon).some(([c, d]) => entreSegmentos(a, b, c, d) <= cerca)) return true;
    } else if (u.punto && (dentro(u.punto, polygon) || bordes(polygon).some(([c, d]) => aSegmento(u.punto, c, d) <= cerca))) return true;
  }
  return false;
}
const cajaDe = anillos => { const pts = (anillos || []).flatMap(a => a.polygon || []), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return pts.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null; };
const seTocan = (c, u, m) => c && u.caja[0] - m <= c[2] && u.caja[0] + u.caja[2] + m >= c[0] && u.caja[1] - m <= c[3] && u.caja[1] + u.caja[3] + m >= c[1];
// Folios del índice que caen en el recinto, con prefiltro por caja.
export function protocolosDelRecinto(indice, anillos) {
  const caja = cajaDe(anillos), margen = CERCANIA / indice.escala;
  return indice.ubicados.filter(p => seTocan(caja, p.u, margen) && tocaRecinto(p.u, anillos, indice.escala));
}

// ---------- Índice del piso: todos los folios ubicados por sus ejes ----------
// leerTipo(tipo) entrega el archivo de registros de ese tipo; se piden de a seis (la matriz completa son 1,9 MB).
export async function construirIndice(catalogo, ejes, leerTipo, piso = nivel.id) {
  const grilla = crearGrilla(ejes), tipos = catalogo.types.filter(t => t.facets?.some(([level]) => onProtocolFloor(level, piso)));
  const ubicados = [], porTipo = new Map(); let sinUbicar = 0, anulados = 0, cola = 0;
  await Promise.all(Array.from({length: 6}, async () => {
    while (cola < tipos.length) {
      const tipo = tipos[cola++], filas = decodeMatrixRows(await leerTipo(tipo), catalogo, tipo).filter(f => onProtocolFloor(f.level, piso));
      porTipo.set(tipo.id, {tipo, filas});
      for (const fila of filas) {
        const estado = String(fila.state ?? '').trim();
        if (estado === 'NULO') { anulados++; continue; }
        const u = ubicarEjes(fila.axes, grilla);
        if (u.estado === 'ok') ubicados.push({fila, tipo, u, estado}); else sinUbicar++;
      }
    }
  }));
  return {ubicados, porTipo, sinUbicar, anulados, escala: grilla.metros, date1904: catalogo.source.date1904, corte: catalogo.source.cutoff};
}
const leer = async archivo => { const r = await fetch(archivo); if (!r.ok) throw Error('No se pudo cargar la matriz de protocolos. Revisa la conexión o guarda el paquete sin conexión.'); return r.json(); };
let pendiente = null;
export function cargarIndice() {
  return pendiente ||= Promise.all([leer('protocols/catalog.json'), leer(datos('ejes.json'))])
    .then(([catalogo, ejes]) => construirIndice(catalogo, ejes, tipo => leer('protocols/' + tipo.file)))
    .catch(e => { pendiente = null; throw e; });
}

// ---------- Sección de la ficha ----------
const ABIERTO = 'ABIERTO', cerrado = e => e === 'CERRADO' || e === 'CERRADO POR AUTOCONTROL';
export function createProtocolosRecinto(ctx) {
  const esc = ctx.esc;
  let filtro = 'todos';
  async function ficha(root, room, resumen) {
    const geo = ctx.footprint(room.id);
    if (!geo?.rings?.length) { root.innerHTML = '<p class="muted">Este recinto no tiene contorno: no se puede cruzar con los ejes de los protocolos.</p>'; return; }
    root.innerHTML = '<p class="muted">Cruzando la matriz de protocolos con los ejes del recinto…</p>';
    let indice; try { indice = await cargarIndice(); } catch (e) { root.innerHTML = `<p class="obsError">${esc(e.message)}</p>`; return; }
    if (!root.isConnected) return;
    const todos = protocolosDelRecinto(indice, geo.rings).sort((a, b) => a.tipo.code.localeCompare(b.tipo.code, 'es') || String(a.fila.folio).localeCompare(String(b.fila.folio), 'es', {numeric: true}));
    const abiertos = todos.filter(p => p.estado === ABIERTO).length, cerrados = todos.filter(p => cerrado(p.estado)).length;
    if (resumen) resumen.textContent = `Protocolos en este recinto · ${todos.length}${abiertos ? ` (${abiertos} abiertos)` : ''}`;
    const lista = todos.filter(p => filtro === 'todos' || (filtro === 'abiertos' ? p.estado === ABIERTO : cerrado(p.estado)));
    const grupos = new Map(); for (const p of lista) { if (!grupos.has(p.tipo.id)) grupos.set(p.tipo.id, []); grupos.get(p.tipo.id).push(p); }
    const fecha = v => { const f = matrixDate(v, indice.date1904); return !f ? '—' : /^\d{4}-\d{2}-\d{2}$/.test(f) ? f.split('-').reverse().join('-') : f; };
    const chip = e => `<span class="obsChip" style="--c:${stateColors[e] || '#595959'}">${esc(stateLabels[e] || e)}</span>`;
    root.innerHTML = `<div class="protRecResumen"><b>${todos.length}</b> folios · <b>${abiertos}</b> abiertos · <b>${cerrados}</b> cerrados</div>
      <div class="obsStateTabs protRecFiltros">${[['todos', 'Todos', todos.length], ['abiertos', 'Abiertos', abiertos], ['cerrados', 'Cerrados', cerrados]].map(([k, t, n]) => `<button type="button" data-prot-filtro="${k}" aria-pressed="${filtro === k}">${t} <b>${n}</b></button>`).join('')}</div>
      ${grupos.size ? [...grupos.values()].map(ps => { const t = ps[0].tipo; return `<details class="protRecGrupo" ${grupos.size <= 3 ? 'open' : ''}><summary><b>${esc(t.code)}</b> ${esc(t.name)} <small>${ps.length}</small></summary><ul>${ps.map(p => `<li><button type="button" data-prot-ver="${esc(t.id)}|${esc(p.fila.id)}" title="Ver este folio en el plano"><span class="protRecFolio">${esc(numeroProtocolo(p.fila.folio))}</span><span><b>${esc(p.u.etiqueta)}</b> · ${esc(textoMedidas(p.u) || p.u.tipo)}<small>${esc([p.fila.element, p.fila.receiver].filter(v => v && String(v).trim() !== 'null').join(' · ') || 'Sin elemento documentado')} · elaborado ${fecha(p.fila.issued)}${cerrado(p.estado) && p.fila.closedDate ? ' · cerrado ' + fecha(p.fila.closedDate) : ''}</small></span>${chip(p.estado)}</button></li>`).join('')}</ul></details>`; }).join('')
        : `<p class="muted">${todos.length ? 'Sin folios en esta categoría.' : 'Ningún protocolo de la matriz nombra ejes que abarquen este recinto.'}</p>`}
      <p class="protRecNota">Matriz REV1 al ${esc(String(indice.corte || '').split('-').reverse().join('-'))} · ${esc(protocolFloors[nivel.id]?.code || '')}. Un folio cuenta si su zona entre ejes se superpone con el recinto (AA-AW/A1-A12 abarca todo el piso), o si su tramo o pilar queda a menos de 60 cm. En este piso no se asignan ${indice.sinUbicar} folios sin ejes ubicables ni ${indice.anulados} anulados. Toca un folio para verlo en el plano.</p>`;
    root.querySelectorAll('[data-prot-filtro]').forEach(b => b.onclick = () => { filtro = b.dataset.protFiltro; ficha(root, room, resumen); });
    root.querySelectorAll('[data-prot-ver]').forEach(b => b.onclick = () => { const [tipoId, folioId] = b.dataset.protVer.split('|'), g = indice.porTipo.get(tipoId); ctx.verProtocolos?.({tipo: g.tipo, filas: g.filas, foco: folioId}); });
  }
  return {ficha};
}
