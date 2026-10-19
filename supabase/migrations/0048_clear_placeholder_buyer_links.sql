-- 0048 Clear buyer links to placeholder buyer names.
--
-- A buyer named only by a placeholder ("Public Sector", "N/A", "Various")
-- identifies nobody. Since #58 ingest no longer links them; this clears the
-- links written before that.
--
-- A deal is cleared only when EVERY buyer party it has (deals.buyer_organization_id
-- and deal_organizations rows with role BUYER) is a placeholder. For those deals
-- buyer_organization_id is set to null and the placeholder BUYER rows are removed.
-- Organisation rows are kept. Nothing else on the deal changes: the
-- updated_at touch trigger is disabled for this one statement so the deal
-- keeps its timestamp, and publish state is not touched.
-- Idempotent: a second run finds no placeholder buyer links and changes nothing.

-- Mirrors PLACEHOLDER_BUYER_NAMES in lib/buyers/placeholder.ts. Keep the two
-- lists identical (tests/unit/placeholder-buyer-names-sql.test.ts pins them).
create or replace function private.placeholder_buyer_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'buyer',
    'client',
    'confidential',
    'contracting authority',
    'contracting body',
    'contracting entity',
    'n a',
    'na',
    'none',
    'not applicable',
    'not known',
    'not specified',
    'public authority',
    'public body',
    'public sector',
    'tbc',
    'to be confirmed',
    'unknown',
    'various',
    'withheld'
  ]::text[];
$$;

-- Same normalisation as normalizeBuyerNameForPlaceholder: NFKC, lowercase,
-- runs of non letters/digits to one space, trimmed.
create or replace function private.normalize_placeholder_buyer_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.normalize(coalesce(p, ''), NFKC)), '[^[:alnum:]]+', ' ', 'g')
  );
$$;

create or replace function private.is_placeholder_buyer_org(p_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and (
        private.normalize_placeholder_buyer_name(o.canonical_name) = any (private.placeholder_buyer_names())
        or exists (
          select 1
          from public.organization_aliases a
          where a.organization_id = o.id
            and private.normalize_placeholder_buyer_name(a.alias) = any (private.placeholder_buyer_names())
        )
      )
  );
$$;

-- Deals whose buyer parties are all placeholders. Read-only; the dry run in
-- the PR uses the same logic.
create or replace function private.placeholder_only_buyer_deals()
returns table (deal_id uuid)
language sql
stable
set search_path = ''
as $$
  with parties as (
    select d.id as deal_id, d.buyer_organization_id as organization_id
    from public.deals d
    where d.buyer_organization_id is not null
    union
    select dor.deal_id, dor.organization_id
    from public.deal_organizations dor
    where dor.role = 'BUYER'
  )
  select p.deal_id
  from parties p
  group by p.deal_id
  having bool_and(private.is_placeholder_buyer_org(p.organization_id));
$$;

-- Clears the links and returns what changed. Safe to run again: with no
-- placeholder buyer links left it changes nothing and returns zeros.
create or replace function private.clear_placeholder_buyer_links()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_links integer := 0;
  v_deals integer := 0;
begin
  create temporary table if not exists placeholder_buyer_cleanup_targets (deal_id uuid primary key) on commit drop;
  truncate placeholder_buyer_cleanup_targets;
  insert into placeholder_buyer_cleanup_targets (deal_id)
  select t.deal_id from private.placeholder_only_buyer_deals() t;

  delete from public.deal_organizations dor
  using placeholder_buyer_cleanup_targets c
  where dor.deal_id = c.deal_id
    and dor.role = 'BUYER'
    and private.is_placeholder_buyer_org(dor.organization_id);
  get diagnostics v_links = row_count;

  if exists (
    select 1 from public.deals d
    join placeholder_buyer_cleanup_targets c on c.deal_id = d.id
    where d.buyer_organization_id is not null
  ) then
    -- Keep the deal's updated_at: only the buyer link changes.
    alter table public.deals disable trigger touch_deals_updated_at;
    update public.deals d
    set buyer_organization_id = null
    from placeholder_buyer_cleanup_targets c
    where d.id = c.deal_id
      and d.buyer_organization_id is not null
      and private.is_placeholder_buyer_org(d.buyer_organization_id);
    get diagnostics v_deals = row_count;
    alter table public.deals enable trigger touch_deals_updated_at;
  end if;

  truncate placeholder_buyer_cleanup_targets;
  return jsonb_build_object('deal_organizations_removed', v_links, 'deals_cleared', v_deals);
end;
$$;

revoke all on function private.placeholder_buyer_names() from public, anon, authenticated, service_role;
revoke all on function private.normalize_placeholder_buyer_name(text) from public, anon, authenticated, service_role;
revoke all on function private.is_placeholder_buyer_org(uuid) from public, anon, authenticated, service_role;
revoke all on function private.placeholder_only_buyer_deals() from public, anon, authenticated, service_role;
revoke all on function private.clear_placeholder_buyer_links() from public, anon, authenticated, service_role;

select private.clear_placeholder_buyer_links();
