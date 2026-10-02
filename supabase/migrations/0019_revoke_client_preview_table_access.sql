-- DealAtlas migration 0019
-- Lock down client roles after the DTO-RPC app deploy is live.
--
-- DEPLOY ORDER: apply 0018, deploy the app that reads previews only through
-- the 0018 DTO RPCs, verify it, THEN apply this migration. Applying it first
-- breaks every public preview page still querying deal_previews directly.

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
-- EXECUTE grant. Only the sanitised DTO RPCs stay client-callable.
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
        'count_preview_sitemap_entries'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;

alter default privileges in schema public revoke execute on functions from public;
revoke create on schema public from public, anon, authenticated;

-- Client roles keep USAGE on public (DTO RPCs, own-row tables) and auth
-- (auth.uid() inside RLS policies). Every other schema is server-only.
do $$
declare
  s record;
begin
  for s in
    select n.nspname
    from pg_catalog.pg_namespace n
    where n.nspname not in ('public', 'auth', 'pg_catalog', 'information_schema')
      and n.nspname not like 'pg\_%'
  loop
    begin
      execute format('revoke all on schema %I from public, anon, authenticated', s.nspname);
    exception when insufficient_privilege then
      raise warning 'could not revoke client usage on schema % (insufficient privilege)', s.nspname;
    end;
  end loop;
end $$;
