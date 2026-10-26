from pathlib import Path
import json,collections,hashlib
from shapely.geometry import Polygon,MultiPolygon,Point
from shapely.ops import unary_union
from shapely.validation import explain_validity
from shapely.strtree import STRtree
root=Path(__file__).resolve().parents[1];out=root/'docs/audit';data=json.loads((root/'dist/data.json').read_text());atlas=json.loads((root/'dist/atlas.json').read_text());selection=json.loads((root/'dist/selection.json').read_text());rooms={r['id']:r for r in data['rooms']};offsets={t['id']:t['offset'] for t in atlas['tiles']}
shapes=[];entries=[];invalid=[];missing_labels=[];technical=[];differences=[]
for e in selection['rooms']:
 r=rooms[e['id']];parts=[Polygon(x['polygon'],x['holes']) for x in e['rings']];g=parts[0] if len(parts)==1 else MultiPolygon(parts);shapes.append(g);entries.append(e)
 if not g.is_valid:invalid.append({'id':r['id'],'code':r['code'],'error':explain_validity(g)})
 dx,dy=offsets[r['document_id']];pt=Point(r['position'][0]+dx,r['position'][1]+dy)
 if not g.covers(pt):missing_labels.append(r['id'])
 if r.get('polygon'):
  t=Polygon([[x+dx,y+dy] for x,y in r['polygon']],[[[x+dx,y+dy] for x,y in h] for h in r.get('holes',[])])
  if t.is_valid and g.is_valid:
   differences.append({'id':r['id'],'code':r['code'],'name':r['name'],'status':r['geometry_status'],'method':e['method'],'iou':g.intersection(t).area/g.union(t).area,'technical_area_pdf_points2':t.area,'selection_area_pdf_points2':g.area,'symmetric_difference_pdf_points2':g.symmetric_difference(t).area,'technical_holes':len(t.interiors),'selection_parts':len(parts),'selection_holes':sum(len(p.interiors) for p in parts)})
for r in rooms.values():
 if r.get('polygon'):
  g=Polygon(r['polygon'],r.get('holes',[]));technical.append({'id':r['id'],'code':r['code'],'name':r['name'],'valid':g.is_valid,'error':None if g.is_valid else explain_validity(g),'status':r['geometry_status'],'holes':len(g.interiors),'method':r.get('geometry_method')})
tree=STRtree(shapes);overlaps=[]
for i,g in enumerate(shapes):
 if not g.is_valid:continue
 for j in tree.query(g):
  j=int(j)
  if j<=i or not shapes[j].is_valid:continue
  a=g.intersection(shapes[j]).area
  if a>1e-7:overlaps.append({'a':entries[i]['id'],'b':entries[j]['id'],'code_a':rooms[entries[i]['id']]['code'],'code_b':rooms[entries[j]['id']]['code'],'area_pdf_points2':a})
summary={'technical_total':len(technical),'technical_statuses':dict(collections.Counter(x['status'] for x in technical)),'technical_invalid':sum(not x['valid'] for x in technical),'technical_with_holes':sum(x['holes']>0 for x in technical),'auxiliary_total':len(selection['rooms']),'auxiliary_invalid':len(invalid),'auxiliary_multipart':sum(len(x['rings'])>1 for x in selection['rooms']),'auxiliary_with_holes':sum(any(x['holes'] for x in e['rings']) for e in selection['rooms']),'auxiliary_holes':sum(len(x['holes']) for e in selection['rooms'] for x in e['rings']),'label_mismatches':len(missing_labels),'overlap_pairs_positive_area':len(overlaps),'overlap_pairs_gt_1_pdf_point2':sum(x['area_pdf_points2']>1 for x in overlaps),'max_overlap_pdf_points2':max([x['area_pdf_points2'] for x in overlaps],default=0),'auxiliary_methods':dict(collections.Counter(x['method'] for x in selection['rooms'])),'technical_auxiliary_comparisons':len(differences),'comparisons_iou_lt_09':sum(x['iou']<.9 for x in differences),'validated_comparisons':[x for x in differences if x['status']=='Validado']}
report={'scope':'Pure topology and stored geometry comparison; not certification of architectural wall correspondence. Areas are PDF coordinate units, never measured construction m2.','summary':summary,'technical':technical,'invalid_auxiliary':invalid,'label_mismatches':missing_labels,'overlaps':sorted(overlaps,key=lambda x:-x['area_pdf_points2']),'differences':sorted(differences,key=lambda x:x['iou'])}
(out/'geometry-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2))
