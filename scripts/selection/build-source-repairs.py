"""Reproduce inspected room repairs from original PDF paths, without rewriting originals.

Only the explicitly inspected paths in reviewed-source-paths.json are accepted.
White PDF rectangles alone are NOT room boundaries. Blue wall barriers partition
the rectangle; the component containing the documented label supplies the outline.
Other automatically proposed regions were rejected during visual inspection.
"""
import hashlib,json
from pathlib import Path
import pymupdf as fitz
from shapely.geometry import Polygon,Point,box
from shapely.ops import unary_union

root=Path(__file__).resolve().parents[2]
data=json.loads((root/'dist/data.json').read_text())
atlas=json.loads((root/'dist/atlas.json').read_text())
selection=json.loads((root/'dist/selection.json').read_text())
reviews=json.loads(Path(__file__).with_name('reviewed-source-paths.json').read_text())
rows={r['id']:r for r in data['rooms']}
docs={d['id']:d for d in data['documents']}
offsets={t['id']:t['offset'] for t in atlas['tiles']}
cache={}
repairs=[]
audit=[]

def geometry(parts):
 return unary_union([Polygon(p['polygon'],p['holes']) for p in parts])

def rings(g):
 parts=[g] if g.geom_type=='Polygon' else list(g.geoms)
 return [{'polygon':[[round(x,4),round(y,4)] for x,y in list(p.exterior.coords)[:-1]],
          'holes':[[[round(x,4),round(y,4)] for x,y in list(h.coords)[:-1]] for h in p.interiors]} for p in parts]

def path_shapes(d,page):
 result=[];chain=[]
 for item in d['items']:
  if item[0]=='re':result.append(box(*(item[1]*page.rotation_matrix)))
  elif item[0]=='l':
   a=list(item[1]*page.rotation_matrix);b=list(item[2]*page.rotation_matrix)
   if chain and chain[-1]!=a:
    if len(chain)>2:result.append(Polygon(chain))
    chain=[]
   if not chain:chain=[a]
   chain.append(b)
  else:raise ValueError('Unreviewed path operator '+item[0])
 if len(chain)>2:result.append(Polygon(chain))
 for p in result:
  if not p.is_valid or p.area<=0:raise ValueError('Invalid source wall shape')
 return result

for review in reviews:
 r=rows[review['id']];did=r['document_id'];doc=docs[did]
 if did not in cache:
  path=root/'dist/source'/doc['filename']
  assert hashlib.sha256(path.read_bytes()).hexdigest()==doc['sha256']
  pdf=fitz.open(path);page=pdf[0];cache[did]=(pdf,page,page.get_drawings())
 _,page,drawings=cache[did]
 assert review['source_sha256']==doc['sha256'] and review['code']==r['code']
 assert r['geometry_status']!='Validado','Never replace validated originals'
 d=drawings[review['white_path']]
 assert d['fill']==(1.,1.,1.) and len(d['items'])==1 and d['items'][0][0]=='re'
 bounds=d['rect']*page.rotation_matrix
 cuts=[]
 for index in review['blue_paths']:
  d=drawings[index];assert d['fill']==(0.,.5,1.)
  cuts.extend(path_shapes(d,page))
 candidate=box(*bounds).difference(unary_union(cuts).buffer(.02,join_style=2))
 parts=[candidate] if candidate.geom_type=='Polygon' else list(candidate.geoms)
 floor=next(p for p in parts if p.contains(Point(r['position'])))
 # These particular isolated inner marks were inspected as equipment, not shafts.
 floor=Polygon(floor.exterior).simplify(.03,preserve_topology=True)
 assert floor.is_valid and floor.contains(Point(r['position']))
 assert not any(floor.contains(Point(o['position'])) for o in data['rooms'] if o['document_id']==did and o['id']!=r['id'])
 local=rings(floor)
 repair={'id':r['id'],'code':r['code'],'sourceId':did,'sourceSha256':doc['sha256'],
         'offset':offsets[did],'rings':local,'kind':'source_outline'}
 repairs.append(repair)
 audit.append({'id':r['id'],'code':r['code'],'white_path':review['white_path'],
               'source_sha256':doc['sha256'],'vertices':len(local[0]['polygon']),
               'area_pdf_points2':floor.area,'status':'pending technical review'})

# Explicit source wall traces from the later mobile screenshots.
for review in json.loads(Path(__file__).with_name('reviewed-wall-outlines.json').read_text()):
 r=rows[review['id']];did=r['document_id'];doc=docs[did]
 assert review['sourceSha256']==doc['sha256'] and review['code']==r['code']
 assert hashlib.sha256((root/'dist/source'/doc['filename']).read_bytes()).hexdigest()==doc['sha256']
 g=geometry(review['rings']);assert g.is_valid and g.contains(Point(r['position']))
 assert not any(g.contains(Point(o['position'])) for o in data['rooms'] if o['document_id']==did and o['id']!=r['id'])
 repairs.append({'id':r['id'],'code':r['code'],'sourceId':did,'sourceSha256':doc['sha256'],'offset':offsets[did],'rings':review['rings'],'kind':'source_outline'})
 audit.append({'id':r['id'],'code':r['code'],'source_sha256':doc['sha256'],'evidence_paths':review['evidence_paths'],'method':'inspected source wall trace','status':'pending technical review'})

# Remove the small overlap of the old TAC auxiliary with the corrected Área Limpia.
# This is an auxiliary trim, not a new certification of the rest of the TAC contour.
for rid,cutter_id in [('508-88399997:r0022','508-88399997:r0047'),('505-49eb24e4:r0010','505-49eb24e4:r0004')]:
 r=rows[rid];ox,oy=offsets[r['document_id']]
 original=next(e for e in selection['rooms'] if e['id']==rid)
 cutter=next(e for e in repairs if e['id']==cutter_id)
 local=[{'polygon':[[x-ox,y-oy] for x,y in p['polygon']],
         'holes':[[[x-ox,y-oy] for x,y in h] for h in p['holes']]} for p in original['rings']]
 trimmed=geometry(local).difference(geometry(cutter['rings']))
 assert trimmed.is_valid and trimmed.contains(Point(r['position']))
 repairs.append({'id':rid,'code':r['code'],'sourceId':r['document_id'],
                 'sourceSha256':docs[r['document_id']]['sha256'],'offset':[ox,oy],
                 'rings':rings(trimmed),'kind':'auxiliary_trim','cutter':cutter_id})

(root/'dist/room-contour-repairs.mjs').write_text('// Generated by scripts/selection/build-source-repairs.py; original source geometry is preserved.\nexport const roomContourRepairs='+json.dumps(repairs,ensure_ascii=False,separators=(',',':'))+';\n')
(root/'docs/audit/source-contour-repairs.json').write_text(json.dumps({'scope':'Inspected source outlines and neighboring auxiliary trim. Not global technical certification.','repairs':audit},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'source_outlines':len(audit),'total_overrides':len(repairs)}))
