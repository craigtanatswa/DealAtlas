-- P0 anti-bypass: match data is Pro-only.
-- Match scores, reasons and match ordering are derived from protected deal
-- fields (exact value, requirements, framework names, CPV codes). Free and
-- anonymous viewers must not receive them in any channel. The app gates this
-- in lib/matching/entitlement.ts; this migration is defence in depth.
--
-- For any viewer where private.is_user_pro(auth.uid()) is not true:
--   * relevance_score is null and preview_reasons is [] (the anon contract);
--   * search_preview_dtos ignores p_min_score and treats sort 'relevance'
--     as 'biddable', so ordering never depends on the company profile.
-- Pro behaviour is unchanged. Same signatures and result columns; CREATE OR
-- REPLACE keeps owners and grants.

create or replace function public.search_preview_dtos(
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_statuses public.deal_status[] default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_min_score numeric default null,
  p_sort text default 'updated',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  relevance_score numeric,
  preview_reasons jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with opts as (
    -- Match data is Pro-only. private.is_user_pro is the fail-closed check.
    select
      coalesce(private.is_user_pro(auth.uid()), false) as pro,
      lower(coalesce(p_sort, 'updated')) as requested_sort
  ),
  eff as (
    select
      o.pro,
      case
        when o.requested_sort = 'relevance' and not o.pro then 'biddable'
        else o.requested_sort
      end as sort,
      case when o.pro then p_min_score end as min_score
    from opts o
  ),
  viewer as (
    select cp.id as company_profile_id
    from public.company_profiles cp
    cross join eff
    where cp.user_id = auth.uid()
      and eff.pro
    limit 1
  ),
  q as (
    select nullif(btrim(left(coalesce(p_query, ''), 200)), '') as text
  ),
  ranked as (
    select
      dp.*,
      eff.sort,
      dm.relevance_score as match_score,
      dm.preview_reasons as match_reasons,
      case
        when q.text is null then 0
        else ts_rank(
          to_tsvector('english'::regconfig, coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')),
          websearch_to_tsquery('english'::regconfig, q.text)
        )
      end as query_rank
    from public.deal_previews dp
    cross join q
    cross join eff
    left join viewer v on true
    left join public.deal_matches dm
      on dm.deal_id = dp.deal_id
     and dm.company_profile_id = v.company_profile_id
    where dp.is_published = true
      and dp.leakage_risk = 'LOW'
      and dp.unpublished_by_admin = false
      and (p_category is null or dp.main_category = p_category)
      and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
      and (p_deal_type is null or dp.deal_type = p_deal_type)
      and (p_region is null or dp.broad_region = p_region)
      and (p_status is null or dp.status = p_status)
      and (p_statuses is null or cardinality(p_statuses) = 0 or dp.status = any(p_statuses))
      and (p_value_band is null or dp.value_band = p_value_band)
      and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
      and (eff.min_score is null or coalesce(dm.relevance_score, -1) >= eff.min_score)
      and (
        q.text is null
        or to_tsvector('english'::regconfig, coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
             @@ websearch_to_tsquery('english'::regconfig, q.text)
      )
  ),
  paged as (
    -- Order and page on plain columns first. The DTO helpers below are costly
    -- per row, and rows skipped by OFFSET must not pay for them.
    select
      r.*,
      count(*) over () as total_count,
      case when r.sort = 'relevance' then coalesce(r.match_score, -1) else 0 end as sort_score,
      case
        when r.sort = 'biddable' and r.status = 'CLOSING_SOON'::public.deal_status then 0
        when r.sort = 'biddable' and r.status = 'OPEN'::public.deal_status then 1
        when r.sort = 'biddable' and r.status = 'UPCOMING'::public.deal_status then 2
        when r.sort = 'biddable' then 3
        else 0
      end as sort_status,
      case
        when r.sort in ('biddable', 'deadline') then (
          select d.submission_deadline
          from public.deals d
          where d.id = r.deal_id
        )
      end as sort_deadline,
      case when r.sort = 'relevance' then r.query_rank else 0 end as sort_rank
    from ranked r
    order by sort_score desc, sort_status asc, sort_deadline asc nulls last, sort_rank desc, r.updated_at desc, r.slug
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(0, least(coalesce(p_offset, 0), 10000))
  )
  select
    p.slug,
    p.preview_title,
    p.preview_summary,
    p.deal_type,
    p.buyer_sector,
    p.stage,
    p.status,
    p.main_category,
    p.broad_region,
    p.value_band,
    p.deadline_band,
    p.duration_band,
    p.sme_suitability,
    p.bid_complexity,
    p.competition_level,
    private.preview_dto_requirements(p.requirements_preview),
    p.relevance_tags[1:12],
    private.preview_freshness_label(p.created_at, p.updated_at),
    p.match_score,
    private.preview_dto_reasons(p.match_reasons),
    p.total_count
  from paged p
  order by p.sort_score desc, p.sort_status asc, p.sort_deadline asc nulls last, p.sort_rank desc, p.updated_at desc, p.slug;
$$;

create or replace function public.get_preview_dto_by_slug(p_slug text)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  relevance_score numeric,
  preview_reasons jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.stage,
    dp.status,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.duration_band,
    dp.sme_suitability,
    dp.bid_complexity,
    dp.competition_level,
    private.preview_dto_requirements(dp.requirements_preview),
    dp.relevance_tags[1:12],
    private.preview_freshness_label(dp.created_at, dp.updated_at),
    dm.relevance_score,
    private.preview_dto_reasons(dm.preview_reasons)
  from public.deal_previews dp
  left join public.company_profiles cp
    on cp.user_id = auth.uid()
   and coalesce(private.is_user_pro(auth.uid()), false)
  left join public.deal_matches dm
    on dm.deal_id = dp.deal_id
   and dm.company_profile_id = cp.id
  where length(coalesce(p_slug, '')) between 1 and 200
    and dp.slug = p_slug
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
    and not private.preview_slug_is_legacy(dp.slug, dp.deal_id)
  limit 1;
$$;

create or replace function public.get_preview_dto_by_deal_id(p_deal_id uuid)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  relevance_score numeric,
  preview_reasons jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.stage,
    dp.status,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.duration_band,
    dp.sme_suitability,
    dp.bid_complexity,
    dp.competition_level,
    private.preview_dto_requirements(dp.requirements_preview),
    dp.relevance_tags[1:12],
    private.preview_freshness_label(dp.created_at, dp.updated_at),
    dm.relevance_score,
    private.preview_dto_reasons(dm.preview_reasons)
  from public.deal_previews dp
  left join public.company_profiles cp
    on cp.user_id = auth.uid()
   and coalesce(private.is_user_pro(auth.uid()), false)
  left join public.deal_matches dm
    on dm.deal_id = dp.deal_id
   and dm.company_profile_id = cp.id
  where auth.uid() is not null
    and dp.deal_id = p_deal_id
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  limit 1;
$$;

-- Direct table reads bypassed the DTO gate: a free user with a company profile
-- could select their own deal_matches.relevance_score (and component scores)
-- over PostgREST. Every app read now goes through service_role (lib/matching/
-- load.ts, lib/alerts/evaluate.ts), so client roles lose table access entirely.
revoke select on table public.deal_matches from anon, authenticated;
