import {nivel} from './level.mjs';
import {loadPma} from './pma.mjs';
import {readProgress} from './room-progress-store.mjs';
import {leerObservaciones} from './observaciones-store.mjs';
import {loadProtocolCatalog} from './protocol-catalog.mjs';
import {chileToday} from './protocol-aging.mjs';
import {overviewProgress,overviewObservations,overviewProtocols} from './floor-overview-model.mjs';

const num=n=>n.toLocaleString('es-CL'),percent=n=>n.toLocaleString('es-CL',{maximumFractionDigits:1})+'%';
const colors=['#b4bfc6','#bd9861','#3985a0','#4f896c'];
export function renderFloorOverview(root,ctx){
 const expanded=matchMedia('(min-width:701px)').matches;
 const esc=ctx.esc,request=(Number(root.dataset.overviewRequest)||0)+1;
 root.dataset.overviewRequest=request;
 const current=()=>root.isConnected&&Number(root.dataset.overviewRequest)===request;
 root.innerHTML=`<div class="overviewHeading"><div><h2>Resumen del piso</h2><p>Todo el piso · ${esc(nivel.nombre)}. Cada panel tiene sus propios filtros.</p></div><button type="button" data-overview-refresh>Actualizar resumen</button></div><div class="overviewGrid">${[['progress','Avance por recinto'],['observations','Observaciones'],['protocols','Protocolos de la matriz']].map(([id,title])=>`<section class="overviewCard" data-overview-source="${id}" aria-label="${title}" aria-busy="true"><h3>${title}</h3><p role="status">Cargando registros del piso…</p></section>`).join('')}</div><section class="overviewPending" aria-label="Pendientes del piso"><h3>Pendientes del piso</h3><p>Selecciona un pendiente para abrir sus registros.</p><div data-overview-pending="progress"></div><div data-overview-pending="observations"></div></section>`;
 root.querySelector('[data-overview-refresh]').onclick=()=>renderFloorOverview(root,ctx);
 function row(action,label,n,total,color,value=''){
  return `<button type="button" class="overviewRow" data-overview-action="${action}" data-value="${esc(value)}"><span>${esc(label)}</span><b>${num(n)} <span aria-hidden="true">↗</span></b>${total?`<i aria-hidden="true"><em style="width:${100*n/total}%;background:${color}"></em></i>`:''}</button>`;
 }
 function pending(action,label,n,value=''){
  return `<button type="button" class="overviewPendingRow" data-overview-action="${action}" data-value="${esc(value)}"><span>${esc(label)}</span><b>${num(n)}</b><span aria-hidden="true">↗</span></button>`;
 }
 function bind(target){target.querySelectorAll('[data-overview-action]').forEach(button=>button.onclick=()=>{
  const {overviewAction:action,value}=button.dataset;
  if(action==='progress-installation')ctx.open('room-progress',{focus:{kind:'installation',value}});
  else if(action==='progress-quality')ctx.open('room-progress',{focus:{kind:'quality',value}});
  else if(action==='progress')ctx.open('room-progress',value==='complete'?{status:'complete',focus:{kind:'complete'}}:{focus:{kind:value||'all'}});
  else if(action==='observations')ctx.open('observaciones',{estado:value});
  else if(action==='overdue')ctx.open('observaciones',{estado:'Pendientes',vencidas:true});
  else if(action==='protocols')ctx.open('matrix',{scopeState:value});
 });}
 function load(source,fetchValue,draw){
  const target=root.querySelector(`[data-overview-source="${source}"]`),pendingRoot=root.querySelector(`[data-overview-pending="${source}"]`);
  const sourceRequest=Number(target.dataset.sourceRequest||0)+1;target.dataset.sourceRequest=sourceRequest;
  const active=()=>current()&&Number(target.dataset.sourceRequest)===sourceRequest;
  return Promise.resolve().then(fetchValue).then(value=>{
   if(!active())return;draw(target,pendingRoot,value);bind(target);if(pendingRoot)bind(pendingRoot);
  }).catch(()=>{
   if(!active())return;
   target.innerHTML=`<h3>${source==='progress'?'Avance por recinto':source==='observations'?'Observaciones':'Protocolos de la matriz'}</h3><p role="alert">No se pudieron leer estos registros. Los otros indicadores siguen disponibles.</p><button type="button" data-overview-retry>Reintentar</button>`;
   if(pendingRoot)pendingRoot.innerHTML='<p class="overviewNote">'+(source==='progress'?'Pendientes de avance':'Pendientes de observaciones')+': sin datos disponibles.</p>';
   target.querySelector('[data-overview-retry]').onclick=()=>{target.setAttribute('aria-busy','true');target.innerHTML='<p role="status">Cargando registros del piso…</p>';load(source,fetchValue,draw);};
  }).finally(()=>{if(active())target.setAttribute('aria-busy','false');});
 }
 const jobs=[
  load('progress',async()=>{const [model,snapshot]=await Promise.all([loadPma(),readProgress()]);return overviewProgress(model,ctx.rooms(),snapshot.records,nivel.id);},(target,pendingRoot,r)=>{
   target.innerHTML=`<h3>Instalación de partidas</h3><button type="button" class="overviewMetric" data-overview-action="progress" data-value="installed"><b data-overview-installed>${r.installedPercent===null?'Sin base':percent(r.installedPercent)}</b><span>${num(r.installed)} / ${num(r.total)} partidas instaladas ↗</span></button><details class="overviewBreakdown" ${expanded?'open':''}><summary>Desglose y fuente</summary><div class="overviewRows">${r.installation.map(({state,n},i)=>row('progress-installation',state,n,r.total,colors[i],state)).join('')}</div><button type="button" class="overviewSubmetric" data-overview-action="progress" data-value="accepted"><b>${num(r.accepted)} / ${num(r.total)}</b> instaladas y conformes ↗</button><button type="button" class="overviewSubmetric" data-overview-action="progress" data-value="complete"><b>${num(r.complete)} / ${num(r.roomCount)}</b> recintos completos y conformes ↗</button><p class="overviewNote">${num(r.coverage.recorded)} / ${num(r.total)} partidas con estado registrado. Cada partida cuenta una vez, sin ponderar superficie ni costo. Avance guardado en este equipo.</p>${r.unknown||r.withoutPma||r.coverage.stale?`<p class="overviewWarning">${num(r.withoutPma)} recintos sin correspondencia PMA · ${num(r.unknown)} partidas sin definición · ${num(r.coverage.stale)} partidas requieren cotejar la fuente.</p>`:''}</details>`;
   pendingRoot.innerHTML=pending('progress-quality','Instaladas sin revisar',r.coverage.awaitingReview,'Sin revisar')+pending('progress','Partidas con observaciones',r.observed,'observed')+pending('progress-installation','Partidas sin registrar',r.coverage.unregistered,'Sin registrar');
  }),
  load('observations',async()=>overviewObservations(await leerObservaciones(nivel.id),nivel.id,chileToday()),(target,pendingRoot,r)=>{
   target.innerHTML=`<h3>Observaciones en terreno</h3><button type="button" class="overviewMetric" data-overview-action="observations" data-value="Pendientes"><b data-overview-observations>${num(r.pendientes)}</b><span>Pendientes en ${num(r.recintos)} ${r.recintos===1?'recinto':'recintos'} ↗</span></button><details class="overviewBreakdown" ${expanded?'open':''}><summary>Desglose y fuente</summary><div class="overviewRows">${[['Abierta','Abiertas','#c18442'],['En corrección','En corrección','#3985a0'],['Corregida','Por validar','#687fc0'],['Cerrada','Cerradas','#4f896c'],...(r.porEstado.Descartada?[['Descartada','Descartadas','#919ba3']]:[])].map(([state,label,color])=>row('observations',label,r.porEstado[state],r.total,color,state)).join('')}</div><p class="overviewNote">${num(r.total)} observaciones registradas en este equipo. Se comparten según la sincronización de Nube.</p>${r.total?'':'<p class="overviewNote">Aún no hay observaciones registradas en este piso.</p>'}</details>`;
   pendingRoot.innerHTML=pending('overdue','Observaciones vencidas',r.vencidas)+pending('observations','Observaciones por validar',r.porVerificar,'Corregida');
  }),
  load('protocols',async()=>overviewProtocols(await loadProtocolCatalog(),nivel.id),(target,_,r)=>{
   target.innerHTML=`<h3>Protocolos de la matriz</h3><button type="button" class="overviewMetric" data-overview-action="protocols" data-value="ABIERTO"><b data-overview-protocols>${num(r.open)}</b><span>Registros abiertos ↗</span></button><details class="overviewBreakdown" ${expanded?'open':''}><summary>Desglose y fuente</summary><div class="overviewRows">${row('protocols','Abiertos',r.open,r.total,'#c18442','ABIERTO')}${row('protocols','Cerrados · incluye autocontrol',r.closed,r.total,'#4f896c','CLOSED_ALL')}${row('protocols','Nulos',r.voided,r.total,'#919ba3','NULO')}${r.other?row('protocols','Otros estados',r.other,r.total,'#919ba3'):''}</div><button type="button" class="overviewSubmetric" data-overview-action="protocols" data-value=""><b>${num(r.total)}</b> registros del piso · ver todos ↗</button><p class="overviewNote">Matriz al ${esc(r.cutoff.split('-').reverse().join('-'))}. Incluye ${num(r.shared)} registros con referencia compartida explícita a este piso. El cierre de protocolos no determina la instalación del checklist.</p></details>`;
  })
 ];
 return Promise.all(jobs);
}
