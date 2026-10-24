#!/usr/bin/env python3
"""Synthetic-only tests; no production credentials or network required."""
import io,json,os,sys,tarfile,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import backup
import verify_restore
class Tests(unittest.TestCase):
 def test_auth_diagnostic_redaction(self):
  self.assertEqual(backup.classify(b'password authentication failed for user SECRET'), 'database_authentication_failed')
 def test_no_raw_diagnostic(self):
  self.assertEqual(backup.classify(b'password=SECRET token=SECRET'), 'command_failed')
 def test_ssl_not_downgraded(self):
  with patch.dict(os.environ,{'SUPABASE_PROJECT_REF':'a'*20,'PGHOST':'db.'+'a'*20+'.supabase.co','PGUSER':'postgres','PGPORT':'5432','PGDATABASE':'postgres','PGPASSWORD':'fiction-only'},clear=True):
   self.assertEqual(backup.source_env()['PGSSLMODE'],'verify-full')
 def test_wrong_project_rejected(self):
  with patch.dict(os.environ,{'SUPABASE_PROJECT_REF':'a'*20,'PGHOST':'db.'+'b'*20+'.supabase.co','PGUSER':'postgres','PGPORT':'5432','PGDATABASE':'postgres','PGPASSWORD':'fiction-only'},clear=True):
   with self.assertRaises(backup.Failure):backup.source_env()
 def test_session_pooler_accepted(self):
  with patch.dict(os.environ,{'SUPABASE_PROJECT_REF':'a'*20,'PGHOST':'aws-0-us-west-2.pooler.supabase.com','PGUSER':'postgres.'+'a'*20,'PGPORT':'5432','PGDATABASE':'postgres','PGPASSWORD':'fiction-only'},clear=True):
   env=backup.source_env()
   self.assertEqual(env['PGSSLMODE'],'verify-full')
   self.assertEqual(env['PGPORT'],'5432')
 def test_transaction_pooler_rejected(self):
  with patch.dict(os.environ,{'SUPABASE_PROJECT_REF':'a'*20,'PGHOST':'aws-0-example.pooler.supabase.com','PGUSER':'postgres.'+'a'*20,'PGPORT':'6543','PGDATABASE':'postgres','PGPASSWORD':'fiction-only'},clear=True):
   with self.assertRaises(backup.Failure):backup.source_env()
 def test_missing_auth_coverage_rejected(self):
  with self.assertRaises(backup.Failure):backup.check_coverage({'tables':[]})
 def test_remote_restore_rejected(self):
  with self.assertRaises(backup.Failure):verify_restore.restore_contents(Path('/unused'),{'PGHOST':'production.example','PGDATABASE':'postgres'})
 def test_restore_env_strips_production(self):
  with patch.dict(os.environ,{'PGPASSWORD':'fiction-only','PGHOST':'production.example','AWS_SECRET_ACCESS_KEY':'fiction-only'}):
   env=verify_restore.target_env(Path('/new/private/socket'))
   self.assertNotIn('PGPASSWORD',env);self.assertNotIn('AWS_SECRET_ACCESS_KEY',env)
   self.assertEqual(env['PGHOST'],'/new/private/socket')
 def test_archive_traversal_rejected(self):
  with tempfile.TemporaryDirectory(dir=os.environ.get('RUNNER_TEMP')) as tmp:
   p=Path(tmp);f=p/'bad.tar'
   with tarfile.open(f,'w') as tar:
    info=tarfile.TarInfo('../escape');info.size=1;tar.addfile(info,io.BytesIO(b'x'))
   with self.assertRaises(backup.Failure):verify_restore.safe_unpack(f,p)
 def test_readback_verified_before_success(self):
  self.check_upload(False,False)
 def test_corrupt_readback_rejected(self):
  self.check_upload(True,False)
 def test_upload_failure_not_success(self):
  self.check_upload(False,True)
 def check_upload(self,corrupt,failed):
  with tempfile.TemporaryDirectory(dir=os.environ.get('RUNNER_TEMP')) as tmp:
   p=Path(tmp);archive=p/'fixture.age';archive.write_bytes(b'fictional encrypted fixture marker')
   def fake(args,stage,**kwargs):
    if stage=='r2_upload' and failed:raise backup.Failure(stage,'command_failed')
    if stage=='r2_readback':Path(args[-1]).write_bytes(b'corrupt' if corrupt else archive.read_bytes())
    return b'{}'
   env={'R2_ACCOUNT_ID':'a'*32,'R2_BUCKET':'fictional-backups','AWS_ACCESS_KEY_ID':'fiction','AWS_SECRET_ACCESS_KEY':'fiction','MAX_BACKUP_BYTES':'10000','SUPABASE_PROJECT_REF':'a'*20}
   with patch.dict(os.environ,env),patch.object(backup,'run',fake):
    if corrupt or failed:
     with self.assertRaises(backup.Failure):backup.upload(archive,p)
    else:self.assertEqual(backup.upload(archive,p)['code'],'encrypted_upload_readback_verified')
 def test_workflow_has_no_schedule_or_push(self):
  root=next(p for p in Path(__file__).resolve().parents if (p/'.github/workflows/supabase-backup.yml').is_file())
  s=(root/'.github/workflows/supabase-backup.yml').read_text()
  self.assertNotIn('\n  schedule:',s);self.assertNotIn('\n  push:',s)
 def test_encryption_rejects_missing_recipient(self):
  with self.assertRaises(backup.Failure):backup.encrypt(Path('/unused'),Path('/unused'),'')
if __name__=='__main__':unittest.main(verbosity=2)
