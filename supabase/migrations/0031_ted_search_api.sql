-- DealAtlas migration 0031
-- TED Search API v3. Disabled until an operator turns the source on.

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
  rate_limit_per_minute,
  terms_checked_at,
  compliance_notes
)
values (
  'ted',
  'Tenders Electronic Daily',
  'GOVERNMENT_OPEN_DATA',
  'JSON_API',
  'https://ted.europa.eu/',
  'https://api.ted.europa.eu/v3/notices/search',
  'Commission Decision 2011/833/EU',
  'https://ted.europa.eu/en/legal-notice',
  'https://ted.europa.eu/en/news/fair-usage-policy-on-ted',
  'OPEN_LICENSE',
  false,
  false,
  10,
  timestamptz '2026-10-14T00:00:00Z',
  'Official TED Search API v3 (POST https://api.ted.europa.eu/v3/notices/search). No API key. Do not scrape HTML. Do not download notice XML or PDF. Licence: https://ted.europa.eu/en/legal-notice under Commission Decision 2011/833/EU. Procurement notices may be reused, including commercially. Attribution: credit the European Union, source Tenders Electronic Daily (TED), Publications Office of the European Union. Do not use the TED logo. Expert-search fields: notice-type (cn-standard, cn-social, pin-cfc-standard, pin-cfc-social, cn-desg), procedure-type (open, restricted, neg-w-call, comp-dial, innovation; design contests included when procedure-type is absent), submission-language = ENG, deadline-receipt-request on or after the run date with a row check that the deadline is still in the future, place-of-performance in the EU-27 or anyw-eea. publication-date is only the ingest window. UK notices stay on Find a Tender. Rate limit 10 requests per minute, under the published 700 requests per minute fair-use cap. Ingestion is preserve-only and must not publish previews. Disabled by default.'
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
  rate_limit_per_minute = excluded.rate_limit_per_minute,
  terms_checked_at = excluded.terms_checked_at,
  compliance_notes = excluded.compliance_notes,
  updated_at = now();
