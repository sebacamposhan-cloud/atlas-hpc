"""Reproducibility and failure isolation of the real Excel import, using temporary outputs."""
import hashlib,json,os,re,subprocess,sys,tempfile,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'dist/source/matriz-control-protocolos-rev1-hpc.xlsx'
SCRIPT=ROOT/'scripts/import-protocol-matrix.py'
class ProtocolImport(unittest.TestCase):
 def test_reproducible_and_invalid_summary_does_not_write(self):
  before=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
  with tempfile.TemporaryDirectory(prefix='atlas-matrix-import-') as temporary:
   output=Path(temporary)/'derived'
   def run(source,seed='1'):
    return subprocess.run([sys.executable,str(SCRIPT),str(source),str(output)],env={**os.environ,'PYTHONHASHSEED':seed},capture_output=True,text=True)
   first=run(SOURCE);self.assertEqual(first.returncode,0,first.stderr)
   snapshot={str(p.relative_to(output)):hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*.json')}
   self.assertEqual(len(snapshot),155)
   second=run(SOURCE,'2');self.assertEqual(second.returncode,0,second.stderr)
   self.assertEqual(snapshot,{str(p.relative_to(output)):hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*.json')})
   corrupt=Path(temporary)/'different-total.xlsx'
   with zipfile.ZipFile(SOURCE) as original,zipfile.ZipFile(corrupt,'w',zipfile.ZIP_DEFLATED) as destination:
    for entry in original.infolist():
     data=original.read(entry.filename)
     if entry.filename=='xl/worksheets/sheet1.xml':
      data,count=re.subn(rb'(<c\b[^>]*\br="G158"[^>]*>.*?<v>)20233(</v>)',rb'\g<1>20234\2',data,count=1,flags=re.S)
      self.assertEqual(count,1)
     destination.writestr(entry,data)
   invalid=run(corrupt);self.assertNotEqual(invalid.returncode,0);self.assertIn('row count does not match',invalid.stderr)
   self.assertEqual(snapshot,{str(p.relative_to(output)):hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*.json')})
  self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(),before)
if __name__=='__main__':unittest.main()
