-- DealAtlas migration 0041
-- ProContract-family council portals. Represented and disabled.
-- No licence is documented. Scraping is not permitted. Live fetch stays off.
-- Follows 0030 on main. Open pull requests reserve 0026, 0027, 0031-0033 and 0040.

insert into private.leak_gate_terms (kind, term)
values
  ('source_platform', 'east mids tenders'),
  ('source_platform', 'essex procontract'),
  ('source_platform', 'kent business portal'),
  ('source_platform', 'source leicestershire')
on conflict (kind, term) do nothing;

insert into public.data_sources (
  source_key,
  name,
  source_type,
  access_method,
  base_url,
  api_url,
  licence_name,
  licence_url,
  terms_url,
  reuse_status,
  scraping_permitted,
  enabled,
  schedule_expression,
  rate_limit_per_minute,
  robots_checked_at,
  terms_checked_at,
  compliance_notes
)
values
  (
    'the-chest',
    'The Chest',
    'PROCUREMENT_PLATFORM',
    'HTML',
    'https://procontract.due-north.com/Opportunities/portal/thechest',
    null,
    null,
    null,
    'https://procontract.due-north.com/SiteInformation/TermsAndConditions',
    'PROHIBITED',
    false,
    false,
    null,
    6,
    timestamptz '2026-10-14T00:00:00Z',
    timestamptz '2026-10-14T00:00:00Z',
    'ProContract terms forbid copying the system and limit issued material to the procurement activity. robots.txt does not disallow the path. Explicit reuse ban: no fetcher. See docs/SOURCE_COMPLIANCE_REPORT.md.'
  ),
  (
    'kent-business-portal',
    'Kent Business Portal',
    'PROCUREMENT_PLATFORM',
    'HTML',
    'https://www.kentbusinessportal.org.uk/',
    null,
    null,
    null,
    'https://www.kentbusinessportal.org.uk/terms-and-conditions/',
    'PROHIBITED',
    false,
    false,
    null,
    6,
    timestamptz '2026-10-14T00:00:00Z',
    timestamptz '2026-10-14T00:00:00Z',
    'BiP Delta terms forbid robots, page-scraping and redistribution. robots.txt is 404. Explicit ban: no fetcher. See docs/SOURCE_COMPLIANCE_REPORT.md.'
  ),
  (
    'source-leicestershire',
    'Source Leicestershire',
    'PROCUREMENT_PLATFORM',
    'HTML',
    'https://procontract.due-north.com/Opportunities/portal/eastmidstenders',
    null,
    null,
    null,
    'https://procontract.due-north.com/SiteInformation/TermsAndConditions',
    'PROHIBITED',
    false,
    false,
    null,
    6,
    timestamptz '2026-10-14T00:00:00Z',
    timestamptz '2026-10-14T00:00:00Z',
    'East Mids Tenders uses the ProContract terms, which forbid copying the system and limit issued material to the procurement activity. Explicit reuse ban: no fetcher. See docs/SOURCE_COMPLIANCE_REPORT.md.'
  ),
  (
    'essex-procontract',
    'Essex ProContract',
    'PROCUREMENT_PLATFORM',
    'HTML',
    'https://www.essex.gov.uk/business/doing-business-council/information-suppliers/find-and-bid-contract',
    null,
    null,
    null,
    'https://procontract.due-north.com/SiteInformation/TermsAndConditions',
    'UNKNOWN',
    false,
    false,
    null,
    6,
    timestamptz '2026-10-14T00:00:00Z',
    timestamptz '2026-10-14T00:00:00Z',
    'Terms that were readable do not explicitly ban scraping or commercial reuse. Open returned HTTP 403. No stable public ProContract portal slug. Seeded UNKNOWN and disabled. Live fetch stays off. See docs/SOURCE_COMPLIANCE_REPORT.md.'
  )
on conflict (source_key) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  access_method = excluded.access_method,
  base_url = excluded.base_url,
  api_url = excluded.api_url,
  licence_name = excluded.licence_name,
  licence_url = excluded.licence_url,
  terms_url = excluded.terms_url,
  reuse_status = excluded.reuse_status,
  scraping_permitted = excluded.scraping_permitted,
  enabled = excluded.enabled,
  schedule_expression = excluded.schedule_expression,
  rate_limit_per_minute = excluded.rate_limit_per_minute,
  robots_checked_at = excluded.robots_checked_at,
  terms_checked_at = excluded.terms_checked_at,
  compliance_notes = excluded.compliance_notes,
  updated_at = now();
