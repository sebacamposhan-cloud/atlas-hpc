// Protocolos de la matriz en el plano: cada folio se encuadra entre sus ejes con su número (001, 002…), en cualquier estado.
// Los anulados (NULO) no se dibujan: van en el panel de la derecha, igual que los que no traen ejes ubicables.
// La grilla de ejes de cada piso sale del DWG (dist/<piso>/ejes.json, scripts/ejes/generar.mjs).
import {nivel, datos} from './level.mjs';
import {crearGrilla, ubicarEjes, numeroProtocolo} from './protocol-ejes.mjs';
import {stateLabels, stateColors} from './protocol-model.mjs';

const ORDEN_ESTADOS = ['ABIERTO', 'CERRADO POR AUTOCONTROL', 'CERRADO'];
let grillaPendiente = null;
function cargarGrilla() {
  return grillaPendiente ||= fetch(datos('ejes.json')).then(r => { if (!r.ok) throw Error('Sin grilla'); return r.json(); }).then(crearGrilla)
    .catch(error => { grillaPendiente = null; throw error; });
}
export const pisoConEjes = () => nivel.id !== 'N-1';

export function createProtocolPlan(ctx) {
  const esc = ctx.esc, svg = document.getElementById('svg');
  const capa = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  capa.id = 'protocolOverlay'; capa.setAttribute('pointer-events', 'none');
  (document.getElementById('markingOverlay') || svg.lastElementChild).after(capa);
  const panel = document.createElement('aside');
  panel.id = 'protocolPanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Protocolos en el plano');
  document.querySelector('main').append(panel);
  let actual = null, foco = null, ocultos = new Set();

  const colorDe = estado => stateColors[estado] || '#8a929b';
  const visibles = () => actual.ubicados.filter(p => !ocultos.has(p.estado));
  function dibujar() {
    if (!actual) { capa.replaceChildren(); return; }
    const escala = svg.getScreenCTM()?.a || 1, px = 1 / escala, grupos = new Map();
    // El número se escribe cuando su recuadro se ve con tamaño suficiente (o es el elegido): de lejos se amontonarían.
    const legible = (u, enFoco) => { const ancho = u.caja[2] * escala, alto = u.caja[3] * escala; return enFoco || (u.tipo === 'punto' ? ancho >= 12 : u.tipo === 'tramo' ? Math.max(ancho, alto) >= 70 : Math.min(ancho, alto) >= 30); };
    // Varios folios con el mismo encuadre comparten recuadro y se listan sus números juntos.
    for (const p of visibles()) {
      const clave = p.u.poligono.map(q => q.map(Math.round).join(',')).join(';');
      if (!grupos.has(clave)) grupos.set(clave, {u: p.u, items: []});
      grupos.get(clave).items.push(p);
    }
    capa.innerHTML = [...grupos.values()].sort((a, b) => b.u.caja[2] * b.u.caja[3] - a.u.caja[2] * a.u.caja[3]).map(g => {
      const estado = ORDEN_ESTADOS.find(e => g.items.some(p => p.estado === e)) || g.items[0].estado, color = colorDe(estado), enFoco = g.items.some(p => p.fila.id === foco);
      const numeros = g.items.map(p => p.numero), texto = (g.u.aproximado ? '≈ ' : '') + (numeros.length > 4 ? numeros.slice(0, 3).join(' · ') + ' +' + (numeros.length - 3) : numeros.join(' · '));
      return `<polygon points="${g.u.poligono.map(p => p.join(',')).join(' ')}" fill="${color}" fill-opacity="${enFoco ? .34 : .14}" stroke="${color}" stroke-width="${enFoco ? 3.5 : 1.6}" vector-effect="non-scaling-stroke"/>`
        + (!legible(g.u, enFoco) ? '' : `<text x="${g.u.centro[0]}" y="${g.u.centro[1]}" text-anchor="middle" dominant-baseline="central" font-size="${(enFoco ? 15 : 12) * px}" font-weight="700" fill="${color}" stroke="white" stroke-width="${3.5 * px}" paint-order="stroke">${esc(texto)}</text>`);
    }).join('');
  }
  new MutationObserver(dibujar).observe(svg, {attributes: true, attributeFilter: ['viewBox']});
  new ResizeObserver(dibujar).observe(svg);

  function encuadrar(cajas) {
    if (!cajas.length) return;
    const x0 = Math.min(...cajas.map(c => c[0])), y0 = Math.min(...cajas.map(c => c[1])), x1 = Math.max(...cajas.map(c => c[0] + c[2])), y1 = Math.max(...cajas.map(c => c[1] + c[3]));
    const w = Math.max(x1 - x0, 500), h = Math.max(y1 - y0, 500), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    ctx.setView([cx - w * .65, cy - h * .65, w * 1.3, h * 1.3]);
  }
  const fila = (p, extra = '') => `<b>${esc(numeroProtocolo(p.folio))}</b><span>${esc(String(p.axes ?? '').trim() || 'Sin ejes')}${extra}</span><small>${esc([p.element, p.receiver].filter(v => String(v ?? '').trim()).join(' · ') || 'Sin elemento documentado')}</small>`;
  function render() {
    const {tipo, ubicados, anulados, sinUbicar} = actual, cuenta = estado => ubicados.filter(p => p.estado === estado).length;
    panel.innerHTML = `<div class="protocolHead"><div><small>Protocolo en el plano · ${esc(nivel.nombre)}</small><h2>${esc(tipo.code)}</h2><p>${esc(tipo.name)}</p></div><button data-cerrar aria-label="Cerrar">×</button></div>
      <p class="protocolResumen">${ubicados.length} en el plano · ${anulados.length} anulados · ${sinUbicar.length} sin ubicación</p>
      <div class="protocolLeyenda">${ORDEN_ESTADOS.filter(cuenta).map(e => `<label><input type="checkbox" data-estado="${esc(e)}" ${ocultos.has(e) ? '' : 'checked'}><i style="background:${colorDe(e)}"></i>${esc(stateLabels[e] || e)} <b>${cuenta(e)}</b></label>`).join('')}</div>
      <div class="protocolScroll">
        <section class="protocolAnulados"><h3>Anulados · fuera del plano</h3>${anulados.length ? `<ul>${anulados.map(p => `<li id="anulado-${esc(p.id)}" class="${p.id === foco ? 'activo' : ''}">${fila(p)}</li>`).join('')}</ul>` : '<p>Este protocolo no tiene folios anulados en el piso.</p>'}</section>
        <h3>En el plano</h3><ul class="protocolLista">${ubicados.map(p => `<li><button data-folio="${esc(p.fila.id)}" class="${p.fila.id === foco ? 'activo' : ''}" ${ocultos.has(p.estado) ? 'disabled' : ''}><i style="background:${colorDe(p.estado)}"></i>${fila(p.fila, p.u.aproximado ? ' ≈' : '')}</button></li>`).join('') || '<li><p>Ningún folio con ejes ubicables.</p></li>'}</ul>
        ${sinUbicar.length ? `<details class="protocolSinUbicar"><summary>Sin ubicación en el plano (${sinUbicar.length})</summary><ul>${sinUbicar.map(s => `<li class="${s.fila.id === foco ? 'activo' : ''}">${fila(s.fila)}<em>${esc(s.motivo)}</em></li>`).join('')}</ul></details>` : ''}
        <p class="protocolNota">El recuadro va entre los ejes extremos que indica el protocolo; los números aparecen al acercarse. ≈ marca un eje que no está en la grilla y se aproximó al más cercano (p. ej. A12B → A12). La matriz no se modifica.</p>
      </div>
      <div class="protocolFooter"><button data-volver>← Volver a la matriz</button></div>`;
    panel.querySelector('[data-cerrar]').onclick = cerrar;
    panel.querySelector('[data-volver]').onclick = () => { cerrar(); ctx.volver(); };
    panel.querySelectorAll('[data-estado]').forEach(input => input.onchange = () => { if (input.checked) ocultos.delete(input.dataset.estado); else ocultos.add(input.dataset.estado); render(); dibujar(); });
    panel.querySelectorAll('[data-folio]').forEach(boton => boton.onclick = () => {
      const p = actual.ubicados.find(x => x.fila.id === boton.dataset.folio);
      foco = p.fila.id; encuadrar([p.u.caja]); render(); dibujar();
      panel.querySelector('[data-folio].activo')?.focus({preventScroll: true});
    });
  }

  // filas: registros del protocolo en este piso (todas los estados); foco: id de un folio para centrarlo.
  async function mostrar({tipo, filas, foco: id = null}) {
    if (!pisoConEjes()) { ctx.toast('El piso −1 aún no tiene la grilla de ejes: su plano viene de PDF. Por ahora los protocolos se ubican en los pisos 1, 2 y 3.'); return false; }
    let grilla;
    try { grilla = await cargarGrilla(); } catch { ctx.toast('No se pudo cargar la grilla de ejes del piso. Revisa la conexión o el paquete sin conexión.'); return false; }
    const ubicados = [], anulados = [], sinUbicar = [];
    for (const f of filas) {
      const estado = String(f.state ?? '').trim();
      if (estado === 'NULO') { anulados.push(f); continue; }
      const u = ubicarEjes(f.axes, grilla);
      if (u.estado === 'ok') ubicados.push({fila: f, u, estado, numero: numeroProtocolo(f.folio)});
      else sinUbicar.push({fila: f, motivo: u.estado === 'faltan' ? 'Ejes que no están en el plano: ' + u.faltan.join(', ') : 'Sin ejes del edificio A reconocibles'});
    }
    const porNumero = (a, b) => String(a).localeCompare(String(b), 'es', {numeric: true});
    ubicados.sort((a, b) => porNumero(a.numero, b.numero)); anulados.sort((a, b) => porNumero(a.folio, b.folio)); sinUbicar.sort((a, b) => porNumero(a.fila.folio, b.fila.folio));
    actual = {tipo, ubicados, anulados, sinUbicar}; foco = id; ocultos = new Set();
    ctx.enter();
    document.body.classList.add('protocolOpen'); panel.hidden = false; render();
    const enfocado = ubicados.find(p => p.fila.id === id);
    encuadrar(enfocado ? [enfocado.u.caja] : ubicados.map(p => p.u.caja));
    if (id && !enfocado) {
      const anulado = anulados.find(p => p.id === id), sin = sinUbicar.find(s => s.fila.id === id);
      ctx.toast(anulado ? `El folio ${numeroProtocolo(anulado.folio)} está anulado: queda fuera del plano.` : sin ? `El folio ${numeroProtocolo(sin.fila.folio)} no tiene ejes ubicables: ${sin.motivo.toLowerCase()}.` : 'Ese folio no está en este piso.');
      if (sin) panel.querySelector('.protocolSinUbicar').open = true;
      panel.querySelector('li.activo')?.scrollIntoView({block: 'nearest'});
    } else panel.querySelector('[data-folio].activo')?.scrollIntoView({block: 'nearest'});
    dibujar();
    return true;
  }
  function cerrar() {
    if (!actual) return;
    actual = null; foco = null; panel.hidden = true; panel.replaceChildren();
    document.body.classList.remove('protocolOpen'); dibujar(); ctx.resize?.();
  }
  window.addEventListener('atlas-floor-home', cerrar);
  document.addEventListener('click', event => { if (actual && event.target.closest('button[data-module],[data-plan-type],#planSettingsOpen,#markingOpen')) cerrar(); }, true);
  return {mostrar, cerrar, activo: () => !!actual};
}
