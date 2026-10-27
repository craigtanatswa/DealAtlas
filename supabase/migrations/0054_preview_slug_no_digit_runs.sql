-- Keep private.preview_slug_is_template in lockstep with
-- sanitisedTitleFragment + buildPreviewSlug (lib/deals/public-slug.ts).
-- Public slugs must never carry an 8+ digit run from the title (CPV / notice
-- ids). New suffixes are opaque non-all-digit hex (enforced in TypeScript);
-- this function still accepts any 8-hex suffix so legacy rows can be classified.

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
                pg_catalog.regexp_replace(
                  pg_catalog.normalize(pg_catalog.lower(coalesce(p_title, ''::text)), 'NFKD'::text),
                  U&'[\0300-\036F]'::text, ''::text, 'g'::text
                ),
                '\d{8,}'::text, ''::text, 'g'::text
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

comment on function private.preview_slug_is_template(text, text, uuid) is
  'True when slug is sanitised title fragment plus 8 hex that is not the deal-id prefix. Title fragment drops 8+ digit runs.';
