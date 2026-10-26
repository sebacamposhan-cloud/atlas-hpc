import json,collections,math,hashlib
from pathlib import Path
import pymupdf as fitz
root=Path(__file__).resolve().parents[1];data=json.loads((root/'dist/data.json').read_text());allrows=[]
for d in data['documents']:
 source=root/'dist/source'/d['filename']
 if hashlib.sha256(source.read_bytes()).hexdigest()!=d['sha256']:raise ValueError('Source hash mismatch: '+d['id'])
 with fitz.open(source) as pdf:
  p=pdf[0];words=[];grid=collections.defaultdict(list)
  for w in p.get_text('words'):
   if w[4] not in {m['code'] for m in data['materials']}:continue
   box=fitz.Rect(w[:4])*p.rotation_matrix;v={'code':w[4],'bbox':list(box),'x':(box.x0+box.x1)/2,'y':(box.y0+box.y1)/2};words.append(v);grid[(int(v['x']//20),int(v['y']//20))].append(v)
  found=[]
  for a in words:
   m=next((m for m in data['materials'] if m['code']==a['code']),None)
   if not m or (m['category']!='Cielos' and a['code'] not in ('N/A','S/E')):continue
   fields={'CIE':a};ok=True
   for field,dx,dy in [('M1',0,-4.92),('M2',8.16,2.76),('M4',-8.28,2.76),('M3',0,11.16),('PAV',0,6)]:
    x,y=a['x']+dx,a['y']+dy;near=[v for i in range(int(x//20)-1,int(x//20)+2) for j in range(int(y//20)-1,int(y//20)+2) for v in grid[(i,j)] if abs(v['x']-x)<1.3 and abs(v['y']-y)<1.3]
    if len(near)!=1:ok=False;break
    fields[field]=near[0]
   if not ok:continue
   rows=[r for r in data['rooms'] if r['document_id']==d['id'] and math.dist([(r['finishes'][0]['bbox'][0]+r['finishes'][0]['bbox'][2])/2,(r['finishes'][0]['bbox'][1]+r['finishes'][0]['bbox'][3])/2],[a['x'],a['y']])<1]
   found.append({'sourceId':d['id'],'sha256':d['sha256'],'page':1,'coordinateSystem':'rotated PDF page points','anchor':[a['x'],a['y']],'fields':fields,'roomIds':[r['id'] for r in rows]})
  print(d['id'],'detected',len(found),'associated',sum(bool(x['roomIds']) for x in found),'stored',sum(r['document_id']==d['id'] for r in data['rooms']),flush=True);allrows+=found
found={rid for candidate in allrows for rid in candidate['roomIds']}
report={'scope':'Independent six-field spatial template recognition in the nine ARQ PDFs. Text-based, fixed standard-symbol layout; not OCR, not a claim about other symbol sizes, other disciplines or technical association approval.','summary':{'recognized':len(allrows),'associated':sum(bool(c['roomIds']) for c in allrows),'known_observations':len(data['rooms']),'known_not_detected':[r['id'] for r in data['rooms'] if r['id'] not in found],'unassociated_candidates':sum(not c['roomIds'] for c in allrows)},'candidates':allrows}
(root/'docs/audit/diamond-recognition.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps(report['summary']))
