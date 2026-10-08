-- Service-role publish of eligible previews, and unpublish of stale ones.
-- Both functions return counts only. They do not enqueue match jobs.

create table if not exists private.publish_denylist (
  deal_id uuid primary key,
  reason text,
  added_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.publish_denylist from public, anon, authenticated, service_role;

alter table public.admin_audit_events alter column actor_id drop not null;

comment on column public.admin_audit_events.actor_id is
  'Admin profile when a person did it. Null is the system publish job.';

-- isTemplatePreviewSlug (lib/deals/public-slug.ts). A suffix equal to the
-- first 8 hex characters of the deal id is rejected.
create or replace function private.preview_slug_is_template(
  p_slug text,
  p_title text,
  p_deal_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    hex.h is not null
    and p_deal_id is not null
    and hex.h <> pg_catalog.left(pg_catalog.replace(p_deal_id::text, '-'::text, ''::text), 8)
    and p_slug = frag.f || '-'::text || hex.h
  from (
    select pg_catalog.lower((pg_catalog.regexp_match(p_slug, '-([0-9a-fA-F]{8})$'::text))[1]) as h
  ) hex
  cross join lateral (
    select case when cleaned = ''::text then 'opportunity'::text else cleaned end as f
    from (
      select pg_catalog.regexp_replace(
        pg_catalog.left(
          pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.regexp_replace(
                pg_catalog.normalize(pg_catalog.lower(coalesce(p_title, ''::text)), 'NFKD'::text),
                U&'[\0300-\036F]'::text, ''::text, 'g'::text
              ),
              '[^a-z0-9]+'::text, '-'::text, 'g'::text
            ),
            '^-+|-+$'::text, ''::text, 'g'::text
          ),
          48
        ),
        '-+$'::text, ''::text
      ) as cleaned
    ) raw
  ) frag;
$$;

revoke all on function private.preview_slug_is_template(text, text, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.publish_eligible_previews(p_cap integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap integer := least(500, greatest(1, coalesce(p_cap, 300)));
  v_result jsonb;
begin
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
            and s.reuse_status in ('OPEN_LICENSE', 'PERMISSION_GRANTED', 'LICENSED', 'TERMS_REVIEWED')
        ) then 'source'
        when not (
          (
            d.status in ('OPEN', 'CLOSING_SOON')
            or (d.status = 'UPCOMING' and d.submission_deadline is not null)
          )
          and dp.status = d.status
          and dp.stage = d.stage
        ) then 'status'
        when d.submission_deadline is null
          or d.submission_deadline <= pg_catalog.now() + interval '24 hours'
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
    insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, summary)
    select null, 'preview.publish'::text, 'deal_preview'::text, f.deal_id::text,
      'Published LOW-risk preview for deal '::text || f.deal_id::text
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

revoke all on function public.publish_eligible_previews(integer) from public, anon, authenticated;
grant execute on function public.publish_eligible_previews(integer) to service_role;

create or replace function public.unpublish_stale_previews()
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
        (d.submission_deadline is not null and d.submission_deadline <= pg_catalog.now())
        or d.status in ('AWARDED', 'CANCELLED', 'CLOSED', 'EXPIRED')
        or dp.status in ('AWARDED', 'CANCELLED', 'CLOSED', 'EXPIRED')
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
    insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, summary)
    select null, 'preview.unpublish'::text, 'deal_preview'::text, f.deal_id::text,
      'Unpublished stale preview for deal '::text || f.deal_id::text
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

revoke all on function public.unpublish_stale_previews() from public, anon, authenticated;
grant execute on function public.unpublish_stale_previews() to service_role;
