#!/usr/bin/env python3
"""pg_dump -> age -> private R2. Logs only fixed safe stage/error codes."""
import argparse, hashlib, json, os, re, select, shutil, subprocess, sys, tarfile, tempfile
from pathlib import Path
from datetime import datetime, timezone
HERE=Path(__file__).resolve().parent
REQUIRED={'auth.users','auth.identities','public.business_customers','public.business_quotes','public.business_orders','public.business_pricebooks','public.business_pricebook_versions','public.mail_inquiries','public.mail_connections','public.mail_oauth_attempts','public.projects','public.credit_accounts','public.credit_transactions','public.credit_plans','public.credit_rates'}
class Failure(Exception):
 def __init__(self,stage,code): self.stage,self.code=stage,code
def emit(stage,code): print(json.dumps({'stage':stage,'code':code}),flush=True)
def classify(stderr):
 text=stderr.decode('utf-8','replace') if isinstance(stderr,bytes) else str(stderr)
 for pattern,code in [('password authentication failed','database_authentication_failed'),('Tenant or user not found','database_user_or_project_invalid'),('certificate verify failed','database_tls_verification_failed'),('root certificate','database_tls_ca_unavailable'),('could not translate host name','database_dns_failed'),('Network is unreachable','database_network_unreachable'),('Connection refused','database_connection_refused'),('permission denied','database_permission_denied'),('row-level security','database_rls_export_denied')]:
  if pattern.lower() in text.lower(): return code
 return 'command_failed'
def run(args,stage,*,env=None,data=None,timeout=600):
 try:p=subprocess.run(args,input=data,env=env,capture_output=True,timeout=timeout)
 except subprocess.TimeoutExpired:raise Failure(stage,'timeout')
 except OSError:raise Failure(stage,'tool_unavailable')
 if p.returncode:raise Failure(stage,classify(p.stderr))
 return p.stdout
def source_env():
 e=os.environ.copy()
 for n in ['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','SUPABASE_PROJECT_REF']:
  if not e.get(n):raise Failure('configuration','missing_'+n.lower())
 ref=e['SUPABASE_PROJECT_REF']
 if not re.fullmatch('[a-z]{20}',ref):raise Failure('configuration','invalid_project_ref')
 direct=e['PGHOST']=='db.'+ref+'.supabase.co'
 pool=bool(re.fullmatch(r'[a-z0-9.-]+\.pooler\.supabase\.com',e['PGHOST']))
 if not (direct and e['PGUSER']=='postgres' or pool and e['PGUSER']=='postgres.'+ref):
  raise Failure('configuration','database_destination_mismatch')
 if e['PGPORT']!='5432' or e['PGDATABASE']!='postgres':raise Failure('configuration','use_direct_or_session_pooler_5432')
 e.update(PGSSLMODE='verify-full',PGSSLROOTCERT=e.get('PGSSLROOTCERT') or 'system',PGCONNECT_TIMEOUT='15',PGOPTIONS='-c default_transaction_read_only=on',PGAPPNAME='ai-supermall-backup')
 for n in ['PGSERVICE','PGSERVICEFILE','PGPASSFILE']:e.pop(n,None)
 return e
class Snapshot:
 def __init__(self,env):self.env,self.process,self.identifier,self.err=env,None,None,None
 def __enter__(self):
  try:
   self.err=tempfile.TemporaryFile()
   self.process=subprocess.Popen(['psql','-X','-qAtw','-v','ON_ERROR_STOP=1'],env=self.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.err)
   self.process.stdin.write(b'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();\n');self.process.stdin.flush()
   if not select.select([self.process.stdout],[],[],30)[0]:raise Failure('readonly_connection','timeout')
   value=self.process.stdout.readline().decode().strip()
   if not re.fullmatch(r'[A-Fa-f0-9]+-[A-Fa-f0-9]+-[0-9]+',value):
    self.process.wait(timeout=5);self.err.seek(0)
    raise Failure('readonly_connection',classify(self.err.read()))
   self.identifier=value
   return self
  except BaseException:self.close();raise
 def close(self):
  if not self.process:return
  try:
   if self.process.poll() is None:
    self.process.stdin.write(b'ROLLBACK;\n\\q\n');self.process.stdin.flush();self.process.wait(timeout=5)
  except (OSError,subprocess.TimeoutExpired):self.process.kill();self.process.wait()
  for s in [self.process.stdin,self.process.stdout,self.err]:s.close()
 def __exit__(self,*_):self.close()
def manifest(env,snapshot=None):
 sql='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
 if snapshot:sql+="SET TRANSACTION SNAPSHOT '"+snapshot+"';\n"
 sql+=(HERE/'manifest.sql').read_text()+'\nROLLBACK;\n'
 try:return json.loads(run(['psql','-X','-qAtw','-v','ON_ERROR_STOP=1'],'inventory',env=env,data=sql.encode()))
 except (ValueError,TypeError):raise Failure('inventory','invalid_inventory')
def check_coverage(m):
 names={r['schema']+'.'+r['name'] for r in m['tables']}
 if not REQUIRED<=names:raise Failure('inventory','important_tables_missing')
 for row in m['tables']:
  if row['schema']=='public' and row['name'].startswith(('business_','mail_','credit_')) and not row['rls']:
   raise Failure('inventory','important_table_rls_disabled')
def collect(folder,env,*,require_coverage=True):
 with Snapshot(env) as snapshot:
  m=manifest(env,snapshot.identifier)
  if require_coverage:check_coverage(m)
  (folder/'manifest.json').write_text(json.dumps(m,sort_keys=True))
  run(['pg_dump','-w','--format=custom','--snapshot='+snapshot.identifier,'--file='+str(folder/'database.dump')],'database_dump',env=env)
  roles=run(['pg_dumpall','-w','--roles-only','--no-role-passwords','--exclude-role=postgres'],'database_roles',env=env)
  (folder/'roles.sql').write_bytes(roles)
 run(['pg_restore','--list',str(folder/'database.dump')],'archive_format')
 for p in folder.iterdir():p.chmod(0o600)
 return m
def encrypt(folder,destination,recipient):
 if not re.fullmatch(r'age1[0-9a-z]{58}',recipient):raise Failure('encryption','invalid_age_recipient')
 try:
  with destination.open('xb') as out,tempfile.TemporaryFile() as err:
   p=subprocess.Popen(['age','-r',recipient],stdin=subprocess.PIPE,stdout=out,stderr=err)
   try:
    with tarfile.open(fileobj=p.stdin,mode='w|') as tar:
     for name in ['database.dump','roles.sql','manifest.json']:tar.add(folder/name,arcname=name,recursive=False)
    p.stdin.close()
    if p.wait(timeout=60):raise Failure('encryption','encryption_failed')
   finally:
    if p.poll() is None:p.kill();p.wait()
 except OSError:raise Failure('encryption','tool_unavailable')
 destination.chmod(0o600)
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def upload(archive,work):
 for n in ['R2_ACCOUNT_ID','R2_BUCKET','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','MAX_BACKUP_BYTES']:
  if not os.environ.get(n):raise Failure('configuration','missing_'+n.lower())
 account=os.environ['R2_ACCOUNT_ID'];bucket=os.environ['R2_BUCKET']
 if not re.fullmatch(r'[a-f0-9]{32}',account) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]',bucket):raise Failure('configuration','invalid_r2_destination')
 try:limit=int(os.environ['MAX_BACKUP_BYTES'])
 except ValueError:raise Failure('configuration','invalid_size_budget')
 if limit<1 or archive.stat().st_size>limit:raise Failure('upload','backup_exceeds_approved_size_budget')
 endpoint='https://'+account+'.r2.cloudflarestorage.com'
 created=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 key='ai-supermall/supabase/'+os.environ['SUPABASE_PROJECT_REF']+'/'+created+'-'+os.urandom(8).hex()+'.tar.age'
 base=['aws','--endpoint-url',endpoint,'--region','auto','--no-cli-pager','s3api']
 run(base+['put-object','--bucket',bucket,'--key',key,'--body',str(archive),'--content-type','application/octet-stream'],'r2_upload')
 downloaded=work/'readback.age'
 run(base+['get-object','--bucket',bucket,'--key',key,str(downloaded)],'r2_readback')
 if digest(archive)!=digest(downloaded):raise Failure('r2_integrity','checksum_mismatch')
 return {'stage':'complete','code':'encrypted_upload_readback_verified','bucket':bucket,'object_key':key,'created_utc':created,'bytes':archive.stat().st_size,'sha256':digest(archive)}
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--approved-production-backup',action='store_true')
 args=parser.parse_args()
 if not args.approved_production_backup:raise Failure('approval','production_backup_not_approved')
 if os.environ.get('BACKUP_PRODUCTION_APPROVED')!='true':raise Failure('approval','administrator_configuration_not_confirmed')
 os.umask(0o077)
 recipient=os.environ.get('BACKUP_AGE_RECIPIENT','')
 if not recipient:raise Failure('configuration','missing_age_recipient')
 for n in ['psql','pg_dump','pg_dumpall','pg_restore','age','aws']:
  if not shutil.which(n):raise Failure('configuration','missing_'+n)
 env=source_env()
 # Check every required destination setting BEFORE exporting any production rows.
 for n in ['R2_ACCOUNT_ID','R2_BUCKET','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','MAX_BACKUP_BYTES']:
  if not os.environ.get(n):raise Failure('configuration','missing_'+n.lower())
 if not re.fullmatch(r'age1[0-9a-z]{58}',recipient):raise Failure('encryption','invalid_age_recipient')
 if not re.fullmatch(r'[a-f0-9]{32}',os.environ['R2_ACCOUNT_ID']):raise Failure('configuration','invalid_r2_destination')
 if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]',os.environ['R2_BUCKET']):raise Failure('configuration','invalid_r2_destination')
 try:limit=int(os.environ['MAX_BACKUP_BYTES'])
 except ValueError:raise Failure('configuration','invalid_size_budget')
 if limit<1:raise Failure('configuration','invalid_size_budget')
 with tempfile.TemporaryDirectory(prefix='db-backup-',dir=os.environ.get('RUNNER_TEMP')) as temp:
  work=Path(temp);plain=work/'plain';plain.mkdir(mode=0o700)
  collect(plain,env);emit('database_dump','complete')
  encrypted=work/'database.tar.age';encrypt(plain,encrypted,recipient);shutil.rmtree(plain)
  result=upload(encrypted,work)
  if os.environ.get('GITHUB_OUTPUT'):
   with open(os.environ['GITHUB_OUTPUT'],'a') as output:
    for name in ('object_key','sha256'):
     output.write(name+'='+result[name]+'\n')
  print(json.dumps(result),flush=True)
if __name__=='__main__':
 try:main()
 except Failure as e:emit(e.stage,e.code);sys.exit(1)
 except KeyboardInterrupt:emit('interrupted','cancelled');sys.exit(1)
 except BaseException:emit('internal','unexpected_failure_details_suppressed');sys.exit(1)
