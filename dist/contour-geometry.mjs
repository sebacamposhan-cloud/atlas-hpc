import {booleanValid,kinks} from './vendor/contour/validation.mjs';
import {inside} from './engine.mjs';
const close=ring=>[...ring.map(p=>p.slice()),ring[0].slice()];
export function partsToFeature(parts){const coords=parts.map(p=>[close(p.polygon),...(p.holes||[]).map(close)]);return {type:'Feature',properties:{},geometry:coords.length===1?{type:'Polygon',coordinates:coords[0]}:{type:'MultiPolygon',coordinates:coords}};}
export function featureToParts(feature,{flipY=false}={}){
 const g=feature.type==='Feature'?feature.geometry:feature;if(!['Polygon','MultiPolygon'].includes(g?.type))throw Error('Se requiere Polygon o MultiPolygon.');
 const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
 const ring=r=>{const values=r.map(p=>[p[0],flipY?-p[1]:p[1]]);if(values.length>1&&values[0][0]===values.at(-1)[0]&&values[0][1]===values.at(-1)[1])values.pop();return values;};
 return polys.map(p=>({polygon:ring(p[0]),holes:p.slice(1).map(ring)}));
}
export function containsPoint(parts,point){return parts.some(p=>inside(point,p.polygon)&&!(p.holes||[]).some(h=>inside(point,h)));}
export function validateParts(parts,width,height){
 if(!Array.isArray(parts)||!parts.length||parts.length>64)throw Error('Define entre 1 y 64 partes.');
 let vertices=0;
 for(const part of parts){if(!Array.isArray(part.holes))throw Error('Faltan los anillos interiores.');for(const ring of [part.polygon,...part.holes]){
  if(!Array.isArray(ring)||ring.length<3)throw Error('Cada anillo necesita al menos tres vértices.');vertices+=ring.length;
  if(ring.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[1]<0||p[0]>width||p[1]>height))throw Error('Geometría fuera de la lámina o coordenadas inválidas.');
  const area=ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0);if(Math.abs(area)<.01)throw Error('Anillo sin área válida.');
 }
 for(const hole of part.holes)if(hole.some(p=>!inside(p,part.polygon)))throw Error('Un hueco sale del contorno exterior.');
 for(let i=0;i<part.holes.length;i++)for(let j=i+1;j<part.holes.length;j++)if(inside(part.holes[i][0],part.holes[j])||inside(part.holes[j][0],part.holes[i]))throw Error('Huecos superpuestos.');
 }
 if(vertices>20000)throw Error('Demasiados vértices.');
 const feature=partsToFeature(parts);
 if(!booleanValid(feature)||kinks(feature).features.length)throw Error('Contorno cruzado, anillos en contacto o partes superpuestas.');
 for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++)if(containsPoint([parts[i]],parts[j].polygon[0])||containsPoint([parts[j]],parts[i].polygon[0]))throw Error('Partes superpuestas.');
 return feature;
}
