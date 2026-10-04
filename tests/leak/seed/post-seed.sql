-- Leak-probe post-seed (spec 2.6, 2.8).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -v outcome_path=.leak/seed-outcome.json -f tests/leak/seed/post-seed.sql
--
-- 1. E1 was published LOW with alerts; an admin now holds it.
-- 2. Writes seed-outcome.json: per row, the gate outcome and the finding codes
--    from private.preview_leak_findings (report-only).

\set ON_ERROR_STOP on

update public.deal_previews
set unpublished_by_admin = true
where deal_id = '5eed0000-0000-4000-8000-0000000000e1';

\t on
\a
\o :outcome_path
select jsonb_pretty(coalesce(jsonb_agg(row_to_json(o)::jsonb order by o.deal_id), '[]'::jsonb))
from (
  select
    dp.deal_id,
    dp.slug,
    dp.is_published,
    dp.leakage_risk,
    dp.unpublished_by_admin,
    exists (select 1 from private.preview_holds h where h.deal_id = dp.deal_id) as held,
    coalesce((
      select array_agg(distinct f.finding_code order by f.finding_code)
      from private.preview_leak_findings(dp.deal_id, dp.slug, dp.preview_title, dp.preview_summary,
                                         dp.requirements_preview, dp.relevance_tags, dp.broad_region) f
    ), '{}') as finding_codes
  from public.deal_previews dp
  where dp.deal_id::text like '5eed0000-%'
) o;
\o
