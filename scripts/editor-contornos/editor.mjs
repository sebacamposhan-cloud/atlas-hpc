// Editor de contornos: herramienta interna para corregir a mano los contornos de los recintos sobre las líneas del DWG.
// Pinzamientos como las polilíneas de AutoCAD, enganche (OSNAP), orto, dibujar y partir. Guarda dist/<piso>/contornos.json
// a través de servidor.mjs; la app aplica ese archivo con geometry-authority.mjs. Ver LEEME.md.
import {decodeRuntime} from '/repo/dist/runtime-loader.mjs';
import {resolveFootprints} from '/repo/dist/geometry-authority.mjs';
import {aMetros, aUnidades, areaM2, areaAnillo, areaDeclarada, enPartes, enAnillo, dist, limpiar, errorAnillo, errorPartes, simplificar, crearIndice, agregarTramo, tramosCerca, enganchar, orto, partir} from './geometria.mjs';
import {NIVELES, vacio, redondear, posicionPlano} from './archivo.mjs';

const $ = id => document.getElementById(id);
const canvas = $('plano'), g = canvas.getContext('2d');
const GRIP = 7, APERTURA = 12, TOLERANCIA_SIMPLIFICAR = aUnidades(.015); // px, px, unidades (1,5 cm)
const MODOS = {editar: 'EDITAR', dibujar: 'DIBUJAR', partir: 'PARTIR'};
const ETIQUETA = {cor: 'Corregido', aux: 'Auxiliar', par: 'Parcial', dwg: 'DWG', sin: 'Sin contorno'};
const COLOR = {cor: '#1a8f4c', aux: '#d98200', par: '#c2372f', dwg: '#4a6a85', sin: '#8a949c'};
const NOMBRE_SNAP = {extremo: 'extremo', medio: 'punto medio', interseccion: 'intersección', perpendicular: 'perpendicular', cercano: 'cercano', 'orto-cruce': 'orto ∩ muro', 'orto-extremo': 'orto · alineado', orto: 'orto'};

let nivel = null, runtime = null, rooms = [], porId = new Map(), aliases = new Map(), base = new Map(), fp = new Map(), cajas = new Map(), corr = new Map();
let indiceDwg = null, indiceRec = null, visibles = [];
let sel = null, modo = 'editar', osnap = true, ortoFijo = false, shift = false, espacio = false, verLineas = true;
let vista = {x: 0, y: 0, s: 1}; // s: píxeles de pantalla por unidad del plano
let deshacer = [], rehacer = [], sucio = false, firmaGuardada = '', puntos = [], cursor = null, snap = null, arrastre = null, sobre = null;
const firma = () => JSON.stringify([...corr.values()].sort((a, b) => a.id.localeCompare(b.id))); // «sin guardar» compara con lo último guardado
let dpr = 1, W = 0, H = 0, pendiente = false;
const imagenes = new Map();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = v => v.toFixed(2).replace('.', ','), m2 = v => v.toLocaleString('es-CL', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const signo = d => (d > 0 ? '+' : '') + d.toFixed(1).replace('.', ',') + ' %';
const aPantalla = p => [(p[0] - vista.x) * vista.s, (p[1] - vista.y) * vista.s];
const aPlano = (sx, sy) => [sx / vista.s + vista.x, sy / vista.s + vista.y];
const clonar = parts => parts.map(p => ({polygon: p.polygon.map(q => [q[0], q[1]]), holes: p.holes.map(h => h.map(q => [q[0], q[1]]))}));
const partesDe = id => clonar(corr.get(id)?.parts || fp.get(id)?.rings || []);
const anillo = (parts, pi, ai) => ai === 0 ? parts[pi].polygon : parts[pi].holes[ai - 1];
const usarOrto = () => ortoFijo !== shift; // Shift invierte el orto mientras se mantiene
const escribiendo = () => ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
let temporizador;
function avisar(texto, ms = 3500) { const a = $('aviso'); a.textContent = texto; a.classList.add('visible'); clearTimeout(temporizador); temporizador = setTimeout(() => a.classList.remove('visible'), ms); }
function caja(rings) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of rings) for (const q of p.polygon) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } return [x0, y0, x1, y1]; }

// ---------- Datos del piso ----------
async function json(url, opcional) { const r = await fetch(url); if (!r.ok) { if (opcional) return null; throw Error('No se pudo leer ' + url); } return r.json(); }
// Recintos únicos del piso, con los mismos alias que app.js (las láminas del −1 se solapan y repiten recintos).
function prepararRecintos(data, atlas) {
  const manual = r => r.version > 1 && r.geometry_method === 'Edición manual en navegador', ubicados = new Map();
  aliases = new Map();
  const orden = [...data.rooms].sort((a, b) => Number(manual(b)) - Number(manual(a)) || (b.status === 'Validado') - (a.status === 'Validado') || Number(b.has_polygon || !!b.polygon) - Number(a.has_polygon || !!a.polygon));
  for (const r of orden) { const w = posicionPlano(r, atlas), k = r.code + '|' + r.name, cand = ubicados.get(k) || [], igual = cand.find(v => dist(v.p, w) < 5); if (igual) aliases.set(r.id, igual.id); else { cand.push({id: r.id, p: w}); ubicados.set(k, cand); } }
  const [bx, by, bw, bh] = atlas.scope?.bounds || [-Infinity, -Infinity, Infinity, Infinity], todos = new Map(data.rooms.map(r => [r.id, r])), vistos = new Set();
  rooms = data.rooms.filter(r => { const p = posicionPlano(r, atlas); return p[0] >= bx && p[0] <= bx + bw && p[1] >= by && p[1] <= by + bh; })
    .map(r => todos.get(aliases.get(r.id) || r.id)).filter(r => r && !vistos.has(r.id) && vistos.add(r.id));
  porId = new Map(rooms.map(r => [r.id, r]));
}
async function cargar(id) {
  if (sucio && !confirm('Hay correcciones sin guardar en ' + NIVELES[nivel].nombre + '. ¿Descartarlas?')) { $('nivel').value = nivel; return; }
  $('cargando').hidden = false; $('cargando').textContent = 'Cargando ' + NIVELES[id].nombre + '…';
  try {
    const n = NIVELES[id];
    runtime = decodeRuntime(await json('/repo/dist/' + n.datos + 'runtime.json'));
    const archivo = await json('/repo/dist/' + n.datos + 'contornos.json', true) || vacio(id);
    nivel = id; history.replaceState(null, '', '?nivel=' + encodeURIComponent(id));
    prepararRecintos(runtime.data, runtime.atlas);
    corr = new Map(archivo.recintos.map(c => [c.id, c]));
    base = resolveFootprints(runtime.atlas, rooms, aliases, runtime.selection, []);
    sel = null; puntos = []; deshacer = []; rehacer = []; sucio = false; firmaGuardada = firma(); imagenes.clear();
    recalcular();
    indiceDwg = crearIndice(48);
    const marco = await json('/repo/data/' + n.dwg + '/marco.json', true), barreras = marco && await json('/repo/data/' + n.dwg + '/barreras.json', true);
    if (barreras) { const E = marco.escala, X = x => (x - marco.ox) * E, Y = y => (marco.oy - y) * E; for (const [ax, ay, bx, by] of barreras) agregarTramo(indiceDwg, [X(ax), Y(ay)], [X(bx), Y(by)]); }
    else avisar('Este equipo no tiene las líneas del DWG del piso (data/' + n.dwg + '/barreras.json): el enganche usa solo los contornos de los recintos.', 8000);
    encuadrar([runtime.map.origin[0], runtime.map.origin[1], runtime.map.origin[0] + runtime.map.width, runtime.map.origin[1] + runtime.map.height]);
    lista(); ficha(); botones();
  } catch (e) { avisar(e.message, 8000); } finally { $('cargando').hidden = true; dibujar(); }
}
// Contornos vigentes (originales + correcciones), sus cajas y el índice de tramos de los demás recintos para enganchar.
function recalcular() {
  fp = resolveFootprints(runtime.atlas, rooms, aliases, runtime.selection, [...corr.values()]);
  cajas = new Map([...fp].map(([id, e]) => [id, caja(e.rings)]));
  indiceRec = crearIndice(48);
  for (const [id, e] of fp) if (id !== sel) for (const p of e.rings) for (const a of [p.polygon, ...p.holes]) for (let i = 0; i < a.length; i++) agregarTramo(indiceRec, a[i], a[(i + 1) % a.length], 'recinto');
}
function tipoDe(id) { const r = porId.get(id), b = base.get(id); return corr.has(id) ? 'cor' : !b ? 'sin' : b.quality === 'auxiliary_pending' ? 'aux' : /parcial/i.test(r?.geometry_method || '') ? 'par' : 'dwg'; }
function estado(r) { const area = areaM2(fp.get(r.id)?.rings || []), pma = areaDeclarada(r.declared_area); return {area, pma, dif: pma ? (area - pma) / pma * 100 : null, tipo: tipoDe(r.id)}; }
const origenDe = id => { const r = porId.get(id), b = base.get(id); return !b ? 'Sin contorno' : b.quality === 'auxiliary_pending' ? 'Superficie auxiliar de selección' : r.geometry_method || b.method; };

// ---------- Lista y ficha ----------
function lista() {
  const f = $('filtro').value, q = normal($('buscar').value);
  const filas = rooms.map(r => ({r, e: estado(r)})).filter(({r, e}) => (!q || normal(r.code + ' ' + r.name).includes(q)) &&
    (f === 'todos' || (f === 'corregidos' ? e.tipo === 'cor' : ['aux', 'par', 'sin'].includes(e.tipo) || (e.dif != null && Math.abs(e.dif) > 15))))
    .sort((a, b) => a.r.code.localeCompare(b.r.code, 'es', {numeric: true}));
  visibles = filas.map(x => x.r.id);
  $('cuenta').textContent = filas.length + ' de ' + rooms.length;
  $('lista').innerHTML = filas.map(({r, e}) => `<button data-id="${esc(r.id)}" class="${r.id === sel ? 'activo' : ''}" role="listitem"><b>${esc(r.code)}</b><em style="color:${e.dif != null && Math.abs(e.dif) > 15 ? 'var(--bad)' : 'var(--muted)'}">${e.dif == null ? '' : signo(e.dif)}</em><span><i class="tag ${e.tipo}">${ETIQUETA[e.tipo]}</i>${esc(r.name)}</span></button>`).join('');
  $('lista').querySelector('.activo')?.scrollIntoView({block: 'nearest'});
}
function ficha() {
  const r = porId.get(sel);
  if (!r) { $('ficha').innerHTML = '<p style="color:var(--muted)">Elige un recinto en la lista o haz clic sobre él en el plano.</p>'; return; }
  const e = estado(r), parts = partesDe(r.id), c = corr.get(r.id), dentro = enPartes(posicionPlano(r, runtime.atlas), parts);
  const vertices = parts.reduce((s, p) => s + p.polygon.length + p.holes.reduce((h, x) => h + x.length, 0), 0);
  $('ficha').innerHTML = `<h2>${esc(r.code)}</h2><p>${esc(r.name)}</p><p><i class="tag ${e.tipo}">${ETIQUETA[e.tipo]}</i>${esc(c ? 'Antes: ' + c.antes : origenDe(r.id))}</p>` +
    `<p>Área <b>${m2(e.area)} m²</b>${e.pma ? ` · PMA ${m2(e.pma)} m² (${signo(e.dif)})` : ' · sin superficie en el PMA'}</p><p>${parts.length} parte${parts.length === 1 ? '' : 's'} · ${vertices} vértices</p>` +
    (dentro || c?.rotuloFuera ? '' : '<p class="aviso">El rótulo del recinto (✚) quedó fuera del contorno.</p>') +
    (c ? `<p>Corregido${c.autor ? ' por ' + esc(c.autor) : ''} · ${esc(new Date(c.fecha).toLocaleString('es-CL'))}</p><label><input type="checkbox" id="rotuloFuera" ${c.rotuloFuera ? 'checked' : ''}> El rótulo va fuera del contorno (línea guía)</label>` : '');
  $('rotuloFuera')?.addEventListener('change', ev => { const {rotuloFuera, ...resto} = corr.get(r.id); aplicar([{id: r.id, despues: ev.target.checked ? {...resto, rotuloFuera: true} : resto}]); });
}
function botones() {
  $('deshacer').disabled = !deshacer.length; $('rehacer').disabled = !rehacer.length;
  $('simplificar').disabled = !sel; $('original').disabled = !corr.has(sel);
  for (const [b, m] of [['modoEditar', 'editar'], ['modoDibujar', 'dibujar'], ['modoPartir', 'partir']]) $(b).setAttribute('aria-pressed', modo === m);
  $('osnap').setAttribute('aria-pressed', osnap); $('orto').setAttribute('aria-pressed', ortoFijo); $('lineas').setAttribute('aria-pressed', verLineas);
  canvas.style.cursor = modo === 'editar' ? 'default' : 'crosshair';
}
function seleccionar(id, verlo = false) {
  sel = id; puntos = []; arrastre = null; sobre = null; recalcular(); lista(); ficha(); botones();
  if (verlo && id && cajas.get(id)) { const [x0, y0, x1, y1] = cajas.get(id), m = Math.max(x1 - x0, y1 - y0) * .6 + 40; encuadrar([x0 - m, y0 - m, x1 + m, y1 + m]); }
  dibujar();
}
function seleccionarEn(p) {
  let mejor = null, area = Infinity;
  for (const [id, e] of fp) { const c = cajas.get(id); if (p[0] < c[0] || p[0] > c[2] || p[1] < c[1] || p[1] > c[3] || !enPartes(p, e.rings)) continue; const a = areaM2(e.rings); if (a < area) { area = a; mejor = id; } }
  seleccionar(mejor);
}

// ---------- Cambios con deshacer ----------
const iguales = (a, b) => JSON.stringify(redondear(a)) === JSON.stringify(redondear(b));
function registro(id, parts) {
  const r = porId.get(id), b = base.get(id), previo = corr.get(id);
  if (b && iguales(parts, b.rings)) return null; // volvió a su contorno original
  return {id, code: r.code, parts: redondear(parts), area_m2: Math.round(areaM2(parts) * 100) / 100, antes: previo?.antes || origenDe(id), ...($('autor').value.trim() ? {autor: $('autor').value.trim()} : {}), fecha: new Date().toISOString(), ...(previo?.rotuloFuera ? {rotuloFuera: true} : {})};
}
function aplicar(cambios) { const paso = cambios.map(c => ({id: c.id, antes: corr.get(c.id) || null, despues: c.despues})); rehacer = []; deshacer.push(paso); if (deshacer.length > 300) deshacer.shift(); hacer(paso, 'despues'); }
function hacer(paso, lado) { for (const c of paso) { if (c[lado]) corr.set(c.id, c[lado]); else corr.delete(c.id); } sucio = firma() !== firmaGuardada; recalcular(); lista(); ficha(); botones(); dibujar(); }
function cambiarPartes(id, parts, otros = []) {
  for (const [i, p] of [[id, parts], ...otros].entries()) { const e = errorPartes(p[1]); if (e) { avisar('No se aplicó' + (i ? ' en ' + porId.get(p[0]).code : '') + ': ' + e); dibujar(); return false; } }
  aplicar([[id, parts], ...otros].map(([i, p]) => ({id: i, despues: registro(i, p)}))); return true;
}
function deshacerPaso() { const p = deshacer.pop(); if (!p) return; rehacer.push(p); hacer(p, 'antes'); }
function rehacerPaso() { const p = rehacer.pop(); if (!p) return; deshacer.push(p); hacer(p, 'despues'); }

// ---------- Herramientas ----------
function calcularSnap(p, ancla) {
  if (!osnap) return usarOrto() && ancla ? {p: orto(p, ancla), tipo: 'orto'} : {p, tipo: null};
  return enganchar(p, {indices: [indiceDwg, indiceRec].filter(Boolean), radio: APERTURA / vista.s, ancla, usarOrto: usarOrto()});
}
function pinzamiento(sx, sy) {
  if (!sel || modo !== 'editar') return null;
  const parts = partesDe(sel); let medio = null;
  for (const [pi, part] of parts.entries()) for (const [ai, a] of [part.polygon, ...part.holes].entries()) for (let i = 0; i < a.length; i++) {
    const v = aPantalla(a[i]); if (Math.hypot(v[0] - sx, v[1] - sy) <= GRIP) return {tipo: 'vertice', pi, ai, i};
    const b = a[(i + 1) % a.length], m = aPantalla([(a[i][0] + b[0]) / 2, (a[i][1] + b[1]) / 2]);
    if (!medio && dist(v, aPantalla(b)) > 3 * GRIP && Math.hypot(m[0] - sx, m[1] - sy) <= GRIP - 1) medio = {tipo: 'medio', pi, ai, i};
  }
  return medio;
}
// El arrastre empieza a mover recién cuando el cursor se desplaza: un clic sobre un pinzamiento no cambia nada.
function iniciarArrastre(gq, ev) {
  const parts = partesDe(sel), a = anillo(parts, gq.pi, gq.ai), b = a[(gq.i + 1) % a.length], inicio = [ev.offsetX, ev.offsetY];
  if (gq.tipo === 'medio' && (ev.ctrlKey || ev.metaKey)) { arrastre = {tipo: 'tramo', gq, parts, inicio, orig: [[...a[gq.i]], [...b]]}; return; }
  if (gq.tipo === 'medio') { a.splice(gq.i + 1, 0, [(a[gq.i][0] + b[0]) / 2, (a[gq.i][1] + b[1]) / 2]); gq = {...gq, tipo: 'vertice', i: gq.i + 1}; }
  arrastre = {tipo: 'vertice', gq, parts, inicio};
}
function moverArrastre() {
  const {gq, parts} = arrastre, a = anillo(parts, gq.pi, gq.ai), n = a.length;
  if (arrastre.tipo === 'vertice') { snap = calcularSnap(cursor, a[(gq.i - 1 + n) % n]); a[gq.i] = [...snap.p]; return; }
  // Tramo en paralelo: se desplaza por su normal hasta pasar por el punto enganchado.
  const [o1, o2] = arrastre.orig, d = [o2[0] - o1[0], o2[1] - o1[1]], l = Math.hypot(...d) || 1, nr = [-d[1] / l, d[0] / l], m = [(o1[0] + o2[0]) / 2, (o1[1] + o2[1]) / 2];
  snap = calcularSnap(cursor, null); const k = (snap.p[0] - m[0]) * nr[0] + (snap.p[1] - m[1]) * nr[1];
  a[gq.i] = [o1[0] + k * nr[0], o1[1] + k * nr[1]]; a[(gq.i + 1) % n] = [o2[0] + k * nr[0], o2[1] + k * nr[1]];
}
function quitarVertice(gq) {
  const parts = partesDe(sel), a = anillo(parts, gq.pi, gq.ai);
  if (a.length > 3) a.splice(gq.i, 1);
  else if (gq.ai > 0) parts[gq.pi].holes.splice(gq.ai - 1, 1);
  else if (parts.length > 1) parts.splice(gq.pi, 1);
  else return avisar('Un contorno necesita al menos 3 vértices.');
  sobre = null; cambiarPartes(sel, parts);
}
const anclaActual = () => arrastre?.tipo === 'vertice' ? (a => a[(arrastre.gq.i - 1 + a.length) % a.length])(anillo(arrastre.parts, arrastre.gq.pi, arrastre.gq.ai)) : modo !== 'editar' ? puntos.at(-1) || null : null;
function cambiarModo(m) {
  if (m !== 'editar' && !sel && m === 'partir') { avisar('Elige primero el recinto que quieres partir.'); return; }
  modo = m; puntos = []; arrastre = null; sobre = null; snap = null; botones(); dibujar();
  if (m === 'dibujar') avisar(sel ? 'Dibuja el contorno de ' + porId.get(sel).code + ': clic en cada vértice, Enter o clic en el primero para cerrar. Ctrl+Enter lo agrega como otra parte.' : 'Dibuja el contorno: al cerrarlo se asigna al recinto cuyo rótulo quede dentro.', 6000);
  if (m === 'partir') avisar('Dibuja la línea de corte de lado a lado del recinto y pulsa Enter. Queda la parte que contiene el rótulo.', 6000);
}
function cerrarDibujo(agregar) {
  const ring = limpiar(puntos), e = errorAnillo(ring); if (e) return avisar(e);
  let id = sel;
  if (!id) { const dentro = rooms.filter(r => enAnillo(posicionPlano(r, runtime.atlas), ring)); if (dentro.length !== 1) return avisar(dentro.length ? 'Quedaron ' + dentro.length + ' rótulos dentro: elige primero el recinto.' : 'Ningún rótulo quedó dentro: elige primero el recinto.'); id = dentro[0].id; sel = id; }
  const parts = agregar ? [...partesDe(id), {polygon: ring, holes: []}] : [{polygon: ring, holes: []}];
  if (cambiarPartes(id, parts)) { puntos = []; cambiarModo('editar'); seleccionar(id); }
}
function aplicarCorte() {
  if (puntos.length < 2) return avisar('La línea de corte necesita al menos dos puntos.');
  const r = porId.get(sel), parts = partesDe(sel), rotulo = posicionPlano(r, runtime.atlas);
  let pi = -1, trozos, ultimo = null;
  for (const [i, p] of parts.entries()) { try { trozos = partir(p.polygon, puntos); pi = i; break; } catch (e) { ultimo = e; } }
  if (pi < 0) return avisar(ultimo?.message || 'La línea no corta el recinto.');
  const [uno, dos] = trozos, primero = enAnillo(rotulo, uno) ? true : enAnillo(rotulo, dos) ? false : areaAnillo(uno) >= areaAnillo(dos);
  const queda = primero ? uno : dos, sobra = primero ? dos : uno, huecos = ring => parts[pi].holes.filter(h => enAnillo(h[0], ring));
  const nuevas = parts.map((p, i) => i === pi ? {polygon: queda, holes: huecos(queda)} : p), resto = {polygon: sobra, holes: huecos(sobra)};
  const vecino = rooms.find(x => x.id !== sel && enAnillo(posicionPlano(x, runtime.atlas), sobra));
  const otros = vecino && confirm(`La otra parte (${m2(areaM2([resto]))} m²) contiene el rótulo de ${vecino.code} · ${vecino.name}.\n¿Asignársela como su contorno? (Reemplaza el contorno actual de ese recinto)`) ? [[vecino.id, [resto]]] : [];
  if (cambiarPartes(sel, nuevas, otros)) { avisar(otros.length ? 'Recinto partido: la otra parte quedó como contorno de ' + vecino.code + '.' : 'Recinto partido: se descartó la otra parte (' + m2(areaM2([resto])) + ' m²).'); puntos = []; cambiarModo('editar'); }
}
function simplificarSel() {
  if (!sel) return; const parts = partesDe(sel), cuenta = ps => ps.reduce((s, p) => s + p.polygon.length + p.holes.reduce((h, x) => h + x.length, 0), 0);
  const nuevas = parts.map(p => ({polygon: simplificar(p.polygon, TOLERANCIA_SIMPLIFICAR), holes: p.holes.map(h => simplificar(h, TOLERANCIA_SIMPLIFICAR))}));
  if (cuenta(nuevas) === cuenta(parts)) return avisar('No hay vértices sobrantes (tolerancia 1,5 cm).');
  if (cambiarPartes(sel, nuevas)) avisar('Simplificado: ' + cuenta(parts) + ' → ' + cuenta(nuevas) + ' vértices.');
}
async function guardar() {
  const archivo = {...vacio(nivel), recintos: [...corr.values()]};
  $('guardar').disabled = true;
  try {
    const res = await fetch('/guardar?nivel=' + encodeURIComponent(nivel), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(archivo)}), j = await res.json();
    if (!res.ok) { $('listaErrores').innerHTML = (j.errores || ['Error desconocido.']).map(e => `<li>${esc(e)}</li>`).join(''); $('errores').showModal(); return; }
    sucio = false; firmaGuardada = firma(); avisar('Guardado: ' + j.recintos + ' recintos corregidos en ' + j.archivo + '. Para publicarlo hay que hacer commit de ese archivo.', 7000);
  } catch (e) { avisar('No se pudo guardar: ' + e.message + '. ¿Sigue abierto servidor.mjs?', 7000); } finally { $('guardar').disabled = false; dibujar(); }
}

// ---------- Dibujo ----------
function dibujar() { if (!pendiente) { pendiente = true; requestAnimationFrame(() => { pendiente = false; pintar(); }); } }
let encuadrePendiente = null; // si el lienzo aún no tiene tamaño, se encuadra cuando lo tenga
function encuadrar([x0, y0, x1, y1]) { if (!W || !H) { encuadrePendiente = [x0, y0, x1, y1]; return; } encuadrePendiente = null; const s = Math.min(W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0)) * .94; vista = {s, x: (x0 + x1) / 2 - W / 2 / s, y: (y0 + y1) / 2 - H / 2 / s}; dibujar(); }
function imagen(url) { let i = imagenes.get(url); if (!i) { i = new Image(); i.onload = dibujar; i.src = url; imagenes.set(url, i); } return i.complete && i.naturalWidth ? i : null; }
function trazar(rings) { g.beginPath(); for (const p of rings) for (const a of [p.polygon, ...p.holes]) { a.forEach((q, i) => { const s = aPantalla(q); i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); }); g.closePath(); } }
function pintar() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#fbfcfd'; g.fillRect(0, 0, W, H);
  if (!runtime) return;
  const [x0, y0] = aPlano(0, 0), [x1, y1] = aPlano(W, H), m = runtime.map;
  // Plano de fondo: vista general y teselas del nivel de detalle adecuado; se aclara cuando se ven las líneas del DWG.
  g.save(); g.globalAlpha = verLineas && vista.s > .6 && indiceDwg?.tramos.length ? .4 : .85;
  const ov = imagen('/repo/dist/' + m.overview); if (ov) { const s = aPantalla(m.origin); g.drawImage(ov, s[0], s[1], m.width * vista.s, m.height * vista.s); }
  const niveles = [...m.levels].sort((a, b) => a.scale - b.scale), nt = niveles.find(l => l.scale >= vista.s * dpr * .9) || niveles.at(-1);
  if (vista.s * dpr > niveles[0].scale * .6) {
    const span = m.tileSize / nt.scale, ruta = m.tilePath || 'map/';
    for (let ty = Math.max(0, Math.floor((y0 - m.origin[1]) / span)); ty <= Math.min(nt.rows - 1, Math.floor((y1 - m.origin[1]) / span)); ty++)
      for (let tx = Math.max(0, Math.floor((x0 - m.origin[0]) / span)); tx <= Math.min(nt.columns - 1, Math.floor((x1 - m.origin[0]) / span)); tx++) {
        const t = imagen(`/repo/dist/${ruta}${nt.z}/${tx}_${ty}.webp`); if (!t) continue;
        const s = aPantalla([m.origin[0] + tx * span, m.origin[1] + ty * span]); g.drawImage(t, s[0], s[1], t.naturalWidth / nt.scale * vista.s, t.naturalHeight / nt.scale * vista.s);
      }
  }
  g.restore();
  // Líneas del DWG (muros, puertas, ventanas, pilares y escaleras): las mismas a las que se engancha.
  if (verLineas && indiceDwg?.tramos.length && vista.s >= .35) {
    g.beginPath(); for (const t of tramosCerca(indiceDwg, x0, y0, x1, y1)) { const a = aPantalla(t.a), b = aPantalla(t.b); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.strokeStyle = 'rgba(18,30,40,.8)'; g.lineWidth = 1; g.stroke();
  }
  // Contornos de los demás recintos, por estado.
  for (const [id, e] of fp) {
    const c = cajas.get(id); if (id === sel || c[2] < x0 || c[0] > x1 || c[3] < y0 || c[1] > y1) continue;
    const t = tipoDe(id); trazar(e.rings); g.setLineDash(t === 'aux' ? [6, 4] : []); g.strokeStyle = COLOR[t]; g.lineWidth = t === 'cor' ? 1.8 : 1.2; g.stroke();
  }
  g.setLineDash([]);
  if (sel) {
    const parts = arrastre?.parts || partesDe(sel); trazar(parts); g.fillStyle = 'rgba(214,51,108,.10)'; g.fill('evenodd'); g.strokeStyle = '#d6336c'; g.lineWidth = 2.2; g.stroke();
    marcaRotulo(aPantalla(posicionPlano(porId.get(sel), runtime.atlas)));
    if (modo === 'editar') for (const [pi, part] of parts.entries()) for (const [ai, a] of [part.polygon, ...part.holes].entries()) for (let i = 0; i < a.length; i++) {
      const v = aPantalla(a[i]), b = a[(i + 1) % a.length];
      if (dist(v, aPantalla(b)) > 3 * GRIP) cuadro(aPantalla([(a[i][0] + b[0]) / 2, (a[i][1] + b[1]) / 2]), 3.5, false, sobre?.tipo === 'medio' && sobre.pi === pi && sobre.ai === ai && sobre.i === i);
      cuadro(v, 4.5, true, (sobre?.tipo === 'vertice' && sobre.pi === pi && sobre.ai === ai && sobre.i === i) || (arrastre?.gq?.pi === pi && arrastre.gq.ai === ai && arrastre.gq.i === i));
    }
  }
  // Dibujo o corte en curso, con su línea elástica hasta el cursor.
  if (modo !== 'editar' && puntos.length) {
    const fin = snap?.p || cursor; g.beginPath(); puntos.forEach((q, i) => { const s = aPantalla(q); i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); }); if (fin) { const s = aPantalla(fin); g.lineTo(s[0], s[1]); }
    g.strokeStyle = modo === 'partir' ? '#c2372f' : '#1f6feb'; g.lineWidth = 2; g.stroke();
    if (modo === 'dibujar' && fin && puntos.length > 1) { const a = aPantalla(fin), b = aPantalla(puntos[0]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.setLineDash([4, 4]); g.strokeStyle = '#1f6feb88'; g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
    for (const q of puntos) cuadro(aPantalla(q), 3, true, false, modo === 'partir' ? '#c2372f' : '#1f6feb');
  }
  const ancla = anclaActual();
  if (ancla && usarOrto() && (arrastre || puntos.length)) { const a = aPantalla(ancla); g.setLineDash([2, 4]); g.strokeStyle = '#e8590c99'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, a[1]); g.lineTo(W, a[1]); g.moveTo(a[0], 0); g.lineTo(a[0], H); g.stroke(); g.setLineDash([]); }
  if (snap?.tipo && snap.tipo !== 'orto' && (arrastre || modo !== 'editar')) marcaSnap(aPantalla(snap.p), snap.tipo);
  barra();
}
function cuadro([x, y], r, lleno, caliente, color = '#1f6feb') { g.beginPath(); g.rect(x - r, y - r, 2 * r, 2 * r); g.fillStyle = caliente ? '#e03131' : lleno ? color : '#fff'; g.fill(); g.strokeStyle = caliente ? '#e03131' : color; g.lineWidth = 1.2; g.stroke(); }
function marcaRotulo([x, y]) { g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.strokeStyle = '#d6336c'; g.lineWidth = 2; g.stroke(); }
// Marcas de enganche como las de AutoCAD: cuadrado extremo, triángulo medio, equis intersección, ⊥ perpendicular, reloj cercano.
function marcaSnap([x, y], tipo) {
  const r = 7; g.beginPath(); g.strokeStyle = '#e8590c'; g.lineWidth = 2;
  if (tipo === 'extremo' || tipo === 'orto-extremo') g.rect(x - r, y - r, 2 * r, 2 * r);
  else if (tipo === 'medio') { g.moveTo(x, y - r); g.lineTo(x + r, y + r * .8); g.lineTo(x - r, y + r * .8); g.closePath(); }
  else if (tipo === 'interseccion' || tipo === 'orto-cruce') { g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); }
  else if (tipo === 'perpendicular') { g.moveTo(x - r, y - r); g.lineTo(x - r, y + r); g.lineTo(x + r, y + r); g.moveTo(x - r, y); g.lineTo(x, y); g.lineTo(x, y + r); }
  else { g.moveTo(x - r, y - r); g.lineTo(x + r, y - r); g.lineTo(x - r, y + r); g.lineTo(x + r, y + r); g.closePath(); }
  g.stroke();
}
function barra() {
  const p = snap?.p || cursor, ancla = anclaActual(), partes = [`<b>${MODOS[modo]}</b>`, `OSNAP <span class="${osnap ? 'on' : 'off'}">${osnap ? 'sí' : 'no'}</span>`, `ORTO <span class="${usarOrto() ? 'on' : 'off'}">${usarOrto() ? 'sí' : 'no'}</span>`];
  if (p) partes.push(`x ${fmt(aMetros(p[0] - runtime.map.origin[0]))} · y ${fmt(aMetros(p[1] - runtime.map.origin[1]))} m`);
  if (snap?.tipo && (arrastre || modo !== 'editar')) partes.push('◆ ' + NOMBRE_SNAP[snap.tipo]);
  if (ancla && p) partes.push('tramo ' + fmt(aMetros(dist(ancla, p))) + ' m');
  if (sel) { const r = porId.get(sel), a = areaM2(arrastre?.parts || partesDe(sel)), pma = areaDeclarada(r.declared_area); partes.push(`${esc(r.code)} · ${m2(a)} m²` + (pma ? ` · PMA ${m2(pma)} (${signo((a - pma) / pma * 100)})` : '')); }
  partes.push(corr.size + ' corregidos' + (sucio ? ' · <span style="color:#ffcf6b">sin guardar</span>' : ''));
  $('estado').innerHTML = partes.map(x => `<span>${x}</span>`).join('');
}

// ---------- Eventos ----------
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', ev => {
  if (!runtime) return; canvas.setPointerCapture(ev.pointerId); cursor = aPlano(ev.offsetX, ev.offsetY);
  if (ev.button === 1 || (ev.button === 0 && espacio)) { arrastre = {tipo: 'pan', inicio: [ev.offsetX, ev.offsetY], vista: {...vista}}; return; }
  if (ev.button === 2) { const gq = pinzamiento(ev.offsetX, ev.offsetY); if (gq?.tipo === 'vertice') quitarVertice(gq); return; }
  if (ev.button !== 0) return;
  if (modo !== 'editar') {
    const q = (snap || calcularSnap(cursor, puntos.at(-1) || null)).p;
    if (modo === 'dibujar' && puntos.length >= 3 && dist(aPantalla(puntos[0]), [ev.offsetX, ev.offsetY]) <= GRIP) return cerrarDibujo(ev.ctrlKey);
    puntos.push([...q]); dibujar(); return;
  }
  const gq = pinzamiento(ev.offsetX, ev.offsetY);
  if (gq) { iniciarArrastre(gq, ev); dibujar(); return; }
  arrastre = {tipo: 'quizas', inicio: [ev.offsetX, ev.offsetY], vista: {...vista}, p: cursor};
});
canvas.addEventListener('pointermove', ev => {
  if (!runtime) return; cursor = aPlano(ev.offsetX, ev.offsetY);
  if (arrastre?.tipo === 'quizas' && Math.hypot(ev.offsetX - arrastre.inicio[0], ev.offsetY - arrastre.inicio[1]) > 4) arrastre.tipo = 'pan';
  if (arrastre?.tipo === 'pan') { vista.x = arrastre.vista.x - (ev.offsetX - arrastre.inicio[0]) / vista.s; vista.y = arrastre.vista.y - (ev.offsetY - arrastre.inicio[1]) / vista.s; cursor = aPlano(ev.offsetX, ev.offsetY); }
  else if (arrastre?.tipo === 'vertice' || arrastre?.tipo === 'tramo') { if (arrastre.movido || Math.hypot(ev.offsetX - arrastre.inicio[0], ev.offsetY - arrastre.inicio[1]) > 2) { arrastre.movido = true; moverArrastre(); } }
  else if (modo !== 'editar') snap = calcularSnap(cursor, puntos.at(-1) || null);
  else { sobre = pinzamiento(ev.offsetX, ev.offsetY); snap = null; canvas.style.cursor = sobre ? (sobre.tipo === 'medio' && ev.ctrlKey ? 'move' : 'pointer') : 'default'; }
  dibujar();
});
canvas.addEventListener('pointerup', () => {
  if (arrastre?.tipo === 'quizas') seleccionarEn(arrastre.p);
  else if ((arrastre?.tipo === 'vertice' || arrastre?.tipo === 'tramo') && arrastre.movido) { const parts = arrastre.parts; arrastre = null; snap = null; cambiarPartes(sel, parts); }
  arrastre = null; dibujar();
});
canvas.addEventListener('dblclick', () => { if (modo === 'dibujar' && puntos.length >= 3) cerrarDibujo(false); else if (modo === 'partir') aplicarCorte(); });
canvas.addEventListener('wheel', ev => {
  ev.preventDefault(); if (!runtime) return;
  const p = aPlano(ev.offsetX, ev.offsetY); vista.s = Math.min(60, Math.max(.02, vista.s * Math.exp(-ev.deltaY * .0015)));
  vista.x = p[0] - ev.offsetX / vista.s; vista.y = p[1] - ev.offsetY / vista.s; cursor = p; dibujar();
}, {passive: false});
addEventListener('keydown', ev => {
  const k = ev.key.toLowerCase(), ctrl = ev.ctrlKey || ev.metaKey;
  if (ctrl && k === 's') { ev.preventDefault(); guardar(); return; }
  if (escribiendo() && ev.key !== 'Escape') return;
  if (ev.key === 'Shift') { shift = true; dibujar(); return; }
  if (ev.key === ' ') { espacio = true; ev.preventDefault(); return; }
  if (ctrl && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); rehacerPaso(); return; }
  if (ctrl && k === 'z') { ev.preventDefault(); deshacerPaso(); return; }
  if (ev.key === 'F3') { ev.preventDefault(); osnap = !osnap; botones(); dibujar(); return; }
  if (ev.key === 'F8') { ev.preventDefault(); ortoFijo = !ortoFijo; botones(); dibujar(); return; }
  if (ev.key === 'Escape') { if (document.activeElement && escribiendo()) document.activeElement.blur(); if (arrastre) arrastre = null; else if (puntos.length) puntos = []; else if (modo !== 'editar') cambiarModo('editar'); snap = null; dibujar(); return; }
  if (ev.key === 'Enter') { if (modo === 'dibujar' && puntos.length >= 3) cerrarDibujo(ctrl); else if (modo === 'partir') aplicarCorte(); return; }
  if (ev.key === 'Backspace') { if (puntos.length) { puntos.pop(); dibujar(); } ev.preventDefault(); return; }
  if (ev.key === 'Delete') { if (sobre?.tipo === 'vertice') quitarVertice(sobre); return; }
  if (ev.key === 'Home') { encuadrar([runtime.map.origin[0], runtime.map.origin[1], runtime.map.origin[0] + runtime.map.width, runtime.map.origin[1] + runtime.map.height]); return; }
  if (ctrl || ev.altKey) return;
  if (k === 'e') cambiarModo('editar'); else if (k === 'd') cambiarModo('dibujar'); else if (k === 'p') cambiarModo('partir');
  else if (k === 's') simplificarSel(); else if (k === 'l') { verLineas = !verLineas; botones(); dibujar(); }
  else if (k === 'f' && sel) seleccionar(sel, true);
  else if (k === 'n' && visibles.length) seleccionar(visibles[(visibles.indexOf(sel) + 1) % visibles.length], true);
});
addEventListener('keyup', ev => { if (ev.key === 'Shift') { shift = false; dibujar(); } if (ev.key === ' ') espacio = false; });
addEventListener('blur', () => { shift = false; espacio = false; });
addEventListener('beforeunload', ev => { if (sucio) { ev.preventDefault(); ev.returnValue = ''; } });

// Los botones sueltan el foco para que Espacio (mover el plano) y Enter (cerrar) no los vuelvan a pulsar.
document.querySelector('header').addEventListener('click', ev => ev.target.closest('button')?.blur());
$('lista').addEventListener('click', ev => { const b = ev.target.closest('[data-id]'); if (b) { if (modo !== 'editar') cambiarModo('editar'); seleccionar(b.dataset.id, true); } });
$('filtro').onchange = lista; $('buscar').oninput = lista;
$('buscar').onkeydown = ev => { if (ev.key === 'Enter' && visibles.length) { seleccionar(visibles[0], true); ev.target.blur(); } };
$('modoEditar').onclick = () => cambiarModo('editar'); $('modoDibujar').onclick = () => cambiarModo('dibujar'); $('modoPartir').onclick = () => cambiarModo('partir');
$('osnap').onclick = () => { osnap = !osnap; botones(); }; $('orto').onclick = () => { ortoFijo = !ortoFijo; botones(); }; $('lineas').onclick = () => { verLineas = !verLineas; botones(); dibujar(); };
$('simplificar').onclick = simplificarSel; $('original').onclick = () => { if (corr.has(sel)) aplicar([{id: sel, despues: null}]); };
$('deshacer').onclick = deshacerPaso; $('rehacer').onclick = rehacerPaso; $('guardar').onclick = guardar;
try { $('autor').value = localStorage.getItem('atlas-editor-autor') || ''; } catch {}
$('autor').onchange = () => { try { localStorage.setItem('atlas-editor-autor', $('autor').value.trim()); } catch {} };
$('nivel').innerHTML = Object.entries(NIVELES).map(([id, n]) => `<option value="${id}">${n.nombre}</option>`).join('');
$('nivel').onchange = () => cargar($('nivel').value);

new ResizeObserver(() => { document.documentElement.style.setProperty('--top', document.querySelector('header').offsetHeight + 'px'); }).observe(document.querySelector('header'));
new ResizeObserver(() => { const c = $('lienzo'); dpr = devicePixelRatio || 1; W = c.clientWidth; H = c.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; if (encuadrePendiente) encuadrar(encuadrePendiente); dibujar(); }).observe($('lienzo'));
const inicial = new URLSearchParams(location.search).get('nivel');
$('nivel').value = NIVELES[inicial] ? inicial : 'N-1';
cargar($('nivel').value);
