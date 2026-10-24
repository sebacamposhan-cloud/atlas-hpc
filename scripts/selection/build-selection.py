"""Offline assembly of auxiliary room hit areas; never runs in the web app."""
import gzip,json
from pathlib import Path
from shapely.geometry import Polygon,Point,shape,box,mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree
R=Path(__file__).resolve().parent;P=R.parents[1]/'dist';C=json.load(gzip.open(R/'direct-candidates.json.gz','rt'));A=json.load(open(P/'atlas.json'));M=json.load(open(R/'manual-regions.json'));rooms=C['rooms'];off={t['id']:t['offset'] for t in A['tiles']};sx,sy,sw,sh=A['scope']['view'];scope=box(sx,sy,sx+sw,sy+sh)
pts=[Point(r['position'][0]+off[r['document_id']][0],r['position'][1]+off[r['document_id']][1]) for r in rooms]
polys={s['i']:shape(s['geometry']) for s in C['selected']};evidence={e['i']:shape(e['geometry']) for e in C['evidence']};methods={s['i']:s['method'] for s in C['selected']}
for k,v in M.items():i=int(k);polys[i]=Polygon(v);evidence[i]=Polygon(v);methods[i]='Superficie auxiliar trazada sobre el plano continuo; pendiente de revisión técnica'
assert len(polys)==len(rooms)==330
for i,p in polys.items():
 assert p.is_valid,(i,rooms[i]['code'])
 assert p.covers(pts[i]),('manual/seed',i,rooms[i]['code'],p.bounds,list(pts[i].coords))
# Fill furniture recesses without taking documented floor space from a neighbouring room.
keys=list(evidence);tree=STRtree([evidence[i] for i in keys]);trimmed={}
for i,p in polys.items():
 cut=[]
 for j in tree.query(p):
  k=keys[int(j)]
  if k!=i and not evidence[k].covers(pts[i]):cut.append(evidence[k])
 q=p.difference(unary_union(cut)) if cut else p
 if not q.covers(pts[i]):raise ValueError(('evidence removed label',i))
 trimmed[i]=q.intersection(scope)
# Smaller subrooms take precedence. Circulation follows the remaining documented floor.
order=sorted(trimmed,key=lambda i:(rooms[i]['code'].startswith(('CT.','CU.')),trimmed[i].area))
final={};claimed=[]
for i in order:
 p=trimmed[i];cuts=[q for q in claimed if q.intersects(p)]
 q=p.difference(unary_union(cuts)) if cuts else p
 if not q.covers(pts[i]):raise ValueError(('overlap removed label',i,rooms[i]['code']))
 final[i]=q;claimed.append(q)
def components(g):return [g] if g.geom_type=='Polygon' else [p for p in g.geoms if p.geom_type=='Polygon']
output=[]
for i,r in enumerate(rooms):
 rings=[]
 for p in components(final[i]):
  if p.area<3:continue
  p=p.simplify(.6,preserve_topology=True)
  convert=lambda pts:[[round(float(x),2),round(float(y),2)] for x,y in list(pts)[:-1]]
  rings.append({'polygon':convert(p.exterior.coords),'holes':[convert(h.coords) for h in p.interiors if Polygon(h).area>8]})
 assert rings,i
 output.append({'id':r['id'],'rings':rings,'score':1,'method':methods[i]})
result={'schema':3,'method':'Superficies auxiliares para consulta por recinto. No son contornos técnicos validados ni sirven para cubicación.','rooms':output}
target=P/'selection.json';tmp=P/'selection.tmp';tmp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')));tmp.replace(target)
print(json.dumps({'rooms':len(rooms),'selection_surfaces':len(output),'manual_regions':len(M),'vertices':sum(len(p['polygon'])+sum(map(len,p['holes'])) for e in output for p in e['rings']),'bytes':target.stat().st_size},indent=2))
