import {ESTADOS,CATEGORIAS,PENDIENTES,vencida} from './observaciones-model.mjs';
export const estadoObservacion = estado => estado === 'Corregida' ? 'Por validar' : estado;
export const referenciaObservacion = obs => {const id=obs.id.toUpperCase(),ref=id.startsWith('OBS-')?id:'OBS-'+id;return ref.length<=24?ref:ref.slice(0,12)+'…'+ref.slice(-8);};
const normalizar = v => String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
export function filtrarObservaciones(lista, filtros, hoy) {
 const palabras=normalizar(filtros.texto).trim().split(/\s+/).filter(Boolean);
 return lista.filter(o=>{
  if(filtros.estado==='Pendientes'?!PENDIENTES.has(o.estado):filtros.estado&&o.estado!==filtros.estado)return false;
  if(filtros.categoria&&o.categoria!==filtros.categoria)return false;
  if(filtros.responsable&&(o.responsable||'Sin responsable')!==filtros.responsable)return false;
  if(filtros.prioridad&&o.prioridad!==filtros.prioridad)return false;
  if(filtros.vencidas&&!vencida(o,hoy))return false;
  const texto=normalizar([referenciaObservacion(o),o.id,o.room.code,o.room.name,o.descripcion,o.responsable||'',o.categoria].join(' '));
  return palabras.every(p=>texto.includes(p));
 });
}
export function facetasObservaciones(lista,filtros,hoy){
 const porCategoria=filtrarObservaciones(lista,{...filtros,categoria:''},hoy),porEstado=filtrarObservaciones(lista,{...filtros,estado:''},hoy);
 return {categorias:[{value:'',label:'Todas las categorías',n:porCategoria.length},...CATEGORIAS.map(value=>({value,label:value,n:porCategoria.filter(o=>o.categoria===value).length}))],
  estados:[{value:'',label:'Todas',n:porEstado.length},{value:'Pendientes',label:'Pendientes',n:porEstado.filter(o=>PENDIENTES.has(o.estado)).length},...ESTADOS.map(value=>({value,label:estadoObservacion(value),n:porEstado.filter(o=>o.estado===value).length}))]};
}
