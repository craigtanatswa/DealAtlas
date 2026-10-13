-- Publish OPEN, CLOSING_SOON and UPCOMING together.
-- UPCOMING with a null submission_deadline is publishable and is not treated as stale.
-- A past UPCOMING deadline is not publishable and is unpublished.
-- OPEN and CLOSING_SOON keep the previous null / 24-hour / past deadline rules.
-- Risk, holds, denylist, source compliance, stage pairing and the Find a Tender /
-- Contracts Finder limit on UPCOMING are unchanged.
-- Default search order (p_sort biddable) is closing soon, then open, then upcoming,
-- each by nearest submission deadline. That timestamp is used only for ordering
-- and is not selected. p_sort deadline orders by that same deadline. p_sort updated
-- is newest first. Relevance sort is unchanged.

create or replace function public.publish_eligible_previews(
  p_cap integer default 300,
  p_run_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap integer := least(500, greatest(1, coalesce(p_cap, 300)));
  v_result jsonb;
begin
  if not exists (select 1 from private.publish_denylist) then
    raise exception 'publish denylist is empty';
  end if;

  with classified as (
    select
      dp.deal_id,
      d.submission_deadline,
      case
        when dp.unpublished_by_admin
          or exists (select 1 from private.preview_holds h where h.deal_id = dp.deal_id)
          then 'held'
        when exists (select 1 from private.publish_denylist x where x.deal_id = dp.deal_id)
          then 'denylist'
        when not exists (
          select 1 from public.data_sources s
          where s.id = d.primary_source_id
            and s.enabled
            and s.access_method = 'OCDS_API'::public.access_method
            and s.reuse_status in ('OPEN_LICENSE'::public.reuse_status, 'PERMISSION_GRANTED'::public.reuse_status)
        ) then 'source'
        when not (
          dp.status = d.status
          and (
            (
              d.status in ('OPEN', 'CLOSING_SOON')
              and d.stage = 'LIVE'
              and dp.stage = 'LIVE'
              and d.submission_deadline is not null
            )
            or (
              d.status = 'UPCOMING'
              and d.stage = 'PLANNING'
              and dp.stage = 'PLANNING'
              and exists (
                select 1 from public.data_sources s
                where s.id = d.primary_source_id
                  and s.source_key in ('find-a-tender'::text, 'contracts-finder'::text)
              )
            )
          )
        ) then 'status'
        -- OPEN and CLOSING_SOON keep the existing deadline gate: a null deadline
        -- or one inside 24 hours is not publishable. UPCOMING with no deadline
        -- stays eligible. A missing date is an unknown opening window, not proof
        -- the notice has passed, so the null check must not exclude it. A past
        -- UPCOMING deadline is excluded: that window has already passed. The
        -- 24-hour first-publish buffer is not applied to UPCOMING, because that
        -- buffer is for bids about to close.
        when d.status is distinct from 'UPCOMING'::public.deal_status
          and (
            d.submission_deadline is null
            or d.submission_deadline <= pg_catalog.now() + interval '24 hours'
          )
          then 'deadline'
        when d.status = 'UPCOMING'::public.deal_status
          and d.submission_deadline is not null
          and d.submission_deadline <= pg_catalog.now()
          then 'deadline'
        when not private.preview_slug_is_template(dp.slug, dp.preview_title, dp.deal_id)
          then 'slug'
        when public.preview_slug_is_retired(dp.slug)
          then 'retired'
        when dp.leakage_risk is distinct from 'LOW'::public.leakage_risk
          then 'risk'
        when private.detect_preview_leakage(
          dp.deal_id, dp.slug, dp.preview_title, dp.preview_summary,
          dp.requirements_preview, dp.relevance_tags, dp.broad_region
        ) is distinct from 'LOW'::public.leakage_risk
          then 'risk'
        else 'eligible'
      end as reason
    from public.deal_previews dp
    join public.deals d on d.id = dp.deal_id
    where dp.is_published = false
  ),
  ranked as (
    select
      deal_id,
      row_number() over (order by submission_deadline asc, deal_id asc) as n
    from classified
    where reason = 'eligible'
  ),
  chosen as (
    select deal_id from ranked where n <= v_cap
  ),
  flipped as (
    update public.deal_previews dp
    set is_published = true,
        updated_at = pg_catalog.now()
    where dp.deal_id in (select chosen.deal_id from chosen)
      and dp.is_published = false
    returning dp.deal_id, dp.is_published
  ),
  audited as (
    insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, summary, metadata)
    select null, 'preview.publish'::text, 'deal_preview'::text, f.deal_id::text,
      'Published LOW-risk preview for deal '::text || f.deal_id::text,
      pg_catalog.jsonb_build_object('actor'::text, 'system:ingest-open'::text, 'run_id'::text, p_run_id)
    from flipped f
    where f.is_published
    returning id
  )
  select pg_catalog.jsonb_build_object(
    'selected'::text, (select count(*)::int from ranked),
    'published'::text, (select count(*)::int from audited),
    'skipped_risk'::text,
      (select count(*)::int from classified where reason = 'risk'::text)
      + (select count(*)::int from flipped where not is_published),
    'skipped_source'::text, (select count(*)::int from classified where reason = 'source'::text),
    'skipped_status'::text, (select count(*)::int from classified where reason = 'status'::text),
    'skipped_deadline'::text, (select count(*)::int from classified where reason = 'deadline'::text),
    'skipped_held'::text, (select count(*)::int from classified where reason = 'held'::text),
    'skipped_slug'::text, (select count(*)::int from classified where reason = 'slug'::text),
    'skipped_retired'::text, (select count(*)::int from classified where reason = 'retired'::text),
    'skipped_denylist'::text, (select count(*)::int from classified where reason = 'denylist'::text),
    'skipped_cap'::text, (select count(*)::int from ranked) - (select count(*)::int from chosen)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.publish_eligible_previews(integer, text) from public, anon, authenticated;
grant execute on function public.publish_eligible_previews(integer, text) to service_role;

drop function if exists public.unpublish_stale_previews();
drop function if exists public.unpublish_stale_previews(text);

-- A deadline under 24 hours away, and a non-template or retired slug, only
-- gate first publication. This function does not unpublish for those.
-- A published row still comes down once its deadline is null or past.
create or replace function public.unpublish_stale_previews(p_run_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with doomed as (
    select dp.deal_id
    from public.deal_previews dp
    join public.deals d on d.id = dp.deal_id
    where dp.is_published
      and (
        (
          d.status is distinct from 'UPCOMING'::public.deal_status
          and (
            d.submission_deadline is null
            or d.submission_deadline <= pg_catalog.now()
          )
        )
        or (
          d.status = 'UPCOMING'::public.deal_status
          and d.submission_deadline is not null
          and d.submission_deadline <= pg_catalog.now()
        )
        or d.status is distinct from dp.status
        or d.stage is distinct from dp.stage
        or not exists (
          select 1 from public.data_sources s
          where s.id = d.primary_source_id
            and s.enabled
            and s.access_method = 'OCDS_API'::public.access_method
            and s.reuse_status in (
              'OPEN_LICENSE'::public.reuse_status,
              'PERMISSION_GRANTED'::public.reuse_status
            )
        )
        or exists (
          select 1 from private.publish_denylist x where x.deal_id = dp.deal_id
        )
        or not (
          (
            d.status in ('OPEN', 'CLOSING_SOON')
            and d.stage = 'LIVE'
            and dp.stage = 'LIVE'
          )
          or (
            d.status = 'UPCOMING'
            and d.stage = 'PLANNING'
            and dp.stage = 'PLANNING'
            and exists (
              select 1 from public.data_sources s
              where s.id = d.primary_source_id
                and s.source_key in ('find-a-tender'::text, 'contracts-finder'::text)
            )
          )
        )
      )
  ),
  flipped as (
    update public.deal_previews dp
    set is_published = false,
        updated_at = pg_catalog.now()
    where dp.deal_id in (select doomed.deal_id from doomed)
      and dp.is_published
    returning dp.deal_id, dp.is_published
  ),
  audited as (
    insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, summary, metadata)
    select null, 'preview.unpublish'::text, 'deal_preview'::text, f.deal_id::text,
      'Unpublished stale preview for deal '::text || f.deal_id::text,
      pg_catalog.jsonb_build_object('actor'::text, 'system:ingest-open'::text, 'run_id'::text, p_run_id)
    from flipped f
    where not f.is_published
    returning id
  )
  select pg_catalog.jsonb_build_object(
    'selected'::text, (select count(*)::int from doomed),
    'unpublished'::text, (select count(*)::int from audited)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.unpublish_stale_previews(text) from public, anon, authenticated;
grant execute on function public.unpublish_stale_previews(text) to service_role;

comment on function public.unpublish_stale_previews(text) is
  'Does not unpublish a row only because its deadline is under 24 hours away, or because its slug is non-template or retired. Those checks gate first publication. OPEN and CLOSING_SOON still come down once the deadline is null or past. UPCOMING with a null deadline stays published: a missing date is an unknown window, not a passed one. UPCOMING with a past deadline comes down.';


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
  p_sort text default 'biddable',
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
  with viewer as (
    select cp.id as company_profile_id
    from public.company_profiles cp
    where cp.user_id = auth.uid()
    limit 1
  ),
  q as (
    select nullif(btrim(left(coalesce(p_query, ''), 200)), '') as text
  ),
  ranked as (
    select
      dp.*,
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
      and (p_min_score is null or coalesce(dm.relevance_score, -1) >= p_min_score)
      and (
        q.text is null
        or to_tsvector('english'::regconfig, coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
             @@ websearch_to_tsquery('english'::regconfig, q.text)
      )
  )
  select
    r.slug,
    r.preview_title,
    r.preview_summary,
    r.deal_type,
    r.buyer_sector,
    r.stage,
    r.status,
    r.main_category,
    r.broad_region,
    r.value_band,
    r.deadline_band,
    r.duration_band,
    r.sme_suitability,
    r.bid_complexity,
    r.competition_level,
    private.preview_dto_requirements(r.requirements_preview),
    r.relevance_tags[1:12],
    private.preview_freshness_label(r.created_at, r.updated_at),
    r.match_score,
    private.preview_dto_reasons(r.match_reasons),
    count(*) over ()
  from ranked r
  order by
    case when lower(coalesce(p_sort, 'biddable')) = 'relevance' then coalesce(r.match_score, -1) else 0 end desc,
    case
      when lower(coalesce(p_sort, 'biddable')) = 'biddable' and r.status = 'CLOSING_SOON'::public.deal_status then 0
      when lower(coalesce(p_sort, 'biddable')) = 'biddable' and r.status = 'OPEN'::public.deal_status then 1
      when lower(coalesce(p_sort, 'biddable')) = 'biddable' and r.status = 'UPCOMING'::public.deal_status then 2
      when lower(coalesce(p_sort, 'biddable')) = 'biddable' then 3
      else 0
    end asc,
    case
      when lower(coalesce(p_sort, 'biddable')) in ('biddable', 'deadline') then (
        select d.submission_deadline
        from public.deals d
        where d.id = r.deal_id
      )
    end asc nulls last,
    case when lower(coalesce(p_sort, 'biddable')) = 'relevance' then r.query_rank else 0 end desc,
    r.updated_at desc,
    r.slug
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;

