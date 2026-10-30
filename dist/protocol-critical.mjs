import {nivel} from './level.mjs';
import {protocolFloors,scopedProtocolRows,sharedProtocol} from './protocol-scope.mjs';
import {loadProtocolCatalog} from './protocol-catalog.mjs';
import {decodeAgingIndex,analyzeCritical,chileToday,isoDay,ageBands} from './protocol-aging.mjs';
import {matrixPage} from './protocol-model.mjs';
import {workChart} from './work-charts.mjs';
import {crearFiltrosColumna} from './column-filters.mjs';
let pending,resumeCritical;document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeCritical?.();});const KEY='atlas-protocol-critical-view-v1';
async function loadIndex(catalog){if(pending?.sha===catalog.source.sha256)return pending.promise;const promise=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch('protocols/'+catalog.aging.file,{signal:controller.signal});if(!response.ok)throw Error('No se pudo cargar el índice de abiertos. Reintenta o guarda la matriz offline.');return decodeAgingIndex(await response.json(),catalog);}finally{clearTimeout(timer);}})().catch(()=>{if(pending?.promise===promise)pending=null;throw Error('No se pudo leer el índice de abiertos. Comprueba la conexión o completa la copia offline.');});pending={sha:catalog.source.sha256,promise};return promise;}
// Especialidad, proceso, nivel, persona, fecha y tramo se filtran desde los encabezados de la tabla (como Excel);
// los gráficos y totales siguen a la tabla. Solo la fecha de evaluación de la antigüedad queda arriba.
export async function renderProtocolCritical(root,ctx){
 const esc=ctx.esc,num=n=>Number(n).toLocaleString('es-CL'),date=day=>day?.split('-').reverse().join('-')||'Sin fecha';
 root.innerHTML='<p role="status">Preparando análisis de protocolos abiertos…</p>';
 let catalog,rows;
 try{catalog=await loadProtocolCatalog();rows=scopedProtocolRows(await loadIndex(catalog),nivel.id);}catch(error){if(!root.isConnected)return;root.innerHTML=`<p role="alert">${esc(error.message)}</p><button id="retryCriticalProtocols">Reintentar análisis</button>`;root.querySelector('button').onclick=()=>renderProtocolCritical(root,ctx);return;}
 if(!root.isConnected)return;
 const floor=protocolFloors[nivel.id],key=KEY+':'+nivel.id;
 const filters={asOf:chileToday()},tabla={filtros:{},orden:null};let page=0,useToday=true;
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.sourceSha256===catalog.source.sha256){useToday=saved.asOfMode!=='custom';if(!useToday&&isoDay(saved.filters?.asOf))filters.asOf=saved.filters.asOf;else useToday=true;if(saved.columnas&&typeof saved.columnas.filtros==='object')tabla.filtros=Object.fromEntries(Object.entries(saved.columnas.filtros).filter(([,v])=>Array.isArray(v)&&v.every(x=>typeof x==='string')).map(([k,v])=>[k,v.slice(0,500)]));}}catch{}
 const types=new Map(catalog.types.map(type=>[type.id,type])),especialidades=new Map(catalog.specialties.map(s=>[s.id,s.name])),bandName=new Map(ageBands.map(b=>[b.key,b.name]));
 const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'],etiquetaMes=v=>MESES[Number(v.slice(5,7))-1]+' '+v.slice(0,4);
 const columnas=[{key:'protocolo',titulo:'Protocolo / folio',valor:r=>types.get(r.typeId).code+' · '+(r.folio||'Sin folio'),orden:r=>types.get(r.typeId).code+' '+String(r.folio||'').padStart(8,'0')},
  {key:'proceso',titulo:'Proceso',valor:r=>types.get(r.typeId).name||types.get(r.typeId).code,clase:'matrixWide'},
  {key:'especialidad',titulo:'Especialidad',valor:r=>types.get(r.typeId).specialtyIds.map(id=>especialidades.get(id)).filter(Boolean)},
  {key:'elaboracion',titulo:'Elaboración',valor:r=>r.age.issued?.slice(0,7)||'',etiqueta:etiquetaMes,opcionesDesc:true,orden:r=>r.age.issued||'',ordenTextos:['Más antigua primero','Más reciente primero']},
  {key:'nivel',titulo:'Nivel',valor:r=>r.level||'Sin nivel documentado'},{key:'recibe',titulo:'Recibe',valor:r=>r.receiver||'Sin receptor documentado',clase:'matrixWide'},
  {key:'tramo',titulo:'Antigüedad',valor:r=>bandName.get(r.age.band)||'Sin tramo',opciones:ageBands.map(b=>b.name),orden:r=>r.age.days,ordenTextos:['Menos días primero','Más días primero']}];
 const cf=crearFiltrosColumna({id:'criticos',columnas,estado:tabla,esc,alCambiar:()=>{page=0;render();}});
 root.innerHTML=`<section class="criticalIntro"><div><span class="section-label">ANTIGÜEDAD DE PROTOCOLOS</span><h2>Protocolos críticos · ${esc(floor.code)}</h2><p>${esc(floor.name)} · Incluye referencias compartidas explícitas al piso.</p><p>Abiertos que han superado un año calendario desde su elaboración, sin fecha de cierre.</p><small>Estados de la matriz al ${date(catalog.source.cutoff)}; antigüedad según la fecha de evaluación.</small></div></section><div class="criticalActions"><label>Evaluar antigüedad al<input id="criticalAsOf" type="date" required></label><button id="criticalToday">Hoy</button></div><p id="criticalScope" class="chartSubtitle"></p><p id="criticalError" role="alert" hidden></p><div id="criticalSummary" class="criticalSummary"></div><div id="criticalCharts" class="chartGrid"></div><section class="criticalList"><div class="matrixResultHead"><h3 id="criticalListTitle">Registros críticos</h3><span id="criticalLimpiar"></span></div><p id="criticalCount" role="status"></p><div class="matrixTableWrap"><table class="matrixTable"><thead><tr id="criticalHead"></tr></thead><tbody id="criticalRows"></tbody></table></div><div class="matrixPagination"><button id="criticalPrevious">Anterior</button><span id="criticalPage"></span><button id="criticalNext">Siguiente</button></div></section>`;
 const $=id=>root.querySelector('#'+id);
 const save=()=>{try{localStorage.setItem(key,JSON.stringify({sourceSha256:catalog.source.sha256,asOfMode:useToday?'today':'custom',filters,columnas:tabla}));}catch{}};
 // Ir a la matriz con el mismo recorte: críticos y los filtros de nivel y persona de esta tabla.
 const unico=k=>tabla.filtros[k]?.length===1?tabla.filtros[k][0]:'';
 function choose(typeId,recordId=null){ctx.choose({typeId,recordId,filters:{criticalOnly:true,asOf:filters.asOf,state:'ABIERTO',level:unico('nivel')==='Sin nivel documentado'?'~':unico('nivel'),receiver:unico('recibe')==='Sin receptor documentado'?'~':unico('recibe')}});}
 function render(){
  if(useToday){filters.asOf=chileToday();}$('criticalAsOf').value=filters.asOf;
  const report=analyzeCritical(rows,catalog,{asOf:filters.asOf}),invalid=!report.valid,shown=invalid?[]:cf.aplicar(report.critical),current=matrixPage(shown,page);page=current.page;
  const filtrado=cf.activos()>0;$('criticalScope').textContent=floor.name+' · '+floor.code+(filtrado?` · ${num(shown.length)} de ${num(report.critical.length)} críticos con los filtros de la tabla`:'');
  $('criticalError').hidden=!invalid;$('criticalError').textContent=invalid?'Selecciona una fecha válida para evaluar la antigüedad.':'';
  $('criticalSummary').innerHTML=[['criticalTotal','Críticos · más de un año',shown.length],['criticalOpen','Abiertos del piso',report.open],['criticalMissing','Sin elaboración válida',report.missing]].map(([id,label,n])=>`<article><span>${label}</span><b id="${id}">${num(n)}</b></article>`).join('');
  // Gráficos sobre lo que muestra la tabla.
  const porTipo=new Map();for(const row of shown)porTipo.set(row.typeId,(porTipo.get(row.typeId)||0)+1);const tipos=[...porTipo].map(([id,n])=>({type:types.get(id),n})).sort((a,b)=>b.n-a.n||a.type.code.localeCompare(b.type.code,'es'));
  const tramo=tabla.filtros.tramo?.length===1?tabla.filtros.tramo[0]:'';
  $('criticalCharts').innerHTML=invalid?'':!shown.length?'<section class="chartCard"><p>No hay protocolos críticos con esta fecha y estos filtros.</p></section>':`<section class="chartCard"><div class="chartHeading"><h3>Procesos con más protocolos críticos</h3><span>10 primeros de ${tipos.length}</span></div><p class="chartSubtitle">${num(shown.length)} críticos en total. Selecciona un proceso para consultar sus registros en la matriz.</p><div class="workChartRows">${tipos.slice(0,10).map(({type,n})=>`<button type="button" class="workChartRow criticalTypeBar" data-critical-type="${type.id}"><span><b>${esc(type.code)}</b><small>${esc(type.name||'')}</small></span><b>${num(n)}</b><em class="workBar"><span style="width:${n/tipos[0].n*100}%;background:#ad544d"></span></em></button>`).join('')}</div></section>${workChart({title:'Críticos por antigüedad',kind:'pie',filter:'critical-age',items:ageBands.map(b=>({key:b.name,n:shown.filter(row=>row.age.band===b.key).length,color:b.color})),subtitle:'Cada registro aparece en un solo tramo. Selecciona un tramo para filtrar la columna Antigüedad; otra vez para quitarlo.'},esc)}`;
  root.querySelectorAll('[data-critical-type]').forEach(button=>button.onclick=()=>choose(button.dataset.criticalType));
  root.querySelectorAll('[data-work-filter="critical-age"]').forEach(node=>{node.setAttribute('aria-pressed',String(tramo===node.dataset.workState));const apply=()=>{if(tramo===node.dataset.workState)delete tabla.filtros.tramo;else tabla.filtros.tramo=[node.dataset.workState];page=0;render();};node.onclick=apply;if(node.tagName!=='BUTTON')node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();apply();}};});
  $('criticalCount').textContent=num(shown.length)+' registros críticos · evaluación al '+date(filters.asOf);$('criticalListTitle').textContent=tramo?'Registros · '+tramo:'Registros críticos';
  $('criticalHead').innerHTML=cf.cabecera();$('criticalLimpiar').innerHTML=cf.limpiar();cf.conectar(root,invalid?[]:report.critical);
  $('criticalRows').innerHTML=current.rows.map(row=>`<tr data-critical-row="${esc(row.id)}"><td><button data-critical-record="${esc(row.id)}">${esc(types.get(row.typeId).code)} · ${esc(row.folio||'Sin folio')}</button></td><td class="matrixWide"><small>${esc(types.get(row.typeId).name||'')}</small></td><td><small>${esc(types.get(row.typeId).specialtyIds.map(id=>especialidades.get(id)).filter(Boolean).join(', ')||'—')}</small></td><td>${date(row.age.issued)}</td><td>${esc(row.level||'Sin nivel')}${sharedProtocol(row.level)?'<small>Compartido</small>':''}</td><td class="matrixWide">${esc(row.receiver||'Sin receptor')}</td><td><span class="criticalBadge">${num(row.age.days)} días</span></td></tr>`).join('')||`<tr><td colspan="${columnas.length}">Sin registros críticos en esta consulta. Cambia los filtros desde los encabezados.</td></tr>`;
  $('criticalPage').textContent='Página '+(page+1)+' de '+current.pages;$('criticalPrevious').disabled=page===0;$('criticalNext').disabled=page+1>=current.pages;
  root.querySelectorAll('[data-critical-record]').forEach(button=>button.onclick=()=>{const row=shown.find(row=>row.id===button.dataset.criticalRecord);choose(row.typeId,row.id);});save();
 }
 $('criticalAsOf').onchange=event=>{filters.asOf=event.target.value;useToday=false;page=0;render();};
 $('criticalPrevious').onclick=()=>{page--;render();};$('criticalNext').onclick=()=>{page++;render();};
 $('criticalToday').onclick=()=>{useToday=true;filters.asOf=chileToday();page=0;render();};resumeCritical=()=>{if(!root.isConnected){resumeCritical=null;return;}if(useToday)render();};
 render();
}
