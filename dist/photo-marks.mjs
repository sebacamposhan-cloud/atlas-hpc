// Marcas sobre las fotos de las observaciones: círculos, rectángulos, flechas y trazos a mano alzada para señalar dónde
// está lo observado. Se guardan como figuras (coordenadas 0–1) junto a la referencia de la foto y se dibujan encima con
// SVG: la foto original queda intacta y se muestra al lado de la marcada. Editor a pantalla completa y visor con zoom
// (rueda del mouse, pellizco o botones) y arrastre, sincronizado entre la original y la marcada.
import {TIPOS_MARCA, COLORES_MARCA, MAX_MARCAS} from './observaciones-model.mjs';

const NOMBRES_COLOR = {'#e3262f': 'Rojo', '#ffd400': 'Amarillo', '#2fd84a': 'Verde', '#ffffff': 'Blanco'};
const GROSORES = [['Fino', 5], ['Medio', 8], ['Grueso', 14]];
const r4 = v => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
const altoCaja = (ancho, alto) => Math.round(1000 * (alto || 3) / (ancho || 4));

// Figuras en un lienzo de 1000 de ancho: cada una con un contorno oscuro debajo para que se lea sobre cualquier fondo.
export function figurasSVG(marcas, H) {
  return (marcas || []).map(m => {
    const pts = m.p.map(([x, y]) => [x * 1000, y * H]), [a, b = a] = pts, g = m.g;
    let forma;
    if (m.t === 'circulo') forma = `<ellipse cx="${(a[0] + b[0]) / 2}" cy="${(a[1] + b[1]) / 2}" rx="${Math.abs(b[0] - a[0]) / 2}" ry="${Math.abs(b[1] - a[1]) / 2}"/>`;
    else if (m.t === 'rect') forma = `<rect x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(b[0] - a[0])}" height="${Math.abs(b[1] - a[1])}"/>`;
    else if (m.t === 'flecha') {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), largo = Math.max(18, g * 4), punta = s => [b[0] - largo * Math.cos(ang + s), b[1] - largo * Math.sin(ang + s)];
      forma = `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}M${punta(.45).join(' ')}L${b[0]} ${b[1]}L${punta(-.45).join(' ')}"/>`;
    } else forma = `<polyline points="${pts.map(q => q.join(',')).join(' ')}"/>`;
    return `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#000" stroke-opacity=".45" stroke-width="${g + 4}">${forma}</g><g stroke="${m.c}" stroke-width="${g}">${forma}</g></g>`;
  }).join('');
}
// Capa sobre una imagen: «meet» para object-fit: contain y «slice» para cover (miniaturas recortadas).
export const capaMarcas = (marcas, ancho, alto, ajuste = 'meet') => {
  if (!marcas?.length) return '';
  const H = altoCaja(ancho, alto);
  return `<svg class="phCapa" viewBox="0 0 1000 ${H}" preserveAspectRatio="xMidYMid ${ajuste}" aria-hidden="true">${figurasSVG(marcas, H)}</svg>`;
};

// Tamaño de la foto dentro de su caja, sin deformarla.
function encajar(marco, caja, ancho, alto) {
  const W = caja.clientWidth, H = caja.clientHeight, k = Math.min(W / ancho, H / alto), w = Math.round(ancho * k), h = Math.round(alto * k);
  marco.style.width = w + 'px'; marco.style.height = h + 'px';
  return {W, H, w, h};
}

// ---------- Editor de marcas ----------
// Devuelve las marcas nuevas (lista, posiblemente vacía) o null si se cancela.
export function editarMarcas({src, ancho, alto, marcas = [], titulo = 'Marcar dónde está la observación', esc = String}) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'phEditor'; d.setAttribute('aria-label', titulo);
    let lista = marcas.map(m => ({...m, p: m.p.map(q => [...q])})), herramienta = 'circulo', color = COLORES_MARCA[0], grosor = 8, actual = null, resultado = null;
    const H = altoCaja(ancho, alto);
    d.innerHTML = `<div class="phBarra"><b>${esc(titulo)}</b>
      <div class="phGrupo" role="group" aria-label="Figura">${Object.entries(TIPOS_MARCA).map(([t, n]) => `<button type="button" data-ph-t="${t}" aria-pressed="${t === herramienta}">${n}</button>`).join('')}</div>
      <div class="phGrupo" role="group" aria-label="Color">${COLORES_MARCA.map(c => `<button type="button" class="phColor" data-ph-c="${c}" aria-pressed="${c === color}" aria-label="${NOMBRES_COLOR[c]}" title="${NOMBRES_COLOR[c]}"><i style="background:${c}"></i></button>`).join('')}</div>
      <div class="phGrupo" role="group" aria-label="Grosor">${GROSORES.map(([n, g]) => `<button type="button" data-ph-g="${g}" aria-pressed="${g === grosor}">${n}</button>`).join('')}</div>
      <div class="phGrupo"><button type="button" data-ph-deshacer>Deshacer</button><button type="button" data-ph-limpiar>Borrar todo</button></div>
      <div class="phGrupo phFin"><button type="button" data-ph-cancelar>Cancelar</button><button type="button" class="primary" data-ph-guardar>Guardar marcas</button></div></div>
      <div class="phLienzo"><div class="phMarco"><img src="${src}" alt="Foto a marcar" draggable="false"><svg class="phCapa phDibujo" viewBox="0 0 1000 ${H}" preserveAspectRatio="none"></svg></div></div>
      <p class="phAyuda" role="status">Arrastra sobre la foto para dibujar. Ctrl+Z deshace.</p>`;
    document.body.append(d);
    const lienzo = d.querySelector('.phLienzo'), marco = d.querySelector('.phMarco'), svg = d.querySelector('.phDibujo'), ayuda = d.querySelector('.phAyuda');
    const ajustar = () => encajar(marco, lienzo, ancho, alto);
    const pintar = () => { svg.innerHTML = figurasSVG(actual ? [...lista, actual] : lista, H); ayuda.textContent = `${lista.length} de ${MAX_MARCAS} marcas. Arrastra sobre la foto para dibujar. Ctrl+Z deshace.`; };
    const punto = e => { const r = svg.getBoundingClientRect(); return [r4((e.clientX - r.left) / r.width), r4((e.clientY - r.top) / r.height)]; };
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0 || actual) return;
      if (lista.length >= MAX_MARCAS) { ayuda.textContent = `Máximo ${MAX_MARCAS} marcas por foto.`; return; }
      e.preventDefault(); try { svg.setPointerCapture(e.pointerId); } catch {} const p = punto(e);
      actual = {t: herramienta, c: color, g: grosor, p: [p, p]}; pintar();
    });
    svg.addEventListener('pointermove', e => {
      if (!actual) return; const p = punto(e);
      if (actual.t === 'trazo') { const u = actual.p.at(-1); if (Math.hypot(p[0] - u[0], p[1] - u[1]) > .004 && actual.p.length < 400) actual.p.push(p); }
      else actual.p[1] = p;
      pintar();
    });
    const soltar = () => {
      if (!actual) return; const [a, b] = [actual.p[0], actual.p.at(-1)];
      // Un toque sin arrastre no deja figura; el trazo necesita al menos dos puntos.
      if (actual.t === 'trazo' ? actual.p.length > 2 || Math.hypot(b[0] - a[0], b[1] - a[1]) > .01 : Math.hypot(b[0] - a[0], b[1] - a[1]) > .015) lista.push(actual);
      actual = null; pintar();
    };
    svg.addEventListener('pointerup', soltar); svg.addEventListener('pointercancel', soltar);
    const grupo = (sel, fijar) => d.querySelectorAll(sel).forEach(b => b.onclick = () => { fijar(b); b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    grupo('[data-ph-t]', b => { herramienta = b.dataset.phT; });
    grupo('[data-ph-c]', b => { color = b.dataset.phC; });
    grupo('[data-ph-g]', b => { grosor = +b.dataset.phG; });
    d.querySelector('[data-ph-deshacer]').onclick = () => { lista.pop(); pintar(); };
    d.querySelector('[data-ph-limpiar]').onclick = () => { if (!lista.length || confirm('¿Borrar todas las marcas de esta foto?')) { lista = []; pintar(); } };
    // Cierre propio (no depende del evento «close»): limpia, quita el diálogo y entrega el resultado una sola vez.
    let cerrado = false;
    const terminar = () => { if (cerrado) return; cerrado = true; removeEventListener('resize', ajustar); if (d.open) d.close(); d.remove(); resolve(resultado); };
    d.querySelector('[data-ph-cancelar]').onclick = terminar;
    d.querySelector('[data-ph-guardar]').onclick = () => { resultado = lista.map(m => ({t: m.t, c: m.c, g: m.g, p: m.p.map(q => [r4(q[0]), r4(q[1])])})); terminar(); };
    d.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); lista.pop(); pintar(); } });
    addEventListener('resize', ajustar);
    d.addEventListener('close', terminar);
    d.showModal();
    const img = d.querySelector('img');
    (img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })).then(() => { ajustar(); pintar(); });
    ajustar(); pintar();
  });
}

// ---------- Visor: original al lado de la marcada, con zoom sincronizado ----------
// alMarcar (opcional) muestra «Dibujar marcas» y recibe el control cuando el visor se cierra para editarlas.
export function verFoto({src, ancho, alto, marcas = [], titulo = 'Foto', alMarcar = null, esc = String}) {
  const d = document.createElement('dialog'); d.className = 'phVisor'; d.setAttribute('aria-label', titulo);
  const conMarcas = marcas?.length > 0, H = altoCaja(ancho, alto);
  const panel = (nombre, capa) => `<figure class="phPanel"><figcaption>${nombre}</figcaption><div class="phVista"><div class="phMarco"><img src="${src}" alt="${esc(titulo)} · ${nombre}" draggable="false">${capa}</div></div></figure>`;
  d.innerHTML = `<div class="phBarra"><b>${esc(titulo)}</b>
    <div class="phGrupo" role="group" aria-label="Zoom"><button type="button" data-ph-zoom="-1" aria-label="Alejar">−</button><span class="phNivel" aria-live="polite">100 %</span><button type="button" data-ph-zoom="1" aria-label="Acercar">+</button><button type="button" data-ph-ajustar>Ajustar</button></div>
    <div class="phGrupo phFin">${alMarcar ? `<button type="button" class="primary" data-ph-marcar>${conMarcas ? 'Editar marcas' : 'Dibujar marcas'}</button>` : ''}<button type="button" data-ph-cerrar>Cerrar</button></div></div>
    <div class="phPaneles${conMarcas ? ' phDoble' : ''}">${conMarcas ? panel('Original', '') + panel('Con marcas', `<svg class="phCapa" viewBox="0 0 1000 ${H}" preserveAspectRatio="none" aria-hidden="true">${figurasSVG(marcas, H)}</svg>`) : panel('Foto', '')}</div>
    <p class="phAyuda">Rueda del mouse o pellizco para acercar; arrastra para moverte; doble clic para ajustar.${conMarcas ? ' La original y la marcada se mueven juntas.' : ''}</p>`;
  document.body.append(d);
  const vistas = [...d.querySelectorAll('.phVista')], marcos = [...d.querySelectorAll('.phMarco')], nivel = d.querySelector('.phNivel');
  let z = 1, ox = 0, oy = 0, base = {W: 1, H: 1, w: 1, h: 1};
  // Sin zoom la foto queda centrada; con zoom no se sale de su caja.
  const limitar = () => {
    const w = base.w * z, h = base.h * z;
    ox = w <= base.W ? (base.W - w) / 2 : Math.min(0, Math.max(base.W - w, ox));
    oy = h <= base.H ? (base.H - h) / 2 : Math.min(0, Math.max(base.H - h, oy));
  };
  const aplicar = () => { limitar(); for (const m of marcos) m.style.transform = `translate(${ox}px, ${oy}px) scale(${z})`; nivel.textContent = Math.round(z * 100) + ' %'; };
  const ajustar = () => { for (const m of marcos) base = encajar(m, m.parentElement, ancho, alto); z = 1; aplicar(); };
  const zoom = (nuevo, px = base.W / 2, py = base.H / 2) => { nuevo = Math.min(8, Math.max(1, nuevo)); const cx = (px - ox) / z, cy = (py - oy) / z; z = nuevo; ox = px - cx * z; oy = py - cy * z; aplicar(); };
  const local = (e, v) => { const r = v.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const punteros = new Map(); let arrastre = null, pellizco = null;
  for (const v of vistas) {
    v.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = local(e, v); zoom(z * Math.exp(-e.deltaY * .0015), px, py); }, {passive: false});
    v.addEventListener('dblclick', e => { const [px, py] = local(e, v); if (z > 1) { z = 1; aplicar(); } else zoom(2.5, px, py); });
    v.addEventListener('pointerdown', e => { try { v.setPointerCapture(e.pointerId); } catch {} punteros.set(e.pointerId, local(e, v)); if (punteros.size === 1) arrastre = {x: e.clientX, y: e.clientY, ox, oy}; else if (punteros.size === 2) { const [a, b] = [...punteros.values()]; pellizco = {d: Math.hypot(a[0] - b[0], a[1] - b[1]), z}; arrastre = null; } });
    v.addEventListener('pointermove', e => {
      if (!punteros.has(e.pointerId)) return; punteros.set(e.pointerId, local(e, v));
      if (pellizco && punteros.size === 2) { const [a, b] = [...punteros.values()]; zoom(pellizco.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pellizco.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
      else if (arrastre) { ox = arrastre.ox + e.clientX - arrastre.x; oy = arrastre.oy + e.clientY - arrastre.y; aplicar(); }
    });
    const fin = e => { punteros.delete(e.pointerId); if (punteros.size < 2) pellizco = null; if (!punteros.size) arrastre = null; };
    v.addEventListener('pointerup', fin); v.addEventListener('pointercancel', fin);
  }
  d.querySelectorAll('[data-ph-zoom]').forEach(b => b.onclick = () => zoom(z * (b.dataset.phZoom === '1' ? 1.5 : 1 / 1.5)));
  d.querySelector('[data-ph-ajustar]').onclick = () => { z = 1; aplicar(); };
  let cerrado = false;
  const cerrar = (marcar = false) => { if (cerrado) return; cerrado = true; removeEventListener('resize', ajustar); if (d.open) d.close(); d.remove(); if (marcar) alMarcar(); };
  d.querySelector('[data-ph-cerrar]').onclick = () => cerrar();
  d.querySelector('[data-ph-marcar]')?.addEventListener('click', () => cerrar(true));
  addEventListener('resize', ajustar);
  d.addEventListener('close', () => cerrar());
  d.showModal();
  const img = d.querySelector('img');
  (img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })).then(ajustar);
  ajustar();
  d.querySelector('[data-ph-cerrar]').focus({preventScroll: true});
  return d;
}
