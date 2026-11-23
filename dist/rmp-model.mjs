// Curvas del RMP (Reporte Mensual de Progreso) en ATLAS, con los mismos pesos que usa Planificación: así, si el RMP dice
// 68 %, ATLAS dice 68 %. Decidido 2026-11-20/22:
// - Pesos por partida EETT de la planilla de Planificación (plantilla de ATLAS, hoja «Pesos»).
// - Lo que ATLAS mide en terreno (terminaciones) entra con el avance de ATLAS en el mes actual; lo que no mide
//   (estructura, instalaciones…) y los meses cerrados, con el % de Planificación (hoja «Avance mensual»).
// - Sin planilla cargada, los gráficos aparecen desactivados con el motivo.
// Cuatro gráficos: curva S plan/real con proyección, eficiencia (real/plan), plan vs real de los últimos 4 meses y
// cumplimiento de la programación. Todo acumulado en % de la obra.
import {avanceTarea} from './programa-obra-model.mjs';

export const SCHEMA = 1, ID = 'rmp-pesos';
export const HOJA_PESOS = 'Pesos', HOJA_MESES = 'Avance mensual';
export const COLUMNAS_PESOS = ['Partida EETT', 'Nombre', 'Peso %', 'Mide ATLAS (Sí/No)'];
export const COLUMNAS_MESES = ['Mes (aaaa-mm)', 'Partida EETT', 'Plan acumulado %', 'Real acumulado %'];
const MES = /^\d{4}-(0[1-9]|1[0-2])$/, CODIGO = /^\d+(\.\d+)*$/;
const falla = m => { throw Error(m); };
const limpio = v => String(v ?? '').trim();
const numero = v => { if (v === '' || v == null) return null; const n = typeof v === 'number' ? v : Number(String(v).replace('%', '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const siNo = v => /^(s[ií]|si|x|1|true)$/i.test(limpio(v));
// Fecha de Excel (número de serie) o texto «aaaa-mm», «mm-aaaa», «mm/aaaa» → «aaaa-mm».
export function mesDe(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 7); }
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  const t = limpio(v); let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})/.exec(t))) return m[1] + '-' + m[2].padStart(2, '0');
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(t))) return m[2] + '-' + m[1].padStart(2, '0');
  return null;
}
export const mesSiguiente = mes => { const [a, m] = mes.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };
export const mesDeFecha = iso => String(iso).slice(0, 7);

// Plantilla para Planificación: dos hojas con un ejemplo que se borra.
export function plantillaRMP() {
  return {
    [HOJA_PESOS]: [COLUMNAS_PESOS, ['5.1', 'Tabiquería (ejemplo, borrar)', 4.5, 'Sí'], ['2.1', 'Hormigón armado (ejemplo, borrar)', 18, 'No']],
    [HOJA_MESES]: [COLUMNAS_MESES, ['2026-10', '2.1', 98, 97], ['2026-10', '5.1', 60, 41]],
  };
}

// hojas: {nombre: filas (arreglo de arreglos)}. Devuelve el registro para la Nube (sin cargada/por) y los avisos.
export function leerPesosRMP(hojas) {
  const buscar = nombre => Object.entries(hojas || {}).find(([k]) => limpio(k).toLowerCase() === nombre.toLowerCase())?.[1];
  const pesos = buscar(HOJA_PESOS), meses = buscar(HOJA_MESES), avisos = [];
  if (!pesos) falla(`Falta la hoja «${HOJA_PESOS}». Descarga la plantilla de ATLAS y completa sus dos hojas.`);
  const partidas = [], vistos = new Set();
  pesos.slice(1).forEach((f, i) => {
    const codigo = limpio(f[0]); if (!codigo && !limpio(f[2])) return;
    const fila = i + 2, peso = numero(f[2]);
    if (!CODIGO.test(codigo)) falla(`Hoja «${HOJA_PESOS}», fila ${fila}: «${codigo}» no es un código de partida EETT (por ejemplo 5.1 o 6.2.3).`);
    if (vistos.has(codigo)) falla(`Hoja «${HOJA_PESOS}», fila ${fila}: la partida ${codigo} está repetida.`);
    if (!(peso >= 0 && peso <= 100)) falla(`Hoja «${HOJA_PESOS}», fila ${fila}: el peso de ${codigo} debe ir de 0 a 100 %.`);
    vistos.add(codigo); partidas.push({codigo, nombre: limpio(f[1]).slice(0, 200), peso, mideAtlas: siNo(f[3])});
  });
  if (!partidas.length) falla(`La hoja «${HOJA_PESOS}» no trae partidas.`);
  const total = partidas.reduce((s, p) => s + p.peso, 0);
  if (!(total > 0)) falla('Los pesos suman 0 %.');
  if (Math.abs(total - 100) > .5) avisos.push(`Los pesos suman ${total.toLocaleString('es-CL', {maximumFractionDigits: 2})} %; ATLAS los lleva a 100 % en la misma proporción.`);
  const porMes = {};
  (meses || []).slice(1).forEach((f, i) => {
    const mes = mesDe(f[0]), codigo = limpio(f[1]); if (!mes && !codigo) return;
    const fila = i + 2, plan = numero(f[2]), real = numero(f[3]);
    if (!mes || !MES.test(mes)) falla(`Hoja «${HOJA_MESES}», fila ${fila}: el mes va como aaaa-mm (por ejemplo 2026-10).`);
    if (!vistos.has(codigo)) falla(`Hoja «${HOJA_MESES}», fila ${fila}: la partida ${codigo || '(vacía)'} no está en la hoja «${HOJA_PESOS}».`);
    for (const [v, nombre] of [[plan, 'plan'], [real, 'real']]) if (v !== null && !(v >= 0 && v <= 100)) falla(`Hoja «${HOJA_MESES}», fila ${fila}: el ${nombre} acumulado va de 0 a 100 %.`);
    (porMes[mes] ||= {})[codigo] = {plan, real};
  });
  if (!meses) avisos.push(`No viene la hoja «${HOJA_MESES}»: sin el plan mensual de Planificación no hay curva programada.`);
  return {registro: validarRMP({schema: SCHEMA, partidas, meses: porMes}), avisos};
}
export function validarRMP(d) {
  if (!d || d.schema !== SCHEMA || !Array.isArray(d.partidas) || !d.partidas.length || typeof d.meses !== 'object' || Array.isArray(d.meses)) falla('Pesos del RMP inválidos.');
  for (const p of d.partidas) if (!CODIGO.test(p.codigo) || !(p.peso >= 0 && p.peso <= 100) || typeof p.mideAtlas !== 'boolean') falla('Partida del RMP inválida.');
  for (const [mes, fila] of Object.entries(d.meses)) if (!MES.test(mes) || typeof fila !== 'object') falla('Mes del RMP inválido.');
  return d;
}

// Avance que ATLAS mide hoy por partida EETT, sumando los pisos cargados. reportes: partidas del reporte de cada piso
// (avance-model.reporteAvance(...).partidas). Devuelve Map código → % (0..100) solo para las partidas con datos.
export function avanceAtlas(codigos, reportes) {
  const r = new Map();
  for (const codigo of codigos) {
    let total = 0, ejecutado = 0;
    for (const partidas of reportes) { const a = avanceTarea({codigo}, partidas); if (a.partidas) { total += a.total; ejecutado += a.ejecutado; } }
    if (total > 0) r.set(codigo, 100 * ejecutado / total);
  }
  return r;
}

// Curvas. hoy: «aaaa-mm-dd». atlas: Map código → % de hoy para las partidas que ATLAS mide (avanceAtlas).
export function curvasRMP(rmp, {hoy, atlas = new Map()} = {}) {
  validarRMP(rmp);
  const total = rmp.partidas.reduce((s, p) => s + p.peso, 0), peso = p => p.peso / total;
  const mesHoy = mesDeFecha(hoy), lista = Object.keys(rmp.meses).sort();
  if (!lista.length) return {puntos: [], proyeccion: [], eficiencia: [], ultimos: [], cumplimiento: null, desviacion: null, mesHoy, conAtlas: 0};
  // Meses continuos desde el primero hasta el último informado (o hasta hoy, si es después).
  const meses = []; for (let m = lista[0]; m <= (lista.at(-1) > mesHoy ? lista.at(-1) : mesHoy); m = mesSiguiente(m)) meses.push(m);
  // Valor acumulado de una partida en un mes: el último informado hasta ese mes (el acumulado no baja si falta un mes).
  const ultimo = (codigo, mes, campo) => { let v = null; for (const m of lista) { if (m > mes) break; const x = rmp.meses[m]?.[codigo]?.[campo]; if (x != null) v = x; } return v; };
  let conAtlas = 0;
  const puntos = meses.map(mes => {
    let plan = 0, real = 0, conPlan = false, conReal = false;
    for (const p of rmp.partidas) {
      const pl = ultimo(p.codigo, mes, 'plan'); if (pl != null) { plan += peso(p) * pl; conPlan = true; }
      if (mes > mesHoy) continue;
      // Mes actual y partida que ATLAS mide: el avance de terreno de ATLAS, salvo que sea menor que lo ya informado por
      // Planificación (un acumulado no retrocede; pasa cuando aún no se marca en ATLAS todo lo ejecutado). Si no, lo informado.
      let re = ultimo(p.codigo, mes, 'real');
      if (mes === mesHoy && p.mideAtlas && atlas.has(p.codigo) && atlas.get(p.codigo) >= (re ?? 0)) { re = atlas.get(p.codigo); conAtlas++; }
      if (re != null) { real += peso(p) * re; conReal = true; }
    }
    return {mes, plan: conPlan ? redondo(plan) : null, real: mes <= mesHoy && conReal ? redondo(real) : null};
  });
  const conReal = puntos.filter(p => p.real != null), actual = conReal.at(-1) || null;
  // Proyección: el ritmo real de los últimos 3 meses, desde el último real hasta 100 %.
  const proyeccion = [];
  if (conReal.length >= 2) {
    const tramo = conReal.slice(-4), ritmo = (tramo.at(-1).real - tramo[0].real) / (tramo.length - 1);
    if (ritmo > .05) { let v = actual.real, m = actual.mes; proyeccion.push({mes: m, valor: v}); for (let i = 0; i < MESES_PROYECCION && v < 100; i++) { m = mesSiguiente(m); v = Math.min(100, v + ritmo); proyeccion.push({mes: m, valor: redondo(v)}); } }
  }
  const eficiencia = puntos.filter(p => p.real != null && p.plan > 0).map(p => ({mes: p.mes, valor: Math.round(100 * p.real / p.plan) / 100}));
  // Plan vs real de cada mes (avance del mes, no acumulado) en los últimos 4 meses con real.
  const ultimos = conReal.slice(-4).map(p => { const i = puntos.indexOf(p), previo = puntos[i - 1]; return {mes: p.mes, plan: redondo((p.plan ?? 0) - (previo?.plan ?? 0)), real: redondo(p.real - (previo?.real ?? 0))}; });
  const cumplimiento = actual && actual.plan > 0 ? Math.min(1, actual.real / actual.plan) : null;
  return {puntos, proyeccion, eficiencia, ultimos, cumplimiento, desviacion: cumplimiento == null ? null : 1 - cumplimiento, mesHoy, actual, conAtlas};
}
export const MESES_PROYECCION = 36; // la proyección se dibuja hasta 3 años después del último real (o hasta 100 %)
const redondo = v => Math.round(v * 100) / 100;
