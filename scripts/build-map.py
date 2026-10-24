"""Offline map preparation only. The published viewer uses static image tiles."""
import fitz,json,math,os
from pathlib import Path
from PIL import Image
P=Path(__file__).resolve().parents[1]/'dist'
a=json.load(open(P/'atlas.json'));data=json.load(open(P/'data.json'));sx,sy,sw,sh=a['scope']['view'];scale=2
out=P/'map';out.mkdir(exist_ok=True)
mosaic=Image.new('L',(math.ceil(sw*scale),math.ceil(sh*scale)),255)
for t in a['tiles']:
 x,y,w,h=t['clip'];left=max(x,sx);top=max(y,sy);right=min(x+w,sx+sw);bottom=min(y+h,sy+sh)
 if left>=right or top>=bottom:continue
 d=next(d for d in data['documents'] if d['id']==t['id'])
 doc=fitz.open(P/'source'/d['filename']);p=doc[0]
 pix=p.get_pixmap(matrix=fitz.Matrix(scale,scale),colorspace=fitz.csGRAY,alpha=False)
 im=Image.frombytes('L',(pix.width,pix.height),pix.samples)
 box=[round((left-t['offset'][0])*scale),round((top-t['offset'][1])*scale),round((right-t['offset'][0])*scale),round((bottom-t['offset'][1])*scale)]
 crop=im.crop(box);target=[round((left-sx)*scale),round((top-sy)*scale),round((right-sx)*scale),round((bottom-sy)*scale)]
 if crop.size!=(target[2]-target[0],target[3]-target[1]):crop=crop.resize((target[2]-target[0],target[3]-target[1]))
 mosaic.paste(crop,target[:2]);print(d['code'],'rendered',flush=True)
 doc.close();del pix,im,crop
levels=[];size=768
for z,factor in enumerate([.5,1,2]):
 im=mosaic if factor==scale else mosaic.resize((math.ceil(sw*factor),math.ceil(sh*factor)),Image.Resampling.LANCZOS)
 folder=out/str(z);folder.mkdir(exist_ok=True)
 for y in range(0,im.height,size):
  for x in range(0,im.width,size):
   im.crop((x,y,min(x+size,im.width),min(y+size,im.height))).save(folder/f'{x//size}_{y//size}.webp',quality=91,method=4)
 levels.append({'z':z,'scale':factor,'columns':math.ceil(im.width/size),'rows':math.ceil(im.height/size)})
 print('level',factor,'done',flush=True)
mosaic.resize((math.ceil(sw*.15),math.ceil(sh*.15)),Image.Resampling.LANCZOS).save(out/'overview.webp',quality=90)
mosaic.resize((math.ceil(sw*.6),math.ceil(sh*.6)),Image.Resampling.LANCZOS).save(out/'export.jpg',quality=90)
json.dump({'origin':[sx,sy],'width':sw,'height':sh,'tileSize':size,'overview':'map/overview.webp','export':'map/export.jpg','levels':levels},open(out/'index.json','w'),separators=(',',':'))
print('map bytes',sum(p.stat().st_size for p in out.rglob('*') if p.is_file()),flush=True)
