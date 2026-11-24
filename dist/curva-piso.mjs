// Curva del piso con el criterio del RMP (decidido el 23-11-2026, docs/CURVAS_RMP.md):
// - Alcance: las terminaciones del piso que ATLAS mide (pavimento, cielo y muros), agrupadas en las tareas del programa.
// - Peso de cada tarea: su costo de línea base 1 (campo «peso» del programa importado, % de la obra). Dentro de la tarea,
//   cada partida pesa sus m² del PMA (o una por recinto si no tiene superficie).
// - Plan: línea base 1, lineal entre su inicio y su fin. Sin línea base (programa importado antes), las fechas vigentes.
// - Real medido: cada partida suma su % desde la fecha de lo que la dejó así (la carga de la planilla de medición de la
//   oficina o la marca en terreno). Antes de lo primero medido no hay real medido.
// - Real estimado: el % de Terminaciones del RMP de cada mes escalado al piso (k = real del piso ÷ Terminaciones del RMP
//   en una fecha ancla). Con planilla de medición, el ancla es la fecha de la planilla (una medición completa) y la
//   estimación cubre lo anterior. Sin planilla, lo marcado en terreno se va poniendo al día de a poco: el ancla es hoy y la
//   estimación llega hasta hoy, por sobre lo marcado, donde se junta con el real. Se dibuja distinto: no es medición.
// - Referencia: el % de Terminaciones de la obra según el RMP.
// Sin DOM: lo prueba curva-piso-test.mjs.
import {tareaDeItem, fraccionProgramada} from './programa-obra-model.mjs';

const SEMANA = 7 * 864e5;
const t = d => Date.parse(d + 'T12:00:00Z'), dia = ms => new Date(ms).toISOString().slice(0, 10), mes = d => d.slice(0, 7);
const uno = v => Math.round(v * 10) / 10;
export const CAPITULO_TERMINACIONES = '6';

// % de Terminaciones de la obra por mes según la planilla del RMP (rmp-model): promedio ponderado del real de las
// partidas del capítulo 6, solo en los meses que lo informan. Map «aaaa-mm» → %.
export function terminacionesRMP(rmp) {
  const r = new Map(), ps = (rmp?.partidas || []).filter(p => p.codigo === CAPITULO_TERMINACIONES || p.codigo.startsWith(CAPITULO_TERMINACIONES + '.'));
  const total = ps.reduce((a, p) => a + p.peso, 0); if (!total) return r;
  for (const [m, fila] of Object.entries(rmp.meses || {}).sort()) {
    const conReal = ps.filter(p => fila?.[p.codigo]?.real != null); if (!conReal.length) continue;
    const peso = conReal.reduce((a, p) => a + p.peso, 0);
    r.set(m, conReal.reduce((a, p) => a + p.peso * fila[p.codigo].real, 0) / peso);
  }
  return r;
}

// partidas: [{id, cantidad, pct (0..100), at («aaaa-mm-dd…» de lo que dejó ese %)}] de las terminaciones del piso.
// programa: el del piso (programa-obra-nube). hoy: «aaaa-mm-dd». rmp: planilla del RMP (o null). medicion: fecha de la
// planilla de medición de la oficina cargada para el piso (o null).
export function curvaPiso(partidas, programa, hoy, rmp = null, {medicion = null} = {}) {
  const grupos = new Map(); let sinTarea = 0;
  for (const p of partidas) {
    const tarea = tareaDeItem(programa, p.id);
    if (!tarea) { sinTarea++; continue; }
    const g = grupos.get(tarea.codigo) || {tarea, partidas: []}; g.partidas.push(p); grupos.set(tarea.codigo, g);
  }
  const lista = [...grupos.values()];
  if (!lista.length) return {puntos: [], criterio: null, sinTarea, partidas: partidas.length, tareas: 0};
  // Criterio RMP solo si todas las tareas traen línea base y peso; si no, fechas vigentes y m².
  const rmpOk = lista.every(g => g.tarea.inicioBase && g.tarea.finBase && g.tarea.peso > 0);
  for (const g of lista) {
    const porM2 = g.partidas.every(p => p.cantidad > 0);
    g.pesos = g.partidas.map(p => porM2 ? p.cantidad : 1); g.suma = g.pesos.reduce((a, v) => a + v, 0);
    g.peso = rmpOk ? g.tarea.peso : g.suma;
    g.inicio = rmpOk ? g.tarea.inicioBase : g.tarea.inicio; g.fin = rmpOk ? g.tarea.finBase : g.tarea.fin;
  }
  const total = lista.reduce((a, g) => a + g.peso, 0);
  const cuando = p => String(p.at || hoy).slice(0, 10);
  const realA = d => 100 * lista.reduce((a, g) => a + g.peso * g.partidas.reduce((s, p, i) => s + (cuando(p) <= d ? g.pesos[i] * Math.min(100, Math.max(0, p.pct || 0)) / 100 : 0), 0) / g.suma, 0) / total;
  const planA = d => 100 * lista.reduce((a, g) => a + g.peso * fraccionProgramada(g.inicio, g.fin, d), 0) / total;
  // Lo primero medido: la fecha más temprana de una partida con avance.
  const medidas = lista.flatMap(g => g.partidas).filter(p => p.pct > 0).map(cuando).sort();
  const conPlanilla = !!(medicion && medidas.length && medidas[0] <= medicion), desde = conPlanilla ? medicion.slice(0, 10) : medidas[0] || null;
  // Estimación con el RMP: k = real del piso en el ancla ÷ Terminaciones del RMP de ese mes (el último informado hasta ahí).
  const term = terminacionesRMP(rmp), mesesT = [...term.keys()];
  const termA = m => { let v = null; for (const k of mesesT) { if (k > m) break; v = term.get(k); } return v; };
  const ancla = conPlanilla ? desde : desde ? hoy : null, realAncla = ancla ? realA(ancla) : null, t0 = ancla ? termA(mes(ancla)) : null;
  const k = realAncla > 0 && t0 > 0 ? realAncla / t0 : null;
  const primeroT = mesesT[0] || null, ultimoT = mesesT.at(-1) || null;
  const h = t(hoy), inicios = lista.map(g => t(g.inicio)), fines = lista.map(g => t(g.fin));
  const primera = Math.min(h, ...inicios, ...(desde ? [t(desde)] : [])), ultima = Math.max(h, ...fines);
  const atras = Math.ceil((h - primera) / SEMANA) + 1, adelante = Math.ceil((ultima - h) / SEMANA);
  const puntos = Array.from({length: atras + adelante + 1}, (_, i) => {
    const d = dia(h + (i - atras) * SEMANA), m = mes(d), pasado = d <= hoy;
    const medido = pasado && desde && d >= desde ? uno(realA(d)) : null;
    const tm = primeroT && m >= primeroT && m <= ultimoT ? termA(m) : null;
    const te = primeroT && m >= primeroT ? termA(m) : null;
    const estimado = !pasado || k == null || te == null ? null : conPlanilla ? (d < desde ? uno(Math.min(realAncla, te * k)) : null) : uno(Math.min(realAncla, te * k));
    return {fecha: d, programado: uno(planA(d)), real: medido, estimado, referencia: pasado && tm != null ? uno(tm) : null};
  });
  // El último punto es hoy exacto (el real de hoy cuenta lo marcado hoy). Con planilla, la estimación empalma con lo
  // primero medido; sin planilla, termina hoy en el real (el ancla).
  const iDesde = conPlanilla ? puntos.findIndex(p => p.real != null) : -1;
  if (iDesde > 0 && puntos[iDesde - 1].estimado != null) puntos[iDesde].estimado = puntos[iDesde].real;
  return {puntos, criterio: rmpOk ? 'rmp' : 'vigente', sinTarea, partidas: partidas.length, tareas: lista.length, desde, conPlanilla, factor: k,
    pesoObra: rmpOk ? Math.round(1e4 * total) / 1e4 : null};
}
