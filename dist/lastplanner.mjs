import {selectionAxes,axesMarkup} from './lastplanner-axes.mjs';
// Integrated Last Planner production cycle; the same database and the main Atlas viewer are reused.
import {PLAN_COLORS,geometryPath,scopeDrawing} from './lastplanner-map.mjs';
import {nivel} from './level.mjs';
import {registerLayer,layerNames} from './layers.mjs';
import {readWorkflow} from './lastplanner-cycle-store.mjs';
import {isoToday,semanaDe,scopeProgress,blockers,executed} from './lastplanner-cycle-model.mjs';
import {createWorkflowUI} from './lastplanner-workflow.mjs';
export const COLOR_ESTADO={'Planificada':'#1b2a56','En ejecución':'#0f5499','Cumplida':'#1a7f37','No cumplida':'#c21f1f'};
export const COLORES_RECINTO=PLAN_COLORS;
let cache=null,pending=null,week=semanaDe(isoToday()),focusId=null;
function index(){cache.porCodigo=new Map();for(const a of cache.actividades.filter(a=>!a.archivada&&!a.id.startsWith('demo-')&&a.level===nivel.id&&a.semana===week&&(!focusId||a.id===focusId)))for(const r of a.recintos){if(!cache.porCodigo.has(r.code))cache.porCodigo.set(r.code,[]);cache.porCodigo.get(r.code).push(a);}layerNames.lastplanner='Last Planner · '+week;}
export function cargarPlan(force=false){if(force)pending=null;if(!pending)pending=readWorkflow().then(data=>{cache=data;index();return data;}).catch(error=>{pending=null;throw error;});return pending;}
function state(room){const activities=cache?.porCodigo?.get(room.code)||[];if(!activities.length)return 'Sin actividades';if(activities.some(a=>blockers(a,cache.restricciones).some(r=>r.critica||r.estado==='Bloqueando ejecución')))return 'Bloqueada';if(activities.every(a=>a.alcances.filter(s=>s.roomId===room.id).every(s=>scopeProgress(a,s.id,{verified:true}).avance>=1)))return 'Verificada';if(activities.some(a=>executed(a)>0))return 'En ejecución';return 'Pendiente';}
registerLayer('lastplanner',{nombre:'Last Planner · ejecución',categories:r=>[state(r)],color:key=>COLORES_RECINTO[key]||'#ffffff',opacity:.5});
export function iniciarCapaLastPlanner(change){const reload=()=>cargarPlan(true).then(change).catch(()=>{});reload();window.addEventListener('atlas-lastplanner-changed',reload);}
export function createLastPlanner(ctx){
 const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'g');overlay.id='lpExecutionLayer';overlay.setAttribute('pointer-events','none');overlay.setAttribute('clip-path','url(#scopeClip)');document.getElementById('svg').append(overlay);let onMap=false;
 function renderOverlay(){
  if(!onMap||!ctx.plannerVisible?.()||!cache||document.body.classList.contains('lpPicking')){overlay.replaceChildren();return;}
  const rows=cache.actividades.filter(a=>a.level===nivel.id&&a.semana===week&&!a.archivada&&!a.id.startsWith('demo-')&&(!focusId||a.id===focusId));
  overlay.innerHTML=(focusId?axesMarkup(referenceAxes(rows[0]),ctx.esc):'')+rows.flatMap(a=>a.alcances.flatMap(scope=>{const room=ctx.rooms().find(r=>r.id===scope.roomId);if(scope.source?.sha256&&room&&ctx.source(room)?.sha256!==scope.source.sha256)return [];return scopeDrawing(a,scope,cache.restricciones).map(shape=>{const g=shape.geometry,path=g?geometryPath(g):ctx.path(scope.roomId),color=PLAN_COLORS[shape.state];return path?`<path data-lp-kind="${shape.kind}" data-lp-scope="${ctx.esc(scope.id)}" d="${ctx.esc(path)}" fill="${g?.type==='line'?'none':color}" fill-opacity="${shape.opacity}" stroke="${color}" stroke-opacity="${shape.kind==='planned'?.7:1}" stroke-width="${g?.type==='line'?shape.kind==='planned'?9:5:3}" stroke-dasharray="${shape.dashed?'8 4':''}" vector-effect="non-scaling-stroke" fill-rule="evenodd"><title>${ctx.esc(scope.code+' · '+scope.label+' · '+shape.state+' · '+(shape.kind==='executed'?'Intervención delimitada en ejecución':'Alcance planificado'))}</title></path>`:'';});})).join('');

 }
 function referenceAxes(activity){const scopes=activity?.alcances||[],current=scopes.every(scope=>{const room=ctx.rooms().find(r=>r.id===scope.roomId);return room&&scope.source?.sha256&&ctx.source(room)?.sha256===scope.source.sha256;});return current?selectionAxes(scopes):null;}
 const showOnPlan=async activity=>{week=activity?.semana||ui.period();focusId=activity?.id||null;onMap=true;await cargarPlan(true);const frame=referenceAxes(activity)?.marco;await ctx.onPlan(activity,frame?.poligono||frame?.linea||(frame?.punto?[frame.punto]:[]));renderOverlay();};
 const ui=createWorkflowUI({...ctx,onPlan:showOnPlan,currentData:()=>cache,renderOverlay});
 return {...ui,renderOverlay,showActivityOnPlan:async id=>{const data=await cargarPlan(true),activity=data.actividades.find(a=>a.id===id);if(!activity)throw Error('La actividad aún no está en este equipo. Sincroniza Nube.');return showOnPlan(activity);}};
}
