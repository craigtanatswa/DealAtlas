-- DealAtlas migration 0011
-- Company-profile relevance matching: extra score columns, server-only
-- detail reasons, match job queue, and authenticated relevance search.

alter table public.deal_matches
  add column if not exists keyword_score numeric(5,2)
    check (keyword_score is null or (keyword_score >= 0 and keyword_score <= 100)),
  add column if not exists sector_score numeric(5,2)
    check (sector_score is null or (sector_score >= 0 and sector_score <= 100)),
  add column if not exists certification_score numeric(5,2)
    check (certification_score is null or (certification_score >= 0 and certification_score <= 100)),
  add column if not exists detail_reasons jsonb not null default '[]'::jsonb;

comment on column public.deal_matches.preview_reasons is
  'Sanitised match/mismatch reasons safe for authenticated clients. Never store source identity or exact protected requirement text.';
comment on column public.deal_matches.detail_reasons is
  'Server-only richer mismatch/match notes for entitled Pro reads. Still must not copy source identity.';

grant all on table public.deal_matches to service_role;

revoke select (detail_reasons) on table public.deal_matches from anon, authenticated;

create index if not exists deal_matches_profile_score_idx
  on public.deal_matches (company_profile_id, relevance_score desc);

create table if not exists public.match_jobs (
  id uuid primary key default gen_random_uuid(),
  company_profile_id uuid references public.company_profiles(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RUNNING', 'DONE', 'ERROR')),
  cursor_offset integer not null default 0 check (cursor_offset >= 0),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  check (company_profile_id is not null or deal_id is not null)
);

create unique index if not exists match_jobs_pending_profile_idx
  on public.match_jobs (company_profile_id)
  where status = 'PENDING'
    and company_profile_id is not null
    and deal_id is null;

create unique index if not exists match_jobs_pending_deal_idx
  on public.match_jobs (deal_id)
  where status = 'PENDING'
    and deal_id is not null
    and company_profile_id is null;

create unique index if not exists match_jobs_pending_pair_idx
  on public.match_jobs (company_profile_id, deal_id)
  where status = 'PENDING'
    and company_profile_id is not null
    and deal_id is not null;

create index if not exists match_jobs_status_requested_idx
  on public.match_jobs (status, requested_at);

alter table public.match_jobs enable row level security;
revoke all on table public.match_jobs from public, anon, authenticated;
grant all on table public.match_jobs to service_role;

comment on table public.match_jobs is
  'Server-only queue for recalculating deal_matches after profile edits or preview publish.';

create or replace function public.search_deal_previews_for_profile(
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
  p_offset integer default 0
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
security invoker
set search_path = public, extensions, pg_catalog
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
      coalesce(dm.preview_reasons, '[]'::jsonb) as preview_reasons,
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
    where dp.is_published = true
      and dp.leakage_risk = 'LOW'
      and (p_category is null or dp.main_category = p_category)
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
        or dp.preview_title % p_query
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
    ranked.requirements_preview,
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
  uuid, text, text, public.buyer_sector, public.deal_type, text, public.deal_status,
  text, text, numeric, text, integer, integer
) from public, anon;

grant execute on function public.search_deal_previews_for_profile(
  uuid, text, text, public.buyer_sector, public.deal_type, text, public.deal_status,
  text, text, numeric, text, integer, integer
) to authenticated, service_role;

comment on function public.search_deal_previews_for_profile is
  'Authenticated search over published deal_previews with optional relevance sort/filter. Join to deal_matches is RLS-constrained.';
