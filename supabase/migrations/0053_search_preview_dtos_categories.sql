-- Multi-raw category filter for the preview search and export RPCs.
--
-- A taxonomy filter such as "Energy & Utilities" expands to several raw
-- deal_previews.main_category values ("Energy", "Energy & Utilities",
-- "Water and Wastewater"). Client code used to fan out one RPC call per raw
-- value and merge the pages itself, which lost updated_at ordering for the
-- default sort=updated because the DTOs carry no timestamps. Filtering by an
-- array inside the RPC keeps ordering, paging and total_count server-side.
--
-- p_categories is added last and defaults to null, so positional callers keep
-- working and p_category still applies when p_categories is null or empty.
-- Postgres cannot CREATE OR REPLACE a function with a changed argument list,
-- so each function is dropped and recreated, then granted again.

drop function if exists public.search_preview_dtos(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  public.deal_status[],
  text,
  text,
  numeric,
  text,
  integer,
  integer
);

create function public.search_preview_dtos(
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
  p_offset integer default 0,
  p_categories text[] default null
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
      and (
        case
          when p_categories is not null and cardinality(p_categories) > 0
            then dp.main_category = any(p_categories)
          else (p_category is null or dp.main_category = p_category)
        end
      )
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

revoke all on function public.search_preview_dtos(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  public.deal_status[],
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
) from public, anon, authenticated;

grant execute on function public.search_preview_dtos(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  public.deal_status[],
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
) to anon, authenticated, service_role;

drop function if exists public.search_deal_previews(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  integer,
  integer
);

create function public.search_deal_previews(
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_categories text[] default null
)
returns table (
  deal_id uuid,
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
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  select
    dp.deal_id,
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
    dp.requirements_preview,
    dp.relevance_tags,
    dp.freshness_label,
    count(*) over() as total_count
  from public.deal_previews dp
  where dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and (
      case
        when p_categories is not null and cardinality(p_categories) > 0
          then dp.main_category = any(p_categories)
        else (p_category is null or dp.main_category = p_category)
      end
    )
    and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
    and (p_deal_type is null or dp.deal_type = p_deal_type)
    and (p_region is null or dp.broad_region = p_region)
    and (p_status is null or dp.status = p_status)
    and (p_value_band is null or dp.value_band = p_value_band)
    and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
    and (
      p_query is null
      or btrim(p_query) = ''
      or to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
           @@ websearch_to_tsquery('english', p_query)
      or dp.preview_title % p_query
    )
  order by
    case when p_query is null or btrim(p_query) = '' then 0
      else ts_rank(
        to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')),
        websearch_to_tsquery('english', p_query)
      )
    end desc,
    dp.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_deal_previews(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  integer,
  integer,
  text[]
) from public, anon, authenticated;
grant execute on function public.search_deal_previews(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  integer,
  integer,
  text[]
) to service_role;

drop function if exists public.search_deal_previews_for_profile(
  uuid,
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  numeric,
  text,
  integer,
  integer
);

create function public.search_deal_previews_for_profile(
  p_company_profile_id uuid,
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_min_score numeric default null,
  p_sort text default 'updated',
  p_limit integer default 20,
  p_offset integer default 0,
  p_categories text[] default null
)
returns table (
  deal_id uuid,
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
  with ranked as (
    select
      dp.deal_id,
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
      dp.requirements_preview,
      dp.relevance_tags,
      dp.freshness_label,
      dm.relevance_score,
      case
        when auth.role() = 'service_role' then coalesce(dm.preview_reasons, '[]'::jsonb)
        else '[]'::jsonb
      end as preview_reasons,
      dp.updated_at,
      case
        when p_query is null or btrim(p_query) = '' then 0
        else ts_rank(
          to_tsvector(
            'english',
            coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')
          ),
          websearch_to_tsquery('english', p_query)
        )
      end as query_rank
    from public.deal_previews dp
    left join public.deal_matches dm
      on dm.deal_id = dp.deal_id
     and dm.company_profile_id = p_company_profile_id
     and (
       auth.role() = 'service_role'
       or exists (
         select 1
         from public.company_profiles cp
         where cp.id = p_company_profile_id
           and cp.user_id = auth.uid()
       )
     )
    where dp.is_published = true
      and dp.leakage_risk = 'LOW'
      and (
        case
          when p_categories is not null and cardinality(p_categories) > 0
            then dp.main_category = any(p_categories)
          else (p_category is null or dp.main_category = p_category)
        end
      )
      and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
      and (p_deal_type is null or dp.deal_type = p_deal_type)
      and (p_region is null or dp.broad_region = p_region)
      and (p_status is null or dp.status = p_status)
      and (p_value_band is null or dp.value_band = p_value_band)
      and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
      and (
        p_min_score is null
        or coalesce(dm.relevance_score, -1) >= p_min_score
      )
      and (
        p_query is null
        or btrim(p_query) = ''
        or to_tsvector(
             'english',
             coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')
           ) @@ websearch_to_tsquery('english', p_query)
      )
  )
  select
    ranked.deal_id,
    ranked.slug,
    ranked.preview_title,
    ranked.preview_summary,
    ranked.deal_type,
    ranked.buyer_sector,
    ranked.stage,
    ranked.status,
    ranked.main_category,
    ranked.broad_region,
    ranked.value_band,
    ranked.deadline_band,
    ranked.duration_band,
    ranked.sme_suitability,
    ranked.bid_complexity,
    ranked.competition_level,
    private.preview_dto_requirements(ranked.requirements_preview),
    ranked.relevance_tags,
    ranked.freshness_label,
    ranked.relevance_score,
    ranked.preview_reasons,
    count(*) over() as total_count
  from ranked
  order by
    case when lower(coalesce(p_sort, 'updated')) = 'relevance'
      then coalesce(ranked.relevance_score, -1)
      else 0
    end desc,
    ranked.query_rank desc,
    ranked.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_deal_previews_for_profile(
  uuid,
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
) from public, anon, authenticated;
grant execute on function public.search_deal_previews_for_profile(
  uuid,
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
) to service_role;
