#!/usr/bin/env python3
"""Decrypt to a NEW local socket-only cluster. Never accepts a remote restore URL."""
import argparse,json,os,shutil,subprocess,sys,tarfile,tempfile
from pathlib import Path
from backup import Failure,run,manifest,emit
NAMES={'database.dump','roles.sql','manifest.json'}
def safe_unpack(archive,folder):
 with tarfile.open(archive,'r:') as tar:
  members=tar.getmembers()
  if len(members)!=3 or {m.name for m in members}!=NAMES or any(not m.isfile() for m in members):
   raise Failure('restore_package','invalid_archive_members')
  for m in members:
   with tar.extractfile(m) as src,(folder/m.name).open('xb') as dst:shutil.copyfileobj(src,dst)
def target_env(sock):
 e={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR','LANG','LC_ALL')}
 e.update(PGHOST=str(sock),PGPORT='5432',PGDATABASE='postgres',PGUSER='postgres',PGSSLMODE='disable',PGAPPNAME='local-backup-restore-verification')
 return e
def restore_contents(folder,env):
 # Called only inside a newly initialized, local-only disposable cluster.
 if not env.get('PGHOST','').startswith('/') or env.get('PGDATABASE')!='postgres':
  raise Failure('restore_target','nonlocal_target_refused')
 expected=json.loads((folder/'manifest.json').read_text())
 available=json.loads(run(['psql','-X','-qAtw','-v','ON_ERROR_STOP=1','-c',"SELECT coalesce(json_agg(json_build_array(name,version)),'[]') FROM pg_available_extension_versions"],'restore_extensions',env=env))
 if any(pair not in available for pair in expected['extensions']):
  raise Failure('restore_extensions','matching_supabase_extensions_required')
 run(['psql','-X','-qAtw','-v','ON_ERROR_STOP=1','-f',str(folder/'roles.sql')],'restore_roles',env=env)
 run(['pg_restore','--exit-on-error','--single-transaction','--dbname=postgres',str(folder/'database.dump')],'restore_database',env=env)
 actual=manifest(env)
 differences=[key for key in expected if expected[key]!=actual.get(key)]
 if differences:raise Failure('restore_verification','inventory_mismatch_'+','.join(differences))
 return {'stage':'restore_verified','code':'local_rows_relations_roles_rls_functions_match','tables':len(expected['tables'])}
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--archive',type=Path,required=True);p.add_argument('--identity',type=Path,required=True)
 p.add_argument('--sandbox-parent',type=Path,required=True)
 p.add_argument('--confirm-new-local-cluster',action='store_true')
 a=p.parse_args()
 if not a.confirm_new_local_cluster:raise Failure('restore_target','explicit_local_restore_confirmation_required')
 for name in ['age','initdb','pg_ctl','psql','pg_restore']:
  if not shutil.which(name):raise Failure('configuration','missing_'+name)
 os.umask(0o077)
 # Parent must exist. Only a newly created child can be used. Existing clusters are never reused.
 with tempfile.TemporaryDirectory(prefix='rv-',dir=a.sandbox_parent.resolve()) as tmp:
  root=Path(tmp);plain=root/'plain';plain.mkdir(mode=0o700);sock=root/'sock';sock.mkdir(mode=0o700)
  env=target_env(sock);cluster=root/'db';package=root/'package.tar'
  with package.open('xb') as out:
   try:
    d=subprocess.run(['age','--decrypt','-i',str(a.identity.resolve()),str(a.archive.resolve())],stdout=out,stderr=subprocess.PIPE,timeout=300)
   except subprocess.TimeoutExpired:raise Failure('restore_decryption','timeout')
   if d.returncode:raise Failure('restore_decryption','age_decryption_failed')
  safe_unpack(package,plain);package.unlink()
  run(['initdb','-D',str(cluster),'--username=postgres','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'],'local_init',env=env)
  started=False
  try:
   run(['pg_ctl','-D',str(cluster),'-l',str(root/'postgres.log'),'-o',"-k "+str(sock)+" -h ''",'-w','start'],'local_start',env=env);started=True
   print(json.dumps(restore_contents(plain,env)),flush=True)
  finally:
   if started:run(['pg_ctl','-D',str(cluster),'-m','immediate','-w','stop'],'local_stop',env=env)
if __name__=='__main__':
 try:main()
 except Failure as e:emit(e.stage,e.code);sys.exit(1)
 except BaseException:emit('restore_internal','failure_details_suppressed');sys.exit(1)
