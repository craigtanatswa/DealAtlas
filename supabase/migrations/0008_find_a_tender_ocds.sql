-- DealAtlas migration 0008
-- Record the official Find a Tender OCDS API endpoint and licence metadata.

update public.data_sources
set
  api_url = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages',
  licence_name = 'Open Government Licence v3.0',
  licence_url = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  terms_url = 'https://www.find-tender.service.gov.uk/Developer/Documentation',
  schedule_expression = '0 */6 * * *',
  rate_limit_per_minute = 20,
  terms_checked_at = timestamptz '2026-09-14T00:00:00Z',
  compliance_notes = 'Official OCDS release-package API (v1.0, OCDS 1.1.5). Notice data is published under the Open Government Licence. Do not scrape HTML when the OCDS API is available. Site-root robots.txt returned HTTP 404 on 2026-09-14; ingestion uses the documented public API, not HTML crawling.',
  updated_at = now()
where source_key = 'find-a-tender';
