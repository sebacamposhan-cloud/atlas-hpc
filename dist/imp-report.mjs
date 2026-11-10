import {orderedMarks} from './imp-numbering.mjs';
import {ultimoArtefacto} from './artefactos-model.mjs';
export const REPORT_COLORS={complete:'#198253',partial:'#c58618',zero:'#bc4242',empty:'#63717d'};
const status=(done,total)=>!total?'empty':done===total?'complete':done?'partial':'zero';
export function roomReport(catalog,artifacts,doc,cut){
 const rooms=new Map(catalog.rooms.map(r=>[r.id,r])),quantities=new Map(artifacts.rooms.map(r=>[r.code,r.items])),names=new Map(artifacts.types.map(t=>[t.code,t.name]));
 return orderedMarks(doc,cut).flatMap(mark=>{const room=rooms.get(mark.roomId);if(!room)return [];const rows=(quantities.get(room.code)||[]).map(a=>{let installed=0,absent=0,unknown=0;for(let unit=1;unit<=a.quantity;unit++){const state=ultimoArtefacto(doc,room.id,a.code,unit,cut)?.state;state==='instalado'?installed++:state==='no_instalado'?absent++:unknown++;}return {code:a.code,name:names.get(a.code)||a.code,total:a.quantity,installed,absent,unknown,status:status(installed,a.quantity)};});const total=rows.reduce((s,r)=>s+r.total,0),installed=rows.reduce((s,r)=>s+r.installed,0);return [{number:mark.number,code:room.code,name:room.name,rows,total,installed,status:status(installed,total)}];});
}
// Whole room tables stay together; only an oversized room repeats its heading on continuation pages.
export function paginateRooms(groups,firstHeight=600,nextHeight=800){
 const pages=[[]];let remaining=firstHeight;
 for(const group of groups){let rows=group.rows.length?group.rows:[null],continuation=false;
  while(rows.length){const full=80+rows.length*24;if(full<=nextHeight&&full>remaining&&(pages.at(-1).length||pages.length===1)){pages.push([]);remaining=nextHeight;}
   let count=Math.min(rows.length,Math.floor((remaining-80)/24));if(count<1){pages.push([]);remaining=nextHeight;continue;}
   const part={...group,rows:rows.slice(0,count),continuation,height:80+count*24};pages.at(-1).push(part);remaining-=part.height;rows=rows.slice(count);continuation=true;
  }
 }
 return pages;
}
