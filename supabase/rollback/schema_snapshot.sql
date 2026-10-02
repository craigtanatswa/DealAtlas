\pset format unaligned
\pset tuples_only on
select 'fn', n.nspname||'.'||p.oid::regprocedure::text, coalesce(p.proacl::text,'<default>'), md5(pg_get_functiondef(p.oid))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.prokind='f'
  and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
union all
select 'tbl', n.nspname||'.'||c.relname, coalesce(c.relacl::text,'<default>'), ''
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind in ('r','v','m')
union all
select 'nsp', nspname, coalesce(nspacl::text,'<default>'), '' from pg_namespace where nspname in ('public','private','extensions','auth')
union all
select 'defacl', coalesce(n.nspname,'*')||':'||d.defaclobjtype::text, d.defaclacl::text, '' from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
union all
select 'pol', schemaname||'.'||tablename||':'||policyname, cmd||' '||array_to_string(roles,',')||' '||coalesce(qual,''), coalesce(with_check,'') from pg_policies where schemaname in ('public','private')
union all
select 'trg', c.relname||':'||t.tgname, t.tgenabled::text, md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private')
union all
select 'col', table_schema||'.'||table_name||'.'||column_name, data_type, coalesce(generation_expression,'') from information_schema.columns where table_schema in ('public','private')
union all
select 'idx', schemaname||'.'||indexname, md5(indexdef), '' from pg_indexes where schemaname in ('public','private')
order by 1,2;
