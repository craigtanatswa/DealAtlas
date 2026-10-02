-- Rollback for migration 0019 (client lockdown of deal_previews).
--
-- ORDER: run this BEFORE redeploying an app build that reads deal_previews
-- directly, and before supabase/rollback/0018_rollback.sql. See
-- DATABASE_SETUP.md "Rolling back 0018/0019".
--
-- Restores the anon/authenticated SELECT grant and RLS policy on
-- deal_previews, and every client EXECUTE / schema grant that 0019 revoked,
-- from the ACL snapshot 0019 recorded in private.pre_0019_acl. The
-- CREATE-on-public revoke and the default function privileges of the
-- migration role are restored the same way.

begin;

do $$
begin
  if to_regclass('private.pre_0019_acl') is null then
    raise exception 'private.pre_0019_acl is missing: 0019 was not applied by this version of the migration';
  end if;
end $$;

grant select on table public.deal_previews to anon, authenticated;

drop policy if exists "published low-risk previews are readable" on public.deal_previews;
create policy "published low-risk previews are readable"
on public.deal_previews
for select
to anon, authenticated
using (is_published = true and leakage_risk = 'LOW');

-- Client EXECUTE grants on public functions, as recorded before 0019. A NULL
-- ACL means the built-in default (EXECUTE for PUBLIC).
do $$
declare
  r record;
begin
  for r in
    select s.object as signature, coalesce(g.grantee_name, 'public') as grantee
    from private.pre_0019_acl s
    left join lateral (
      select case when e.grantee = 0 then 'public' else pg_catalog.pg_get_userbyid(e.grantee)::text end as grantee_name
      from pg_catalog.aclexplode(s.acl) as e
      where e.privilege_type = 'EXECUTE'
    ) g on true
    where s.kind = 'function'
      and to_regprocedure(s.object) is not null
      and (s.acl is null or g.grantee_name in ('public', 'anon', 'authenticated'))
  loop
    execute format('grant execute on function %s to %s', r.signature,
      case when r.grantee = 'public' then 'public' else quote_ident(r.grantee) end);
  end loop;
end $$;

-- Client USAGE / CREATE on the schemas 0019 touched, as recorded before 0019.
do $$
declare
  r record;
begin
  for r in
    select s.object as schema_name,
      case when e.grantee = 0 then 'public' else pg_catalog.pg_get_userbyid(e.grantee)::text end as grantee,
      e.privilege_type
    from private.pre_0019_acl s
    cross join lateral pg_catalog.aclexplode(s.acl) as e
    where s.kind = 'schema'
      and e.privilege_type in ('USAGE', 'CREATE')
      and (e.grantee = 0 or pg_catalog.pg_get_userbyid(e.grantee) in ('anon', 'authenticated'))
  loop
    begin
      execute format('grant %s on schema %I to %s', r.privilege_type, r.schema_name,
        case when r.grantee = 'public' then 'public' else quote_ident(r.grantee) end);
    exception when insufficient_privilege then
      raise warning 'could not restore % on schema % for % (insufficient privilege)', r.privilege_type, r.schema_name, r.grantee;
    end;
  end loop;
end $$;

-- Default EXECUTE on future functions for the migration role. No global row
-- means the built-in default (EXECUTE for PUBLIC).
do $$
declare
  r record;
begin
  if not exists (select 1 from private.pre_0019_acl where kind = 'default_acl' and object = '*') then
    alter default privileges grant execute on functions to public;
  end if;
  for r in
    select s.object as schema_name,
      case when e.grantee = 0 then 'public' else pg_catalog.pg_get_userbyid(e.grantee)::text end as grantee
    from private.pre_0019_acl s
    cross join lateral pg_catalog.aclexplode(s.acl) as e
    where s.kind = 'default_acl'
      and e.privilege_type = 'EXECUTE'
      and (e.grantee = 0 or pg_catalog.pg_get_userbyid(e.grantee) in ('anon', 'authenticated'))
  loop
    if r.schema_name = '*' then
      execute format('alter default privileges grant execute on functions to %s',
        case when r.grantee = 'public' then 'public' else quote_ident(r.grantee) end);
    else
      execute format('alter default privileges in schema %I grant execute on functions to %s', r.schema_name,
        case when r.grantee = 'public' then 'public' else quote_ident(r.grantee) end);
    end if;
  end loop;
end $$;

drop table private.pre_0019_acl;

commit;
