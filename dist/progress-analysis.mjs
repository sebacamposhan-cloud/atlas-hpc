// Drill-down shares the report's floor/PMA/eligibility decisions; it never reads other data sources.
export function progressDetails(rows, family = '', focus = {kind:'all'}) {
 const matches = (row, task) => {
  switch (focus?.kind) {
   case 'all': return true;
   case 'installation': return task.installation === focus.value;
   case 'quality': return task.installation === 'Instalado' && task.quality === focus.value;
   case 'sector': return (row.room.sector || 'Sin sector') === focus.value && !(task.installation === 'Instalado' && task.quality === 'Conforme');
   case 'installed': return task.installation === 'Instalado';
   case 'accepted': return task.installation === 'Instalado' && task.quality === 'Conforme';
   case 'observed': return task.quality === 'Con observaciones';
   case 'complete': return row.complete;
   default: return false;
  }
 };
 return rows.flatMap(row => row.tasks.filter(task => task.documented && (!family || task.field === family) && matches(row, task)).map(task => ({room:row.room, task, record:task.stale?null:row.record})));
}
export function progressCoverage(rows, family = '') {
 const details = progressDetails(rows, family);
 const recorded = details.filter(({task}) => task.installation !== 'Sin registrar').length;
 return {total:details.length,recorded,unregistered:details.length-recorded,
  stale:details.filter(({task})=>task.stale).length,
  awaitingReview:details.filter(({task})=>task.installation==='Instalado'&&task.quality==='Sin revisar').length};
}
