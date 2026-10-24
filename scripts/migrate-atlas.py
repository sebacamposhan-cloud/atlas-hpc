import sqlite3,json,shutil,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1];target=root/'data/atlas.sqlite'
if not target.exists():shutil.copyfile(root/'data/atlas-v2-original.sqlite',target)
db=sqlite3.connect(target);db.execute('PRAGMA foreign_keys=ON');backup=sqlite3.connect(root/'data/atlas-before-migration.sqlite');db.backup(backup);backup.close()
with db:
 db.executescript((root/'migrations/002_construction.sql').read_text());web=json.loads((root/'dist/data.json').read_text());special=json.loads((root/'dist/disciplines.json').read_text())
 for d in web['documents']+special['documents']:
  sha=hashlib.sha256((root/'dist/source'/d['filename']).read_bytes()).hexdigest();db.execute('INSERT OR IGNORE INTO atlas_sources VALUES(?,?,?,?,?,?)',(d['id'],d.get('specialty','architecture'),d.get('revision'),sha,d['filename'],json.dumps(d,ensure_ascii=False)))
 for r in web['rooms']:
  db.execute('INSERT OR IGNORE INTO atlas_room_observations VALUES(?,?,?,?,?,?,?)',(r['id'],r['code'],r['level'],r['sector'],r['document_id'],r['status'],json.dumps(r,ensure_ascii=False)))
 for r in special['observations']:
  db.execute('INSERT OR IGNORE INTO atlas_room_observations VALUES(?,?,?,?,?,?,?)',(r['id'],r['code'],'-1',r['sheetId'],r['sheetId'],r['status'],json.dumps(r,ensure_ascii=False)))
 for m in web['materials']:db.execute('INSERT OR IGNORE INTO atlas_materials VALUES(?,?)',(str(m['code']),json.dumps(m,ensure_ascii=False)))
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';assert not db.execute('PRAGMA foreign_key_check').fetchall()
print(json.dumps({'original_rooms':db.execute('SELECT COUNT(*) FROM rooms').fetchone()[0],'web_labels':len(web['rooms']),'web_unique_codes':len(set(r['code'] for r in web['rooms'])),'specialty_observations':len(special['observations']),'integrity':'ok'}))
