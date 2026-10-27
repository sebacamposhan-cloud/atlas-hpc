"""Read the protocol registry without executing formulas or changing the source workbook.
python scripts/import-protocol-matrix.py [workbook.xlsx] [derived-output-directory]
Only the named main registry and general summary are imported, not pivots/hidden legacy sheets.
"""
import argparse, collections, datetime, hashlib, json, re, unicodedata, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
FIELDS=['item','specialty','process','code','folio','element','level','axes','rooms','issued','selfCheck','closed','closedDate','month','receiver','state']
HEADERS=['ITEM GRAL','ESPECIALIDAD / ACTIVIDAD','PARTIDAS / PROCESO','CODIGO','FOLIO','ELEMENTO','NIVEL','EJES','RECINTOS','FECHA DE ELABORACIÓN','AUTOCONTROL','CERRADO','FECHA DE CIERRE','Mes','RECIBE','ESTADO']
def normalized(value):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFD',value) if unicodedata.category(c)!='Mn').lower().split())
def ident(prefix,value):return prefix+'-'+hashlib.sha256(value.encode()).hexdigest()[:16]
def write(path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
def import_matrix(source,output):
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    with zipfile.ZipFile(source) as book:
        strings=[''.join(t.text or '' for t in si.findall('.//m:t',NS)) for si in ET.fromstring(book.read('xl/sharedStrings.xml'))]
        workbook=ET.fromstring(book.read('xl/workbook.xml'))
        relations={r.get('Id'):r.get('Target') for r in ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))}
        sheets=[{'name':s.get('name'),'id':s.get('sheetId'),'state':s.get('state','visible'),'path':relations[s.get('{'+REL+'}id')]} for s in workbook.find('m:sheets',NS)]
        for sheet in sheets:sheet['path']=sheet['path'].lstrip('/') if sheet['path'].startswith('/') else 'xl/'+sheet['path']
        def read(sheet):
            result=[]
            for row in ET.fromstring(book.read(sheet['path'])).findall('m:sheetData/m:row',NS):
                values={};formulas=[]
                for cell in row.findall('m:c',NS):
                    value=cell.find('m:v',NS);column=re.sub(r'\d+$','',cell.get('r'));formula=cell.find('m:f',NS)
                    if formula is not None:formulas.append(column)
                    text=value.text if value is not None else None
                    if text is not None and cell.get('t')=='s':text=strings[int(text)]
                    if text is None and cell.get('t')=='inlineStr':text=''.join(t.text or '' for t in cell.findall('.//m:t',NS))
                    if text is not None:values[column]=text
                if values:result.append((int(row.get('r')),values,formulas))
            return result
        registry=next(s for s in sheets if s['name']=='2-CORRELATIVO DE PROTOCOLOS HPC')
        summary=next(s for s in sheets if s['name']=='1-RESUMEN GENERAL HPC')
        rows=read(registry);summary_rows=read(summary)
        headers=next(v for row,v,f in rows if row==2)
        if [headers.get(chr(65+i)) for i in range(16)]!=HEADERS:raise ValueError('Registry headers changed; review the source mapping before importing.')
        data=[];formula_columns=set()
        for row,cells,formulas in rows:
            if row<=2:continue
            if not any((cells.get(c) or '').strip() for c in 'ABCDE'):continue
            values=[cells.get(chr(65+i)) for i in range(16)]
            if not values[0] or not values[2] or not values[3]:raise ValueError(f'Missing identity/process/code in row {row}')
            data.append((row,values));formula_columns.update(formulas)
        properties=workbook.find('m:workbookPr',NS);date1904=properties is not None and properties.get('date1904') in ['1','true']
        cutoff=next(v.get('B') for row,v,f in summary_rows if row==1)
        def date(value):
            if not value:return None
            return ((datetime.datetime(1904,1,1) if date1904 else datetime.datetime(1899,12,30))+datetime.timedelta(days=float(value))).date().isoformat()
        total_row=next((row,v) for row,v,f in summary_rows if (v.get('A') or '').strip()=='TOTALES')
        declared={key:int(total_row[1][col]) for key,col in [('ABIERTO','C'),('CERRADO','D'),('NULO','E'),('CERRADO POR AUTOCONTROL','F')]}
        declared_total=int(total_row[1]['G'])
        if declared_total!=len(data):raise ValueError('The registry row count does not match the declared total; review before publishing.')
        cutoff_date=date(cutoff)
        types={};specialties={};folio_rows=collections.defaultdict(list);raw_states=collections.Counter();clean_states=collections.Counter();whitespace=[]
        item_ids=set()
        for row,values in data:
            item,specialty,process,code,folio,element,level,axes,rooms,issued,self_check,closed,closed_date,month,receiver,state=values
            if item in item_ids:raise ValueError(f'Duplicate ITEM GRAL at row {row}')
            item_ids.add(item);code=code.strip();specialty_key=normalized(specialty or '')
            sid=ident('specialty',specialty_key)
            group=specialties.setdefault(sid,{'id':sid,'name':specialty.strip() if specialty and specialty.strip() else 'Sin especialidad documentada','variants':set(),'typeIds':set(),'count':0})
            if specialty:group['variants'].add(specialty)
            group['count']+=1
            entry=types.setdefault(code,{'id':ident('protocol',code),'code':code,'names':set(),'rawCodes':set(),'specialtyIds':set(),'count':0,'states':collections.Counter(),'levels':collections.Counter(),'rows':[]})
            entry['names'].add(process.strip());entry['rawCodes'].add(values[3]);entry['specialtyIds'].add(sid);entry['count']+=1;group['typeIds'].add(entry['id'])
            state_key=(state or '').strip() or 'Sin estado documentado';entry['states'][state_key]+=1;entry['levels'][(level or '').strip()]+=1
            entry['rows'].append([row,*values]);raw_states[state or '']+=1;clean_states[state_key]+=1
            if state is not None and state!=state.strip():whitespace.append({'row':row,'raw':state,'display':state_key})
            folio_rows[(code,(folio or '').strip())].append(row)
        duplicates=[{'code':code,'folio':folio,'rows':r} for (code,folio),r in folio_rows.items() if len(r)>1]
        if len({entry['id'] for entry in types.values()})!=len(types):raise ValueError('Hash collision')
        output.mkdir(parents=True,exist_ok=True)
        protocols=[];ids=set()
        for code,entry in sorted(types.items()):
            if entry['id'] in ids:raise ValueError('Hash collision')
            ids.add(entry['id']);names=sorted(entry['names'],key=lambda value:(normalized(value),value));fields=['sourceRow',*FIELDS]
            pool=[];lookup={}
            def intern(value):
                if value is None:return None
                if value not in lookup:lookup[value]=len(pool);pool.append(value)
                return lookup[value]
            packed=[[row[0],*[intern(v) for v in row[1:]]] for row in entry.pop('rows')]
            path='registers/'+entry['id']+'.json'
            write(output/path,{'schema':1,'sourceSha256':digest,'typeId':entry['id'],'fields':fields,'strings':pool,'rows':packed})
            protocols.append({'id':entry['id'],'code':code,'name':names[0],'names':names,'rawCodes':sorted(entry['rawCodes']),'specialtyIds':sorted(entry['specialtyIds']),'count':entry['count'],'states':dict(sorted(entry['states'].items())),'levels':dict(sorted(entry['levels'].items())),'file':path})
        groups=[{**g,'variants':sorted(g['variants']),'typeIds':sorted(g['typeIds'])} for g in specialties.values()];groups.sort(key=lambda g:normalized(g['name']))
        audit={'statusWhitespace':whitespace,'duplicateFolios':duplicates,'missingSpecialtyRows':[row for row,v in data if not (v[1] or '').strip()],'missingIssueDate':sum(not v[9] for row,v in data),'missingCloseDate':sum(not v[12] for row,v in data),'rawStates':dict(sorted(raw_states.items())),'declaredStates':declared,'declaredTotal':declared_total,'calculatedStates':dict(sorted(clean_states.items())),'differences':{state:clean_states[state]-declared.get(state,0) for state in sorted(set(clean_states)|set(declared)) if clean_states[state]!=declared.get(state,0)}}
        aging_fields=['sourceRow','typeId','code','folio','level','receiver','issued','closedDate','state']
        aging_strings=[];aging_lookup={}
        def aging_value(value):
            if value is None:return None
            if value not in aging_lookup:aging_lookup[value]=len(aging_strings);aging_strings.append(value)
            return aging_lookup[value]
        aging_rows=[]
        for row,v in data:
            if (v[15] or '').strip() not in ['ABIERTO','PENDIENTE']:continue
            values=[ident('protocol',v[3].strip()),v[3],v[4],v[6],v[14],v[9],v[12],v[15]]
            aging_rows.append([row,*[aging_value(value) for value in values]])
        write(output/'open-aging.json',{'schema':1,'sourceSha256':digest,'fields':aging_fields,'strings':aging_strings,'rows':aging_rows})
        catalog={'schema':1,'source':{'filename':'matriz-control-protocolos-rev1-hpc.xlsx','originalName':'Matriz Control De Protocolos REV1 - HPC.xlsx','sha256':digest,'bytes':source.stat().st_size,'revision':'REV1 (nombre del archivo)','cutoff':cutoff_date,'date1904':date1904,'registrySheet':registry['name'],'registrySheetId':registry['id'],'summarySheet':summary['name'],'summaryTotalRow':total_row[0],'columns':dict(zip(FIELDS,HEADERS)),'formulaColumns':sorted(formula_columns),'valueMode':'Valores guardados en el Excel; no se ejecutan ni recalculan fórmulas.'},'aging':{'file':'open-aging.json','count':len(aging_rows)},'totalRecords':len(data),'totalTypes':len(protocols),'specialties':groups,'types':protocols,'audit':audit,'sheets':[{'name':s['name'],'state':s['state'],'imported':s['name'] in [registry['name'],summary['name']]} for s in sheets]}
        write(output/'catalog.json',catalog)
        valid={p['file'].split('/')[-1] for p in protocols}
        for old in (output/'registers').glob('protocol-*.json'):
            if old.name not in valid:old.unlink()
        print(json.dumps({'records':len(data),'types':len(protocols),'specialties':len(groups),'cutoff':cutoff_date,'states':dict(clean_states),'duplicateFolioGroups':len(duplicates),'differences':audit['differences'],'sha256':digest},ensure_ascii=False))
        return catalog
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',nargs='?',type=Path,default=ROOT/'dist/source/matriz-control-protocolos-rev1-hpc.xlsx');parser.add_argument('output',nargs='?',type=Path,default=ROOT/'dist/protocols');args=parser.parse_args();import_matrix(args.source,args.output)
