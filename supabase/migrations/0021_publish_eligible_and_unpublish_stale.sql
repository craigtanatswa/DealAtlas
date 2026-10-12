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

drop function if exists public.publish_eligible_previews(integer);
drop function if exists public.publish_eligible_previews(integer, text);

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
              and d.submission_deadline is not null
              and exists (
                select 1 from public.data_sources s
                where s.id = d.primary_source_id
                  and s.source_key in ('find-a-tender'::text, 'contracts-finder'::text)
              )
            )
          )
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
        d.submission_deadline is null
        or d.submission_deadline <= pg_catalog.now()
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
  'Does not unpublish a row only because its deadline is under 24 hours away, or because its slug is non-template or retired. Those checks gate first publication. A published row still comes down once its deadline is null or past.';

-- One-time launch release. Revoked from every API role. The migration calls it once.
create or replace function private.launch_release_holds()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released integer;
  v_holds integer;
begin
  drop table if exists pg_temp.launch_release_0021;
  create temp table launch_release_0021 (
    deal_id uuid primary key
  ) on commit drop;

  insert into launch_release_0021 (deal_id)
  select dp.deal_id
  from public.deal_previews dp
  where dp.is_published = false
    and dp.leakage_risk = 'LOW'::public.leakage_risk
    and (
      dp.unpublished_by_admin
      or exists (
        select 1 from private.preview_holds h where h.deal_id = dp.deal_id
      )
    )
    and not exists (
      select 1 from private.publish_denylist x where x.deal_id = dp.deal_id
    )
    and private.preview_slug_is_template(dp.slug, dp.preview_title, dp.deal_id)
    and private.detect_preview_leakage(
      dp.deal_id,
      dp.slug,
      dp.preview_title,
      dp.preview_summary,
      dp.requirements_preview,
      dp.relevance_tags,
      dp.broad_region
    ) = 'LOW'::public.leakage_risk;

  select count(*)::int into v_released from launch_release_0021;

  delete from private.preview_holds h
  where h.deal_id in (select r.deal_id from launch_release_0021 r);
  get diagnostics v_holds = row_count;

  update public.deal_previews dp
  set unpublished_by_admin = false,
      is_published = false,
      updated_at = pg_catalog.now()
  where dp.deal_id in (select r.deal_id from launch_release_0021 r);

  if v_released > 0 then
    insert into public.admin_audit_events (actor_id, action, entity_type, entity_id, summary, metadata)
    values (
      null,
      'preview.release_hold'::text,
      'deal_preview'::text,
      null,
      'Released launch holds'::text,
      pg_catalog.jsonb_build_object(
        'actor'::text, 'system:migration-0021'::text,
        'batch'::text, 'launch-release-0021'::text,
        'released'::text, v_released,
        'holds_deleted'::text, v_holds
      )
    );
  end if;
end;
$$;

revoke all on function private.launch_release_holds() from public, anon, authenticated, service_role;

-- Idempotent. Missing deals are skipped, so an empty CI database inserts nothing.
insert into private.publish_denylist (deal_id, reason)
select d.id, 'launch HIGH/REVIEW (run 37448172031)'::text
from public.deals d
where d.id in (
  '4114445b-a7c8-4293-a104-b5751983f664'::uuid,
  '54d7643d-4e3e-4677-98df-4c8eac6959bf'::uuid,
  '63152b92-3f61-41b7-b0dc-68c47e40d266'::uuid,
  '7f69c1c0-23bd-4bca-9cf1-a4984fe29854'::uuid,
  'a0883a86-d5ae-4ebc-9b53-d748becb19b7'::uuid,
  'c3452e4e-7d15-4256-a24d-b380e270977a'::uuid,
  'd3e4b2ca-a04d-47de-9a95-5365361a9f94'::uuid,
  'f40d336e-8bba-4dd8-b0d3-ff4230091ff2'::uuid,
  '09e3c3da-6584-4f2b-b4af-b5a97475b9f1'::uuid,
  '1e04744f-2290-4ca5-abb7-ae4b9d159ef8'::uuid,
  '274d3b83-06f9-4737-ab7a-d26949308872'::uuid,
  '56aa201f-ce47-466c-a712-db2fcf8e36c0'::uuid,
  '59a8d51e-58eb-45c5-8db5-aa7ac3bde330'::uuid,
  '8e85de94-d4b1-49be-abb1-3ebd9ae218e8'::uuid,
  'ee22cd36-6c47-4333-b805-caf1063a8e2b'::uuid,
  'f3b89abf-cf61-46d1-bb89-7beb4b6b544f'::uuid
)
on conflict (deal_id) do nothing;

select private.launch_release_holds();
