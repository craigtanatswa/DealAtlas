-- Enabled sources with OPEN_LICENSE, PERMISSION_GRANTED or silent UNKNOWN
-- terms may publish. Access method is not a publish gate.
-- PROHIBITED and disabled sources stay excluded.
-- OPEN and CLOSING_SOON may have a null submission_deadline. A non-null
-- deadline must be more than 24 hours away on first publish, and must not
-- be in the past. A null deadline is not unpublished.
-- UPCOMING PLANNING is allowed from any compliant source. EARLY, AWARD,
-- CONTRACT and other stages stay unpublishable.

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
            and s.reuse_status in (
              'OPEN_LICENSE'::public.reuse_status,
              'PERMISSION_GRANTED'::public.reuse_status,
              'UNKNOWN'::public.reuse_status
            )
            and s.reuse_status <> 'PROHIBITED'::public.reuse_status
        ) then 'source'
        when not (
          dp.status = d.status
          and (
            (
              d.status in ('OPEN', 'CLOSING_SOON')
              and d.stage = 'LIVE'
              and dp.stage = 'LIVE'
            )
            or (
              d.status = 'UPCOMING'
              and d.stage = 'PLANNING'
              and dp.stage = 'PLANNING'
            )
          )
        ) then 'status'
        -- A null deadline is unknown, not expired, for OPEN, CLOSING_SOON and
        -- UPCOMING. A non-null OPEN or CLOSING_SOON deadline must be more than
        -- 24 hours away. A non-null UPCOMING deadline must still be in the
        -- future. An expired deadline is never published.
        when d.submission_deadline is not null
          and (
            (
              d.status is distinct from 'UPCOMING'::public.deal_status
              and d.submission_deadline <= pg_catalog.now() + interval '24 hours'
            )
            or (
              d.status = 'UPCOMING'::public.deal_status
              and d.submission_deadline <= pg_catalog.now()
            )
          )
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
          d.submission_deadline is not null
          and d.submission_deadline <= pg_catalog.now()
        )
        or d.status is distinct from dp.status
        or d.stage is distinct from dp.stage
        or not exists (
          select 1 from public.data_sources s
          where s.id = d.primary_source_id
            and s.enabled
            and s.reuse_status in (
              'OPEN_LICENSE'::public.reuse_status,
              'PERMISSION_GRANTED'::public.reuse_status,
              'UNKNOWN'::public.reuse_status
            )
            and s.reuse_status <> 'PROHIBITED'::public.reuse_status
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
  'Does not unpublish a row only because its deadline is under 24 hours away, null, or because its slug is non-template or retired. Those checks gate first publication, except a null deadline which stays publishable. OPEN, CLOSING_SOON and UPCOMING come down once a non-null deadline is in the past. EARLY, AWARD and CONTRACT stages come down. A disabled or PROHIBITED source comes down. UNKNOWN terms stay up when the source is enabled.';
