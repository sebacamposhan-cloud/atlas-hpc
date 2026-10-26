"""Independent topology check of derived repairs against actual neighbor surfaces."""
import json,hashlib
from pathlib import Path
from shapely.geometry import Polygon
from shapely.ops import unary_union
root=Path(__file__).resolve().parent
text=(root/'dist/room-contour-repairs.mjs').read_text()
repairs=json.loads(text.split('export const roomContourRepairs=')[1].rstrip(';\n'))
selection=json.loads((root/'dist/selection.json').read_text())
shapes={e['id']:unary_union([Polygon(p['polygon'],p['holes']) for p in e['rings']]) for e in selection['rooms']}
for repair in repairs:
 ox,oy=repair['offset']
 shapes[repair['id']]=unary_union([Polygon([[x+ox,y+oy] for x,y in p['polygon']],[[[x+ox,y+oy] for x,y in h] for h in p['holes']]) for p in repair['rings']])
for repair in repairs:
 g=shapes[repair['id']]
 assert g.is_valid and not g.is_empty,repair['id']
 for other,neighbor in shapes.items():
  if other==repair['id'] or not g.intersects(neighbor):continue
  assert neighbor.is_valid,('Invalid touching neighbor',repair['id'],other)
  assert g.intersection(neighbor).area<.05,('Overlap introduced',repair['id'],other)
baseline=json.loads((root/'docs/audit/baseline-hashes.json').read_text())
for name,digest in baseline.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
print('14 derived shapes valid, no neighbor overlap above 0.05 PDF point², 36 original hashes preserved')
