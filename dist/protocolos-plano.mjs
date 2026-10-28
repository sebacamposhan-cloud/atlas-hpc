// Protocolos de la matriz en el plano: cada folio se dibuja exactamente sobre sus ejes con su número (001, 002…),
// en cualquier estado: zona entre ejes, tramo sobre un eje o pilar en un cruce. Todos los números se escriben; si
// chocan, se corren junto a su figura con una línea guía. Los anulados (NULO) y los que no traen ejes ubicables no se
// dibujan: van en el panel de la derecha citando lo que dice la matriz.
// La grilla de ejes de cada piso sale del DWG (dist/<piso>/ejes.json, scripts/ejes/generar.mjs).
import {nivel, datos} from './level.mjs';
import {crearGrilla, ubicarEjes, numeroProtocolo, textoMedidas, motivoSinUbicar} from './protocol-ejes.mjs';
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
  // Zona: polígono entre los ejes. Tramo: línea sobre el eje con topes en los ejes que lo cortan. Pilar: círculo en el cruce.
  function figura({u, color, enFoco}, px) {
    if (u.poligono) return `<polygon points="${u.poligono.map(p => p.join(',')).join(' ')}" fill="${color}" fill-opacity="${enFoco ? .32 : .13}" stroke="${color}" stroke-width="${enFoco ? 3.5 : 1.8}" vector-effect="non-scaling-stroke"/>`;
    if (u.linea) {
      const [p, q] = u.linea, largo = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n = [-(q[1] - p[1]) / largo * 7 * px, (q[0] - p[0]) / largo * 7 * px];
      const tope = c => `<line x1="${c[0] - n[0]}" y1="${c[1] - n[1]}" x2="${c[0] + n[0]}" y2="${c[1] + n[1]}" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${color}" stroke-width="${enFoco ? 6 : 4}" stroke-opacity=".85" vector-effect="non-scaling-stroke"/>${tope(p)}${tope(q)}`;
    }
    const [x, y] = u.punto;
    return `<circle cx="${x}" cy="${y}" r="${(enFoco ? 10 : 7) * px}" fill="${color}" fill-opacity=".3" stroke="${color}" stroke-width="${enFoco ? 3 : 2}" vector-effect="non-scaling-stroke"/><circle cx="${x}" cy="${y}" r="${1.8 * px}" fill="${color}"/>`;
  }
  // Busca un lugar libre para el número: dentro de la figura y, si no cabe o choca, alrededor en anillos crecientes.
  function etiqueta({u, color, enFoco, texto}, px, ocupadas) {
    const t = enFoco ? 15 : 12, w = (texto.length * t * .62 + 8) * px, h = (t + 5) * px, sep = 6 * px, [bx, by, bw, bh] = u.caja, [cx, cy] = u.centro;
    const candidatos = [];
    if (u.tipo !== 'punto') { candidatos.push([cx, cy]); for (let k = 1; k <= 3 && (2 * k + 1) * h < bh; k++) candidatos.push([cx, cy - k * h], [cx, cy + k * h]); }
    for (let anillo = 0; anillo < 5; anillo++) {
      const d = anillo * (h + sep);
      candidatos.push([bx + bw + sep + w / 2 + d, cy], [cx, by - sep - h / 2 - d], [bx - sep - w / 2 - d, cy], [cx, by + bh + sep + h / 2 + d],
        [bx + bw + sep + w / 2 + d, by - sep - h / 2 - d], [bx - sep - w / 2 - d, by + bh + sep + h / 2 + d]);
    }
    const rect = ([x, y]) => [x - w / 2, y - h / 2, w, h], libre = r => !ocupadas.some(o => r[0] < o[0] + o[2] && o[0] < r[0] + r[2] && r[1] < o[1] + o[3] && o[1] < r[1] + r[3]);
    const lugar = candidatos.find(c => libre(rect(c))) || candidatos[0];
    ocupadas.push(rect(lugar));
    const dentro = u.tipo !== 'punto' && lugar[0] >= bx && lugar[0] <= bx + bw && lugar[1] >= by && lugar[1] <= by + bh;
    const cercano = [Math.min(Math.max(lugar[0], bx), bx + bw), Math.min(Math.max(lugar[1], by), by + bh)];
    return (dentro ? '' : `<line x1="${lugar[0]}" y1="${lugar[1]}" x2="${cercano[0]}" y2="${cercano[1]}" stroke="${color}" stroke-width="1" stroke-opacity=".75" vector-effect="non-scaling-stroke"/>`)
      + `<text x="${lugar[0]}" y="${lugar[1]}" text-anchor="middle" dominant-baseline="central" font-size="${t * px}" font-weight="700" fill="${color}" stroke="white" stroke-width="${3.5 * px}" paint-order="stroke">${esc(texto)}</text>`;
  }
  function dibujar() {
    if (!actual) { capa.replaceChildren(); return; }
    const px = 1 / (svg.getScreenCTM()?.a || 1), vista = svg.viewBox.baseVal, grupos = new Map();
    // Varios folios con la misma figura comparten trazo y se listan sus números juntos.
    for (const p of visibles()) {
      const clave = p.u.tipo + ':' + (p.u.poligono || p.u.linea || [p.u.punto]).map(q => q.map(Math.round).join(',')).join(';');
      if (!grupos.has(clave)) grupos.set(clave, {u: p.u, items: []});
      grupos.get(clave).items.push(p);
    }
    const lista = [...grupos.values()].map(g => {
      const estado = ORDEN_ESTADOS.find(e => g.items.some(p => p.estado === e)) || g.items[0].estado, numeros = g.items.map(p => p.numero);
      return {...g, color: colorDe(estado), enFoco: g.items.some(p => p.fila.id === foco), texto: (g.u.aproximado ? '≈ ' : '') + (numeros.length > 4 ? numeros.slice(0, 3).join(' · ') + ' +' + (numeros.length - 3) : numeros.join(' · '))};
    });
    const area = g => g.u.caja[2] * g.u.caja[3], margen = 60 * px;
    const enVista = ({u: {caja: c}}) => c[0] <= vista.x + vista.width + margen && c[0] + c[2] >= vista.x - margen && c[1] <= vista.y + vista.height + margen && c[1] + c[3] >= vista.y - margen;
    // Primero el elegido y las figuras chicas, que necesitan su número al lado; las zonas grandes tienen más lugar.
    const ocupadas = [], etiquetas = lista.filter(enVista).sort((a, b) => (b.enFoco - a.enFoco) || area(a) - area(b)).map(g => etiqueta(g, px, ocupadas)).join('');
    capa.innerHTML = [...lista].sort((a, b) => area(b) - area(a)).map(g => figura(g, px)).join('') + etiquetas;
  }
  new MutationObserver(dibujar).observe(svg, {attributes: true, attributeFilter: ['viewBox']});
  new ResizeObserver(dibujar).observe(svg);

  function encuadrar(cajas) {
    if (!cajas.length) return;
    const x0 = Math.min(...cajas.map(c => c[0])), y0 = Math.min(...cajas.map(c => c[1])), x1 = Math.max(...cajas.map(c => c[0] + c[2])), y1 = Math.max(...cajas.map(c => c[1] + c[3]));
    const w = Math.max(x1 - x0, 500), h = Math.max(y1 - y0, 500), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    ctx.setView([cx - w * .65, cy - h * .65, w * 1.3, h * 1.3]);
  }
  // Lo que dice la matriz, tal cual, para poder comprobarlo.
  const vacio = v => !String(v ?? '').trim() || String(v).trim() === 'null';
  const cita = texto => vacio(texto) ? '(celda vacía)' : '«' + esc(String(texto).trim()) + '»';
  const quien = f => esc([f.element, f.receiver].filter(v => !vacio(v)).join(' · ') || 'Sin elemento documentado');
  function render() {
    const {tipo, ubicados, anulados, sinUbicar} = actual, cuenta = estado => ubicados.filter(p => p.estado === estado).length;
    panel.innerHTML = `<div class="protocolHead"><div><small>Protocolo en el plano · ${esc(nivel.nombre)}</small><h2>${esc(tipo.code)}</h2><p>${esc(tipo.name)}</p></div><button data-cerrar aria-label="Cerrar">×</button></div>
      <p class="protocolResumen">${ubicados.length} en el plano · ${anulados.length} anulados · ${sinUbicar.length} sin ubicación</p>
      <div class="protocolLeyenda">${ORDEN_ESTADOS.filter(cuenta).map(e => `<label><input type="checkbox" data-estado="${esc(e)}" ${ocultos.has(e) ? '' : 'checked'}><i style="background:${colorDe(e)}"></i>${esc(stateLabels[e] || e)} <b>${cuenta(e)}</b></label>`).join('')}</div>
      <div class="protocolScroll">
        <section class="protocolAnulados"><h3>Anulados · fuera del plano</h3>${anulados.length ? `<ul>${anulados.map(f => `<li class="${f.id === foco ? 'activo' : ''}"><b>${esc(numeroProtocolo(f.folio))}</b><span>EJES: ${cita(f.axes)}</span><small>${quien(f)}</small></li>`).join('')}</ul>` : '<p>Este protocolo no tiene folios anulados en el piso.</p>'}</section>
        ${sinUbicar.length ? `<details class="protocolSinUbicar" open><summary>Sin ubicación en el plano (${sinUbicar.length})</summary><ul>${sinUbicar.map(s => `<li class="${s.fila.id === foco ? 'activo' : ''}"><b>${esc(numeroProtocolo(s.fila.folio))}</b><span>EJES: ${cita(s.fila.axes)}</span><em>${esc(s.motivo)}</em><small>${quien(s.fila)}</small></li>`).join('')}</ul></details>` : ''}
        <h3>En el plano (${ubicados.length})</h3><ul class="protocolLista">${ubicados.map(p => `<li><button data-folio="${esc(p.fila.id)}" class="${p.fila.id === foco ? 'activo' : ''}" ${ocultos.has(p.estado) ? 'disabled' : ''}><i style="background:${colorDe(p.estado)}"></i><b>${esc(p.numero)}</b><span>${esc(p.u.etiqueta)} · ${esc(textoMedidas(p.u))}</span><small>EJES: ${cita(p.fila.axes)}${p.u.ignorado ? ' · se ignoró «' + esc(p.u.ignorado) + '»' : ''}${p.u.aproximados.length ? ' · ≈ ' + esc(p.u.aproximados.map(a => a.id + ' → ' + a.base).join(', ')) : ''}</small><small>${quien(p.fila)} · ${esc(stateLabels[p.estado] || p.estado)}</small></button></li>`).join('') || '<li><p>Ningún folio con ejes ubicables.</p></li>'}</ul>
        <p class="protocolNota">Se dibuja exactamente entre los ejes que indica el protocolo: zona entre ejes, tramo sobre un eje o pilar en un cruce. Las medidas salen de la grilla del DWG (vano de 8,2 m). ≈ marca un eje que no está en la grilla y se aproximó a su base (A12B → A12). La matriz no se modifica.</p>
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

  // filas: registros del protocolo en este piso (todos los estados); foco: id de un folio para centrarlo.
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
      else sinUbicar.push({fila: f, motivo: motivoSinUbicar(f.axes, u)});
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
      ctx.toast(anulado ? `El folio ${numeroProtocolo(anulado.folio)} está anulado: queda fuera del plano.` : sin ? `El folio ${numeroProtocolo(sin.fila.folio)} no se ubica. ${sin.motivo}` : 'Ese folio no está en este piso.');
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
