"""Read-only PDF/SQLite/runtime audit. Output is evidence, not technical validation."""
import collections,hashlib,json,math,pathlib,sqlite3,sys
import pymupdf as fitz
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else str(root/'docs/audit/data-audit.json'))
web=json.loads((root/'dist/data.json').read_text());atlas=json.loads((root/'dist/atlas.json').read_text());special=json.loads((root/'dist/disciplines.json').read_text());runtime=json.loads((root/'dist/runtime.json').read_text())
docs={d['id']:d for d in web['documents']};pdfs={did:fitz.open(root/'dist/source'/d['filename']) for did,d in docs.items()};pages={did:p[0] for did,p in pdfs.items()}
# Cache text pages: bbox comparisons use source PDF text with rotation normalized.
words={did:[(fitz.Rect(w[:4])*p.rotation_matrix,w[4]) for w in p.get_text('words')] for did,p in pages.items()}
rows={r['id']:r for r in web['rooms']};offsets={t['id']:t['offset'] for t in atlas['tiles']};placed=collections.defaultdict(list);aliases={};alias_evidence=[]
def world(r):return [r['position'][i]+offsets[r['document_id']][i] for i in (0,1)]
for r in sorted(web['rooms'],key=lambda r:(r['status']=='Validado',bool(r['polygon'])),reverse=True):
 pos=world(r);key=r['code']+'|'+r['name'];same=next((v for v in placed[key] if math.dist(v['world'],pos)<5),None)
 if same:
  aliases[r['id']]=same['id'];alias_evidence.append({'id':r['id'],'canonical_id':same['id'],'code':r['code'],'world_distance':math.dist(same['world'],pos),'basis':'same code, same name, world label distance <5 PDF points; not independently validated'})
 else:placed[key].append({'id':r['id'],'world':pos})
x,y,w,h=atlas['scope']['bounds'];canonical=[];seen=set()
for r in web['rooms']:
 pos=world(r)
 if not(x<=pos[0]<=x+w and y<=pos[1]<=y+h):continue
 c=rows[aliases.get(r['id'],r['id'])]
 if c['id'] not in seen:canonical.append(c);seen.add(c['id'])
selection_ids={r['id'] for r in json.loads((root/'dist/selection.json').read_text())['rooms']}
source=[]
for did,d in docs.items():
 path=root/'dist/source'/d['filename'];source.append({'id':did,'filename':d['filename'],'sha256_matches':hashlib.sha256(path.read_bytes()).hexdigest()==d['sha256'],'page_count':len(pdfs[did]),'revision':d['revision']})
sqlite=sqlite3.connect(f'file:{root}/data/atlas.sqlite?mode=ro',uri=True)
material_rows=collections.defaultdict(dict)
for did,code,desc,asepsis,bb in sqlite.execute('select document_id,code,description,asepsis,source_bbox from finishes'):
 material_rows[did][code]={'description':desc,'asepsis':asepsis,'source_bbox':json.loads(bb) if bb else None}
all_records=[]
for r in web['rooms']:
 fields=[]
 for f in r['finishes']:
  bbox=fitz.Rect(f['bbox']);pad=bbox+(-.2,-.2,.2,.2)
  at_bbox=[text for rect,text in words[r['document_id']] if pad.contains((rect.tl+rect.br)*.5)]
  catalogue=material_rows[r['document_id']].get(f['code'])
  fields.append({'field':f['field'],'code':f['code'],'description':f['description'],'asepsis':f.get('asepsis'),'bbox':f['bbox'],'pdf_text_at_bbox':at_bbox,'pdf_code_confirmed':f['code'] in at_bbox,'source_catalogue':catalogue,'catalogue_matches':bool(catalogue and catalogue['description']==f['description'] and catalogue['asepsis']==f.get('asepsis'))})
 walls=[f for f in fields if f['field'] in ('M1','M2','M3','M4')];wall_codes={f['code'] for f in walls};documented_class=sorted({f['asepsis'] for f in walls if f['asepsis']})
 if r['asepsis']:cause='documented_wall_paint_classification'
 elif '15' in wall_codes:cause='documented_mixed_finish_paint_type_unspecified'
 elif wall_codes<= {'N/A'}:cause='all_wall_fields_explicitly_not_applicable'
 elif 'S/E' in wall_codes:cause='documented_walls_include_unspecified_finish'
 else:cause='documented_wall_finishes_without_asepsis_category'
 label_bbox=fitz.Rect(r['label_bbox'])+(-.2,-.2,.2,.2)
 label_text=[text for rect,text in words[r['document_id']] if label_bbox.contains((rect.tl+rect.br)*.5)]
 all_records.append({'id':r['id'],'code':r['code'],'name':r['name'],'document_id':r['document_id'],'source_filename':docs[r['document_id']]['filename'],'source_sha256':docs[r['document_id']]['sha256'],'revision':docs[r['document_id']]['revision'],'page':docs[r['document_id']]['page'],'canonical_in_scope':r['id'] in seen,'canonical_id':aliases.get(r['id'],r['id']),'asepsis':r['asepsis'],'rederived_from_walls':documented_class,'asepsis_matches':r['asepsis']==documented_class,'cause':cause,'source_pdf_exists':(root/'dist/source'/docs[r['document_id']]['filename']).is_file(),'diamond_image':r['diamond_url'],'diamond_image_exists':(root/'dist'/r['diamond_url'].lstrip('/')).is_file(),'diamond_bbox':r['diamond_bbox'],'label_pdf_text':label_text,'code_found_in_label_bbox':r['code'] in label_text,'finishes':fields,'review_scope':'Automated PDF word/box and per-source catalogue comparison; does not validate technical association, geometry or whole-document absence.'})
all_by_id={r['id']:r for r in all_records};unknown=[all_by_id[r['id']] for r in canonical if not r['asepsis']]
observations={row[0]:json.loads(row[1]) for row in sqlite.execute('select id,payload from atlas_room_observations')};legacy_ids={row[0] for row in sqlite.execute('select id from rooms')}
obs_expected=web['rooms']+special['observations'];obs_diffs=[r['id'] for r in obs_expected if observations.get(r['id'])!=r]
c=runtime['catalog'];decoded=[]
for row in c['rows']:
 r=dict(zip(c['fields'],row))
 for key in c['pooledFields']:r[key]=c['strings'][r[key]]
 r['notes']=[c['strings'][i] for i in r['notes']]
 r['finishes']=[dict(c['finishes'][i],bbox=bbox) for i,bbox in r['finishes']]
 decoded.append(r)
runtime_diffs=[]
for a,b in zip(web['rooms'],decoded):
 for key in a:
  if key in ('polygon','holes'):continue
  if a[key]!=b.get(key):runtime_diffs.append([a['id'],key])
summary={'arq_labels':len(web['rooms']),'canonical_rooms':len(canonical),'canonical_selection_ids_equal':seen==selection_ids,'aliases':len(aliases),'unclassified_canonical':len(unknown),'canonical_categories':dict(collections.Counter(a for r in canonical for a in (r['asepsis'] or ['unclassified']))),'unclassified_causes':dict(collections.Counter(r['cause'] for r in unknown)),'all_diamond_images_present':all(r['diamond_image_exists'] for r in all_records),'all_six_fields_present':all(len(r['finishes'])==6 for r in all_records),'pdf_field_code_matches':sum(f['pdf_code_confirmed'] for r in all_records for f in r['finishes']),'pdf_fields_total':sum(len(r['finishes']) for r in all_records),'source_catalogue_matches':sum(f['catalogue_matches'] for r in all_records for f in r['finishes']),'label_code_bbox_matches':sum(r['code_found_in_label_bbox'] for r in all_records),'asepsis_derivation_matches':sum(r['asepsis_matches'] for r in all_records),'legacy_rooms':len(legacy_ids),'observation_rows':len(observations),'sqlite_observation_payload_diffs':obs_diffs,'legacy_missing_web_ids':sorted(set(rows)-legacy_ids),'runtime_metadata_diffs':runtime_diffs,'integrity':sqlite.execute('pragma integrity_check').fetchall(),'foreign_key_errors':sqlite.execute('pragma foreign_key_check').fetchall()}
report={'scope':'Phase 0 documentary chain audit; source-backed machine checks, not professional validation','summary':summary,'sources':source,'unclassified_canonical_rooms':[{k:r[k] for k in ('id','code','cause')} for r in unknown],'all_arq_labels':all_records,'alias_evidence':alias_evidence}
out.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n');print(json.dumps(summary,ensure_ascii=False,indent=2));print('written',out)
