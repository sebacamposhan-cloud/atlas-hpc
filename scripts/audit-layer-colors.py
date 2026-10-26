"""Extract CIE legend colors; reject conflicts between source sheets."""
import json,hashlib
from pathlib import Path
import pymupdf as fitz
root=Path(__file__).resolve().parents[1]
docs=json.loads((root/'dist/disciplines.json').read_text())['documents']
observations=[];palette={};pattern_box=None
for doc in docs:
 if doc['specialty']!='ceilings':continue
 source=root/'dist/source'/doc['filename']
 assert hashlib.sha256(source.read_bytes()).hexdigest()==doc['sha256']
 page=fitz.open(source)[0]
 drawings=[(i,d,d['rect']*page.rotation_matrix) for i,d in enumerate(page.get_drawings()) if d.get('fill') is not None]
 for word in page.get_text('words'):
  code=word[4]
  if code not in {str(x) for x in range(201,221)}:continue
  b=fitz.Rect(word[:4])*page.rotation_matrix
  if b.x0<page.rect.width*.9 or b.y0>350:continue
  matches=[(i,d,rect) for i,d,rect in drawings if rect.contains(fitz.Point(b.x1+15,(b.y0+b.y1)/2)) and 15<rect.width<35 and 8<rect.height<16]
  assert len(matches)==1,(doc['id'],code)
  i,d,rect=matches[0];color='#'+''.join(f'{round(c*255):02x}' for c in d['fill'])
  key='CIE|'+code
  assert key not in palette or palette[key]['color']==color,(key,'Conflicting source color')
  palette.setdefault(key,{'color':color,'sources':[]})['sources'].append(doc['id'])
  observations.append({'source':doc['id'],'sha256':doc['sha256'],'page':1,'code':code,'path':i,'box':list(rect),'color':color})
  if doc['id']=='cie-504' and code=='214':pattern_box=list(rect)
assert len(observations)==152 and len(palette)==19
# Code 200 has an unpainted white cell, inspected in the rendered legend.
palette['CIE|200']={'color':'#ffffff','sources':[d['id'] for d in docs if d['specialty']=='ceilings'],'method':'unpainted white legend cell, visually checked'}
# 214 is a grid, not a solid white finish: preserve the source swatch itself.
palette['CIE|214']['pattern']='assets/layer-colors/cie-214.png'
page=fitz.open(root/'dist/source/cie-504.pdf')[0]
target=root/'dist/assets/layer-colors';target.mkdir(exist_ok=True)
page.get_pixmap(matrix=fitz.Matrix(4,4),clip=fitz.Rect(pattern_box)+(.3,.3,-.3,-.3)).save(target/'cie-214.png')
(root/'dist/documented-layer-colors.mjs').write_text('// Generated from eight original CIE legends; see docs/audit/layer-colors.json.\nexport const documentedLayerColors='+json.dumps(palette,separators=(',',':'))+';\n')
(root/'docs/audit/layer-colors.json').write_text(json.dumps({'observations':observations,'palette':palette,'scope':'CIE legend colors only. ARQ Muros/Pavimentos legend is monochrome; app palette is consultation, not a documentary color assignment. Code 200 white cell and 214 grid visually inspected.'},indent=2)+'\n')
print('152 vector color samples agree across 8 sheets; 200 white cell and 214 source grid preserved')
