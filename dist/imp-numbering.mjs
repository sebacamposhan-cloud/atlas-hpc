import {containsPoint} from './contour-geometry.mjs';
export function validateRoomMarks(marks){if(marks===undefined)return;const ids=new Set(),numbers=new Set();if(!Array.isArray(marks)||marks.length>10000)throw Error('Numeración inválida.');for(const m of marks){if(!m.roomId||!m.code||!Number.isSafeInteger(m.number)||m.number<1||ids.has(m.roomId)||numbers.has(m.number)||!Array.isArray(m.point)||m.point.length!==2||!m.point.every(Number.isFinite)||!m.author||!Number.isFinite(Date.parse(m.at)))throw Error('Marca de recinto inválida o duplicada.');ids.add(m.roomId);numbers.add(m.number);}}
export function markRoom(doc,room,author,at=new Date().toISOString()){
 if(doc.roomMarks?.some(m=>m.roomId===room.id))return doc;
 let point=room.position;
 if(!containsPoint(room.parts,point)){point=null;for(const part of room.parts){const xs=part.polygon.map(p=>p[0]),ys=part.polygon.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;for(let i=1;i<40&&!point;i++)for(let j=1;j<40&&!point;j++){const p=[x+w*i/40,y+h*j/40];if(containsPoint(room.parts,p))point=p;}if(point)break;}}
 if(!point)throw Error('No se pudo ubicar el número dentro del recinto.');
 const next={...doc,updatedAt:at,roomMarks:[...(doc.roomMarks||[]),{roomId:room.id,code:room.code,number:Math.max(0,...(doc.roomMarks||[]).map(m=>m.number))+1,point,author,at}]};validateRoomMarks(next.roomMarks);return next;
}
export const orderedMarks=(doc,cut='9999-12-31')=>(doc?.roomMarks||[]).filter(m=>m.at.slice(0,10)<=cut).slice().sort((a,b)=>a.number-b.number);
