-- Read-only; source inventory and pg_dump share an exported MVCC snapshot.
WITH scopes AS (SELECT oid,nspname FROM pg_namespace WHERE nspname IN ('public','auth','storage')),
tables AS (
 SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,
 pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,
 (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 query_to_xml(format('SELECT count(*) AS n, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' ORDER BY md5(to_jsonb(t)::text)),'''')) AS fingerprint FROM %I.%I t',n.nspname,c.relname),false,true,'') AS inventory
 FROM pg_class c JOIN scopes n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p')
)
SELECT jsonb_build_object(
'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',nspname,'name',relname,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'owner',owner,'acl',acl,'columns',columns,'count',(xpath('/row/n/text()',inventory))[1]::text::bigint,'fingerprint',(xpath('/row/fingerprint/text()',inventory))[1]::text) ORDER BY nspname,relname),'[]') FROM tables),
'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated) ORDER BY n.nspname,c.relname,k.conname),'[]') FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN scopes n ON n.oid=c.relnamespace),
'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_array(schemaname,tablename,indexname,indexdef) ORDER BY schemaname,tablename,indexname),'[]') FROM pg_indexes WHERE schemaname IN ('public','auth','storage')),
'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname),'[]') FROM pg_policies p WHERE schemaname IN ('public','auth','storage')),
'functions',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)),pg_get_userbyid(p.proowner),p.proacl::text,p.prosecdef,p.proconfig) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]') FROM pg_proc p JOIN scopes n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p')),
'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY n.nspname,c.relname,t.tgname),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN scopes n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal),
'schemas',(SELECT coalesce(jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl::text) ORDER BY nspname),'[]') FROM pg_namespace WHERE nspname IN ('public','auth','storage')),
'extensions',(SELECT coalesce(jsonb_agg(jsonb_build_array(extname,extversion) ORDER BY extname),'[]') FROM pg_extension),
'role_memberships',(SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),admin_option,inherit_option,set_option) ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member)),'[]') FROM pg_auth_members),
'roles',(SELECT coalesce(jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig) ORDER BY rolname),'[]') FROM pg_roles WHERE rolname !~ '^pg_' AND rolname <> 'postgres')
);
