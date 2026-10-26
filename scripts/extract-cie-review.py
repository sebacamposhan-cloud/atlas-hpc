"""Recover exact documented codes excluded by the original numeric-only extractor.
No material/area inference, master-room merge or SQLite write is performed.
"""
import json,hashlib
from pathlib import Path
import pymupdf as fitz
root=Path(__file__).resolve().parents[1]
web=json.loads((root/'dist/data.json').read_text())
base=json.loads((root/'dist/disciplines.json').read_text())
codes={r['code'] for r in web['rooms']}
existing={r['id'] for r in base['observations']}
observations=[]
for d in base['documents']:
 if d['specialty']!='ceilings':continue
 source=root/'dist/source'/d['filename']
 if hashlib.sha256(source.read_bytes()).hexdigest()!=d['sha256']:raise ValueError('Source hash mismatch: '+d['id'])
 with fitz.open(source) as pdf:
  page=pdf[0]
  for i,w in enumerate(page.get_text('words')):
   oid=f"{d['id']}:{i}"
   if w[4] not in codes or oid in existing:continue
   rect=fitz.Rect(w[:4]);center=(rect.tl+rect.br)*.5;clip=fitz.Rect(center.x-65,center.y-35,center.x+65,center.y+40)
   p=center*page.rotation_matrix
   observations.append({'id':oid,'specialty':'ceilings','sheetId':d['id'],'code':w[4],'position':[p.x,p.y],'bbox':list(rect*page.rotation_matrix),'rawText':page.get_text(clip=clip),'area':None,'nct':None,'status':'Extraído; asociación pendiente de revisión','associationStatus':'unverified','extractionMethod':'Exact known ARQ code in PDF word; no proximity association or attribute inference','source':{'sha256':d['sha256'],'page':1,'bbox':list(clip),'coordinates':'unrotated PDF text'}})
result={'schema':1,'status':'review_candidates','observations':observations}
(root/'dist/cie-review-observations.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'recovered_observations':len(observations),'distinct_codes':len({r['code'] for r in observations}),'base_observations_preserved':len(base['observations'])}))
