// Progress is a project in the existing marking store/cloud, separate from the source PDF and ARQ progress.
export const esImpermeabilizacion = d => d?.schema === 3 && d.tipo === 'impermeabilizacion';
export const IMP_STATES = {
  pendiente: {name:'Pendiente', color:'#7a8793'},
  ejecucion: {name:'En ejecución', color:'#176ec4'},
  parcial: {name:'Avance parcial', color:'#c58618'},
  terminado: {name:'Terminado', color:'#198253'},
  observado: {name:'Observado', color:'#bc4242'},
};
const text = (s,n) => typeof s === 'string' && !!s.trim() && s.length <= n;
export function validarImpermeabilizacion(d) {
  if (!esImpermeabilizacion(d) || d.specialty !== 'waterproofing' || d.level !== 'N-1' || !text(d.id,100)) throw Error('Registro IMP inválido.');
  for (const [k,n] of [['name',160],['author',160],['purpose',2000]]) if (!text(d[k],n)) throw Error('Registro IMP incompleto: '+k);
  if (!Number.isSafeInteger(d.version) || d.version < 1 || ![d.createdAt,d.updatedAt].every(v=>Number.isFinite(Date.parse(v)))) throw Error('Versión o fecha IMP inválida.');
  if (!/^[a-f0-9]{64}$/.test(d.source?.sha256||'') || d.source?.sheetId !== 'imp-s01' || !Number.isSafeInteger(d.source.registrationVersion)) throw Error('Fuente IMP inválida.');
  if (!Array.isArray(d.history) || d.history.length > 20000) throw Error('Historial IMP inválido.');
  const ids=new Set();
  for (const e of d.history) {
    if (!text(e.id,100) || ids.has(e.id) || !text(e.roomId,160) || !text(e.code,160) || !IMP_STATES[e.state] || !text(e.author,160) || !Number.isFinite(Date.parse(e.at)) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date||'') || !Number.isFinite(Date.parse(e.date)) || new Date(e.date).toISOString().slice(0,10)!==e.date || typeof e.note!=='string' || e.note.length>1000) throw Error('Evento IMP inválido.');
    ids.add(e.id);
  }
  return d;
}
export function nuevoAvanceIMP(catalog, author, at=new Date().toISOString()) {
  return validarImpermeabilizacion({schema:3,tipo:'impermeabilizacion',specialty:'waterproofing',id:'imp-s01-avance-'+catalog.document.sha256.slice(0,16)+'-v'+catalog.registration.version,level:'N-1',name:'Impermeabilización S01 · avance',author,purpose:'Seguimiento sobre HPC-ARQ-DET-IMP-A-908 Rev01',version:1,createdAt:at,updatedAt:at,source:{sheetId:catalog.id,sha256:catalog.document.sha256,registrationVersion:catalog.registration.version},history:[]});
}
// Date cut is based on the reported work date; later corrections on that date win by recording timestamp.
export const ultimoAvanceIMP = (d,id,cut='9999-12-31') => d?.history.filter(e=>e.roomId===id && e.date<=cut).sort((a,b)=>a.date.localeCompare(b.date)||a.at.localeCompare(b.at)||a.id.localeCompare(b.id)).at(-1) || null;
export function registrarAvanceIMP(d,room,{state,date,note='',author,id,at=new Date().toISOString()}) {
  const last=ultimoAvanceIMP(d,room.id);
  if (last?.state===state && last.date===date && last.note===note.trim()) return d;
  return validarImpermeabilizacion({...d,updatedAt:at,history:[...d.history,{id,roomId:room.id,code:room.code,state,date,note:note.trim(),author,at}]});
}
export const impPath = parts => parts.flatMap(p=>[p.polygon,...p.holes]).map(r=>'M'+r.map(p=>p.join(',')).join('L')+'Z').join('');
