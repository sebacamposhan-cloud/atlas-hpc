// Liberación de frentes: semáforo por recinto a partir del Excel de consultas, PTO y programa.
// Reglas tomadas de la app del nivel 2 (Recintos HPC). Un Excel vale para todo el edificio:
// las consultas se asocian por código de recinto o por terminación («PAV 106», «CIE 202», «M 14», «M2 14»).
// Archivado: las importaciones apuntan a dist/ para que liberacion-test.mjs corra desde aquí. Al devolverlo a dist/, usar './layers.mjs' y './web-store.mjs'.
import {registerLayer} from '../../dist/layers.mjs';
import {loadVendor} from '../../dist/web-store.mjs';
const CLAVE = 'atlas-liberacion-v1', CLAVE_ANTIGUA = 'recintos-hpc-excel-v1', DIA = 86400000;
const CERRADOS = ['aprobada', 'aprobado', 'respondida', 'respondido', 'cerrada', 'cerrado'];
export const ESTADOS = {bloqueado: 'Bloqueado', restriccion: 'Con restricción', liberado: 'Liberado', 'sin-dato': 'Sin datos'};
export const COLORES = {bloqueado: '#d64545', restriccion: '#e5a800', liberado: '#2e9e5b', 'sin-dato': '#9aa3ad'};
const porEtiqueta = Object.fromEntries(Object.entries(ESTADOS).map(([k, v]) => [v, k]));

const sinTildes = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function aDia(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return Math.round(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) / DIA);
  if (typeof v === 'number') return Math.round(v) - 25569; // número de serie de Excel
  let m = String(v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { let a = +m[3]; if (a < 100) a += 2000; return Math.round(Date.UTC(a, +m[2] - 1, +m[1]) / DIA); }
  m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DIA) : null;
}
const hoyDia = () => { const h = new Date(); return Math.round(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()) / DIA); };
export function textoFecha(d) { if (d == null) return '—'; const f = new Date(d * DIA); return String(f.getUTCDate()).padStart(2, '0') + '-' + String(f.getUTCMonth() + 1).padStart(2, '0') + '-' + f.getUTCFullYear(); }
function columna(fila, claves) { const ks = Object.keys(fila); for (const c of claves) for (const k of ks) if (sinTildes(k).includes(c)) return fila[k]; return ''; }

// Hojas: Parámetros (ciclo, fecha de corte), Recintos, Solicitudes (consultas/PTO), Programa.
export function leerLibro(libro, XLSX) {
  const hoja = nombre => { const n = libro.SheetNames.find(s => sinTildes(s).startsWith(nombre)); return n ? XLSX.utils.sheet_to_json(libro.Sheets[n], {defval: '', raw: true}) : []; };
  const r = {ciclo: 30, corte: null, recintos: {}, solicitudes: [], programa: {}, prueba: false};
  for (const f of hoja('parametro')) {
    const p = sinTildes(columna(f, ['parametro'])), v = columna(f, ['valor']);
    if (p.includes('ciclo') && +v > 0) r.ciclo = +v;
    if (p.includes('corte')) r.corte = aDia(v);
  }
  for (const f of hoja('recinto')) { const c = String(columna(f, ['codigo'])).trim(); if (c) r.recintos[c] = {nombre: String(columna(f, ['nombre'])), sector: String(columna(f, ['sector'])), piso: String(columna(f, ['piso']))}; }
  hoja('solicitud').forEach((f, i) => {
    const tipo = String(columna(f, ['tipo'])).trim(), asunto = String(columna(f, ['asunto', 'descripcion', 'titulo'])).trim();
    const recinto = String(columna(f, ['recinto'])).trim(), terminacion = String(columna(f, ['terminacion'])).trim();
    if (!tipo && !asunto && !recinto && !terminacion) return;
    if (sinTildes(columna(f, ['origen'])).includes('prueba')) r.prueba = true;
    r.solicitudes.push({n: String(columna(f, ['n°', 'nº', 'numero', 'n.']) || i + 1), tipo: tipo || 'Solicitud', asunto, recinto, terminacion,
      emision: aDia(columna(f, ['emision'])), requerida: aDia(columna(f, ['requerida'])),
      estado: String(columna(f, ['estado'])).trim() || 'Sin estado', responsable: String(columna(f, ['responsable'])).trim()});
  });
  for (const f of hoja('programa')) {
    const c = String(columna(f, ['recinto', 'codigo'])).trim(); if (!c) continue;
    if (sinTildes(columna(f, ['origen'])).includes('prueba')) r.prueba = true;
    (r.programa[c] ||= []).push({actividad: String(columna(f, ['actividad'])), inicio: aDia(columna(f, ['inicio'])), holgura: columna(f, ['holgura'])});
  }
  return r;
}
function leerTerminacion(t) { const m = sinTildes(t).toUpperCase().replace(/\s+/g, ' ').match(/^(PAV|CIE|M[1-4]?)\s*[-:]?\s*(.+)$/); return m ? {tipo: m[1], codigo: m[2].trim()} : null; }
function tieneTerminacion(room, t) { return (room.finishes || []).some(f => (t.tipo === 'M' ? /^M[1-4]$/.test(f.field) : f.field === t.tipo) && String(f.code).toUpperCase() === t.codigo); }
const afecta = (s, room) => (s.recinto && s.recinto === room.code) || (!!s.terminacion && !!leerTerminacion(s.terminacion) && tieneTerminacion(room, leerTerminacion(s.terminacion)));
export function calcular(datos, rooms) {
  const hoy = datos.corte ?? hoyDia(), listados = Object.keys(datos.recintos).length, out = new Map();
  for (const room of rooms) {
    // Si el Excel lista sus recintos, los que no aparecen no se siguen: quedan «Sin datos» aunque compartan terminación.
    if (listados && !datos.recintos[room.code]) { out.set(room.code, {estado: 'sin-dato', solicitudes: [], programa: [], hoy, fueraDelExcel: true}); continue; }
    const programa = [...(datos.programa[room.code] || [])].sort((a, b) => (a.inicio ?? 1e9) - (b.inicio ?? 1e9));
    const inicio = programa[0]?.inicio ?? null;
    const solicitudes = datos.solicitudes.filter(s => afecta(s, room)).map(s => {
      const abierta = !CERRADOS.includes(sinTildes(s.estado)), requerida = s.requerida ?? inicio, emision = s.emision ?? hoy;
      const holgura = requerida != null ? requerida - emision - datos.ciclo : null;
      const estado = !abierta ? 'liberado' : sinTildes(s.estado).includes('rechaz') || (holgura != null && holgura < 0) ? 'bloqueado' : 'restriccion';
      return {s, abierta, requerida, desdePrograma: s.requerida == null, emisionSupuesta: s.emision == null, holgura, estado};
    });
    let estado = 'liberado';
    if (solicitudes.some(x => x.estado === 'restriccion')) estado = 'restriccion';
    if (solicitudes.some(x => x.estado === 'bloqueado')) estado = 'bloqueado';
    const orden = {bloqueado: 0, restriccion: 1, liberado: 2};
    solicitudes.sort((a, b) => orden[a.estado] - orden[b.estado] || (a.holgura ?? 1e9) - (b.holgura ?? 1e9));
    out.set(room.code, {estado, solicitudes, programa, hoy});
  }
  return out;
}

export function createLiberacion(ctx) {
  const esc = ctx.esc;
  let guardado = null, calculo = new Map(), calculadoPara = null;
  try { guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { guardado = null; }
  const resultado = () => { const rooms = ctx.rooms(); if (guardado && calculadoPara !== rooms) { calculo = calcular(guardado.datos, rooms); calculadoPara = rooms; } return calculo; };
  const estado = r => guardado ? resultado().get(r.code)?.estado || 'sin-dato' : 'sin-dato';
  registerLayer('liberacion', {nombre: 'Liberación de frentes', categories: r => [ESTADOS[estado(r)]], color: key => COLORES[porEtiqueta[key]] || COLORES['sin-dato'], opacity: .5});

  function usar(datos, nombre, guardar = true) {
    guardado = {nombre, fecha: new Date().toISOString(), datos};
    calculadoPara = null;
    if (guardar) { try { localStorage.setItem(CLAVE, JSON.stringify(guardado)); } catch { ctx.toast('No se pudo guardar el Excel en este navegador; se usará solo en esta sesión.'); } }
    ctx.changed();
  }
  async function leerArchivo(buffer) { await loadVendor('xlsx'); return leerLibro(XLSX.read(buffer, {type: 'array', cellDates: true}), XLSX); }
  // El Excel que se haya cargado en la antigua vista del nivel 2 se incorpora una vez.
  (async () => {
    if (guardado) return;
    let antiguo; try { antiguo = JSON.parse(localStorage.getItem(CLAVE_ANTIGUA) || 'null'); } catch { return; }
    if (!antiguo?.b64) return;
    try { usar(await leerArchivo(Uint8Array.from(atob(antiguo.b64), c => c.charCodeAt(0)).buffer), antiguo.nombre); } catch { /* se puede cargar de nuevo */ }
  })();

  const punto = e => `<i class="libDot" style="background:${COLORES[e]}"></i>`;
  const holguraTexto = x => x.holgura == null ? 'sin fecha' : (x.holgura >= 0 ? '+' : '') + x.holgura + ' días';
  function solicitudHTML(x, codigo) {
    const s = x.s, porTerminacion = s.terminacion && s.recinto !== codigo ? ' · afecta a todos los recintos con ' + esc(s.terminacion) : '';
    return `<div class="libSolicitud ${x.estado}"><div><b>${esc(s.tipo)} N° ${esc(s.n)}</b><span>${x.abierta ? esc(holguraTexto(x)) : esc(s.estado)}</span></div><p>${esc(s.asunto)}</p><small>${x.abierta ? 'Estado: ' + esc(s.estado) + ' · ' : ''}Emitida: ${x.emisionSupuesta ? 'aún no (se cuenta desde hoy)' : textoFecha(s.emision)} · Requerida en terreno: ${textoFecha(x.requerida)}${x.desdePrograma && x.requerida != null ? ' (del programa)' : ''}${s.responsable ? ' · ' + esc(s.responsable) : ''}${porTerminacion}</small></div>`;
  }
  function ficha(r) {
    if (!guardado) return `<div class="separator"></div><div class="section-label">LIBERACIÓN DE FRENTES</div><p class="muted">Sin Excel de liberación cargado. <button class="codeLink" data-lib-open>Cargarlo</button></p>`;
    const c = resultado().get(r.code), abiertas = c.solicitudes.filter(x => x.abierta);
    if (c.fueraDelExcel) return `<div class="separator"></div><div class="section-label">LIBERACIÓN DE FRENTES</div><p class="libState">${punto('sin-dato')}<b>Sin datos</b></p><p class="muted">Este recinto no está en la hoja Recintos del Excel cargado (${esc(guardado.nombre)}).</p>`;
    return `<div class="separator"></div><div class="section-label">LIBERACIÓN DE FRENTES${guardado.datos.prueba ? ' · DATOS DE PRUEBA' : ''}</div><p class="libState">${punto(c.estado)}<b>${ESTADOS[c.estado]}</b></p><h4>Qué lo frena (${abiertas.length})</h4>${abiertas.length ? '' : '<p class="muted">No tiene consultas ni PTO abiertos.</p>'}${c.solicitudes.map(x => solicitudHTML(x, r.code)).join('')}${c.programa.length ? `<h4>Programa</h4><table class="finishes"><tbody>${c.programa.map(p => `<tr><td>${textoFecha(p.inicio)}</td><td>${esc(p.actividad)}${p.holgura !== '' ? ' · holgura ' + esc(p.holgura) + ' d' : ''}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }
  function bind(root) { root.querySelectorAll('[data-lib-open]').forEach(b => b.onclick = () => ctx.show('liberacion')); }

  function page(heading) {
    const rooms = ctx.rooms(), cuenta = {bloqueado: 0, restriccion: 0, liberado: 0, 'sin-dato': 0};
    for (const r of rooms) cuenta[estado(r)]++;
    const d = guardado?.datos, criticos = guardado ? rooms.filter(r => ['bloqueado', 'restriccion'].includes(estado(r))).map(r => ({r, c: resultado().get(r.code)})).sort((a, b) => (a.c.estado === 'bloqueado' ? 0 : 1) - (b.c.estado === 'bloqueado' ? 0 : 1) || (a.c.solicitudes[0]?.holgura ?? 1e9) - (b.c.solicitudes[0]?.holgura ?? 1e9)) : [];
    return heading('Liberación de frentes', 'Semáforo por recinto según consultas, PTO y programa. Toca un estado para verlo en el plano.') +
      (d?.prueba ? '<div class="libAviso">DATOS DE PRUEBA: las consultas, PTO y fechas son inventadas. Los recintos y el plano son reales.</div>' : '') +
      `<div class="kpiGrid">${Object.keys(ESTADOS).map(e => `<button class="kpi libKpi" data-lib-state="${e}"><span>${punto(e)}${ESTADOS[e]}</span><b>${cuenta[e]}</b><small>${guardado ? 'de ' + rooms.length + ' recintos' : 'Carga un Excel'}</small></button>`).join('')}</div>` +
      `<div class="layerLayout"><section class="chartCard"><h3>Datos</h3><p>${guardado ? 'Excel: <b>' + esc(guardado.nombre) + '</b> · cargado el ' + esc(new Date(guardado.fecha).toLocaleString('es-CL')) : 'Aún no hay un Excel cargado en este navegador.'}</p>${d ? `<p class="dataNote">Ciclo ITO: ${d.ciclo} días corridos · Fecha de corte: ${textoFecha(d.corte ?? hoyDia())}${d.corte == null ? ' (hoy)' : ''} · ${d.solicitudes.length} consultas/PTO leídas. Un mismo Excel sirve para todos los pisos.</p>` : ''}<label class="primary libUpload">Cargar Excel…<input id="libArchivo" type="file" accept=".xlsx,.xls" hidden></label><button id="libEjemplo">Usar datos de ejemplo</button>${guardado ? '<button id="libQuitar">Quitar datos</button>' : ''}<button data-go-map>Ver el plano ↗</button><details><summary>Formato del Excel</summary><p>Hojas <b>Parámetros</b> (Ciclo ITO, Fecha de corte), <b>Recintos</b> (Código, Nombre, Sector, Piso), <b>Solicitudes</b> (N°, Tipo, Asunto, Recinto o Terminación como «PAV 106», Emisión, Requerida, Estado, Responsable) y <b>Programa</b> (Recinto, Actividad, Inicio, Holgura).</p><p>Bloqueado: consulta rechazada o con holgura negativa (requerida − emisión − ciclo ITO). Con restricción: consulta abierta con holgura. Liberado: sin consultas abiertas.</p></details></section>` +
      `<section class="chartCard"><h3>Recintos que requieren gestión (${criticos.length})</h3>${criticos.slice(0, 60).map(({r, c}) => `<button class="distributionRow" data-lib-room="${esc(r.id)}"><span>${punto(c.estado)}${esc(r.code)} · ${esc(r.name)}</span><b>${c.solicitudes[0] ? esc(holguraTexto(c.solicitudes[0])) : ''}</b></button>`).join('') || `<p>${guardado ? 'Ningún recinto bloqueado ni con restricción en este piso.' : 'Carga el Excel para calcular el semáforo.'}</p>`}${criticos.length > 60 ? '<p class="dataNote">Se muestran los 60 más urgentes.</p>' : ''}</section></div>`;
  }
  function bindPage(root) {
    root.querySelectorAll('[data-lib-state]').forEach(b => b.onclick = () => { if (guardado) ctx.paint(ESTADOS[b.dataset.libState]); else ctx.toast('Carga primero el Excel de liberación.'); });
    root.querySelectorAll('[data-lib-room]').forEach(b => b.onclick = () => { ctx.show('map'); ctx.select(b.dataset.libRoom); });
    root.querySelector('#libArchivo').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { usar(await leerArchivo(await f.arrayBuffer()), f.name); ctx.toast('Excel cargado: ' + f.name); }
      catch (err) { ctx.toast('No se pudo leer «' + f.name + '»: ' + err.message + '. Revisa que tenga las hojas Recintos, Solicitudes y Programa.'); }
      finally { e.target.value = ''; }
    };
    root.querySelector('#libEjemplo').onclick = async () => {
      try { const res = await fetch('./liberacion/datos-ejemplo.xlsx'); if (!res.ok) throw Error('Ejemplo no disponible'); usar(await leerArchivo(await res.arrayBuffer()), 'datos-ejemplo.xlsx (datos de prueba)'); }
      catch (err) { ctx.toast(err.message); }
    };
    const quitar = root.querySelector('#libQuitar');
    if (quitar) quitar.onclick = () => { guardado = null; calculo = new Map(); try { localStorage.removeItem(CLAVE); } catch { /* nada */ } ctx.changed(); };
  }
  return {estado, ficha, bind, page, bindPage, dot: r => guardado ? punto(estado(r)) : ''};
}
