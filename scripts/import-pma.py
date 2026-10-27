"""Import saved PMA values into JSON and a separate reproducible SQLite snapshot.
No formulas are executed; original workbook, Atlas databases and geometries are untouched.
python scripts/import-pma.py [source.xlsx] [output-dir] [derived.sqlite]
"""
import argparse, collections, hashlib, json, os, re, sqlite3, tempfile, zipfile
from pathlib import Path
from xml.etree import ElementTree as E
ROOT=Path(__file__).resolve().parents[1]
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
MAIN='HPC PMA TERMINACIONES'
REFERENCE='01_PMA_A-TAB-000_ARQ_DataTermin'
REVIEW='HPC SE5 Obs PMA Det. Terminacio'
FIELDS=['code','roomType','category','unit','name','area','level','change','PAV','CIE','M1','M2','M3','M4','asepsis','wallType','projected','reference','comparison','comments','observation','response']
HEADERS=['CÓDIGO DE RECINTOS','RECINTO TIPO','CATEGORIA GENERAL','UNIDAD','RECINTO','SUPERFICIE','NIVEL','RECINTO NUEVO O ELIMINADO','PAVIMENTOS','CIELOS','MURO NORTE','MURO ORIENTE','MURO SUR','MURO PONIENTE','ASEPSIA PINTURA ','MUROS Y ASEPSIA','PMA ESPECIALIDAD PROYECTADA','PMA ESPECIALIDAD REFERENCIAL','COMPARACIÓN','COMENTARIOS al PMA DE TERMINACIONES','\nHPC SE5 Obs PMA Det. Terminacio','Respuesta a \nHPC SE5 Obs PMA Det. Terminacio']
EXTRA_HEADERS={'01_PMA_A-TAB-000_ARQ_DataTermin': ['Código Recintos', 'Recinto Tipo', 'Categoría General', 'Unidad Funcional', 'Recinto', 'Superficie', 'Nivel', 'Comments', 'ARQ_PMA_Comentarios', 'PAVIMENTOS', 'CIELOS', 'Wall Finish', 'Base Finish', 'ARQ_PMA_TerminacionesReferencial', 'ARQ_PMA_TER_Comentarios', 'MURO NORTE', 'MURO ORIENTE', 'MURO SUR', 'MURO PONIENTE', 'ARQ_PMA_AsepsiaPintura', 'RESPUESTA PMA OBS. Det. Terminaciones_RevF'], 'HPC SE5 Obs PMA Det. Terminacio': ['CÓDIGOS DE RECINTOS', 'RECINTO LICITACION', 'RECINTO ELIMINADO/RECINTO NUEVO/RECINTO TIPO (RTP)', 'LISTADO RECINTOS TIPO', 'UNIDAD', 'NIVEL', 'RECINTO', 'PMA TERMINACIONES', 'PMA TERMINACIONES', 'ESTADO PMA TERMINACIONES PISOS', 'ESTADO PMA TERMINACIONES CIELOS', 'ESTADO PMA TERMINACIONES MUROS', 'OBSERVACIONES PMA TERMINACIONES', 'RESPUESTA SACYR']}
def dump(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def import_pma(source,output,database):
    source,output,database=Path(source).resolve(),Path(output).resolve(),Path(database).resolve()
    if database in {(ROOT/'data'/name).resolve() for name in ['atlas.sqlite','atlas-v2-original.sqlite','atlas-before-migration.sqlite']} or database==source:raise ValueError('Original databases and workbook are protected; choose a separate derived snapshot.')
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    with zipfile.ZipFile(source) as z:
        strings=[''.join(t.text or '' for t in s.findall('.//m:t',NS)) for s in E.fromstring(z.read('xl/sharedStrings.xml'))]
        rels={r.get('Id'):r.get('Target') for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        sheets={}
        for s in E.fromstring(z.read('xl/workbook.xml')).find('m:sheets',NS):
            target=rels[s.get('{'+REL+'}id')];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
            rows=[]
            for r in E.fromstring(z.read(target)).findall('m:sheetData/m:row',NS):
                cells={};formulas=[];errors=[]
                for c in r.findall('m:c',NS):
                    col=re.sub(r'\d+$','',c.get('r'));v=c.find('m:v',NS)
                    value=v.text if v is not None else None
                    if v is not None and v.text is None and c.get('t')=='str':value=''
                    if value is not None and c.get('t')=='s':value=strings[int(value)]
                    if c.get('t')=='inlineStr':value=''.join(t.text or '' for t in c.findall('.//m:t',NS))
                    if value is not None:cells[col]=value
                    if c.find('m:f',NS) is not None:formulas.append(col)
                    if c.get('t')=='e':errors.append(col)
                if cells:rows.append({'row':int(r.get('r')),'cells':cells,'formulaColumns':formulas,'errorColumns':errors})
            sheets[s.get('name')]={'state':s.get('state','visible'),'rows':rows}
    headers=next(r['cells'] for r in sheets[MAIN]['rows'] if r['row']==5)
    cols=[chr(66+i) for i in range(22)]
    if [headers.get(c) for c in cols]!=HEADERS:raise ValueError('PMA headers changed; review mapping before importing.')
    definitions=[(MAIN,5,'B','H',cols,FIELDS),(REFERENCE,1,'A','G',[chr(65+i) for i in range(21)],None),(REVIEW,2,'A','F',[chr(65+i) for i in range(14)],None)]
    datasets={};pool=[];lookup={};decoded={};footers=[]
    def intern(v):
        if v is None:return None
        if v not in lookup:lookup[v]=len(pool);pool.append(v)
        return lookup[v]
    for name,header_row,code_col,level_col,columns,fields in definitions:
        hs=next(r['cells'] for r in sheets[name]['rows'] if r['row']==header_row)
        if name in EXTRA_HEADERS and [hs.get(c) for c in columns]!=EXTRA_HEADERS[name]:raise ValueError('PMA reference/review headers changed; review the mapping.')
        records=[];raw=[]
        for r in sheets[name]['rows']:
            if r['row']<=header_row or not (r['cells'].get(code_col) or '').strip():continue
            code=r['cells'][code_col]
            if code=='Total general' or re.fullmatch(r'Grand total: \d+',code):
                footers.append({'sheet':name,'sourceRow':r['row'],'label':code});continue
            if not re.fullmatch(r'[A-Za-z0-9.()\-]+',code.strip()):raise ValueError(f'Unexpected room code at {name}:{r["row"]}: {code}')
            values=[r['cells'].get(c) for c in columns]
            raw.append({'id':f'{digest[:16]}:{name}:{r["row"]}','sourceRow':r['row'],'code':code,'level':r['cells'].get(level_col),'values':values})
            records.append([r['row'],*[intern(v) for v in values]])
        if len({r['code'].strip() for r in raw})!=len(raw):raise ValueError(f'Duplicate codes in {name}; explicit reconciliation is required.')
        decoded[name]=raw
        datasets[name]={'fields':fields or columns,'columns':columns,'headers':[hs.get(c) for c in columns],'rows':records,'count':len(records)}
    main=decoded[MAIN]
    if not main:raise ValueError('No PMA rooms')
    if any(int(r['label'].split(': ')[1])!=len(main) for r in footers if r['label'].startswith('Grand total: ')):raise ValueError('Declared PMA total does not match extracted rooms')
    main_codes={r['code'].strip() for r in main}
    if any({r['code'].strip() for r in decoded[name]}!=main_codes for name in [REFERENCE,REVIEW]):raise ValueError('PMA sheets disagree on room identities; reconcile before publishing.')
    for name in [REFERENCE,REVIEW]:
        levels={r['code'].strip():r['level'] for r in decoded[name]}
        if any(levels[r['code'].strip()]!=r['level'] for r in main):raise ValueError('PMA sheet levels disagree; reconcile before publishing.')
    orientations={r['row']:r['cells'] for r in sheets['CODIFICACIÓN MUROS']['rows']}
    if [orientations[1].get(c) for c in 'EFGH']!=['MURO NORTE','MURO ORIENTE','MURO SUR','MURO PONIENTE'] or [orientations[2].get(c) for c in 'EFGH']!=['M1','M2','M3','M4']:raise ValueError('Wall orientation mapping changed; review before importing.')
    legends=[]
    for name in ['CODIGOS TERMINACIONES','CODIFICACIÓN MUROS']:
        for r in sheets[name]['rows']:
            if name=='CODIGOS TERMINACIONES' and not r['cells'].get('C'):continue
            if name=='CODIFICACIÓN MUROS' and not r['cells'].get('B'):continue
            legends.append({'sheet':name,'sourceRow':r['row'],'cells':r['cells']})
    counts=collections.Counter(r['level'] for r in main)
    audit={'levels':dict(sorted(counts.items())),'eliminated':counts['Recintos Eliminados'],'comparison':dict(sorted(collections.Counter(r['values'][18] for r in main).items(),key=lambda pair:pair[0] or '')),'reviewStates':{col:dict(sorted(collections.Counter((r['values'][i] or '').strip() or 'Sin revisión documentada' for r in decoded[REVIEW]).items())) for i,col in [(9,'PAV'),(10,'CIE'),(11,'walls')]}}
    metadata={'filename':'hpc-5-arq-gen-pma-01-revb.xlsx','originalName':'HPC-5-ARQ-GEN-PMA-01-RevB (1).xlsx','sha256':digest,'bytes':source.stat().st_size,'revision':'RevB (nombre del archivo)','date':None,'valueMode':'Valores guardados; no se ejecutan ni recalculan fórmulas.','mainSheet':MAIN,'referenceSheet':REFERENCE,'reviewSheet':REVIEW,'orientationSource':'CODIFICACIÓN MUROS!E1:H2','sheets':[{'name':name,'state':s['state']} for name,s in sheets.items()]}
    audit['excludedTotals']=footers
    cover={(r['row'],col):value for r in sheets['Caratula']['rows'] for col,value in r['cells'].items()}
    metadata['cover']={'title':cover.get((1,'D')),'project':cover.get((2,'E')),'notes':cover.get((6,'B'))}
    value={'schema':1,'source':metadata,'strings':pool,'datasets':datasets,'legends':legends,'audit':audit}
    # Validate everything before replacing derived outputs. Build SQLite in a temporary file.
    database.parent.mkdir(parents=True,exist_ok=True)
    fd,temp=tempfile.mkstemp(dir=database.parent,suffix='.sqlite');os.close(fd)
    try:
        with sqlite3.connect(temp) as db:
            db.execute('PRAGMA foreign_keys=ON');db.executescript((ROOT/'migrations/004_pma_snapshot.sql').read_text())
            db.execute('INSERT INTO pma_sources VALUES(?,?)',(digest,dump(metadata)))
            for name,records in decoded.items():
                for r in records:db.execute('INSERT INTO pma_observations VALUES(?,?,?,?,?,?,?)',(r['id'],digest,name,r['sourceRow'],r['code'],r['level'],dump(dict(zip(datasets[name]['fields'],r['values'])))))
            for r in legends:db.execute('INSERT INTO pma_legends VALUES(?,?,?,?)',(digest,r['sheet'],r['sourceRow'],dump(r['cells'])))
            if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('Invalid derived database')
        output.mkdir(parents=True,exist_ok=True)
        (output/'catalog.json.tmp').write_text(dump(value)+'\n');os.replace(output/'catalog.json.tmp',output/'catalog.json');os.replace(temp,database)
    finally:
        if os.path.exists(temp):os.unlink(temp)
    print(dump({'records':len(main),'sourceSha256':digest,'audit':audit}))
    return value
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',nargs='?',type=Path,default=ROOT/'dist/source/hpc-5-arq-gen-pma-01-revb.xlsx');p.add_argument('output',nargs='?',type=Path,default=ROOT/'dist/pma');p.add_argument('database',nargs='?',type=Path,default=ROOT/'data/pma-revb.sqlite');a=p.parse_args();import_pma(a.source,a.output,a.database)
