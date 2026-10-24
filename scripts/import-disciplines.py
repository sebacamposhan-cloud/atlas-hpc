"""Read-only source import; all coordinates normalized with PDF /Rotate."""
import fitz,re,json,hashlib,shutil,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];dest=root/'dist/disciplines';dest.mkdir(exist_ok=True)
docs=[];observations=[];pattern=re.compile(r'^\d+(?:\.\d+){3,5}-\d+$')
files=[(f,'ceilings','cie-'+re.search(r'-(50\d)-',f.name)[1]) for f in sorted(Path(sys.argv[1]).glob('*.pdf'))]
files.append((Path(sys.argv[2]),'floors','pav-s01'))
for source,specialty,did in files:
 pdf=fitz.open(source);page=pdf[0];folder=dest/did;folder.mkdir(exist_ok=True);sha=hashlib.sha256(source.read_bytes()).hexdigest();filename=did+'.pdf';shutil.copyfile(source,root/'dist/source'/filename);w,h=page.rect.width,page.rect.height
 doc={'id':did,'specialty':specialty,'code':source.stem,'filename':filename,'revision':'Rev00' if specialty=='ceilings' else 'No identificada','level':'-1','width':w,'height':h,'sha256':sha,'page':1,'rotation':page.rotation,'coordinateSystem':'rotated PDF page points','tiles':[]}
 page.get_pixmap(matrix=fitz.Matrix(.35,.35),alpha=False).pil_save(str(folder/'overview.webp'))
 scale=2 if specialty=='ceilings' else 5
 for y in range(0,int(h)+1,512):
  for x in range(0,int(w)+1,512):
   clip=fitz.Rect(x,y,min(x+512,w),min(y+512,h));pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),clip=clip,alpha=False);path=f'{x}_{y}.webp';pix.pil_save(str(folder/path),quality=94);doc['tiles'].append([x,y,clip.width,clip.height,path])
 for i,word in enumerate(page.get_text('words')):
  if not pattern.fullmatch(word[4]):continue
  x0,y0,x1,y1=word[:4];x=(x0+x1)/2;y=(y0+y1)/2;clip=fitz.Rect(x-65,y-35,x+65,y+40);text=page.get_text(clip=clip);area=re.search(r'(\d+[,.]\d+)\s*m²',text);nct=re.search(r'NCT\s*(\d+[,.]\d+)\s*m',text);pt=fitz.Point(x,y)*page.rotation_matrix
  observations.append({'id':f'{did}:{i}','specialty':specialty,'sheetId':did,'code':word[4],'position':[pt.x,pt.y],'bbox':list(fitz.Rect(word[:4])*page.rotation_matrix),'rawText':text,'area':area[1] if area else None,'nct':nct[1] if nct else None,'status':'Extraído; pendiente de revisión','source':{'sha256':sha,'page':1,'bbox':list(clip),'coordinates':'unrotated PDF text'}})
 docs.append(doc)
case=next(r for r in observations if r['code']=='7.1.2.1.2-1' and r['sheetId']=='cie-504');case.update({'name':'Box Consulta Médica','area':'12,45','nct':'2,80','ceilingCodes':['213'],'luminaires':['L19'],'status':'Ficha cotejada visualmente; geometría pendiente','verification':'Cotejo visual de lámina 504, página 1. No valida contorno ni cantidad de luminarias.'})
(root/'dist/disciplines.json').write_text(json.dumps({'schema':1,'documents':docs,'observations':observations,'transforms':[]},ensure_ascii=False,separators=(',',':')))
print(json.dumps({'documents':len(docs),'observations':len(observations),'uniqueCodes':len({r['code'] for r in observations})}))
