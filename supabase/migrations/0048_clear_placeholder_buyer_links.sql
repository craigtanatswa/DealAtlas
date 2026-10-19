-- 0048 Clear buyer links to placeholder buyer names.
--
-- A buyer named only by a placeholder ("Public Sector", "N/A", "Various")
-- identifies nobody. Since #58 ingest no longer links them; this clears the
-- links written before that.
--
-- Every placeholder buyer link is removed: deal_organizations rows with role
-- BUYER pointing at a placeholder org, and deals.buyer_organization_id when it
-- points at one. Real buyer links on the same deal are kept. Organisation and
-- alias rows are kept, publish state is not touched, and the deal keeps its
-- updated_at (the touch trigger is off for the one UPDATE).
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
    pg_catalog.regexp_replace(pg_catalog.lower(normalize(coalesce(p, ''), NFKC)), '[^[:alnum:]]+', ' ', 'g')
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

-- Clears placeholder buyer links and returns what changed. The scope is
-- the single WHERE predicate on private.is_placeholder_buyer_org(...).
create or replace function private.clear_placeholder_buyer_links()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_links integer := 0;
  v_deals integer := 0;
begin
  delete from public.deal_organizations dor
  where dor.role = 'BUYER'
    and private.is_placeholder_buyer_org(dor.organization_id);
  get diagnostics v_links = row_count;

  if exists (
    select 1 from public.deals d
    where d.buyer_organization_id is not null
      and private.is_placeholder_buyer_org(d.buyer_organization_id)
  ) then
    -- Only the buyer link changes; keep the deal's updated_at.
    alter table public.deals disable trigger touch_deals_updated_at;
    update public.deals d
    set buyer_organization_id = null
    where d.buyer_organization_id is not null
      and private.is_placeholder_buyer_org(d.buyer_organization_id);
    get diagnostics v_deals = row_count;
    alter table public.deals enable trigger touch_deals_updated_at;
  end if;

  return jsonb_build_object('deal_organizations_removed', v_links, 'deals_cleared', v_deals);
end;
$$;

revoke all on function private.placeholder_buyer_names() from public, anon, authenticated, service_role;
revoke all on function private.normalize_placeholder_buyer_name(text) from public, anon, authenticated, service_role;
revoke all on function private.is_placeholder_buyer_org(uuid) from public, anon, authenticated, service_role;
revoke all on function private.clear_placeholder_buyer_links() from public, anon, authenticated, service_role;

select private.clear_placeholder_buyer_links();
