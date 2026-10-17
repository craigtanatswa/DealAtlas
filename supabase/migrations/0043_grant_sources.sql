-- DealAtlas migration 0043 (renumbered from 0033)
-- Find a Grant and Innovate UK funding competitions.
-- Grants use deal_type GRANT. Both sources stay disabled: the Open Government
-- Licence covers reuse, and the terms do not explicitly allow scraping.

alter type public.deal_type add value if not exists 'GRANT';

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
    'find-a-grant',
    'Find a Grant',
    'GOVERNMENT_WEB',
    'HTML',
    'https://find-government-grants.service.gov.uk/',
    'https://find-government-grants.service.gov.uk/grants',
    'Open Government Licence v3.0',
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    'https://find-government-grants.service.gov.uk/info/terms-and-conditions',
    'OPEN_LICENSE',
    false,
    false,
    '0 6 * * *',
    10,
    timestamptz '2026-10-14T00:00:00Z',
    timestamptz '2026-10-14T00:00:00Z',
    'Public grant list under the Open Government Licence v3.0. robots.txt is HTTP 404 with no Disallow. Terms do not explicitly allow scraping, so this source stays disabled. Preserve-only. Do not send source identity to free users.'
  ),
  (
    'innovate-uk',
    'Innovate UK funding competitions',
    'GOVERNMENT_WEB',
    'HTML',
    'https://apply-for-innovation-funding.service.gov.uk/',
    'https://apply-for-innovation-funding.service.gov.uk/competition/search',
    'Open Government Licence v3.0',
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    'https://apply-for-innovation-funding.service.gov.uk/info/terms-and-conditions',
    'OPEN_LICENSE',
    false,
    false,
    '0 6 * * *',
    10,
    timestamptz '2026-10-14T00:00:00Z',
    timestamptz '2026-10-14T00:00:00Z',
    'Public Innovation Funding Service competition search under the Open Government Licence v3.0. robots.txt redirects to login, so no Disallow is published. Terms do not explicitly allow scraping, so this source stays disabled. Preserve-only. Do not send source identity to free users.'
  ),
  (
    'etendersni',
    'eTendersNI',
    'GOVERNMENT_WEB',
    'HTML',
    'https://etendersni.gov.uk/',
    null,
    null,
    null,
    'https://etendersni.gov.uk/epps/home.do',
    'PROHIBITED',
    false,
    false,
    null,
    null,
    timestamptz '2026-10-14T00:00:00Z',
    timestamptz '2026-10-14T00:00:00Z',
    'BLOCKED. Prior research found a Cloudflare/WAF challenge and no API. Do not attempt to get past the challenge. No fetcher. The opportunity search also presents an image CAPTCHA. Copyright is European Dynamics, not an open licence.'
  ),
  (
    'ukri-funding-finder',
    'UKRI Funding Finder',
    'GOVERNMENT_WEB',
    'HTML',
    'https://www.ukri.org/opportunity/',
    null,
    null,
    null,
    'https://www.ukri.org/who-we-are/terms-of-use/',
    'PROHIBITED',
    false,
    false,
    null,
    null,
    timestamptz '2026-10-14T00:00:00Z',
    timestamptz '2026-10-14T00:00:00Z',
    'Excluded. UKRI terms of use forbid electronic reproduction for commercial purposes without prior written permission. No fetcher.'
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

insert into private.leak_gate_terms (kind, term) values
  ('source_platform', 'apply-for-innovation-funding'),
  ('source_platform', 'find a grant'),
  ('source_platform', 'find-a-grant'),
  ('source_platform', 'find-government-grants'),
  ('source_platform', 'innovation funding service'),
  ('source_platform', 'innovate uk'),
  ('source_platform', 'innovate uk funding competitions'),
  ('source_platform', 'ukri funding finder'),
  ('source_platform', 'ukri.org')
on conflict (kind, term) do nothing;
