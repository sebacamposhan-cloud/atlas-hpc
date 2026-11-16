"""Reproducible IMP import for any floor.
Usage: python scripts/imp/import.py path/to/source.pdf [codigo piso datos]
  codigo: sheet code used in file names (default s01); piso: Atlas floor id (default N-1);
  datos: floor data folder under dist ('' for N-1, 'n02/' for N02). Example for level 2:
  python scripts/imp/import.py "HPC-ARQ-DET-IMP-A-9xx N02.pdf" n02 N02 n02/
Then mark the floor in dist/pisos.js with imp: '<codigo>' and run node scripts/prepare-offline.mjs.
Contour source: existing Atlas authority. Registration: all 41 S-GRID lines, not label proximity.
PDF and architecture remain intact; no heights, quantities or installation states are inferred.
"""
import collections,hashlib,json,subprocess,sys,re
from pathlib import Path
import fitz
import numpy as np
from shapely import Polygon,box,make_valid,union_all
from shapely.affinity import affine_transform
ROOT=Path(__file__).resolve().parents[2]
source=Path(sys.argv[1]);sha=hashlib.sha256(source.read_bytes()).hexdigest()
COD=(sys.argv[2] if len(sys.argv)>2 else 's01').lower();PISO=sys.argv[3] if len(sys.argv)>3 else 'N-1';DATOS=sys.argv[4] if len(sys.argv)>4 else ''
HOJA='imp-'+COD;NIVEL_ETIQUETA='-1' if PISO=='N-1' else str(int(PISO[1:]))
pdf=fitz.open(source)
assert len(pdf)==1,'Expected one '+COD.upper()+' page'
p=pdf[0];drawings=p.get_drawings();axes=json.loads((ROOT/'dist'/(DATOS+'ejes.json')).read_text())
found={'numero':[],'letra':[]}
for d in drawings:
 if d.get('layer')!='S-GRID':continue
 pts=[q*p.rotation_matrix for item in d['items'] for q in item[1:] if isinstance(q,fitz.Point)]
 if not pts:continue
 dx=max(q.x for q in pts)-min(q.x for q in pts);dy=max(q.y for q in pts)-min(q.y for q in pts)
 found['numero' if dx<dy else 'letra'].append(pts[0].x if dx<dy else pts[0].y)
fits=[];checks=[]
for kind,k in [('numero',0),('letra',1)]:
 originals=sorted((e for e in axes['ejes'] if e['tipo']==kind),key=lambda e:e['a'][k]);dest=sorted(set(found[kind]));assert len(originals)==len(dest)
 src=np.array([e['a'][k] for e in originals]);m=np.linalg.lstsq(np.column_stack([src,np.ones(len(src))]),dest,rcond=None)[0]
 errors=np.abs(src*m[0]+m[1]-dest);assert max(errors)<.1,'Grid registration exceeds 0.1 PDF points'
 fits.append(m.tolist());checks.extend({'axis':e['id'],'pdfPosition':round(y,5),'errorPoints':round(float(err),6)} for e,y,err in zip(originals,dest,errors))
transform=[fits[0][0],0,0,fits[1][0],fits[0][1],fits[1][1]]
words=p.get_text('words');labels={};raw={}
for block in p.get_text('blocks'):
 lines=block[4].splitlines()
 for i,line in enumerate(lines):
  raw[line]='\n'.join(lines)
for w in words:
 pt=fitz.Point((w[0]+w[2])/2,(w[1]+w[3])/2)*p.rotation_matrix
 labels[w[4]]=[round(pt.x,5),round(pt.y,5)]
# Extract source layer coverage as evidence, not as a progress state. Disjoint CAD triangles share fill paths.
layers=['Proyecto Aprobado','Artefacto a impermeabilizar','Solo muros 2 metros','Se agregan en obra de proyecto aprobado'];pieces=collections.defaultdict(list)
for d in drawings:
 if d.get('layer') not in layers or not d.get('fill'):continue
 chain=[]
 def flush():
  global chain
  if len(chain)>2:
   g=make_valid(Polygon(chain))
   if g.area>.00001:pieces[d['layer']].append(g)
  chain=[]
 for item in d['items']:
  if item[0]!='l':continue
  a,b=tuple(item[1]),tuple(item[2])
  if chain and chain[-1]!=a:flush()
  if not chain:chain.append(a)
  chain.append(b)
  if chain[0]==b:flush()
 flush()
M=p.rotation_matrix;bounds=box(0,0,p.rect.width,p.rect.height)
coverage={k:affine_transform(union_all(v,grid_size=.001),[M.a,M.c,M.b,M.d,M.e,M.f]).intersection(bounds).buffer(0) for k,v in pieces.items()}
architecture=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/imp/contours.mjs'),DATOS],cwd=ROOT))
rooms=[];omitted=[]
for item in sorted(architecture,key=lambda v:v['id']):
 r=item['room'];code=r['code']
 if code not in labels:omitted.append({'code':code,'reason':'Código no rotulado en el PDF IMP'});continue
 g=affine_transform(make_valid(union_all([Polygon(q['polygon'],q['holes']) for q in item['rings']])),transform).intersection(bounds)
 polygons=[g] if g.geom_type=='Polygon' else [q for q in g.geoms if q.geom_type=='Polygon']
 if not polygons or g.area<.01:omitted.append({'code':code,'reason':'Sin contorno dentro de la lámina'});continue
 def ring(q):return [[round(x,4),round(y,4)] for x,y in list(q.coords)[:-1]]
 g=union_all(polygons)
 parts=[{'polygon':ring(q.exterior),'holes':[ring(h) for h in q.interiors]} for q in polygons]
 source_layers=[k for k,v in coverage.items() if g.intersection(v,grid_size=.001).area>max(.1,g.area*.005)]
 rooms.append({'id':HOJA+':'+item['id'],'architectureId':item['id'],'code':code,'name':r['name'],'sheetId':HOJA,'specialty':'waterproofing','position':labels[code],'parts':parts,'sourceLayers':source_layers,'geometryQuality':item['quality'],'rawText':raw.get(code,code)})
folder=ROOT/'dist/disciplines'/HOJA;folder.mkdir(exist_ok=True,parents=True)
# Immutable original, actual /Rotate honored for both images and polygons.
(ROOT/'dist/source'/(HOJA+'.pdf')).write_bytes(source.read_bytes())
p.get_pixmap(matrix=fitz.Matrix(.8,.8),alpha=False).pil_save(str(folder/'overview.webp'),quality=90)
p.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False).pil_save(str(folder/'export.webp'),quality=96)
tiles=[]
for y in range(0,int(p.rect.height),512):
 for x in range(0,int(p.rect.width),512):
  clip=fitz.Rect(x,y,min(x+512,p.rect.width),min(y+512,p.rect.height));name=f'{x}_{y}.webp'
  p.get_pixmap(matrix=fitz.Matrix(5,5),clip=clip,alpha=False).pil_save(str(folder/name),quality=94)
  tiles.append([x,y,clip.width,clip.height,name])
codigo_lamina=(re.search(r'HPC-ARQ-DET-IMP-A-\d+',source.name) or [None])[0] or 'HPC-ARQ-DET-IMP-A-908';revision=(re.search(r'Rev\d+',source.name) or ['Rev01'])[0]
doc={'id':HOJA,'specialty':'waterproofing','code':codigo_lamina,'filename':HOJA+'.pdf','originalFilename':source.name,'revision':revision,'level':NIVEL_ETIQUETA,'width':p.rect.width,'height':p.rect.height,'sha256':sha,'page':1,'rotation':p.rotation,'coordinateSystem':'rotated PDF page points','tiles':tiles}
basefile=ROOT/'dist'/(DATOS+'disciplines.json');base=json.loads(basefile.read_text()) if basefile.exists() else {'schema':1,'documents':[],'observations':[],'transforms':[]};base['documents']=[d for d in base['documents'] if d['id']!=HOJA]+[doc]
basefile.write_text(json.dumps(base,ensure_ascii=False,separators=(',',':')))
catalog={'schema':1,'id':HOJA,'level':PISO,'document':doc,'registration':{'version':1,'method':str(len(checks))+' ejes S-GRID emparejados por orden y distancias; sin ajuste por rótulos','axesSha256':hashlib.sha256((ROOT/'dist/ejes.json').read_bytes()).hexdigest(),'transform':transform,'checks':checks,'maxErrorPoints':max(c['errorPoints'] for c in checks)},'rooms':rooms,'uncontouredCodes':sorted(c for c in raw if c not in {r['code'] for r in rooms} and re.fullmatch(r'(?:\d+(?:\.\d+){3,5}|(?:CU|CT\.[FP]|RT|DI)\.[\d.()\-]+)-\d+',c)),'omittedArchitecture':omitted,'sourceLayers':layers,'note':'Contornos ARQ existentes registrados por ejes sobre IMP. Revisión técnica pendiente; los colores originales documentan alcance y no ejecución. Sin metrado automático.'}
# Derived export source flattens the source's annotations and rotation, retaining its vector geometry.
# The uploaded original above remains byte-identical.
derivative=fitz.open(source);derivative.bake();derivative[0].remove_rotation();derivative.save(str(ROOT/'dist/impermeabilizacion'/(COD+'-export.pdf')),garbage=4,deflate=True,no_new_id=True)
catalog['exportSource']='impermeabilizacion/'+COD+'-export.pdf'
(ROOT/'dist/impermeabilizacion'/(COD+'.json')).write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'sha256':sha,'rooms':len(rooms),'corridors':sum(r['code'].startswith(('CT.','CU.')) for r in rooms),'sourceLayers':dict(collections.Counter(k for r in rooms for k in r['sourceLayers'])),'maxGridErrorPoints':catalog['registration']['maxErrorPoints'],'omitted':omitted},ensure_ascii=False))
