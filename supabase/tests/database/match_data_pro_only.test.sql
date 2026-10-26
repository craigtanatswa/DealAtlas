-- 0051: match scores, reasons and match ordering are Pro-only. Free viewers
-- get no match data, relevance sort falls back to the default (biddable)
-- order, and min_score is ignored, so two free users with different company
-- profiles see the same results in the same order. Pro behaviour is unchanged.
begin;
select no_plan();

insert into public.deals (id, primary_source_id, external_primary_id, source_title, deal_type, buyer_sector, stage, status)
select v.id, ds.id, v.ext, v.title, 'PUBLIC_TENDER', 'PUBLIC', 'LIVE', v.status::public.deal_status
from public.data_sources ds
cross join (values
  ('a0510000-0000-4000-8000-00000000000a'::uuid, 'P0MS-EXT-A', 'Zephyrine quillwork alpha', 'OPEN'),
  ('a0510000-0000-4000-8000-00000000000b'::uuid, 'P0MS-EXT-B', 'Zephyrine quillwork beta', 'CLOSING_SOON')
) as v(id, ext, title, status)
where ds.source_key = 'find-a-tender';

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  main_category, broad_region, leakage_risk, is_published
) values
  ('a0510000-0000-4000-8000-00000000000a', 'p0ms-deal-a-0a0a0a0a', 'Grounds maintenance for a public body',
   'A public body needs grounds maintenance.', 'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
   'facilities', 'Nationwide', 'LOW', true),
  ('a0510000-0000-4000-8000-00000000000b', 'p0ms-deal-b-0b0b0b0b', 'Catering for a public body',
   'A public body needs catering.', 'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'CLOSING_SOON',
   'facilities', 'Nationwide', 'LOW', true);

insert into auth.users (id, email) values
  ('a0510000-0000-4000-8000-0000000000f1', 'p0ms-free-1@example.test'),
  ('a0510000-0000-4000-8000-0000000000f2', 'p0ms-free-2@example.test'),
  ('a0510000-0000-4000-8000-0000000000a1', 'p0ms-pro@example.test');
insert into public.subscriptions (user_id, provider, plan_key, status, current_period_start, current_period_end, is_current)
values ('a0510000-0000-4000-8000-0000000000a1', 'dodo', 'PRO_MONTHLY', 'ACTIVE', now() - interval '1 day', now() + interval '30 days', true);
insert into public.company_profiles (id, user_id, company_name) values
  ('a0510000-0000-4000-8000-0000000001f1', 'a0510000-0000-4000-8000-0000000000f1', 'P0MS Free One'),
  ('a0510000-0000-4000-8000-0000000001f2', 'a0510000-0000-4000-8000-0000000000f2', 'P0MS Free Two'),
  ('a0510000-0000-4000-8000-0000000001a1', 'a0510000-0000-4000-8000-0000000000a1', 'P0MS Pro');
insert into public.deal_matches (company_profile_id, deal_id, relevance_score, preview_reasons) values
  ('a0510000-0000-4000-8000-0000000001f1', 'a0510000-0000-4000-8000-00000000000a', 90, '[{"code":"KEYWORD_OVERLAP","kind":"match","label":"x"}]'),
  ('a0510000-0000-4000-8000-0000000001f1', 'a0510000-0000-4000-8000-00000000000b', 10, '[]'),
  ('a0510000-0000-4000-8000-0000000001f2', 'a0510000-0000-4000-8000-00000000000a', 10, '[]'),
  ('a0510000-0000-4000-8000-0000000001f2', 'a0510000-0000-4000-8000-00000000000b', 90, '[{"code":"KEYWORD_OVERLAP","kind":"match","label":"x"}]'),
  ('a0510000-0000-4000-8000-0000000001a1', 'a0510000-0000-4000-8000-00000000000a', 95, '[{"code":"KEYWORD_OVERLAP","kind":"match","label":"x"}]'),
  ('a0510000-0000-4000-8000-0000000001a1', 'a0510000-0000-4000-8000-00000000000b', 10, '[]');

-- Order of the two fixture slugs for one search, as the caller sees it.
create temporary table p0ms_results (who text, label text, slugs text[], scored integer, reasons integer, n integer);
grant all on p0ms_results to authenticated;

create function pg_temp.p0ms_capture(p_who text, p_label text, p_sort text, p_min numeric)
returns void language sql as $$
  insert into p0ms_results
  select p_who, p_label,
    array_agg(s.slug order by s.n),
    count(*) filter (where s.relevance_score is not null)::integer,
    count(*) filter (where s.preview_reasons is not null)::integer,
    count(*)::integer
  from (
    select d.slug, d.relevance_score, d.preview_reasons, row_number() over () as n
    from public.search_preview_dtos(p_sort => p_sort, p_min_score => p_min, p_limit => 200) d
  ) s
  where s.slug like 'p0ms-%';
$$;
grant execute on function pg_temp.p0ms_capture(text, text, text, numeric) to authenticated;

-- pgTAP functions are not resolvable under the client role here, so the
-- client-side reads are captured into temp tables and asserted after reset.
create temporary table p0ms_dto (who text, label text, score numeric, reasons jsonb, denied text);
grant all on p0ms_dto to authenticated;
create function pg_temp.p0ms_direct_read(p_who text) returns void language plpgsql as $$
begin
  begin
    perform relevance_score from public.deal_matches limit 1;
    insert into p0ms_dto (who, label, denied) values (p_who, 'direct', 'allowed');
  exception when others then
    insert into p0ms_dto (who, label, denied) values (p_who, 'direct', sqlstate);
  end;
end;
$$;
grant execute on function pg_temp.p0ms_direct_read(text) to authenticated;

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"a0510000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
select pg_temp.p0ms_capture('f1', 'biddable', 'biddable', null);
select pg_temp.p0ms_capture('f1', 'relevance', 'relevance', null);
select pg_temp.p0ms_capture('f1', 'relevance90', 'relevance', 90);
insert into p0ms_dto (who, label, score, reasons)
  select 'f1', 'slug', relevance_score, preview_reasons from public.get_preview_dto_by_slug('p0ms-deal-a-0a0a0a0a');
insert into p0ms_dto (who, label, score, reasons)
  select 'f1', 'dealid', relevance_score, preview_reasons from public.get_preview_dto_by_deal_id('a0510000-0000-4000-8000-00000000000a');
select pg_temp.p0ms_direct_read('f1');

select set_config('request.jwt.claims', '{"sub":"a0510000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
select pg_temp.p0ms_capture('f2', 'relevance', 'relevance', null);
select pg_temp.p0ms_capture('f2', 'relevance90', 'relevance', 90);

select set_config('request.jwt.claims', '{"sub":"a0510000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select pg_temp.p0ms_capture('pro', 'relevance', 'relevance', null);
select pg_temp.p0ms_capture('pro', 'relevance50', 'relevance', 50);
insert into p0ms_dto (who, label, score, reasons)
  select 'pro', 'slug', relevance_score, preview_reasons from public.get_preview_dto_by_slug('p0ms-deal-a-0a0a0a0a');
insert into p0ms_dto (who, label, score, reasons)
  select 'pro', 'dealid', relevance_score, preview_reasons from public.get_preview_dto_by_deal_id('a0510000-0000-4000-8000-00000000000a');

select set_config('request.jwt.claims', '', true);
reset role;

select is((select count(*)::integer from p0ms_dto where who = 'f1' and label in ('slug', 'dealid')), 2,
  'free DTO reads returned rows');
select is((select count(*)::integer from p0ms_dto where who = 'f1' and label in ('slug', 'dealid')
  and (score is not null or reasons is not null)), 0, 'free slug and deal-id DTOs carry no score or reasons');
select is((select denied from p0ms_dto where who = 'f1' and label = 'direct'), '42501',
  'free user cannot read deal_matches directly');
select is((select score from p0ms_dto where who = 'pro' and label = 'slug'), 95::numeric,
  'Pro slug DTO keeps the score');
select is((select score from p0ms_dto where who = 'pro' and label = 'dealid'), 95::numeric,
  'Pro deal-id DTO keeps the score');

select is((select slugs from p0ms_results where who = 'f1' and label = 'biddable'),
  array['p0ms-deal-b-0b0b0b0b', 'p0ms-deal-a-0a0a0a0a'], 'biddable order puts CLOSING_SOON first');
select is((select sum(scored + reasons)::integer from p0ms_results where who in ('f1', 'f2')),
  0, 'free search rows carry no score and no reasons');
select is((select slugs from p0ms_results where who = 'f1' and label = 'relevance'),
  (select slugs from p0ms_results where who = 'f1' and label = 'biddable'),
  'free relevance sort falls back to biddable order');
select is((select slugs from p0ms_results where who = 'f2' and label = 'relevance'),
  (select slugs from p0ms_results where who = 'f1' and label = 'relevance'),
  'two free users with opposite profiles get identical ordering');
select is((select n from p0ms_results where who = 'f1' and label = 'relevance90'), 2,
  'free min_score is ignored (user one)');
select is((select n from p0ms_results where who = 'f2' and label = 'relevance90'), 2,
  'free min_score is ignored (user two)');
select is((select slugs from p0ms_results where who = 'f2' and label = 'relevance90'),
  (select slugs from p0ms_results where who = 'f1' and label = 'biddable'),
  'free relevance + min_score still returns the default order');

select is((select slugs from p0ms_results where who = 'pro' and label = 'relevance'),
  array['p0ms-deal-a-0a0a0a0a', 'p0ms-deal-b-0b0b0b0b'], 'Pro relevance sort orders by the Pro profile');
select is((select scored from p0ms_results where who = 'pro' and label = 'relevance'), 2,
  'Pro search rows carry scores');
select is((select slugs from p0ms_results where who = 'pro' and label = 'relevance50'),
  array['p0ms-deal-a-0a0a0a0a'], 'Pro min_score still filters');

select * from finish();
rollback;
