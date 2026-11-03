"""Reproducible, non-destructive technical import. Usage: python scripts/import-apu.py APU.xlsx
Requires openpyxl. Original workbook remains external; monetary amounts are checked, not published.
"""
import sys,json,hashlib,re,unicodedata,collections
from pathlib import Path
import openpyxl
source=Path(sys.argv[1]);sha=hashlib.sha256(source.read_bytes()).hexdigest();version='hpc-apu-'+sha[:12]+'-01'
w=openpyxl.load_workbook(source,read_only=True,data_only=True)
f=openpyxl.load_workbook(source,read_only=True,data_only=False)
assert w.sheetnames==['APU'],'Unexpected workbook layout'
rows=list(w['APU'].values);formula=list(f['APU'].values)
assert any(list(row[:7])==['Código','Nat','Ud','Resumen','CanPres','Pres','ImpPres'] for row in rows[:10])
def norm(v):return unicodedata.normalize('NFKD',str(v or '')).encode('ascii','ignore').decode().lower().strip()
def unit(v):return {'m2':'m²','m3':'m³','dia':'día','ml':'ml','m':'m','un':'un','ud':'un','u':'un','ud.':'un','uni':'un','un.':'un','gl':'gl','kg':'kg','lt':'lt','no':'un','n':'un'}.get(norm(v),str(v or '').strip())
def number(v):return isinstance(v,(float,int)) and not isinstance(v,bool)
curated=['5.1.1','5.1.3','5.1.4','5.1.5','5.1.6','5.1.7','5.1.8','5.1.9','6.1.4.1','6.1.4.2','6.1.4.3','6.1.4.4','6.1.4.5','6.2.2','6.2.3','6.2.4','6.3.2','6.3.3','6.3.4','6.4.1.1','6.4.1.2','6.4.1.3','6.4.2.1','6.4.2.2','6.4.2.3']
chapters=[];parts=[];current=None;stack=[];price={};orphan=[];formulas=0
for rownum,r in enumerate(rows,1):
 code,nature,ud,description,coef,pres,amount=r[:7]
 formulas+=sum(isinstance(v,str) and v.startswith('=') for v in formula[rownum-1])
 if nature not in ['Capítulo','Partida','Material','Mano de obra','Maquinaria','Otros']:continue
 code=str(code or '');description=str(description or '')
 if nature in ['Capítulo','Partida']:
  if nature=='Capítulo':
   current=None
   while stack and not code.rstrip('.').startswith(stack[-1]['code'].rstrip('.')+'.'):stack.pop()
   c={'id':'chapter:'+str(rownum),'code':code,'description':description,'parentId':stack[-1]['id'] if stack else None,'row':rownum};chapters.append(c);stack.append(c);continue
  current={'id':code+'@'+str(rownum),'code':code,'description':description,'unitOriginal':ud,'unit':unit(ud),'row':rownum,'chapterIds':[c['id'] for c in stack],'chapterPath':[c['description'] for c in stack],'resources':[],'operations':[],'issues':[]}
  parts.append(current);price[current['id']]=pres
 else:
  resource={'id':current['id']+':'+code+'@'+str(rownum) if current else 'orphan:'+str(rownum),'code':code,'nature':nature,'description':description,'unitOriginal':ud,'unit':unit(ud),'coefficient':coef if number(coef) else None,'coefficientOriginal':coef,'row':rownum,'sourceCells':{'code':'A'+str(rownum),'unit':'C'+str(rownum),'coefficient':'E'+str(rownum)},'priceCheck':'ok' if all(number(x) for x in [coef,pres,amount]) and abs(coef*pres-amount)<=1 else 'pending'}
  if current:current['resources'].append(resource)
  else:orphan.append(resource)
for p in parts:
 if re.search(r'eliminad|suprimid',norm(p['description'])):p['issues'].append('deleted')
 if not p['unit']:p['issues'].append('missing-unit')
 if not number(price[p['id']]) or price[p['id']]<=0:p['issues'].append('missing-positive-price')
 if not p['resources']:p['issues'].append('no-resources')
 if any(not number(r['coefficient']) or r['coefficient']<=0 for r in p['resources']):p['issues'].append('incomplete-coefficients')
 p['validation']='documentary-reviewed' if p['code'] in curated and not p['issues'] else 'pending'
 p['selectable']=not p['issues']
 for r in p['resources']:
  if r['nature']!='Mano de obra':continue
  reviewed=p['validation']=='documentary-reviewed' and r['unit']=='día' and number(r['coefficient']) and r['coefficient']>0
  p['operations'].append({'id':r['id'],'resourceId':r['id'],'label':r['description'],'coefficient':r['coefficient'],'resourceUnit':r['unit'],'resourceUnitOriginal':r['unitOriginal'],'outputUnit':p['unit'],'validation':'documentary-reviewed' if reviewed else 'pending','selectable':bool(reviewed),'productivity':None,'limitation':'Composición del recurso no documentada; no convertir día de recurso a jornada-persona.','row':r['row']})
 p['priceCheck']='resources-reviewed' if all(r['priceCheck']=='ok' for r in p['resources']) and p['resources'] else 'pending'
# Duplicate codes must never overwrite earlier occurrences.
counts=collections.Counter(p['code'] for p in parts)
for p in parts:
 if counts[p['code']]>1:p['issues'].append('duplicate-code');p['selectable']=False
# Independently recompute sums from coefficient x resource price, never from cached subtotal formulas.
subtotal_checks=[]
for part in parts:
 resource_rows=[rows[r['row']-1] for r in part['resources']]
 values=[rr[4]*rr[5] for rr in resource_rows if number(rr[4]) and number(rr[5])]
 status='consistent' if len(values)==len(resource_rows) and number(price[part['id']]) and abs(sum(values)-price[part['id']])<=len(values)+1 else 'pending-review'
 subtotal_checks.append({'partId':part['id'],'row':part['row'],'status':status})
out={'schema':1,'version':version,'source':{'name':'APU.xlsx','project':'Hospital Provincia Cordillera','sha256':sha,'sheet':'APU','rows':len(rows)},'chapters':chapters,'parts':parts,'orphans':orphan}
audit={'importer':{'version':'hpc-apu-import-1','scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},'version':version,'source':out['source'],'counts':{'chapters':len(chapters),'parts':len(parts),'resources':sum(len(p['resources']) for p in parts),'orphans':len(orphan),'resourceTypes':dict(collections.Counter(r['nature'] for p in parts for r in p['resources'])),'operations':sum(len(p['operations']) for p in parts),'reviewedParts':sum(p['validation']=='documentary-reviewed' for p in parts),'reviewedOperations':sum(o['selectable'] for p in parts for o in p['operations']),'usableApuPersonRates':0,'formulaCells':formulas},'subtotalChecks':dict(collections.Counter(r['status'] for r in subtotal_checks)),'subtotalPending':[r for r in subtotal_checks if r['status']!='consistent'],'resourceNaturePrefixMismatches':[{'row':r['row'],'code':r['code'],'nature':r['nature']} for p in parts for r in p['resources'] if r['nature']=='Mano de obra' and not r['code'].upper().startswith('MO')],'issues':dict(collections.Counter(i for p in parts for i in p['issues'])),'sample':[{'code':p['code'],'row':p['row'],'description':p['description'],'validation':p['validation'],'operations':[{'label':o['label'],'row':o['row'],'coefficient':o['coefficient'],'unit':o['resourceUnitOriginal'],'status':o['validation']} for o in p['operations']]} for p in parts if p['code'] in curated],'limitations':['Revisión documental por reglas contrastadas con las filas originales; no aprobación técnica de cuadrillas.','Todos los recursos de mano de obra usan Dia/dia sin composición verificada.','Importes monetarios comprobados a nivel recurso, no publicados en catálogo técnico.','El Excel original es la fuente reversible; cambiar index.json permite volver a otra importación conservada.']}
root=Path('dist/apu');root.mkdir(exist_ok=True);name=version+'.json'
payload=json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n'
if (root/name).exists():assert (root/name).read_text()==payload,'Immutable import version differs'
(root/name).write_text(payload)
(root/'index.json').write_text(json.dumps({'schema':1,'version':version,'file':name,'sha256':hashlib.sha256(payload.encode()).hexdigest()},indent=2)+'\n')
(root/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n');print(json.dumps(audit['counts']));print(json.dumps(audit['issues']))
