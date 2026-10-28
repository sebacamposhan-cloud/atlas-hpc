import fitz,re,json,statistics,hashlib,pathlib,sys
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[2];out=root/'dist/doors';out.mkdir(exist_ok=True)
paths=[pathlib.Path(p)for p in sys.argv[1:]]
if len(paths)!=2:raise SystemExit('Usage: prepare.py Puerta1.pdf Puerta2.pdf')
docs=[fitz.open(p)for p in paths];pages=[d[0]for d in docs]
for p in pages:p.set_rotation(0)
def axes(p):
 result={}
 for w in p.get_text('words'):
  if w[4] in ['AH','AI','AJ'] and 700<w[1]<800:result[w[4]]=[(w[0]+w[2])/2,(w[1]+w[3])/2]
 return result
ax=[axes(p)for p in pages];deltas=[[ax[0][a][j]-ax[1][a][j]for a in ['AH','AI','AJ']]for j in [0,1]];dx,dy=map(statistics.median,deltas);print('Axis translation',dx,dy,'residuals',deltas)
# One join inside the common AH-AI strip. Each source owns exactly one side.
seam=2000.;x0,y0,x1,y1=100.,850.,3940.,3600.;h=y1-y0
merged=fitz.open();page=merged.new_page(width=x1-x0,height=y1-y0)
for idx,p in enumerate(pages):
 offx,offy=(0,0)if idx==0 else(dx,dy);left,right=(x0,seam)if idx==0 else(seam,x1);clip=fitz.Rect(left-offx,y0-offy,right-offx,y1-offy);page.show_pdf_page(fitz.Rect(left-x0,0,right-x0,h),docs[idx],0,clip=clip)
page.set_rotation(90);merged.save(out/'puertas-unidas.pdf',deflate=True);pix=page.get_pixmap(matrix=fitz.Matrix(.5,.5));Image.frombytes('RGB',[pix.width,pix.height],pix.samples).save(out/'overview.webp',quality=90)
W,H=page.rect.width,page.rect.height;tiles=[]
for yy in range(0,int(H),768):
 for xx in range(0,int(W),768):
  r=fitz.Rect(xx,yy,min(xx+768,W),min(yy+768,H));p=page.get_pixmap(matrix=fitz.Matrix(1.5,1.5),clip=r);filename=f'tile-{xx}-{yy}.webp';Image.frombytes('RGB',[p.width,p.height],p.samples).save(out/filename,quality=92);tiles.append([r.x0,r.y0,r.width,r.height,filename])
rooms=[];doors=[];excluded=[];sources=[]
for idx,p in enumerate(pages):
 offx,offy=(0,0)if idx==0 else(dx,dy)
 def point(b):return [y1-((b[1]+b[3])/2+offy),(b[0]+b[2])/2+offx-x0]
 def owns(b):
  x=(b[0]+b[2])/2+offx;y=(b[1]+b[3])/2+offy
  return x0<x<x1 and y0<y<y1 and(x<=seam if idx==0 else x>seam)
 spans=[s for b in p.get_text('dict')['blocks']if 'lines'in b for l in b['lines']for s in l['spans']]
 for s in spans:
  if re.fullmatch(r'\d+(?:\.\d+){2,}-\d+',s['text'].strip())and owns(s['bbox']):rooms.append({'code':s['text'].strip(),'position':point(s['bbox']),'source':idx+1})
 for i,s in enumerate(spans):
  key=s['text'].strip()
  if not re.fullmatch(r'[A-Z]\d+_[SN]\d+_\d+',key)or not owns(s['bbox']):continue
  preceding=spans[max(0,i-3):i];types=[t['text'].strip()for t in preceding if re.fullmatch(r'(?:PI|PT|PE|PC|PA)\w+',t['text'].strip())]
  label={'key':key,'type':types[0]if len(types)==1 else None,'position':point(s['bbox']),'source':idx+1,'sourceBox':s['bbox']}
  if '_S01_'not in key:excluded.append(label);continue
  doors.append(label)
 sources.append({'file':paths[idx].name,'sha256':hashlib.sha256(paths[idx].read_bytes()).hexdigest()})
# Door-to-room proximity is only a candidate, never a certified association.
for d in doors:
 near=sorted(rooms,key=lambda r:sum((a-b)**2 for a,b in zip(r['position'],d['position'])))[:2]
 d['roomCandidates']=[{'code':r['code'],'distance':round(sum((a-b)**2 for a,b in zip(r['position'],d['position']))**.5,2)}for r in near]
(out/'catalog.json').write_text(json.dumps({'schema':1,'width':W,'height':H,'sources':sources,'alignment':{'axes':['AH','AI','AJ'],'translation':[dx,dy],'seam':seam,'candidateOnly':False},'tiles':tiles,'rooms':rooms,'doors':doors,'reviewOtherLevels':excluded},ensure_ascii=False))
print('rooms',len(rooms),'doors',len(doors),'other levels',len(excluded),'missing types',sum(d['type']is None for d in doors))
