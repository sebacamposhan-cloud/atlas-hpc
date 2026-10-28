export const progressFloors={'N-1':'A-S01',N01:'A-N01',N02:'A-N02',N03:'A-N03'};
export function progressFloor(value){
 const key=String(value??'').trim().toUpperCase().replace(/\s/g,'').replace('−','-');
 return ({'-1':'N-1','N-1':'N-1','S01':'N-1','A-S01':'N-1','1':'N01',N1:'N01',N01:'N01','A-N01':'N01','2':'N02',N2:'N02',N02:'N02','A-N02':'N02','3':'N03',N3:'N03',N03:'N03','A-N03':'N03'})[key]||null;
}
export function progressRooms(rooms,level){
 if(!progressFloors[level])return [];
 const seen=new Set();return rooms.filter(room=>{const code=String(room.code??'').trim();if(progressFloor(room.level)!==level||!code||seen.has(code))return false;seen.add(code);return true;});
}
// Legacy data may lack level. Use a documented sheet or unique room identity, never the active screen alone.
export function scopeConstruction({zones,events,protocols},rooms,level,{sheetLevels=new Map(),roomLevels=new Map()}={}){
 const codes=new Set(progressRooms(rooms,level).map(r=>r.code.trim()));
 const scopedZones=zones.filter(z=>codes.has(z.roomCode?.trim())&&(z.level?progressFloor(z.level):progressFloor(sheetLevels.get(z.sheetId)))===level);
 const ids=new Set(scopedZones.map(z=>z.id));
 const matches=(p,code)=>codes.has(code?.trim())&&(p.level?progressFloor(p.level):roomLevels.get(code?.trim()))===level;
 const scopedProtocols=protocols.filter(p=>p.elements?.some(code=>matches(p,code))).map(p=>({...p,elements:p.elements.filter(code=>matches(p,code)),shared:p.elements.some(code=>!matches(p,code))}));
 const unresolvedZones=zones.filter(z=>!z.level&&!progressFloor(sheetLevels.get(z.sheetId))).length;
 const unresolvedProtocols=protocols.filter(p=>!p.level&&(!p.elements?.length||p.elements.some(code=>!roomLevels.get(code?.trim())))).length;
 return {zones:scopedZones,events:events.filter(e=>ids.has(e.zoneId)&&(!e.level||progressFloor(e.level)===level)),protocols:scopedProtocols,unresolved:unresolvedZones+unresolvedProtocols};
}
