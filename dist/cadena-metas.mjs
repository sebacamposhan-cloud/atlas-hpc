// Cadena Proyectos → Avance → Last Planner (decidido 2026-11-20). El avance del recinto se marca en el rombo o con el
// pincel de un proyecto de partida (levantamiento.mjs → avance-marcar.mjs); aquí ese avance llega a las metas:
// - «Instalado» suma al avance de la meta enseguida: cada superficie del frente toma el avance de sus partidas.
// - Cuando todas las superficies del frente quedan «Instalado» y «Conforme», la meta pasa a «hecha», que es «por
//   confirmar»: la cierra a mano quien la asignó (o su jefatura) con «Confirmar» o la devuelve. Nada se confirma solo.
// El servidor y la base solo dejan marcar a quien recibió la meta, así que la cadena corre en su equipo: al cambiar el
// avance (marcado aquí o bajado de la Nube) o sus metas. Sirve igual en todos los pisos: lee el piso activo.
import {ABIERTAS} from './jerarquia-model.mjs';

// Superficie del frente (lastplanner-cycle-model, validateScope) → grupos del rombo (resumenRecinto de avance-model).
export const GRUPOS_DE_TIPO = {pavimentos: ['PAV'], cielos: ['CIE'], muros: ['M'], recinto: ['PAV', 'CIE', 'M']};

// Estado de una superficie desde el resumen del recinto. null: el PMA no trae partidas para esa superficie.
export function estadoSuperficie(resumen, tipo) {
  const ps = (resumen?.grupos || []).filter(g => (GRUPOS_DE_TIPO[tipo] || []).includes(g.campo)).flatMap(g => g.partidas);
  if (!ps.length) return null;
  const avance = ps.reduce((a, p) => a + Math.max(0, Math.min(100, p.pct || 0)), 0) / ps.length / 100;
  return {avance: Math.round(avance * 100) / 100, instalado: ps.every(p => p.ejecucion === 'Instalado'), conforme: ps.every(p => p.ejecucion === 'Instalado' && p.revision === 'Conforme')};
}

// Qué hacer con una meta: marcas que cambian ({scopeId: avance}) y si queda por confirmar.
// estados: Map scopeId → estadoSuperficie (o null si la superficie no tiene datos en este equipo).
export function planMeta(meta, estados) {
  if (!ABIERTAS.includes(meta.estado) || !meta.alcances?.length) return {marcas: {}, porConfirmar: false};
  const marcas = {};
  for (const s of meta.alcances) {
    const e = estados.get(s.id); if (!e) continue;
    const actual = meta.marcas?.[s.id]?.avance || 0;
    if (Math.abs(e.avance - actual) >= .005) marcas[s.id] = e.avance;
  }
  const porConfirmar = meta.alcances.every(s => estados.get(s.id)?.conforme);
  return {marcas, porConfirmar};
}

export const NOTA_CONFORME = 'Todas las superficies del frente quedaron instaladas y conformes en ATLAS. Falta que la confirme quien la asignó.';

// En el navegador: escucha el avance y las metas, y aplica planMeta a las metas abiertas que recibió esta cuenta en este piso.
export function iniciarCadenaMetas({toast = () => {}} = {}) {
  if (typeof window === 'undefined') return;
  let espera = 0, corriendo = false, otraVez = false;
  async function pasada() {
    const [{leerJerarquia, avanzar, hecha}, {cargarAvance}, {resumenRecinto}, {nivel}] = await Promise.all([
      import('./jerarquia-store.mjs'), import('./avance.mjs'), import('./avance-model.mjs'), import('./level.mjs')]);
    const d = await leerJerarquia();
    if (!d.actor || !d.perfil) return;
    const mias = d.metas.filter(m => m.asignadaA === d.actor.id && ABIERTAS.includes(m.estado) && m.alcances?.length && (!m.piso || m.piso === nivel.id));
    if (!mias.length) return;
    const c = await cargarAvance(), resumenes = new Map();
    const resumen = code => { if (!resumenes.has(code)) { const f = c.porCodigo.get(String(code).trim()); resumenes.set(code, f ? resumenRecinto(f.nodos, f.row) : null); } return resumenes.get(code); };
    for (const m of mias) {
      const estados = new Map(m.alcances.filter(s => !s.level || s.level === nivel.id).map(s => [s.id, estadoSuperficie(resumen(s.code), s.tipo)]));
      const plan = planMeta(m, estados);
      try {
        if (Object.keys(plan.marcas).length) await avanzar(m.id, {marcas: plan.marcas});
        if (plan.porConfirmar) { await hecha(m.id, NOTA_CONFORME); toast('Meta «' + m.titulo + '»: todo conforme. Queda por confirmar por quien la asignó.'); }
      } catch {} // sin permiso o con la meta cambiada en otro equipo: la próxima pasada vuelve a intentarlo con lo sincronizado
    }
  }
  async function correr() {
    if (corriendo) { otraVez = true; return; }
    corriendo = true;
    try { do { otraVez = false; await pasada(); } while (otraVez); } catch {} finally { corriendo = false; }
  }
  const programar = () => { clearTimeout(espera); espera = setTimeout(correr, 1500); };
  for (const evento of ['atlas-avance-changed', 'atlas-jerarquia-changed']) window.addEventListener(evento, programar);
  programar();
}
