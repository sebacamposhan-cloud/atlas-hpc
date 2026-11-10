// Plano de puertas de un piso: cada puerta del plano de avance se dibuja en su lugar con el color de su estado y su número
// de vano (Sacyr y los subcontratos ubican los vanos por ese número). Tocar una puerta abre su ficha: modelo, llave, vano,
// ancho, código de partida, contratista (Teisa madera / Protego cortafuego y metálicas) y estado.
// Funciona solo, como un plano propio (tarjeta «Puertas» del módulo Plano, en consulta: lo que dice el plano), y con un
// Proyecto tipo Puertas abierto se marca el estado en terreno, se guarda y se sincroniza como cualquier proyecto.
// Datos: dist/<piso>/puertas.json (scripts/puertas/importar-dwg.mjs). Modelo: puertas-model.mjs.
import {datos} from './level.mjs';
import * as P from './puertas-model.mjs';
import {readMarkings, saveMarking} from './marking-store.mjs';
import {firmante, pedirSesion} from './firma.mjs';
import {loadVendor} from './web-store.mjs';

export function createPuertas(ctx) {
  const {esc} = ctx, svg = document.getElementById('svg');
  const capa = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  capa.id = 'puertasOverlay'; capa.setAttribute('pointer-events', 'none');
  (document.getElementById('protocolOverlay') || document.getElementById('markingOverlay') || svg.lastElementChild).after(capa);
  const panel = document.createElement('aside');
  panel.id = 'puertasPanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Puertas del piso');
  document.querySelector('main').append(panel);
  let catalogo, cargando = null, activo = false, proyecto = null, elegida = null, busqueda = '', contratista = '', ocultos = new Set(), cola = Promise.resolve(), guardando = 0;

  function cargar() {
    return cargando ||= fetch(datos('puertas.json')).then(r => r.ok ? r.json() : null).then(c => (catalogo = c ? P.validarCatalogo(c) : null)).catch(() => (catalogo = null));
  }
  const puertaDe = id => catalogo?.puertas.find(p => p.id === id) || null;
  const fecha = f => f ? String(f).slice(0, 10).split('-').reverse().join('-') : '';
  const visibles = () => P.filtrar(catalogo.puertas, {texto: busqueda, contratista, doc: proyecto, estados: new Set(P.ORDEN.filter(e => !ocultos.has(e)))});

  // ---------- Plano ----------
  function dibujar() {
    if (!activo || !catalogo) { capa.replaceChildren(); return; }
    // Lejos, puntos chicos sin número (no se tapan); cerca, el círculo con el número de vano, como en el plano de avance.
    const escala = svg.getScreenCTM()?.a || 1, detalle = escala >= 0.2, px = 1 / escala, r = (detalle ? 8 : 3.2) * px, lista = visibles();
    const marca = p => {
      const color = P.ESTADOS[P.estadoDe(p, proyecto)].color, sel = p.id === elegida;
      return `${sel ? `<circle cx="${p.x}" cy="${p.y}" r="${r * 1.9}" fill="none" stroke="#0f5499" stroke-width="${3 * px}"/>` : ''}<circle cx="${p.x}" cy="${p.y}" r="${p.vano && detalle ? r * 1.25 : r * .8}" fill="${color}" stroke="#fff" stroke-width="${2 * px}"/>${p.vano && detalle ? `<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="${(String(p.vano).length > 3 ? 7 : 9.5) * px}" font-weight="700" fill="#fff">${esc(p.vano)}</text>` : ''}${p.pletinas && detalle ? `<rect x="${p.x + r * .9}" y="${p.y - r * 1.6}" width="${r * .8}" height="${r * .8}" fill="${P.ESTADOS.pletinas.color}" stroke="#fff" stroke-width="${px}"/>` : ''}`;
    };
    // La elegida va arriba de todo.
    capa.innerHTML = lista.filter(p => p.id !== elegida && !p.fuera).map(marca).join('') + (elegida && lista.some(p => p.id === elegida) ? marca(puertaDe(elegida)) : '');
  }
  new MutationObserver(() => { if (activo) dibujar(); }).observe(svg, {attributes: true, attributeFilter: ['viewBox']});
  new ResizeObserver(() => { if (activo) dibujar(); }).observe(svg);
  // Toque en el plano (app.js): si cae sobre una puerta, se elige y el recinto no se abre.
  function tocar(punto) {
    if (!activo || !catalogo) return false;
    const px = 1 / (svg.getScreenCTM()?.a || 1), max = 18 * px;
    const cerca = visibles().filter(p => !p.fuera).map(p => ({p, d: Math.hypot(p.x - punto.x, p.y - punto.y)})).filter(x => x.d <= max).sort((a, b) => a.d - b.d)[0];
    if (!cerca) return false;
    elegir(cerca.p.id, false); return true;
  }
  function encuadrar(lista) {
    if (!lista.length) return;
    const xs = lista.map(p => p.x), ys = lista.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    const w = Math.max(x1 - x0, 400), h = Math.max(y1 - y0, 400), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    ctx.setView([cx - w * .6, cy - h * .6, w * 1.2, h * 1.2]);
  }

  // ---------- Panel ----------
  const chip = estado => `<span class="puertaChip" style="--c:${P.ESTADOS[estado].color}">${esc(P.ESTADOS[estado].nombre)}</span>`;
  function ficha(p) {
    const estado = P.estadoDe(p, proyecto), cambio = P.cambioDe(p, proyecto), dato = (n, v) => v ? `<div><dt>${n}</dt><dd>${esc(v)}</dd></div>` : '';
    return `<section class="puertaFicha" aria-label="Puerta ${esc(p.llave || p.id)}">
      <p class="puertaTitulo"><b>${esc(p.modelo || 'Modelo sin rótulo')}</b>${p.vano ? `<span class="puertaVano">Vano ${esc(p.vano)}</span>` : ''}</p>
      <p class="puertaEstado">${chip(estado)}${cambio ? `<small>Marcado el ${esc(fecha(cambio.at))} por ${esc(cambio.autor)}</small>` : '<small>Según el plano de avance</small>'}</p>
      <dl class="puertaDatos">${dato('Llave', p.llave)}${dato('Modelo', p.modelo)}${dato('Ancho', p.ancho)}${dato('Código de partida', p.partida)}${dato('Contratista', p.contratista ? P.CONTRATISTAS[p.contratista] : 'Sin contratista en el plano')}${dato('En el plano', P.ESTADOS[p.estado].nombre + (p.pletinas ? ' · con pletinas' : ''))}</dl>
      ${p.revisar?.length ? `<p class="puertaRevisar"><b>Revisar:</b> ${p.revisar.map(esc).join('; ')}.</p>` : ''}
      ${proyecto ? `<div class="puertaOpciones" role="group" aria-label="Estado de la puerta">${P.opcionesDe(p).map(e => `<button type="button" data-puerta-estado="${e}" aria-pressed="${estado === e}" style="--c:${P.ESTADOS[e].color}">${esc(P.ESTADOS[e].nombre)}</button>`).join('')}</div>`
        : '<p class="puertaNota">Para marcar el estado en terreno, abre o crea un proyecto de puertas.</p>'}
      <p class="puertaNota">Descripción del modelo: pendiente de la ficha de modelos de puerta.</p>
    </section>`;
  }
  function pintar() {
    if (!activo) return;
    if (!catalogo) { panel.innerHTML = `<div class="puertasCabeza"><h2>Puertas</h2><button type="button" data-puertas-cerrar aria-label="Cerrar">×</button></div><p class="puertaNota">Este piso aún no tiene plano de avance de puertas. Cuando llegue su DWG se importa con scripts/puertas/importar-dwg.mjs.</p>`; panel.querySelector('[data-puertas-cerrar]').onclick = cerrar; return; }
    const lista = visibles().sort(P.ordenLista), n = P.contar(catalogo.puertas, proyecto), p = elegida && puertaDe(elegida);
    const filas = lista.slice(0, 120).map(q => `<li><button type="button" data-puerta="${esc(q.id)}" aria-current="${q.id === elegida}"><i style="background:${P.ESTADOS[P.estadoDe(q, proyecto)].color}"></i><span><b>${q.vano ? 'Vano ' + esc(q.vano) + ' · ' : ''}${esc(q.modelo || 'Sin modelo')}</b><small>${esc(q.llave || 'Sin llave')}${q.contratista ? ' · ' + esc(q.contratista) : ''} · ${esc(P.ESTADOS[P.estadoDe(q, proyecto)].nombre)}</small></span></button></li>`).join('');
    panel.innerHTML = `<div class="puertasCabeza"><h2>Puertas · ${esc(ctx.levelName)}</h2><button type="button" data-puertas-cerrar aria-label="Cerrar">×</button></div>
      <p class="puertaFuente">Plano de avance «${esc(catalogo.fuente.archivo)}» al ${esc(fecha(catalogo.fuente.modificado))} · ${catalogo.puertas.length} puertas</p>
      <div class="puertaProyecto">${proyecto ? `<p><b>Proyecto: ${esc(proyecto.name)}</b><small>${guardando ? 'Guardando…' : 'Los cambios se guardan en este equipo y se sincronizan.'}</small></p><button type="button" data-puertas-excel>Excel</button><button type="button" data-puertas-consulta>Solo consulta</button>`
        : `<p><b>Consulta del plano</b><small>Estados tal como vienen en el plano de avance.</small></p><button type="button" class="primary" data-puertas-proyecto>Marcar en terreno</button><button type="button" data-puertas-excel>Excel</button>`}</div>
      <div class="scrollPuertas">
      ${p ? ficha(p) : ''}
      <div class="puertaLeyenda">${P.ORDEN.filter(e => n[e]).map(e => `<label><input type="checkbox" data-puertas-estado="${e}" ${ocultos.has(e) ? '' : 'checked'}><i style="background:${P.ESTADOS[e].color}"></i>${esc(P.ESTADOS[e].nombre)} <b>${n[e]}</b></label>`).join('')}</div>
      <div class="puertaContratistas" role="group" aria-label="Contratista">${[['', 'Todas'], ['Teisa', 'Teisa'], ['Protego', 'Protego']].map(([v, t]) => `<button type="button" data-puertas-contratista="${v}" aria-pressed="${contratista === v}">${t}</button>`).join('')}</div>
      <input type="search" class="puertasBuscar" data-puertas-buscar placeholder="Buscar vano, llave o modelo…" value="${esc(busqueda)}" autocomplete="off" aria-label="Buscar puertas">
      <p class="puertaNota">${lista.length} ${lista.length === 1 ? 'puerta' : 'puertas'}${lista.length > 120 ? ' · se muestran las primeras 120: busca para acotar' : ''}</p>
      <ul class="puertasLista">${filas}</ul></div>`;
    panel.querySelector('[data-puertas-cerrar]').onclick = cerrar;
    panel.querySelector('[data-puertas-proyecto]')?.addEventListener('click', proyectoDelPiso);
    panel.querySelector('[data-puertas-consulta]')?.addEventListener('click', () => { proyecto = null; pintar(); dibujar(); });
    panel.querySelector('[data-puertas-excel]').onclick = excel;
    panel.querySelectorAll('[data-puertas-estado]').forEach(i => i.onchange = () => { if (i.checked) ocultos.delete(i.dataset.puertasEstado); else ocultos.add(i.dataset.puertasEstado); pintar(); dibujar(); });
    panel.querySelectorAll('[data-puertas-contratista]').forEach(b => b.onclick = () => { contratista = b.dataset.puertasContratista; pintar(); dibujar(); });
    const buscar = panel.querySelector('[data-puertas-buscar]');
    buscar.oninput = () => { busqueda = buscar.value; const pos = buscar.selectionStart; pintar(); dibujar(); const b = panel.querySelector('[data-puertas-buscar]'); b.focus(); b.setSelectionRange(pos, pos); };
    panel.querySelectorAll('[data-puerta]').forEach(b => b.onclick = () => elegir(b.dataset.puerta, true));
    panel.querySelectorAll('[data-puerta-estado]').forEach(b => b.onclick = () => marcar(b.dataset.puertaEstado));
  }
  function elegir(id, centrar) {
    elegida = id; pintar(); dibujar();
    const p = puertaDe(id);
    if (centrar && p && !p.fuera) ctx.setView([p.x - 260, p.y - 200, 520, 400]);
    panel.querySelector('.scrollPuertas')?.scrollTo({top: 0});
  }

  // ---------- Proyecto ----------
  async function proyectosDelPiso() { return (await readMarkings()).filter(d => P.esPuertas(d) && d.level === ctx.level && !d.eliminado).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  // «Marcar en terreno»: abre el proyecto de puertas del piso o, si no hay, crea uno con lo que dice el plano.
  async function proyectoDelPiso() {
    const existente = (await proyectosDelPiso())[0];
    if (existente) { proyecto = existente; pintar(); dibujar(); return; }
    await crearProyecto();
  }
  async function crearProyecto() {
    await cargar();
    if (!catalogo) { ctx.toast('Este piso aún no tiene plano de avance de puertas.'); return; }
    const autor = firmante();
    if (!autor) { pedirSesion('Inicia sesión en Atlas para crear el proyecto de puertas.'); return; }
    try {
      const doc = P.nuevoProyectoPuertas({name: 'Puertas · ' + ctx.levelName, author: autor, purpose: 'Avance de instalación de puertas (Teisa y Protego) sobre el plano «' + catalogo.fuente.archivo + '».'}, catalogo, ctx.level, crypto.randomUUID());
      await saveMarking(doc, 0);
      proyecto = doc; if (!activo) await abrir(); else { pintar(); dibujar(); }
      ctx.toast('Proyecto de puertas creado. Toca una puerta para marcar su estado.');
    } catch (e) { ctx.toast(e.message); }
  }
  function marcar(estado) {
    const p = puertaDe(elegida); if (!p || !proyecto) return;
    const autor = firmante();
    if (!autor) { pedirSesion('Inicia sesión en Atlas para marcar puertas.'); return; }
    guardando++; pintar();
    cola = cola.then(async () => {
      try {
        const siguiente = {...P.marcarPuerta(proyecto, p, estado, {autor}), version: proyecto.version + 1, updatedAt: new Date().toISOString()};
        await saveMarking(siguiente, proyecto.version);
        proyecto = siguiente;
      } catch (e) { ctx.toast('Cambio no guardado. ' + e.message); }
      finally { guardando--; pintar(); dibujar(); }
    });
  }
  async function excel() {
    try {
      await loadVendor('xlsx'); const X = window.XLSX;
      const ws = X.utils.aoa_to_sheet([P.ENCABEZADOS, ...P.filasExcel(catalogo, proyecto)]), wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, 'Puertas');
      ctx.download(new Blob([X.write(wb, {bookType: 'xlsx', type: 'array'})], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), (proyecto?.name || 'Puertas ' + ctx.levelName).replace(/[\\/:*?"<>|]+/g, '-') + '.xlsx');
    } catch (e) { ctx.toast(e.message); }
  }
  // Si la nube trae otra versión del proyecto abierto, se muestra esa.
  addEventListener('atlas-markings-changed', async e => {
    if (!proyecto || e.detail?.origen !== 'nube' || (e.detail.id && e.detail.id !== proyecto.id)) return;
    const nuevo = (await readMarkings()).find(d => d.id === proyecto.id);
    if (nuevo && !nuevo.eliminado) { proyecto = nuevo; pintar(); dibujar(); }
  });
  addEventListener('atlas-puertas-nuevo', () => crearProyecto());
  addEventListener('atlas-puertas-abrir', async e => { const doc = (await readMarkings()).find(d => d.id === e.detail?.id); if (doc) { proyecto = doc; await abrir(); } });

  async function abrir() {
    await cargar();
    ctx.enter();
    activo = true; panel.hidden = false; document.body.classList.add('puertasOpen');
    pintar(); dibujar();
    if (catalogo) encuadrar(visibles().filter(p => !p.fuera));
    ctx.resize?.();
  }
  function cerrar() {
    if (!activo) return;
    activo = false; elegida = null; panel.hidden = true; panel.replaceChildren();
    document.body.classList.remove('puertasOpen'); dibujar(); ctx.resize?.();
  }
  addEventListener('atlas-floor-home', cerrar);
  return {abrir, cerrar, tocar, activo: () => activo, hayPlano: async () => !!(await cargar())};
}
