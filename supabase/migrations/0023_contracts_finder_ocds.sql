-- DealAtlas migration 0023
-- Contracts Finder official OCDS Search feed. Follows 0022, which adds UNCLASSIFIED.

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
  terms_checked_at,
  compliance_notes
)
values (
  'contracts-finder',
  'Contracts Finder',
  'GOVERNMENT_OPEN_DATA',
  'OCDS_API',
  'https://www.contractsfinder.service.gov.uk/',
  'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search',
  'Open Government Licence v3.0',
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  'OPEN_LICENSE',
  false,
  true,
  '0 */6 * * *',
  10,
  timestamptz '2026-10-12T00:00:00Z',
  'Official OCDS Search feed only. Owner approved Open Government Licence v3.0 for this feed. Do not scrape the website HTML. Polite rate limit; back off on HTTP 429 using Retry-After. Ingestion is preserve-only and must not publish previews.'
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
  terms_checked_at = excluded.terms_checked_at,
  compliance_notes = excluded.compliance_notes,
  updated_at = now();
