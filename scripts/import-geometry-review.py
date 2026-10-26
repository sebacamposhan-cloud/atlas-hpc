"""Consolidate a browser contour review into a derived SQLite database, never the originals."""
import argparse,hashlib,json,sqlite3,uuid
from pathlib import Path
from shapely.geometry import shape,Point
root=Path(__file__).resolve().parents[1]
def import_review(input_path,database):
 database=Path(database).resolve()
 if database in {(root/'data'/name).resolve() for name in ['atlas.sqlite','atlas-v2-original.sqlite','atlas-before-migration.sqlite']}:raise ValueError('Use a derived database; original SQLite files are protected')
 value=json.loads(Path(input_path).read_text());r=value.get('record',{})
 if value.get('format')!='atlas-geometry-review-v1' or r.get('status')!='pending':raise ValueError('Only pending Atlas geometry reviews may be imported')
 if r.get('coordinate_system')!='rotated PDF page points':raise ValueError('Unsupported coordinate system')
 for field in ['id','observation_id','source_id','source_sha256','at','responsible','reason']:
  if not isinstance(r.get(field),str) or not r[field].strip():raise ValueError('Missing '+field)
 g=shape(r['geometry'])
 if g.geom_type not in ('Polygon','MultiPolygon') or g.is_empty or not g.is_valid or g.area<=0:raise ValueError('Invalid geometry')
 source=database if database.exists() else root/'data/atlas.sqlite'
 with sqlite3.connect(f'file:{source}?mode=ro',uri=True) as check:
  row=check.execute('SELECT o.source_id,s.sha256,s.payload,o.payload FROM atlas_room_observations o JOIN atlas_sources s ON s.id=o.source_id WHERE o.id=?',(r['observation_id'],)).fetchone()
  if not row or row[0]!=r['source_id'] or row[1]!=r['source_sha256']:raise ValueError('Source/observation/hash mismatch')
  observed=json.loads(row[3]);
  if observed.get('position') and not g.contains(Point(observed['position'])):raise ValueError('Geometry must contain the source room label')
  d=json.loads(row[2]);x,y,xx,yy=g.bounds
  if r.get('page')!=d.get('page',1) or x<0 or y<0 or xx>d['width'] or yy>d['height']:raise ValueError('Geometry/page outside source')
  for oid,payload in check.execute('SELECT id,payload FROM atlas_room_observations WHERE source_id=? AND id<>?',(r['source_id'],r['observation_id'])):
   position=json.loads(payload).get('position')
   if position and g.contains(Point(position)):raise ValueError('Geometry includes another room label: '+oid)
 database.parent.mkdir(parents=True,exist_ok=True)
 if not database.exists():
  with sqlite3.connect(f'file:{root}/data/atlas.sqlite?mode=ro',uri=True) as original,sqlite3.connect(database) as derived:original.backup(derived)
 backup=database.with_name(database.name+'.before-'+uuid.uuid4().hex+'.sqlite')
 with sqlite3.connect(database) as db:
  with sqlite3.connect(backup) as b:db.backup(b)
  db.execute('PRAGMA foreign_keys=ON');db.executescript((root/'migrations/003_geometry_reviews.sql').read_text())
  digest=hashlib.sha256(json.dumps(r,sort_keys=True,separators=(',',':')).encode()).hexdigest()
  old=db.execute('SELECT payload_hash FROM atlas_geometry_revisions WHERE id=?',(r['id'],)).fetchone()
  if old:
   if old[0]!=digest:raise ValueError('Conflicting review ID')
   inserted=False
  else:
   previous=db.execute('SELECT id FROM atlas_geometry_revisions WHERE observation_id=? ORDER BY rowid DESC LIMIT 1',(r['observation_id'],)).fetchone()
   with db:db.execute('INSERT INTO atlas_geometry_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(r['id'],r['observation_id'],r['source_id'],r['source_sha256'],r['page'],r['coordinate_system'],json.dumps(r['geometry'],separators=(',',':')),r['status'],r['at'],r['responsible'],r['reason'],digest,previous[0] if previous else None))
   inserted=True
  if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('Database integrity failure')
 return {'database':str(database),'backup':str(backup),'inserted':inserted,'status':'pending'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('review');p.add_argument('--database',required=True);a=p.parse_args();print(json.dumps(import_review(a.review,a.database)))
