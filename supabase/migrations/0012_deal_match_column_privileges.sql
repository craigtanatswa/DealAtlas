-- DealAtlas migration 0012
-- Table-level SELECT on deal_matches includes every column, so a column
-- REVOKE does not hide detail_reasons. Grant only preview-safe columns.

revoke select on table public.deal_matches from anon, authenticated;

grant select (
  id,
  company_profile_id,
  deal_id,
  relevance_score,
  category_score,
  keyword_score,
  location_score,
  value_score,
  sector_score,
  certification_score,
  semantic_score,
  preview_reasons,
  calculated_at
) on table public.deal_matches to authenticated;

grant all on table public.deal_matches to service_role;
