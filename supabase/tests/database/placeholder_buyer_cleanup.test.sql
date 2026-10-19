-- Migration 0048. Synthetic rows only.
begin;
select no_plan();

truncate table public.deals cascade;

alter table public.data_sources disable trigger enforce_source_enablement;
insert into public.data_sources (
  id, source_key, name, source_type, access_method, reuse_status, scraping_permitted, enabled
) values
  ('d4800000-0000-4000-8000-000000000001', 'pr48-feed', 'Placeholder test feed', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'OPEN_LICENSE', false, true);

insert into public.organizations (id, canonical_name, normalized_name) values
  ('a4800000-0000-4000-8000-000000000001', 'Public Sector', 'public sector'),
  ('a4800000-0000-4000-8000-000000000002', 'Brynlow Vale County Borough Council', 'brynlow vale county borough council'),
  ('a4800000-0000-4000-8000-000000000003', 'Public Sector Pension Board', 'public sector pension board'),
  ('a4800000-0000-4000-8000-000000000004', 'Harbour Trust Holdings', 'harbour trust holdings');

-- A real-looking name whose alias is a placeholder still counts as a placeholder.
insert into public.organization_aliases (organization_id, alias, normalized_alias) values
  ('a4800000-0000-4000-8000-000000000001', 'Public Sector', 'public sector'),
  ('a4800000-0000-4000-8000-000000000004', 'N/A', 'n a');

insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
) values
  -- 1: only buyer is a placeholder (name and alias).
  ('c4800000-0000-4000-8000-000000000001', 'd4800000-0000-4000-8000-000000000001', 'Energy procurement pipeline',
   'a4800000-0000-4000-8000-000000000001', 'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  -- 2: real buyer.
  ('c4800000-0000-4000-8000-000000000002', 'd4800000-0000-4000-8000-000000000001', 'Street lighting renewal',
   'a4800000-0000-4000-8000-000000000002', 'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  -- 3: placeholder buyer id plus a real BUYER link: not placeholder-only, untouched.
  ('c4800000-0000-4000-8000-000000000003', 'd4800000-0000-4000-8000-000000000001', 'Mixed buyer parties',
   'a4800000-0000-4000-8000-000000000001', 'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  -- 4: "Public Sector Pension Board" is a real name.
  ('c4800000-0000-4000-8000-000000000004', 'd4800000-0000-4000-8000-000000000001', 'Pension administration',
   'a4800000-0000-4000-8000-000000000003', 'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  -- 5: buyer whose only alias is a placeholder.
  ('c4800000-0000-4000-8000-000000000005', 'd4800000-0000-4000-8000-000000000001', 'Harbour dredging',
   'a4800000-0000-4000-8000-000000000004', 'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days');

insert into public.deal_organizations (deal_id, organization_id, role) values
  ('c4800000-0000-4000-8000-000000000001', 'a4800000-0000-4000-8000-000000000001', 'BUYER'),
  ('c4800000-0000-4000-8000-000000000002', 'a4800000-0000-4000-8000-000000000002', 'BUYER'),
  ('c4800000-0000-4000-8000-000000000003', 'a4800000-0000-4000-8000-000000000001', 'BUYER'),
  ('c4800000-0000-4000-8000-000000000003', 'a4800000-0000-4000-8000-000000000002', 'BUYER'),
  ('c4800000-0000-4000-8000-000000000004', 'a4800000-0000-4000-8000-000000000003', 'BUYER'),
  ('c4800000-0000-4000-8000-000000000005', 'a4800000-0000-4000-8000-000000000004', 'BUYER');

-- Pin each deal's timestamp so "nothing else changes" is checkable.
alter table public.deals disable trigger touch_deals_updated_at;
update public.deals set updated_at = '2026-01-01T00:00:00Z' where id::text like 'c4800000-%';
alter table public.deals enable trigger touch_deals_updated_at;

create temporary table before_0048 as
  select id, source_title, status, stage, submission_deadline, updated_at, primary_source_id
  from public.deals where id::text like 'c4800000-%';

select is(
  private.normalize_placeholder_buyer_name(' Public  SECTOR. '),
  'public sector',
  'normalisation lowercases, folds punctuation and whitespace'
);
select is(private.normalize_placeholder_buyer_name('N/A'), 'n a', 'N/A normalises to "n a"');

select is(
  (select array_agg(deal_id order by deal_id) from private.placeholder_only_buyer_deals()),
  array['c4800000-0000-4000-8000-000000000001', 'c4800000-0000-4000-8000-000000000005']::uuid[],
  'only placeholder-only deals are selected'
);

select is(
  private.clear_placeholder_buyer_links(),
  '{"deals_cleared": 2, "deal_organizations_removed": 2}'::jsonb,
  'first run clears two deals and two BUYER links'
);

select is(
  (select buyer_organization_id from public.deals where id = 'c4800000-0000-4000-8000-000000000001'),
  null,
  'placeholder-only deal loses its buyer'
);
select ok(
  not exists (
    select 1 from public.deal_organizations
    where deal_id = 'c4800000-0000-4000-8000-000000000001' and role = 'BUYER'
  ),
  'placeholder-only deal loses its BUYER link'
);
select is(
  (select buyer_organization_id from public.deals where id = 'c4800000-0000-4000-8000-000000000005'),
  null,
  'a buyer whose alias is a placeholder is cleared'
);

select is(
  (select buyer_organization_id from public.deals where id = 'c4800000-0000-4000-8000-000000000002'),
  'a4800000-0000-4000-8000-000000000002'::uuid,
  'real buyer is untouched'
);
select is(
  (select buyer_organization_id from public.deals where id = 'c4800000-0000-4000-8000-000000000004'),
  'a4800000-0000-4000-8000-000000000003'::uuid,
  'Public Sector Pension Board is not a placeholder'
);
select is(
  (select count(*) from public.deal_organizations where deal_id = 'c4800000-0000-4000-8000-000000000003' and role = 'BUYER'),
  2::bigint,
  'mixed deal keeps both BUYER links'
);
select is(
  (select buyer_organization_id from public.deals where id = 'c4800000-0000-4000-8000-000000000003'),
  'a4800000-0000-4000-8000-000000000001'::uuid,
  'mixed deal keeps its buyer id'
);

select is(
  (select count(*) from public.organizations where id::text like 'a4800000-%'),
  4::bigint,
  'organisation rows survive'
);
select is(
  (select count(*) from public.organization_aliases where organization_id::text like 'a4800000-%'),
  2::bigint,
  'alias rows survive'
);

select ok(
  not exists (
    select 1 from public.deals d join before_0048 b on b.id = d.id
    where d.source_title is distinct from b.source_title
       or d.status is distinct from b.status
       or d.stage is distinct from b.stage
       or d.submission_deadline is distinct from b.submission_deadline
       or d.updated_at is distinct from b.updated_at
       or d.primary_source_id is distinct from b.primary_source_id
  ),
  'nothing else on any deal changes, including updated_at'
);

create temporary table after_first_0048 as
  select d.id, d.buyer_organization_id, d.updated_at,
    (select array_agg(dor.organization_id::text || ':' || dor.role order by dor.organization_id) from public.deal_organizations dor where dor.deal_id = d.id) as links
  from public.deals d where d.id::text like 'c4800000-%';

select is(
  private.clear_placeholder_buyer_links(),
  '{"deals_cleared": 0, "deal_organizations_removed": 0}'::jsonb,
  'second run changes nothing'
);
select ok(
  not exists (
    select 1 from public.deals d join after_first_0048 a on a.id = d.id
    where d.buyer_organization_id is distinct from a.buyer_organization_id
       or d.updated_at is distinct from a.updated_at
       or (select array_agg(dor.organization_id::text || ':' || dor.role order by dor.organization_id) from public.deal_organizations dor where dor.deal_id = d.id) is distinct from a.links
  ),
  'second run leaves every deal and link as it was'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'touch_deals_updated_at' and tgrelid = 'public.deals'::regclass and tgenabled <> 'D'
  ),
  'the updated_at trigger is enabled again'
);

select ok(
  not has_function_privilege('service_role', 'private.clear_placeholder_buyer_links()', 'execute')
  and not has_function_privilege('anon', 'private.placeholder_buyer_names()', 'execute'),
  'API roles cannot execute the cleanup helpers'
);

select * from finish();
rollback;
