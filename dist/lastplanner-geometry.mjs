// Geometric checks on existing plan coordinates; no dimensions or heights are inferred.
export const distanceToSegment=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
export function insideRing(point,ring,tolerance=1){
 let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(distanceToSegment(point,a,b)<=tolerance)return true;if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;
}
export function withinGeometry(parent,geometry,tolerance=1){
 if(!parent||!geometry||!Array.isArray(geometry.points)||geometry.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return false;
 const segments=g=>g.points.slice(1).map((b,i)=>[g.points[i],b]).concat(g.type==='polygon'?[[g.points.at(-1),g.points[0]]]:[]);
 if(parent.type==='line')return geometry.type==='line'&&segments(geometry).every(([a,b])=>Array.from({length:33},(_,i)=>[a[0]+(b[0]-a[0])*i/32,a[1]+(b[1]-a[1])*i/32]).every(p=>parent.points.slice(1).some((v,i)=>distanceToSegment(p,parent.points[i],v)<=tolerance)));
 const contains=p=>insideRing(p,parent.points,tolerance)&&!(parent.holes||[]).some(h=>insideRing(p,h,0));
 if(!geometry.points.every(contains))return false;
 // Check every interval between boundary intersections: vertices alone miss concave exits and holes.
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],rings=[parent.points,...(parent.holes||[])];
 for(const [a,b] of segments(geometry)){
  const v=[b[0]-a[0],b[1]-a[1]],cuts=[0,1];
  for(const ring of rings)for(let i=0;i<ring.length;i++){const c=ring[i],d=ring[(i+1)%ring.length],w=[d[0]-c[0],d[1]-c[1]],offset=[c[0]-a[0],c[1]-a[1]],den=cross(v,w);if(Math.abs(den)<1e-10)continue;const t=cross(offset,w)/den,u=cross(offset,v)/den;if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);}
  cuts.sort((x,y)=>x-y);for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2;if(!contains([a[0]+v[0]*t,a[1]+v[1]*t]))return false;}
 }
 if(geometry.type==='polygon')for(const hole of parent.holes||[])if(insideRing(hole[0],geometry.points,0)&&!(geometry.holes||[]).some(h=>insideRing(hole[0],h,tolerance)))return false;
 return true;
}
