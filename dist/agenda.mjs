// Agenda de terreno: lo que jefatura te asignó, separado en Hoy (con lo atrasado y lo devuelto) y Esta semana (hasta el
// domingo). Lo de más adelante y lo sin fecha sigue en Mis tareas. Sin DOM: lo prueba agenda-test.mjs.
export const ABIERTAS_AGENDA = ['asignada', 'en_curso', 'devuelta'];

// Domingo de la semana de «hoy» (aaaa-mm-dd). La semana va de lunes a domingo, como Last Planner.
export function finDeSemana(hoy) {
  const d = new Date(hoy + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (7 - d.getUTCDay()) % 7);
  return d.toISOString().slice(0, 10);
}

export function agruparAgenda(metas, yo, hoy) {
  const fin = finDeSemana(hoy), grupos = {hoy: [], semana: [], despues: []};
  for (const m of metas) {
    if (m.asignadaA !== yo || !ABIERTAS_AGENDA.includes(m.estado)) continue;
    const f = m.fechaLimite || '';
    if (m.estado === 'devuelta' || (f && f <= hoy)) grupos.hoy.push(m);
    else if (f && f <= fin) grupos.semana.push(m);
    else grupos.despues.push(m);
  }
  const orden = (a, b) => (b.estado === 'devuelta') - (a.estado === 'devuelta') || String(a.fechaLimite || '9999').localeCompare(String(b.fechaLimite || '9999')) || String(a.titulo).localeCompare(String(b.titulo), 'es');
  for (const g of Object.values(grupos)) g.sort(orden);
  return grupos;
}

// Texto corto de la fecha de una tarea respecto de hoy.
export function cuando(m, hoy) {
  if (m.estado === 'devuelta') return 'Devuelta';
  if (!m.fechaLimite) return 'Sin fecha';
  if (m.fechaLimite < hoy) return 'Atrasada · ' + m.fechaLimite.split('-').reverse().join('-');
  if (m.fechaLimite === hoy) return 'Hoy';
  return 'Hasta el ' + m.fechaLimite.split('-').reverse().join('-');
}
