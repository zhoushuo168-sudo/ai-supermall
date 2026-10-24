#!/usr/bin/env python3
"""Actual age tests when the standard tools exist; otherwise explicitly skipped."""
import os,shutil,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from backup import encrypt,run,Failure
from verify_restore import safe_unpack
@unittest.skipUnless(shutil.which('age') and shutil.which('age-keygen'),'age tools not installed in this environment')
class CryptoTests(unittest.TestCase):
 def test_age_roundtrip_and_tamper_rejection(self):
  with tempfile.TemporaryDirectory(dir=os.environ.get('RUNNER_TEMP')) as tmp:
   root=Path(tmp);identity=root/'identity';plain=root/'plain';plain.mkdir(mode=0o700)
   run(['age-keygen','-o',str(identity)],'synthetic_key')
   recipient=run(['age-keygen','-y',str(identity)],'synthetic_recipient').decode().strip()
   for name in ['database.dump','roles.sql','manifest.json']:(plain/name).write_text('FICTIONAL ONLY: '+name)
   archive=root/'fiction.tar.age';encrypt(plain,archive,recipient)
   clear=run(['age','--decrypt','-i',str(identity),str(archive)],'synthetic_decrypt')
   tar=root/'fiction.tar';tar.write_bytes(clear);dest=root/'unpacked';dest.mkdir();safe_unpack(tar,dest)
   for p in plain.iterdir():self.assertEqual(p.read_bytes(),(dest/p.name).read_bytes())
   data=bytearray(archive.read_bytes());data[-1]^=1;archive.write_bytes(data)
   with self.assertRaises(Failure):run(['age','--decrypt','-i',str(identity),str(archive)],'synthetic_tamper')
if __name__=='__main__':unittest.main(verbosity=2)
