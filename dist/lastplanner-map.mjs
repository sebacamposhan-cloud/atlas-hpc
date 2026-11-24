import {activeExecutions,scopeProgress,blockers} from './lastplanner-cycle-model.mjs';
import {ESTADOS_COLOR as C} from './estados-color.mjs';
// Tintes de la paleta única (estados-color.mjs), los mismos significados que el rombo: en ejecución = amarillo, bloqueo = rojo.
export const PLAN_COLORS={Bloqueada:C.problema.tinte,Pendiente:C.pendiente.tinte,'En ejecución':C.ejecucion.tinte,'Por verificar':C.revisar.tinte,Verificada:C.conforme.tinte,'Sin actividades':C.sinRegistro.tinte};
// Borde de cada estado en el plano: el color pleno, para que el tinte se lea también impreso en blanco y negro.
export const PLAN_BORDES={Bloqueada:C.problema.color,Pendiente:C.pendiente.color,'En ejecución':'#9a7a00','Por verificar':C.revisar.color,Verificada:C.conforme.color,'Sin actividades':'#8c8c8c'};
export const geometryPath=g=>'M'+g.points.map(p=>p.join(',')).join('L')+(g.type==='polygon'?'Z'+(g.holes||[]).map(h=>'M'+h.map(p=>p.join(',')).join('L')+'Z').join(''):'');
export function scopeDrawing(activity,scope,restrictions){
 const progress=scopeProgress(activity,scope.id),verified=scopeProgress(activity,scope.id,{verified:true}),blocked=blockers(activity,restrictions).some(r=>(!r.scopeIds.length||r.scopeIds.includes(scope.id))&&(r.critica||r.estado==='Bloqueando ejecución'));
 const state=blocked?'Bloqueada':verified.avance>=1?'Verificada':progress.avance>=1?'Por verificar':progress.avance>0?'En ejecución':'Pendiente';
 const shapes=[{geometry:scope.geometry,kind:'planned',state,opacity:(verified.avance>=1||blocked)?0.4:0.18,dashed:progress.avance>0&&verified.avance<1}];
 // Draw only the geometry actually captured in an execution. Never infer a partial boundary from a percentage.
 for(const entry of activeExecutions(activity))for(const actual of entry.alcances.filter(s=>s.scopeId===scope.id))for(const geometry of actual.geometry||[])shapes.push({geometry,kind:'executed',state:blocked?'Bloqueada':entry.validacion?.estado==='Validada'?'Verificada':'Por verificar',opacity:.55,dashed:entry.validacion?.estado!=='Validada'});
 return shapes;
}
