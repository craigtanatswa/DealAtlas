-- Legacy public slugs must not resolve. A deal-id 8-hex suffix and an older
-- title slug with no 8-hex suffix are not served. Unknown /deals paths are
-- rejected in the app proxy before the loading shell can answer 200.

create or replace function private.preview_slug_is_legacy(p_slug text, p_deal_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_slug is null
    or substring(p_slug from '-([0-9a-fA-F]{8})$') is null
    or lower(substring(p_slug from '-([0-9a-fA-F]{8})$'))
      = lower(pg_catalog.left(pg_catalog.replace(p_deal_id::text, '-'::text, ''::text), 8));
$$;

revoke all on function private.preview_slug_is_legacy(text, uuid) from public, anon, authenticated, service_role;

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
  left join public.company_profiles cp on cp.user_id = auth.uid()
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

create or replace function public.resolve_preview_deal_id(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select dp.deal_id
  from public.deal_previews dp
  where auth.uid() is not null
    and length(coalesce(p_slug, '')) between 1 and 200
    and dp.slug = p_slug
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
    and not private.preview_slug_is_legacy(dp.slug, dp.deal_id)
  limit 1;
$$;

revoke all on function public.get_preview_dto_by_slug(text) from public;
grant execute on function public.get_preview_dto_by_slug(text) to anon, authenticated, service_role;

revoke all on function public.resolve_preview_deal_id(text) from public, anon;
grant execute on function public.resolve_preview_deal_id(text) to authenticated, service_role;
