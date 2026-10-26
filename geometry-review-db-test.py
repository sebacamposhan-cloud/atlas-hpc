"""Test the additive geometry review path on temporary database copies only."""
import importlib.util,json,sqlite3,tempfile,hashlib
from pathlib import Path
root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('geometry_import',root/'scripts/import-geometry-review.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
web=json.loads((root/'dist/data.json').read_text());room=next(r for r in web['rooms'] if r['code']=='RT.(-1)-1' and r['geometry_status']=='Validado');doc=next(d for d in web['documents'] if d['id']==room['document_id'])
ring=lambda r:r+[r[0]]
r={'id':'isolated-review','observation_id':room['id'],'source_id':doc['id'],'source_sha256':doc['sha256'],'page':1,'coordinate_system':'rotated PDF page points','geometry':{'type':'Polygon','coordinates':[ring(room['polygon']),*[ring(h) for h in room['holes']]]},'status':'pending','at':'2026-01-01T00:00:00Z','responsible':'QA fixture','reason':'Source-backed import test'}
original=root/'data/atlas.sqlite';digest=hashlib.sha256(original.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory() as folder:
 folder=Path(folder);review=folder/'review.json';database=folder/'derived.sqlite';review.write_text(json.dumps({'format':'atlas-geometry-review-v1','record':r}))
 first=module.import_review(review,database);assert first['inserted'];assert Path(first['backup']).exists();assert not module.import_review(review,database)['inserted']
 with sqlite3.connect(database) as db,sqlite3.connect(f'file:{original}?mode=ro',uri=True) as source:
  for table in ['rooms','atlas_room_observations','atlas_sources','atlas_validations','atlas_history']:
   assert db.execute('SELECT * FROM '+table+' ORDER BY rowid').fetchall()==source.execute('SELECT * FROM '+table+' ORDER BY rowid').fetchall(),table
  assert db.execute('pragma integrity_check').fetchone()[0]=='ok';assert not db.execute('pragma foreign_key_check').fetchall()
  try:db.execute("UPDATE atlas_geometry_revisions SET reason='rewrite'");raise AssertionError('mutable review')
  except sqlite3.IntegrityError:pass
  db.executescript((root/'migrations/003_geometry_reviews.sql').read_text());assert db.execute('SELECT COUNT(*) FROM atlas_geometry_revisions').fetchone()[0]==1
 for field,value in [('source_sha256','a'*64),('status','verified')]:
  bad={**r,field:value};review.write_text(json.dumps({'format':'atlas-geometry-review-v1','record':bad}))
  try:module.import_review(review,database);raise AssertionError('invalid input accepted')
  except ValueError:pass
 review.write_text(json.dumps({'format':'atlas-geometry-review-v1','record':{**r,'reason':'different contents'}}))
 try:module.import_review(review,database);raise AssertionError('conflicting id accepted')
 except ValueError:pass
 try:module.import_review(review,original);raise AssertionError('original not protected')
 except ValueError:pass
assert hashlib.sha256(original.read_bytes()).hexdigest()==digest
print('Derived SQLite: additive/idempotent migration, preserved original rows, immutable revisions, source/hash/status constraints, backups and conflicting IDs passed')
