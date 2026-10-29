import {reportProgress,installation} from './room-progress-model.mjs';
import {progressCoverage} from './progress-analysis.mjs';
import {resumen} from './observaciones-model.mjs';
import {scopeProtocolCatalog} from './protocol-scope.mjs';

// Keep each source's eligibility rules. These are independent counts, never a blended score.
export function overviewProgress(model,rooms,records,level){
 const report=reportProgress(model,rooms,records,level);
 return {...report,roomCount:report.rows.length,coverage:progressCoverage(report.rows),
  installation:installation.map(state=>({state,n:report.tasks.filter(task=>task.installation===state).length})),
  installedPercent:report.total?100*report.installed/report.total:null};
}
export const overviewObservations=(list,level,today)=>resumen(list.filter(obs=>obs.level===level),today);
export function overviewProtocols(catalog,level){
 const scope=scopeProtocolCatalog(catalog,level),states={};
 for(const [state,n] of Object.entries(scope.states))states[state.trim()]=(states[state.trim()]||0)+n;
 const open=states.ABIERTO||0,closed=(states.CERRADO||0)+(states['CERRADO POR AUTOCONTROL']||0),voided=states.NULO||0;
 return {total:scope.total,open,closed,voided,other:scope.total-open-closed-voided,shared:scope.shared,cutoff:catalog.source.cutoff};
}
