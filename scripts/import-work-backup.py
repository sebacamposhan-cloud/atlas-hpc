"""Import portable device records into SQLite without overwriting existing records.
Usage: python3 scripts/import-work-backup.py backup.json [database.sqlite]
Conflicts retain the database copy; backup is created before the transaction.
"""
import json,sqlite3,sys,datetime,uuid
from pathlib import Path
root=Path(__file__).resolve().parents[1];value=json.loads(Path(sys.argv[1]).read_text());target=Path(sys.argv[2]) if len(sys.argv)>2 else root/'data/atlas.sqlite'
if value.get('format')!='atlas-construction-v1':raise SystemExit('Unsupported backup')
db=sqlite3.connect(target);db.execute('PRAGMA foreign_keys=ON');saved=sqlite3.connect(str(target)+'.before-import');db.backup(saved);saved.close();dump=lambda v:json.dumps(v,ensure_ascii=False)
with db:
 for z in value['zones']:
  pts=z['points']
  if len(pts)<3 or any(len(p)!=2 or any(not isinstance(v,(int,float)) for v in p) for p in pts):raise ValueError('Invalid geometry')
  db.execute('INSERT OR IGNORE INTO atlas_zones VALUES(?,?,?,?,?,?,?,?,?,?)',(z['id'],z['roomCode'],z.get('observationId'),z['specialty'],z['sheetId'],dump(pts),z['status'],None,None,dump(z)))
 for e in value['events']:db.execute('INSERT OR IGNORE INTO atlas_events VALUES(?,?,?,?,?,?)',(e['id'],e['zoneId'],e['dimension'],e['state'],e['date'],dump(e)))
 for p in value['protocols']:
  db.execute('INSERT OR IGNORE INTO atlas_protocols VALUES(?,?,?,?,?,?)',(p['id'],p['number'],p['specialty'],p['technical'],p['administrative'],dump(p)))
  existing=db.execute('SELECT id FROM atlas_protocols WHERE official_number=? AND specialty=?',(p['number'],p['specialty'])).fetchone()[0]
  for code in p['elements']:db.execute('INSERT OR IGNORE INTO atlas_protocol_elements VALUES(?,?,?)',(existing,code,'room-code-pending-global-identity'))
 for h in value.get('history',[]):db.execute('INSERT OR IGNORE INTO atlas_history VALUES(?,?,?,?,?,?)',(h['id'],h['item']['id'],h['at'],None,dump(h),'Imported device history'))
 if db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('Foreign key failure')
print('Import committed; existing records retained; pre-import database backup created')
