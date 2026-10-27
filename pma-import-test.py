"""Reproducibility, original protection, SQLite integrity and failure before publishing."""
import hashlib,importlib.util,json,sqlite3,tempfile,zipfile
from pathlib import Path
root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pma',root/'scripts/import-pma.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
source=root/'dist/source/hpc-5-arq-gen-pma-01-revb.xlsx'
protected=[source,*[root/'data'/name for name in ['atlas.sqlite','atlas-v2-original.sqlite','atlas-before-migration.sqlite']]]
hashes={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
with tempfile.TemporaryDirectory() as td:
    td=Path(td);out=td/'pma';database=td/'pma.sqlite';m.import_pma(source,out,database)
    first=[(out/'catalog.json').read_bytes(),database.read_bytes()]
    m.import_pma(source,out,database);assert first==[(out/'catalog.json').read_bytes(),database.read_bytes()]
    assert first[0]==(root/'dist/pma/catalog.json').read_bytes()
    with sqlite3.connect(f'file:{database}?mode=ro',uri=True) as db:
        assert db.execute('pragma integrity_check').fetchone()[0]=='ok'
        assert not db.execute('pragma foreign_key_check').fetchall()
        assert db.execute('select count(*) from pma_observations').fetchone()[0]==9321
        assert db.execute('select count(*) from pma_observations where sheet=? and level=?',(m.MAIN,'Recintos Eliminados')).fetchone()[0]==133
        value=json.loads((out/'catalog.json').read_text())
        for name,dataset in value['datasets'].items():
            for row in dataset['rows']:
                raw={field:value['strings'][v] if v is not None else None for field,v in zip(dataset['fields'],row[1:])}
                saved=db.execute('select source_sha256,payload_json from pma_observations where sheet=? and source_row=?',(name,row[0])).fetchone()
                assert saved[0]==value['source']['sha256'] and json.loads(saved[1])==raw
    bad=td/'invalid.xlsx'
    with zipfile.ZipFile(source) as zin,zipfile.ZipFile(bad,'w') as zout:
        for entry in zin.infolist():
            body=zin.read(entry.filename)
            if entry.filename=='xl/worksheets/sheet2.xml':body=body.replace(b'r="B5"',b'r="ZZ5"',1)
            zout.writestr(entry,body)
    try:m.import_pma(bad,out,database)
    except ValueError:pass
    else:raise AssertionError('Changed PMA headers must be rejected')
    assert first==[(out/'catalog.json').read_bytes(),database.read_bytes()]
    for path in protected:
        try:m.import_pma(source,out,path)
        except ValueError:pass
        else:raise AssertionError('Original overwrite must be refused')
assert hashes=={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
print('PMA importer: repeatable JSON/SQLite, 9,321 source observations, all stored values, integrity/foreign keys, rejected schema change without replacing valid output, original workbook and all SQLite files preserved')
