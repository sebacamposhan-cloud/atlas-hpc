"""Import documentary PMA S01 quantities; never treat workbook counts as installed quantities."""
import sys,json,hashlib,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as E
root=Path(__file__).resolve().parents[2];source=Path(sys.argv[1]);n={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with ZipFile(source) as z:
 strings=[''.join(t.text or '' for t in s.findall('.//m:t',n)) for s in E.fromstring(z.read('xl/sharedStrings.xml'))]
 def rows(file):
  for row in E.fromstring(z.read(file)).findall('.//m:row',n):
   vals={}
   for c in row:
    v=c.find('m:v',n)
    if v is not None:vals[re.sub(r'\d','',c.get('r'))]=strings[int(v.text)] if c.get('t')=='s' else v.text
   yield int(row.get('r')),vals
 data=list(rows('xl/worksheets/sheet1.xml'));headers=dict(data)[6];names=dict(data)[3]
 types=[{'code':v,'column':col,'name':names.get(col,v)} for col,v in headers.items() if re.fullmatch('[A-FRS]\\d+',v)]
 rooms=[];excluded=[]
 for num,r in data:
  if num<7 or r.get('G')!='A-S01' or not r.get('A'):continue
  if 'ELIMIN' in (r.get('H') or '').upper():excluded.append(r['A']);continue
  items=[]
  for a in types:
   value=r.get(a['column'],'0')
   if value in ('','0'):continue
   q=float(value)
   if q<=0 or not q.is_integer():raise ValueError((num,a,value))
   items.append({'code':a['code'],'quantity':int(q),'cell':a['column']+str(num)})
  rooms.append({'code':r['A'],'name':r.get('E',''),'row':num,'items':items})
 assert len({r['code'] for r in rooms})==len(rooms)
 out={'schema':1,'source':{'filename':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sheet':'HPC PMA Artefactos','revision':'RevB','level':'A-S01','quantityOrigin':'Valores guardados de la matriz J:BJ; no indica instalación'},'types':types,'rooms':rooms,'excludedDeleted':excluded}
 (root/'dist/impermeabilizacion/artefactos-s01.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
 print({'rooms':len(rooms),'roomsWithArtifacts':sum(bool(r['items']) for r in rooms),'units':sum(a['quantity'] for r in rooms for a in r['items']),'types':len(types),'excluded':len(excluded)})
