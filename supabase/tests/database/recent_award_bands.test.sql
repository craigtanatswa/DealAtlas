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
select is(private.round_award_count(50), 50, '50 awards stay exact');
select is(private.round_award_count(53), 53, 'a count of 50 or more stays exact');

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

create temporary table recent_award_seed (
  n integer primary key,
  sector public.buyer_sector not null,
  region text not null,
  amount numeric not null,
  days_ago integer not null
) on commit drop;

insert into recent_award_seed (n, sector, region, amount, days_ago)
values
  (1, 'HEALTHCARE', 'London', 150000, 3),
  (2, 'HEALTHCARE', 'London', 150000, 3),
  (3, 'HEALTHCARE', 'London', 150000, 3),
  (4, 'HEALTHCARE', 'London', 150000, 3),
  (5, 'HEALTHCARE', 'London', 2000000, 3),
  (6, 'HEALTHCARE', 'London', 2000000, 3),
  (7, 'HEALTHCARE', 'London', 2000000, 3),
  (8, 'EDUCATION', 'Scotland', 100000, 3),
  (9, 'EDUCATION', 'Scotland', 100000, 3),
  (10, 'UTILITY', 'Wales', 2000000, 40),
  (11, 'UTILITY', 'Wales', 2000000, 40),
  (12, 'UTILITY', 'Wales', 2000000, 40),
  (13, 'PUBLIC', 'North West England', 80000, 20),
  (14, 'PUBLIC', 'North West England', 80000, 20),
  (15, 'PUBLIC', 'North West England', 80000, 20),
  (16, 'PUBLIC', 'London', 123456.78, 90);

insert into public.locations (id, region)
select
  ('a2620000-0000-4000-8000-' || lpad(row_number() over (order by region)::text, 12, '0'))::uuid,
  region
from (select distinct region from recent_award_seed) seeded;

insert into public.deals (
  id,
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
  'a2600000-0000-4000-8000-000000000001',
  'ZQ-AWD-2026-0417',
  'CANARY SOURCE TITLE NEVER FREE',
  'AWARD',
  sector,
  'AWARD',
  'AWARDED'
from recent_award_seed;

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
  current_date - days_ago,
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
  where buyer_sector = 'PUBLIC'
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
  where n in (4, 5, 6, 7, 8, 9)
);

select is(
  (select count(*) from public.list_recent_award_bands()),
  3::bigint,
  'three qualifying cards still return when the window has fewer than 10 awards'
);
select is(
  (select aggregate_contract_count from public.list_recent_award_bands() limit 1),
  NULL::integer,
  'the aggregate line is hidden below 10 awards'
);

rollback to savepoint full_fixture;

select results_eq(
  $$select sector, region, value_band, recency_weeks
    from public.list_recent_award_bands()
    order by sector, region$$,
  $$values
    ('Healthcare'::text, 'London'::text, '£100k–£250k'::text, 2::integer),
    ('Public'::text, 'North West England'::text, '£50k–£100k'::text, 4::integer),
    ('Utility'::text, 'Wales'::text, '£1m–£5m'::text, 8::integer)$$,
  'cards are distinct sector and region pairs with coarse recency'
);

select is(
  (select count(*) from public.list_recent_award_bands() where sector = 'Education'),
  0::bigint,
  'a sector, region and value band with fewer than 3 awards is omitted'
);
select is(
  (select aggregate_value_label from public.list_recent_award_bands() limit 1),
  '£13m',
  'the aggregate value covers the whole window at two significant figures'
);
select is(
  (select aggregate_contract_count from public.list_recent_award_bands() limit 1),
  15,
  'the aggregate count is rounded to the nearest 5 when under 50'
);
select is(
  (select aggregate_window_weeks from public.list_recent_award_bands() limit 1),
  8,
  'the aggregate uses the 8-week window'
);

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
