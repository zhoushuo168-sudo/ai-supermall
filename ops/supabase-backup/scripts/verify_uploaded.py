#!/usr/bin/env python3
"""Read back the encrypted object and reuse the local-only restore verifier."""
import json,os,re,subprocess,sys,tempfile
from pathlib import Path
from backup import Failure,run,digest,emit

def main():
 required=('R2_ACCOUNT_ID','R2_BUCKET','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','BACKUP_OBJECT_KEY','BACKUP_OBJECT_SHA256','BACKUP_AGE_IDENTITY')
 if any(not os.environ.get(n) for n in required):raise Failure('restore_configuration','missing_restore_setting')
 account=os.environ['R2_ACCOUNT_ID'];bucket=os.environ['R2_BUCKET'];key=os.environ['BACKUP_OBJECT_KEY']
 if not re.fullmatch('[a-f0-9]{32}',account) or not re.fullmatch('[a-z0-9][a-z0-9-]{1,61}[a-z0-9]',bucket):raise Failure('restore_configuration','invalid_r2_destination')
 if not re.fullmatch(r'ai-supermall/supabase/[a-z]{20}/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{16}\.tar\.age',key):raise Failure('restore_configuration','invalid_backup_object_key')
 if not re.fullmatch('[a-f0-9]{64}',os.environ['BACKUP_OBJECT_SHA256']):raise Failure('restore_configuration','invalid_checksum')
 os.umask(0o077)
 with tempfile.TemporaryDirectory(prefix='backup-check-',dir=os.environ.get('RUNNER_TEMP')) as tmp:
  root=Path(tmp);archive=root/'backup.tar.age';identity=root/'identity.txt'
  run(['aws','--endpoint-url','https://'+account+'.r2.cloudflarestorage.com','--region','auto','--no-cli-pager','s3api','get-object','--bucket',bucket,'--key',key,str(archive)],'restore_download')
  if digest(archive)!=os.environ['BACKUP_OBJECT_SHA256']:raise Failure('restore_integrity','checksum_mismatch')
  identity.write_text(os.environ['BACKUP_AGE_IDENTITY']);identity.chmod(0o600)
  # The restore process receives no production connection settings or cloud credentials.
  clean={k:v for k,v in os.environ.items() if k in ('PATH','HOME','LANG','LC_ALL','TMPDIR')}
  p=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('verify_restore.py')),'--archive',str(archive),'--identity',str(identity),'--sandbox-parent',str(root),'--confirm-new-local-cluster'],env=clean,capture_output=True,timeout=900)
  try:result=json.loads(p.stdout.decode().strip().splitlines()[-1])
  except (ValueError,IndexError):raise Failure('restore_validation','no_safe_result')
  if p.returncode:
   stage=result.get('stage','restore_validation');code=result.get('code','failed')
   if not re.fullmatch('[a-z_]+',stage) or not re.fullmatch('[a-z_,]+',code):raise Failure('restore_validation','unclassified_failure')
   raise Failure(stage,code)
  if result.get('stage')!='restore_verified':raise Failure('restore_validation','verification_not_confirmed')
  print(json.dumps(result),flush=True)

if __name__=='__main__':
 try:main()
 except Failure as e:emit(e.stage,e.code);sys.exit(1)
 except BaseException:emit('restore_validation','failure_details_suppressed');sys.exit(1)
