export const normalize=value=>String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g,' ').trim();
export function matrixDate(value,date1904=false){
 if(value===null||value===undefined||value==='')return null;
 if(!/^\d+(\.\d+)?$/.test(String(value)))return String(value);
 const date=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Number(value)*86400000);
 return Number.isNaN(date.getTime())?String(value):date.toISOString().slice(0,10);
}
