"""Offline conservative vector candidate pilot. Scores are not probabilities."""
import argparse,fitz,json,math,hashlib,sqlite3,collections
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source-id',required=True);args=p.parse_args();root=Path(__file__).resolve().parents[1];db=sqlite3.connect(root/'data/atlas.sqlite');db.execute('PRAGMA foreign_keys=ON');row=db.execute('SELECT filename,sha256,revision FROM atlas_sources WHERE id=?',(args.source_id,)).fetchone()
if not row:raise SystemExit('Import source first')
filename,sha,revision=row;page=fitz.open(root/'dist/source'/filename)[0];lines=[];curves=[]
for path in page.get_drawings():
 for item in path['items']:
  if item[0]=='l':lines.append(tuple(pt*page.rotation_matrix for pt in item[1:]))
  elif item[0]=='c':curves.append(tuple(pt*page.rotation_matrix for pt in item[1:]))
all_lines=lines
lines=[(a,b,(a-b).norm()) for a,b in all_lines if .4<(a-b).norm()<15]
key=lambda p:(round(p.x,1),round(p.y,1));endpoint_grid=collections.defaultdict(list)
for i,(a,b,L) in enumerate(lines):endpoint_grid[key(a)].append((i,a,b));endpoint_grid[key(b)].append((i,b,a))
found=[];used=set()
for i,(a,b,L) in enumerate(lines):
 if i in used:continue
 pts=[a,b];taken={i};turns=[]
 for step in range(50):
  last=pts[-1];v=pts[-1]-pts[-2];candidates=[]
  for j,c,d in endpoint_grid[key(last)]:
   if j in taken:continue
   v2=d-c;angle=math.atan2(v.x*v2.y-v.y*v2.x,v.x*v2.x+v.y*v2.y)
   if .005<abs(angle)<.45 and .3<v2.norm()/v.norm()<3 and (not turns or angle*turns[-1]>0):candidates.append((abs(angle),j,d,angle))
  if not candidates:break
  _,j,d,angle=min(candidates);pts.append(d);turns.append(angle);taken.add(j)
  total=abs(sum(turns))
  if total>1.7:break
  if 1.3<total<1.7 and len(pts)>5:
   a,m,b=pts[0],pts[len(pts)//2],pts[-1];den=2*(a.x*(m.y-b.y)+m.x*(b.y-a.y)+b.x*(a.y-m.y))
   if abs(den)<1e-5:continue
   a2=a.x*a.x+a.y*a.y;m2=m.x*m.x+m.y*m.y;b2=b.x*b.x+b.y*b.y
   center=fitz.Point((a2*(m.y-b.y)+m2*(b.y-a.y)+b2*(a.y-m.y))/den,(a2*(b.x-m.x)+m2*(a.x-b.x)+b2*(m.x-a.x))/den);radius=(a-center).norm()
   if 8<radius<100 and max(abs((q-center).norm()-radius) for q in pts)<.6:
    found.append({'center':list(center),'radius':radius,'points':[list(q) for q in pts]});used|=taken;break

grid={};cell=30
for a,b in all_lines:
 for pt in (a,b):grid.setdefault((int(pt.x//cell),int(pt.y//cell)),[]).append((a,b))
rooms=[json.loads(r[0]) for r in db.execute('SELECT payload FROM atlas_room_observations WHERE source_id=?',(args.source_id,))];candidates=[];seen=set();out=root/'dist/assets/door-pilot';out.mkdir(exist_ok=True)
for arc in found:
 a,b=fitz.Point(arc['points'][0]),fitz.Point(arc['points'][-1]);center=fitz.Point(arc['center']);radius=arc['radius']
 leaf=False
 for center in [center]:
  gx,gy=int(center.x//cell),int(center.y//cell)
  for ox in (-1,0,1):
   for oy in (-1,0,1):
    for l1,l2 in grid.get((gx+ox,gy+oy),[]):
     if min((l1-center).norm(),(l2-center).norm())<2 and abs((l2-l1).norm()-radius)<3:leaf=True
 if not leaf:continue
 # Exclude sheet cartouche using imported architecture tile clip in source coordinates.
 atlas=json.loads((root/'dist/atlas.json').read_text());tile=next(t for t in atlas['tiles'] if t['id']==args.source_id);cx,cy,cw,ch=tile['clip'];ox,oy=tile['offset']
 if not cx-ox<=center.x<=cx-ox+cw or not cy-oy<=center.y<=cy-oy+ch:continue
 x,y=(a.x+b.x)/2,(a.y+b.y)/2;key=(round(center.x/3),round(center.y/3),round(radius/3))
 if key in seen:continue
 seen.add(key);identifier='door-'+hashlib.sha256(f'{sha}:rotated:1:{key}'.encode()).hexdigest()[:20];clip=fitz.Rect(x-90,y-90,x+90,y+90)&page.rect
 if clip.is_empty:continue
 page.get_pixmap(matrix=fitz.Matrix(2,2),clip=clip,alpha=False).pil_save(str(out/(identifier+'.webp')),quality=95)
 candidate={'id':identifier,'source_id':args.source_id,'filename':filename,'sha256':sha,'revision':revision,'page':1,'pageSize':[page.rect.width,page.rect.height],'position':[x,y],'bbox':[min(a.x,b.x),min(a.y,b.y),max(a.x,b.x),max(a.y,b.y)],'confidence':.55,'confidenceMeaning':'heuristic priority, not calibrated probability','status':'candidate','method':'connected-line-arc-with-leaf-rotated-v3','roomSuggestions':[{'id':r['id'],'code':r['code'],'status':'unverified-nearest-label'} for r in sorted(rooms,key=lambda r:math.dist(r.get('position',[0,0]),[x,y]))[:2]],'preview':'assets/door-pilot/'+identifier+'.webp','previewBounds':list(clip)};candidates.append(candidate)
 with db:db.execute('INSERT OR IGNORE INTO atlas_doors VALUES(?,?,?,?,?,?,?)',(identifier,args.source_id,json.dumps([x,y]),json.dumps(candidate['bbox']),.55,'candidate',json.dumps(candidate)))
data={'schema':1,'source':args.source_id,'sha256':sha,'candidates':candidates,'evaluation':{'reference':None,'falsePositives':None,'missedDoors':None,'precision':None,'recall':None},'warning':'Candidates only, not verified doors; furniture and other symbols may match.'};(root/'dist/door-pilot.json').write_text(json.dumps(data,ensure_ascii=False));(root/'data/door-pilot.json').write_text(json.dumps(data,ensure_ascii=False));print(json.dumps({'curves':len(curves),'lines':len(all_lines),'reconstructedArcs':len(found),'candidates':len(candidates),'evaluation':'pending verified reference'}))
