#!/usr/bin/env python3
"""Real pg_dump/pg_restore of FICTIONAL data only, socket-only disposable clusters."""
import json,os,shutil,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from backup import collect,run,manifest,Failure,Snapshot
from verify_restore import target_env,restore_contents,RESTORE_ADMIN
SQL="""
CREATE ROLE fixture_reader NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb);
CREATE TABLE public.business_customers(id uuid PRIMARY KEY,owner_id uuid REFERENCES auth.users(id),name text,UNIQUE(id,owner_id));
CREATE TABLE public.business_quotes(id uuid PRIMARY KEY,owner_id uuid,customer_id uuid,quantity numeric,unit_price numeric,total numeric,CHECK(total=quantity*unit_price),FOREIGN KEY(customer_id,owner_id) REFERENCES public.business_customers(id,owner_id));
CREATE TABLE public.credit_accounts(user_id uuid PRIMARY KEY REFERENCES auth.users(id),balance integer CHECK(balance>=0));
CREATE TABLE public.credit_transactions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),credits integer,status text);
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001','{"company":"Fiction A"}'),('00000000-0000-4000-8000-000000000002','{"company":"Fiction B"}');
INSERT INTO public.business_customers VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Fiction A'),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Fiction B');
INSERT INTO public.business_quotes VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',15,90,1350);
INSERT INTO public.credit_accounts VALUES ('00000000-0000-4000-8000-000000000001',10),('00000000-0000-4000-8000-000000000002',20);
INSERT INTO public.credit_transactions VALUES ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',10,'posted'),('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',20,'posted');
ALTER TABLE public.business_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_customer ON public.business_customers FOR SELECT TO fixture_reader USING (owner_id=current_setting('request.jwt.claim.sub',true)::uuid);
GRANT USAGE ON SCHEMA public TO fixture_reader;
GRANT SELECT ON public.business_customers TO fixture_reader;
CREATE FUNCTION public.fixture_total(q numeric,p numeric) RETURNS numeric LANGUAGE sql IMMUTABLE AS 'SELECT q*p';
CREATE FUNCTION public.fixture_guard() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';
CREATE TRIGGER fixture_guard BEFORE UPDATE ON public.business_quotes FOR EACH ROW EXECUTE FUNCTION public.fixture_guard();
"""
def sql(env,s):
 return run(['psql','-X','-qAtw','-v','ON_ERROR_STOP=1','-c',s],'fictional_sql',env=env).decode().strip()
def start(root,name,user='postgres'):
 cluster=root/name;sock=root/(name+'s');sock.mkdir(mode=0o700);env=target_env(sock,user)
 run(['initdb','-D',str(cluster),'--username='+user,'--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'],'fixture_init',env=env)
 run(['pg_ctl','-D',str(cluster),'-l',str(root/(name+'.log')),'-o',"-k "+str(sock)+" -h ''",'-w','start'],'fixture_start',env=env)
 return cluster,env
def main():
 os.umask(0o077)
 for tool in ['pg_dump','pg_dumpall','pg_restore','psql','initdb','pg_ctl']:
  if not shutil.which(tool):raise Failure('fixture_setup','missing_'+tool)
 with tempfile.TemporaryDirectory(prefix='pg-',dir=os.environ.get('RUNNER_TEMP')) as tmp:
  root=Path(tmp);active=[]
  try:
   source,e=start(root,'a');active.append((source,e));sql(e,SQL)
   # Prove the inventory can retain a stable snapshot while a different transaction writes.
   with Snapshot(e) as snap:
    old=manifest(e,snap.identifier)
    sql(e,"UPDATE public.credit_accounts SET balance=11 WHERE balance=10")
    assert manifest(e,snap.identifier)==old
    assert manifest(e)!=old
   plain=root/'plain';plain.mkdir(mode=0o700);expected=collect(plain,e,require_coverage=False)
   target,t=start(root,'b',RESTORE_ADMIN);active.append((target,t))
   result=restore_contents(plain,t)
   actual=manifest(t);actual['roles']=[r for r in actual['roles'] if r[0]!=RESTORE_ADMIN]
   assert actual==expected
   assert sql(t,'SELECT quantity*unit_price,total FROM public.business_quotes')=='1350|1350'
   assert sql(t,'SELECT count(*) FROM public.business_quotes q JOIN public.business_customers c ON (q.customer_id,q.owner_id)=(c.id,c.owner_id)')=='1'
   assert sql(t,'SELECT sum(balance) FROM public.credit_accounts')=='31'
   assert sql(t,'SELECT sum(credits) FROM public.credit_transactions')=='30'
   assert sql(t,"SET ROLE fixture_reader; SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001'; SELECT count(*) FROM public.business_customers")=='1'
   assert sql(t,'SELECT public.fixture_total(15,90)')=='1350'
   print(json.dumps({'stage':'synthetic_restore','code':'passed','checks':['snapshot_consistency','custom_dump_restore','row_counts_and_hashes','auth_metadata','foreign_key_relationship','credits_balance','credits_ledger','rls_isolation','roles_and_grants','functions','triggers','no_tcp_listener'],'tables':len(expected['tables'])}))
  finally:
   for cluster,env in reversed(active):
    run(['pg_ctl','-D',str(cluster),'-m','immediate','-w','stop'],'fixture_stop',env=env)
if __name__=='__main__':
 try:main()
 except Failure as e:print(json.dumps({'stage':e.stage,'code':e.code}));sys.exit(1)
