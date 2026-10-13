-- Recently awarded bands (migration 0026). Synthetic rows only.
begin;
select no_plan();

select is(private.format_award_total(4200000), '£4.2m', 'millions keep two significant figures');
select is(private.format_award_total(4250000), '£4.3m', 'millions round the second significant figure');
select is(private.format_award_total(13040000), '£13m', 'a total above ten million drops the extra digits');
select is(private.format_award_total(1000000), '£1.0m', 'an exact million keeps two significant figures');
select is(private.format_award_total(87000), '£87k', 'thousands keep two significant figures');
select is(private.format_award_total(1500), '£1.5k', 'a small thousand keeps one decimal');
select is(private.format_award_total(999), '£1.0k', 'a value just under a thousand rounds up');
select is(private.format_award_total(50), '£50', 'a value under a thousand stays in pounds');
select is(private.format_award_total(0), NULL::text, 'a zero total is not labelled');
select is(private.format_award_total(NULL::numeric), NULL::text, 'a missing total is not labelled');

select is(private.round_award_count(12), 10, '12 awards round down to the nearest 5');
select is(private.round_award_count(13), 15, '13 awards round up to the nearest 5');
select is(private.round_award_count(37), 35, '37 awards round to 35');
select is(private.round_award_count(49), 50, '49 awards round to 50');
select is(private.round_award_count(50), 50, '50 awards round to the nearest 10');
select is(private.round_award_count(53), 50, '53 awards round down to the nearest 10');
select is(private.round_award_count(55), 60, '55 awards round up to the nearest 10');

select is(
  array(
    select u.name
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes)
      with ordinality as u(name, mode, ord)
    where p.oid = 'public.list_recent_award_bands()'::regprocedure
      and u.mode = 't'
    order by u.ord
  ),
  array[
    'sector',
    'region',
    'value_band',
    'recency_weeks',
    'aggregate_value_label',
    'aggregate_contract_count',
    'aggregate_window_weeks'
  ],
  'list_recent_award_bands returns only the allowed columns'
);

select ok(
  has_function_privilege('anon', 'public.list_recent_award_bands()', 'execute')
  and has_function_privilege('authenticated', 'public.list_recent_award_bands()', 'execute')
  and has_function_privilege('service_role', 'public.list_recent_award_bands()', 'execute'),
  'anon, authenticated and service_role can execute the band RPC'
);
select ok(
  not has_function_privilege('anon', 'private.format_award_total(numeric)', 'execute')
  and not has_function_privilege('authenticated', 'private.format_award_total(numeric)', 'execute')
  and not has_function_privilege('anon', 'private.round_award_count(integer)', 'execute')
  and not has_function_privilege('authenticated', 'private.round_award_count(integer)', 'execute'),
  'client roles cannot execute the rounding helpers'
);

insert into public.organizations (id, canonical_name, normalized_name)
values
  ('a2600000-0000-4000-8000-000000000001', 'CANARY BUYER NEVER FREE', 'canary buyer never free'),
  ('a2600000-0000-4000-8000-000000000002', 'CANARY WINNER NEVER FREE', 'canary winner never free');

insert into public.data_sources (id, source_key, name, source_type, access_method, reuse_status, enabled)
values
  ('a2640000-0000-4000-8000-000000000001', 'award-band-open', 'Award band open', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'OPEN_LICENSE', true),
  ('a2640000-0000-4000-8000-000000000002', 'award-band-json', 'Award band json', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'OPEN_LICENSE', true),
  ('a2640000-0000-4000-8000-000000000003', 'award-band-licensed', 'Award band licensed', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'LICENSED', true);

create temporary table recent_award_seed (
  n integer primary key,
  sector public.buyer_sector not null,
  region text not null,
  amount numeric not null,
  days_ago integer not null,
  source_id uuid not null,
  denylisted boolean not null
) on commit drop;

insert into recent_award_seed (n, sector, region, amount, days_ago, source_id, denylisted)
values
  (1, 'HEALTHCARE', 'London', 150000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (2, 'HEALTHCARE', 'London', 150000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (3, 'HEALTHCARE', 'London', 150000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (4, 'HEALTHCARE', 'London', 150000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (5, 'HEALTHCARE', 'London', 150000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (6, 'HEALTHCARE', 'London', 2000000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (7, 'HEALTHCARE', 'London', 2000000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (8, 'HEALTHCARE', 'London', 2000000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (9, 'EDUCATION', 'Scotland', 100000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (10, 'EDUCATION', 'Scotland', 100000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (11, 'EDUCATION', 'Scotland', 100000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (12, 'EDUCATION', 'Scotland', 100000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (13, 'UTILITY', 'Wales', 2000000, 40, 'a2640000-0000-4000-8000-000000000001', false),
  (14, 'UTILITY', 'Wales', 2000000, 40, 'a2640000-0000-4000-8000-000000000001', false),
  (15, 'UTILITY', 'Wales', 2000000, 40, 'a2640000-0000-4000-8000-000000000001', false),
  (16, 'UTILITY', 'Wales', 2000000, 40, 'a2640000-0000-4000-8000-000000000001', false),
  (17, 'UTILITY', 'Wales', 2000000, 40, 'a2640000-0000-4000-8000-000000000001', false),
  (18, 'PUBLIC', 'North West England', 80000, 20, 'a2640000-0000-4000-8000-000000000001', false),
  (19, 'PUBLIC', 'North West England', 80000, 20, 'a2640000-0000-4000-8000-000000000001', false),
  (20, 'PUBLIC', 'North West England', 80000, 20, 'a2640000-0000-4000-8000-000000000001', false),
  (21, 'PUBLIC', 'North West England', 80000, 20, 'a2640000-0000-4000-8000-000000000001', false),
  (22, 'PUBLIC', 'North West England', 80000, 20, 'a2640000-0000-4000-8000-000000000001', false),
  (23, 'PRIVATE', 'East Midlands', 150000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (24, 'PRIVATE', 'East Midlands', 150000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (25, 'PRIVATE', 'East Midlands', 150000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (26, 'PRIVATE', 'East Midlands', 150000, 3, 'a2640000-0000-4000-8000-000000000001', false),
  (27, 'PRIVATE', 'East Midlands', 150000, 20, 'a2640000-0000-4000-8000-000000000001', false),
  (28, 'PUBLIC', 'London', 123456.78, 90, 'a2640000-0000-4000-8000-000000000001', false),
  (29, 'HEALTHCARE', 'London', 5000000, 0, 'a2640000-0000-4000-8000-000000000001', false),
  (30, 'NONPROFIT', 'Northern Ireland', 5000000, 3, 'a2640000-0000-4000-8000-000000000002', false),
  (31, 'NONPROFIT', 'Northern Ireland', 5000000, 3, 'a2640000-0000-4000-8000-000000000002', false),
  (32, 'NONPROFIT', 'Northern Ireland', 5000000, 3, 'a2640000-0000-4000-8000-000000000002', false),
  (33, 'NONPROFIT', 'Northern Ireland', 5000000, 3, 'a2640000-0000-4000-8000-000000000002', false),
  (34, 'NONPROFIT', 'Northern Ireland', 5000000, 3, 'a2640000-0000-4000-8000-000000000002', false),
  (35, 'EDUCATION', 'Wales', 5000000, 3, 'a2640000-0000-4000-8000-000000000003', false),
  (36, 'EDUCATION', 'Wales', 5000000, 3, 'a2640000-0000-4000-8000-000000000003', false),
  (37, 'EDUCATION', 'Wales', 5000000, 3, 'a2640000-0000-4000-8000-000000000003', false),
  (38, 'EDUCATION', 'Wales', 5000000, 3, 'a2640000-0000-4000-8000-000000000003', false),
  (39, 'EDUCATION', 'Wales', 5000000, 3, 'a2640000-0000-4000-8000-000000000003', false),
  (40, 'UTILITY', 'Scotland', 5000000, 3, 'a2640000-0000-4000-8000-000000000001', true),
  (41, 'UTILITY', 'Scotland', 5000000, 3, 'a2640000-0000-4000-8000-000000000001', true),
  (42, 'UTILITY', 'Scotland', 5000000, 3, 'a2640000-0000-4000-8000-000000000001', true),
  (43, 'UTILITY', 'Scotland', 5000000, 3, 'a2640000-0000-4000-8000-000000000001', true),
  (44, 'UTILITY', 'Scotland', 5000000, 3, 'a2640000-0000-4000-8000-000000000001', true);

insert into public.locations (id, region)
select
  ('a2620000-0000-4000-8000-' || lpad(row_number() over (order by region)::text, 12, '0'))::uuid,
  region
from (select distinct region from recent_award_seed) seeded;

insert into public.deals (
  id,
  primary_source_id,
  buyer_organization_id,
  reference,
  source_title,
  deal_type,
  buyer_sector,
  stage,
  status
)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  source_id,
  'a2600000-0000-4000-8000-000000000001',
  'ZQ-AWD-2026-0417',
  'CANARY SOURCE TITLE NEVER FREE',
  'AWARD',
  sector,
  'AWARD',
  'AWARDED'
from recent_award_seed;

insert into private.publish_denylist (deal_id, reason)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'award band test'
from recent_award_seed
where denylisted;

insert into public.deal_locations (deal_id, location_id)
select
  ('a2610000-0000-4000-8000-' || lpad(seed.n::text, 12, '0'))::uuid,
  location.id
from recent_award_seed seed
join public.locations location on location.region = seed.region
where location.id::text like 'a2620000-%';

insert into public.awards (id, deal_id, award_identifier, award_date, award_value, currency)
select
  ('a2630000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'ZQ-AWD-2026-0417',
  date_trunc('week', current_date)::date - days_ago,
  amount,
  'GBP'
from recent_award_seed;

insert into public.award_suppliers (award_id, organization_id, awarded_value)
select
  ('a2630000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a2600000-0000-4000-8000-000000000002',
  amount
from recent_award_seed;

savepoint full_fixture;

delete from public.awards
where deal_id in (
  select id from public.deals
  where buyer_sector in ('PUBLIC', 'PRIVATE')
    and source_title = 'CANARY SOURCE TITLE NEVER FREE'
);

select is_empty(
  $$select * from public.list_recent_award_bands()$$,
  'fewer than three sector and region cards hides the strip'
);

rollback to savepoint full_fixture;

delete from public.awards
where id in (
  select ('a2630000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
  from recent_award_seed
  where n > 9
);

select is_empty(
  $$select * from public.list_recent_award_bands()$$,
  'fewer than 10 awards returns no strip rows'
);

rollback to savepoint full_fixture;

select results_eq(
  $$select sector, region, value_band, recency_weeks
    from public.list_recent_award_bands()
    order by sector, region$$,
  $$values
    ('Healthcare'::text, 'London'::text, '£100k–£250k'::text, 2::integer),
    ('Private'::text, 'East Midlands'::text, '£100k–£250k'::text, 4::integer),
    ('Public'::text, 'North West England'::text, '£50k–£100k'::text, 4::integer),
    ('Utility'::text, 'Wales'::text, '£1m–£5m'::text, 8::integer)$$,
  'cards are distinct sector and region pairs with coarse recency'
);

select is(
  (select count(*) from public.list_recent_award_bands() where sector = 'Education' and region = 'Scotland'),
  0::bigint,
  'a 4-award bucket returns no row'
);
select is(
  (select recency_weeks from public.list_recent_award_bands() where sector = 'Private' and region = 'East Midlands'),
  4,
  'a 2-week bucket with 4 awards widens to 4 weeks'
);
select is(
  (select count(*) from public.list_recent_award_bands()
   where (sector = 'Non-profit' and region = 'Northern Ireland')
      or (sector = 'Education' and region = 'Wales')
      or (sector = 'Utility' and region = 'Scotland')),
  0::bigint,
  'JSON_API, LICENSED and denylisted awards do not form cards'
);
select is(
  (select aggregate_value_label from public.list_recent_award_bands() limit 1),
  '£18m',
  'the aggregate value covers the approved window at two significant figures'
);
select is(
  (select aggregate_contract_count from public.list_recent_award_bands() limit 1),
  private.round_award_count(27),
  'the RPC count is already rounded'
);
select isnt(
  (select aggregate_contract_count from public.list_recent_award_bands() limit 1),
  27::integer,
  'the RPC does not return the raw award count'
);
select is(
  (select aggregate_contract_count from public.list_recent_award_bands() limit 1),
  25,
  'the aggregate count is rounded to the nearest 5 when under 50'
);
select is(
  (select aggregate_window_weeks from public.list_recent_award_bands() limit 1),
  8,
  'the aggregate uses the 8-week window'
);

savepoint over_fifty;

insert into public.deals (
  id, primary_source_id, buyer_organization_id, reference, source_title,
  deal_type, buyer_sector, stage, status
)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a2640000-0000-4000-8000-000000000001',
  'a2600000-0000-4000-8000-000000000001',
  'ZQ-AWD-2026-0417',
  'CANARY SOURCE TITLE NEVER FREE',
  'AWARD', 'HEALTHCARE', 'AWARD', 'AWARDED'
from generate_series(100, 125) as n;

insert into public.deal_locations (deal_id, location_id)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  location.id
from generate_series(100, 125) as n
join public.locations location on location.region = 'London'
where location.id::text like 'a2620000-%';

insert into public.awards (id, deal_id, award_identifier, award_date, award_value, currency)
select
  ('a2630000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'ZQ-AWD-2026-0417',
  date_trunc('week', current_date)::date - 3,
  150000,
  'GBP'
from generate_series(100, 125) as n;

select is(
  (select aggregate_contract_count from public.list_recent_award_bands() limit 1),
  50,
  'a count of 50 or more is already rounded to the nearest 10'
);
select is(
  (select aggregate_contract_count from public.list_recent_award_bands() limit 1),
  private.round_award_count(53),
  'the RPC count of 53 matches the database rounding helper'
);

rollback to savepoint over_fifty;

savepoint unpublished_region;

insert into public.deals (
  id, primary_source_id, buyer_organization_id, reference, source_title,
  deal_type, buyer_sector, stage, status
)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a2640000-0000-4000-8000-000000000001',
  'a2600000-0000-4000-8000-000000000001',
  'ZQ-AWD-2026-0417',
  'CANARY SOURCE TITLE NEVER FREE',
  'AWARD', 'OTHER', 'AWARD', 'AWARDED'
from generate_series(200, 204) as n;

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published
)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'band-held-preview-' || n::text,
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'AWARD', 'OTHER', 'AWARD', 'AWARDED',
  'Remote', '[]'::jsonb, 'HIGH', false
from generate_series(200, 204) as n;

insert into public.awards (id, deal_id, award_identifier, award_date, award_value, currency)
select
  ('a2630000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'ZQ-AWD-2026-0417',
  date_trunc('week', current_date)::date - 3,
  100000,
  'GBP'
from generate_series(200, 204) as n;

insert into public.deals (
  id, primary_source_id, buyer_organization_id, reference, source_title,
  deal_type, buyer_sector, stage, status
)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a2640000-0000-4000-8000-000000000001',
  'a2600000-0000-4000-8000-000000000001',
  'ZQ-AWD-2026-0417',
  'CANARY SOURCE TITLE NEVER FREE',
  'AWARD', 'OTHER', 'AWARD', 'AWARDED'
from generate_series(210, 214) as n;

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'band-admin-hold-' || n::text,
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'AWARD', 'OTHER', 'AWARD', 'AWARDED',
  'Yorkshire and the Humber', '[]'::jsonb, 'LOW', true, true
from generate_series(210, 214) as n;

insert into public.awards (id, deal_id, award_identifier, award_date, award_value, currency)
select
  ('a2630000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'ZQ-AWD-2026-0417',
  date_trunc('week', current_date)::date - 3,
  100000,
  'GBP'
from generate_series(210, 214) as n;

select is(
  (select count(*) from public.list_recent_award_bands() where region = 'Remote'),
  0::bigint,
  'an unpublished HIGH preview does not supply the region'
);
select is(
  (select count(*) from public.list_recent_award_bands() where region = 'Yorkshire and the Humber'),
  0::bigint,
  'a held preview does not supply the region'
);

rollback to savepoint unpublished_region;

savepoint published_region;

insert into public.deals (
  id, primary_source_id, buyer_organization_id, reference, source_title,
  deal_type, buyer_sector, stage, status
)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a2640000-0000-4000-8000-000000000001',
  'a2600000-0000-4000-8000-000000000001',
  'ZQ-AWD-2026-0417',
  'CANARY SOURCE TITLE NEVER FREE',
  'AWARD', 'OTHER', 'AWARD', 'AWARDED'
from generate_series(220, 224) as n;

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published
)
select
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'band-live-preview-' || n::text,
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'AWARD', 'OTHER', 'AWARD', 'AWARDED',
  'Yorkshire and the Humber', '[]'::jsonb, 'LOW', true
from generate_series(220, 224) as n;

insert into public.awards (id, deal_id, award_identifier, award_date, award_value, currency)
select
  ('a2630000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('a2610000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'ZQ-AWD-2026-0417',
  date_trunc('week', current_date)::date - 3,
  100000,
  'GBP'
from generate_series(220, 224) as n;

select is(
  (select count(*) from public.list_recent_award_bands()
   where sector = 'Other' and region = 'Yorkshire and the Humber'),
  1::bigint,
  'a published LOW preview can supply the region'
);

rollback to savepoint published_region;

grant usage on schema extensions to anon, authenticated;
set local role anon;

select throws_ok(
  'select id from public.awards limit 1',
  '42501',
  null,
  'anon cannot select awards'
);
select throws_ok(
  'select canonical_name from public.organizations limit 1',
  '42501',
  null,
  'anon cannot select organisations'
);
select throws_ok(
  'select private.format_award_total(4200000)',
  '42501',
  null,
  'anon cannot execute the value formatter'
);

select results_eq(
  $$select sector, region, value_band, recency_weeks
    from public.list_recent_award_bands()
    order by sector, region$$,
  $$values
    ('Healthcare'::text, 'London'::text, '£100k–£250k'::text, 2::integer),
    ('Private'::text, 'East Midlands'::text, '£100k–£250k'::text, 4::integer),
    ('Public'::text, 'North West England'::text, '£50k–£100k'::text, 4::integer),
    ('Utility'::text, 'Wales'::text, '£1m–£5m'::text, 8::integer)$$,
  'anon receives the same coarse cards'
);

select ok(
  not exists (
    select 1
    from public.list_recent_award_bands() as band
    where (
      select array_agg(key order by key)
      from jsonb_object_keys(to_jsonb(band)) as key
    ) is distinct from array[
      'aggregate_contract_count',
      'aggregate_value_label',
      'aggregate_window_weeks',
      'recency_weeks',
      'region',
      'sector',
      'value_band'
    ]
  ),
  'anon json rows contain only the allowed keys'
);

select ok(
  not exists (
    select 1
    from public.list_recent_award_bands() as band
    where band::text ilike '%canary%'
       or band::text ilike '%zq-awd%'
       or band::text like '%123456%'
       or band::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-'
  ),
  'anon rows contain no buyer, winner, title, reference, exact value or id'
);

reset role;

select * from finish();
rollback;
