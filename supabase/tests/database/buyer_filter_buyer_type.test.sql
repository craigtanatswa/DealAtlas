-- 0067: PUBLIC/PRIVATE buyer filters use the top-level buyer type, while the
-- legacy sector values keep filtering on buyer_sector. All fixtures are
-- synthetic and scoped by a unique main_category so seed data is irrelevant.
begin;
select plan(5);

insert into public.deals (
  id, source_title, deal_type, buyer_sector, buyer_type, sector, stage, status
) values
  ('b6700000-0000-4000-8000-000000000001', 'Buyer filter fixture education',
   'PUBLIC_TENDER', 'EDUCATION', 'PUBLIC', 'EDUCATION', 'LIVE', 'OPEN'),
  ('b6700000-0000-4000-8000-000000000002', 'Buyer filter fixture healthcare',
   'PUBLIC_TENDER', 'HEALTHCARE', 'PUBLIC', 'HEALTHCARE', 'LIVE', 'OPEN'),
  ('b6700000-0000-4000-8000-000000000003', 'Buyer filter fixture public',
   'PUBLIC_TENDER', 'PUBLIC', 'PUBLIC', 'OTHER', 'LIVE', 'OPEN'),
  ('b6700000-0000-4000-8000-000000000004', 'Buyer filter fixture nonprofit',
   'PUBLIC_TENDER', 'NONPROFIT', 'PRIVATE', 'CHARITY_NONPROFIT', 'LIVE', 'OPEN'),
  ('b6700000-0000-4000-8000-000000000005', 'Buyer filter fixture private',
   'PUBLIC_TENDER', 'PRIVATE', 'PRIVATE', 'OTHER', 'LIVE', 'OPEN');

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, buyer_type,
  sector, stage, status, main_category, broad_region, leakage_risk, is_published
) values
  ('b6700000-0000-4000-8000-000000000001', 'bfbt-public-education-0a',
   'Specialist support for a public organisation',
   'A public organisation needs specialist support.', 'PUBLIC_TENDER',
   'EDUCATION', 'PUBLIC', 'EDUCATION', 'LIVE', 'OPEN', 'bfbt-fixtures', 'Nationwide', 'LOW', true),
  ('b6700000-0000-4000-8000-000000000002', 'bfbt-public-healthcare-0b',
   'Specialist support for a public organisation',
   'A public organisation needs specialist support.', 'PUBLIC_TENDER',
   'HEALTHCARE', 'PUBLIC', 'HEALTHCARE', 'LIVE', 'OPEN', 'bfbt-fixtures', 'Nationwide', 'LOW', true),
  ('b6700000-0000-4000-8000-000000000003', 'bfbt-public-plain-0c',
   'Specialist support for a public organisation',
   'A public organisation needs specialist support.', 'PUBLIC_TENDER',
   'PUBLIC', 'PUBLIC', 'OTHER', 'LIVE', 'OPEN', 'bfbt-fixtures', 'Nationwide', 'LOW', true),
  ('b6700000-0000-4000-8000-000000000004', 'bfbt-private-nonprofit-0d',
   'Specialist support for a private organisation',
   'A private organisation needs specialist support.', 'PUBLIC_TENDER',
   'NONPROFIT', 'PRIVATE', 'CHARITY_NONPROFIT', 'LIVE', 'OPEN', 'bfbt-fixtures', 'Nationwide', 'LOW', true),
  ('b6700000-0000-4000-8000-000000000005', 'bfbt-private-plain-0e',
   'Specialist support for a private organisation',
   'A private organisation needs specialist support.', 'PUBLIC_TENDER',
   'PRIVATE', 'PRIVATE', 'OTHER', 'LIVE', 'OPEN', 'bfbt-fixtures', 'Nationwide', 'LOW', true);

create temporary table bfbt_results (scope text, buyer_filter text, slugs text[]);
grant all on bfbt_results to anon, service_role;

set local role anon;
insert into bfbt_results
select 'anon', 'PUBLIC', array_agg(slug order by slug)
from public.search_preview_dtos(
  p_category => 'bfbt-fixtures',
  p_buyer_sector => 'PUBLIC',
  p_limit => 50
)
where slug like 'bfbt-%';
insert into bfbt_results
select 'anon', 'PRIVATE', array_agg(slug order by slug)
from public.search_preview_dtos(
  p_category => 'bfbt-fixtures',
  p_buyer_sector => 'PRIVATE',
  p_limit => 50
)
where slug like 'bfbt-%';
insert into bfbt_results
select 'anon', 'NONPROFIT', array_agg(slug order by slug)
from public.search_preview_dtos(
  p_category => 'bfbt-fixtures',
  p_buyer_sector => 'NONPROFIT',
  p_limit => 50
)
where slug like 'bfbt-%';
reset role;

set local role service_role;
insert into bfbt_results
select 'service', 'PUBLIC', array_agg(slug order by slug)
from public.search_deal_previews(
  p_category => 'bfbt-fixtures',
  p_buyer_sector => 'PUBLIC',
  p_limit => 50
)
where slug like 'bfbt-%';
insert into bfbt_results
select 'service', 'PRIVATE', array_agg(slug order by slug)
from public.search_deal_previews(
  p_category => 'bfbt-fixtures',
  p_buyer_sector => 'PRIVATE',
  p_limit => 50
)
where slug like 'bfbt-%';
reset role;

select is(
  (select slugs from bfbt_results where scope = 'anon' and buyer_filter = 'PUBLIC'),
  array['bfbt-public-education-0a', 'bfbt-public-healthcare-0b', 'bfbt-public-plain-0c'],
  'anon PUBLIC filter returns public EDUCATION, HEALTHCARE and PUBLIC buyers only'
);
select is(
  (select slugs from bfbt_results where scope = 'anon' and buyer_filter = 'PRIVATE'),
  array['bfbt-private-nonprofit-0d', 'bfbt-private-plain-0e'],
  'anon PRIVATE filter returns the NONPROFIT and PRIVATE buyers only'
);
select is(
  (select slugs from bfbt_results where scope = 'anon' and buyer_filter = 'NONPROFIT'),
  array['bfbt-private-nonprofit-0d'],
  'anon legacy NONPROFIT filter still works'
);
select is(
  (select slugs from bfbt_results where scope = 'service' and buyer_filter = 'PUBLIC'),
  array['bfbt-public-education-0a', 'bfbt-public-healthcare-0b', 'bfbt-public-plain-0c'],
  'service_role PUBLIC filter matches the anon split'
);
select is(
  (select slugs from bfbt_results where scope = 'service' and buyer_filter = 'PRIVATE'),
  array['bfbt-private-nonprofit-0d', 'bfbt-private-plain-0e'],
  'service_role PRIVATE filter matches the anon split'
);

select * from finish();
rollback;
