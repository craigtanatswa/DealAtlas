-- DealAtlas migration 0019
-- Lock down client roles after the DTO-RPC app deploy is live.
--
-- DEPLOY ORDER: apply 0018, deploy the app that reads previews only through
-- the 0018 DTO RPCs, verify it, THEN apply this migration. Applying it first
-- breaks every public preview page still querying deal_previews directly.

-- Function and schema ACLs as they were before this migration, so
-- supabase/rollback/0019_rollback.sql can restore exactly what is revoked
-- below (hosted default privileges differ per project). Server-only.
create table if not exists private.pre_0019_acl (
  kind text not null check (kind in ('function', 'schema', 'default_acl')),
  object text not null,
  acl aclitem[],
  primary key (kind, object)
);
revoke all on table private.pre_0019_acl from public, anon, authenticated, service_role;

-- Signatures are rendered with an empty search_path so names and argument
-- types are schema-qualified and the rollback resolves them under any path.
select pg_catalog.set_config('dealatlas.pre_0019_search_path', pg_catalog.current_setting('search_path'), false);
select pg_catalog.set_config('search_path', '', false);

insert into private.pre_0019_acl (kind, object, acl)
select 'function', p.oid::regprocedure::text, p.proacl
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and not exists (
    select 1
    from pg_catalog.pg_depend dep
    where dep.classid = 'pg_catalog.pg_proc'::regclass
      and dep.objid = p.oid
      and dep.deptype = 'e'
  )
union all
select 'schema', n.nspname, n.nspacl
from pg_catalog.pg_namespace n
where n.nspname in ('public', 'private', 'extensions')
union all
select 'default_acl', coalesce(n.nspname, '*'), d.defaclacl
from pg_catalog.pg_default_acl d
left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype = 'f'
  and d.defaclrole = (select r.oid from pg_catalog.pg_roles r where r.rolname = current_user)
  and (d.defaclnamespace = 0 or n.nspname = 'public')
on conflict (kind, object) do nothing;

select pg_catalog.set_config('search_path', pg_catalog.current_setting('dealatlas.pre_0019_search_path'), false);

-- Client roles no longer read deal_previews; the DTO RPCs (SECURITY DEFINER)
-- are the only client path.
drop policy if exists "published low-risk previews are readable" on public.deal_previews;
revoke all on table public.deal_previews from public, anon, authenticated;
grant all on table public.deal_previews to service_role;

-- Legacy invoker search RPCs return deal_id and are kept for service-role code
-- (exports) only.
revoke all on function public.search_deal_previews(
  text, text, public.buyer_sector, public.deal_type, text, public.deal_status, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.search_deal_previews(
  text, text, public.buyer_sector, public.deal_type, text, public.deal_status, text, text, integer, integer
) to service_role;

revoke all on function public.search_deal_previews_for_profile(
  uuid, text, text, public.buyer_sector, public.deal_type, text, public.deal_status,
  text, text, numeric, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.search_deal_previews_for_profile(
  uuid, text, text, public.buyer_sector, public.deal_type, text, public.deal_status,
  text, text, numeric, text, integer, integer
) to service_role;

-- Every other non-extension function in public loses its implicit PUBLIC
-- EXECUTE grant. The sanitised DTO RPCs stay client-callable, plus the two
-- boolean helpers the free saved-deal policy and the app-deal 404 use.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature, p.proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from pg_catalog.pg_depend dep
        where dep.classid = 'pg_catalog.pg_proc'::regclass
          and dep.objid = p.oid
          and dep.deptype = 'e'
      )
      and p.proname not in (
        'search_preview_dtos',
        'get_preview_dto_by_slug',
        'get_preview_dto_by_deal_id',
        'resolve_preview_deal_id',
        'list_saved_deal_previews',
        'list_preview_sitemap_entries',
        'count_preview_sitemap_entries',
        'saved_deal_row_visible',
        'caller_misses_published_preview'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;

-- Functions created later by the migration role are not client-callable by
-- default: the global PUBLIC default and any per-schema anon/authenticated
-- default (hosted Supabase adds one) are both removed.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;

-- Client roles keep USAGE on public (DTO RPCs, own-row tables) and auth
-- (auth.uid() inside RLS policies). The DealAtlas server-only schemas are
-- named explicitly; Supabase-managed schemas (storage, realtime, graphql,
-- vault, ...) keep their platform grants.
do $$
declare
  s text;
begin
  foreach s in array array['private', 'extensions'] loop
    if exists (select 1 from pg_catalog.pg_namespace where nspname = s) then
      begin
        execute format('revoke all on schema %I from public, anon, authenticated', s);
      exception when insufficient_privilege then
        raise warning 'could not revoke client usage on schema % (insufficient privilege)', s;
      end;
    end if;
  end loop;
end $$;
