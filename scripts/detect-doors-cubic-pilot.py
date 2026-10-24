"""Offline conservative vector candidate pilot. Scores are not probabilities."""
import argparse,fitz,json,math,hashlib,sqlite3
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source-id',required=True);args=p.parse_args();root=Path(__file__).resolve().parents[1];db=sqlite3.connect(root/'data/atlas.sqlite');db.execute('PRAGMA foreign_keys=ON');row=db.execute('SELECT filename,sha256,revision FROM atlas_sources WHERE id=?',(args.source_id,)).fetchone()
if not row:raise SystemExit('Import source first')
filename,sha,revision=row;page=fitz.open(root/'dist/source'/filename)[0];lines=[];curves=[]
for path in page.get_drawings():
 for item in path['items']:
  if item[0]=='l':lines.append(tuple(pt*page.rotation_matrix for pt in item[1:]))
  elif item[0]=='c':curves.append(tuple(pt*page.rotation_matrix for pt in item[1:]))
grid={};cell=30
for a,b in lines:
 for pt in (a,b):grid.setdefault((int(pt.x//cell),int(pt.y//cell)),[]).append((a,b))
rooms=[json.loads(r[0]) for r in db.execute('SELECT payload FROM atlas_room_observations WHERE source_id=?',(args.source_id,))];candidates=[];seen=set();out=root/'dist/assets/door-pilot';out.mkdir(exist_ok=True)
for pts in curves:
 a,c1,c2,b=pts;dx=abs(b.x-a.x);dy=abs(b.y-a.y)
 if not 8<=dx<=100 or not .88<=dy/dx<=1.12:continue
 vectors=[(c1.x-a.x,c1.y-a.y),(b.x-c2.x,b.y-c2.y)]
 if any(min(abs(x),abs(y))>max(abs(x),abs(y))*.07+.1 or not .45<=math.hypot(x,y)/dx<=.65 for x,y in vectors):continue
 leaf=False
 for center in [fitz.Point(a.x,b.y),fitz.Point(b.x,a.y)]:
  gx,gy=int(center.x//cell),int(center.y//cell)
  for ox in (-1,0,1):
   for oy in (-1,0,1):
    for l1,l2 in grid.get((gx+ox,gy+oy),[]):
     if min((l1-center).norm(),(l2-center).norm())<2 and abs((l2-l1).norm()-dx)<3:leaf=True
 if not leaf:continue
 x,y=(a.x+b.x)/2,(a.y+b.y)/2;key=(round(x,1),round(y,1))
 if key in seen:continue
 seen.add(key);identifier='door-'+hashlib.sha256(f'{sha}:rotated:1:{key}'.encode()).hexdigest()[:20];clip=fitz.Rect(x-90,y-90,x+90,y+90)&page.rect
 if clip.is_empty:continue
 page.get_pixmap(matrix=fitz.Matrix(2,2),clip=clip,alpha=False).pil_save(str(out/(identifier+'.webp')),quality=95)
 candidate={'id':identifier,'source_id':args.source_id,'filename':filename,'sha256':sha,'revision':revision,'page':1,'pageSize':[page.rect.width,page.rect.height],'position':[x,y],'bbox':[min(a.x,b.x),min(a.y,b.y),max(a.x,b.x),max(a.y,b.y)],'confidence':.55,'confidenceMeaning':'heuristic priority, not calibrated probability','status':'candidate','method':'quarter-cubic-with-leaf-rotated-v2','roomSuggestions':[{'id':r['id'],'code':r['code'],'status':'unverified-nearest-label'} for r in sorted(rooms,key=lambda r:math.dist(r.get('position',[0,0]),[x,y]))[:2]],'preview':'assets/door-pilot/'+identifier+'.webp','previewBounds':list(clip)};candidates.append(candidate)
 with db:db.execute('INSERT OR IGNORE INTO atlas_doors VALUES(?,?,?,?,?,?,?)',(identifier,args.source_id,json.dumps([x,y]),json.dumps(candidate['bbox']),.55,'candidate',json.dumps(candidate)))
data={'schema':1,'source':args.source_id,'sha256':sha,'candidates':candidates,'evaluation':{'reference':None,'falsePositives':None,'missedDoors':None,'precision':None,'recall':None},'warning':'Candidates only, not verified doors; furniture and other symbols may match.'};(root/'dist/door-pilot.json').write_text(json.dumps(data,ensure_ascii=False));(root/'data/door-pilot.json').write_text(json.dumps(data,ensure_ascii=False));print(json.dumps({'curves':len(curves),'lines':len(lines),'candidates':len(candidates),'evaluation':'pending verified reference'}))
