-- DealAtlas migration 0006
-- Minimal reference seed data. Real opportunity data is ingested, not hard-coded.

insert into public.categories (slug, name, description)
values
  ('technology', 'Technology', 'Software, cloud, cyber security, telecoms, data and IT services'),
  ('professional-services', 'Professional Services', 'Consulting, legal, accounting, research and advisory services'),
  ('construction-infrastructure', 'Construction & Infrastructure', 'Construction, civil works, engineering and infrastructure supply chain'),
  ('facilities-property', 'Facilities & Property', 'Facilities management, maintenance, cleaning, security and property services'),
  ('healthcare', 'Healthcare', 'Healthcare goods, services, equipment and digital health'),
  ('education', 'Education', 'Education services, technology, training and supplies'),
  ('transport-logistics', 'Transport & Logistics', 'Freight, fleet, transport, warehousing and logistics'),
  ('manufacturing-industrial', 'Manufacturing & Industrial', 'Machinery, industrial supplies, manufacturing and plant'),
  ('marketing-creative', 'Marketing & Creative', 'Advertising, communications, media, design and events'),
  ('food-catering', 'Food & Catering', 'Food supply, catering and hospitality services'),
  ('energy-utilities', 'Energy & Utilities', 'Energy, water, utilities, renewables and environmental services'),
  ('office-business-supplies', 'Office & Business Supplies', 'Furniture, stationery, uniforms and general business supplies'),
  ('other', 'Other', 'Opportunities that do not yet map to another DealAtlas category')
on conflict (slug) do nothing;

-- Find a Tender is seeded as an official open-data/API source.
-- Verify the current endpoint and licence details in adapter implementation before first production run.
insert into public.data_sources (
  source_key,
  name,
  source_type,
  access_method,
  base_url,
  licence_name,
  licence_url,
  terms_url,
  reuse_status,
  scraping_permitted,
  enabled,
  compliance_notes
)
values (
  'find-a-tender',
  'Find a Tender',
  'GOVERNMENT_OPEN_DATA',
  'OCDS_API',
  'https://www.find-tender.service.gov.uk/',
  'Open Government Licence',
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  'https://www.find-tender.service.gov.uk/Developer/Documentation',
  'OPEN_LICENSE',
  false,
  true,
  'Use official OCDS/API mechanisms. Do not scrape HTML when an official data interface is available.'
)
on conflict (source_key) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  access_method = excluded.access_method,
  base_url = excluded.base_url,
  licence_name = excluded.licence_name,
  licence_url = excluded.licence_url,
  terms_url = excluded.terms_url,
  reuse_status = excluded.reuse_status,
  compliance_notes = excluded.compliance_notes;

-- Disabled template to make the private-source compliance workflow explicit.
insert into public.data_sources (
  source_key,
  name,
  source_type,
  access_method,
  reuse_status,
  scraping_permitted,
  enabled,
  compliance_notes
)
values (
  'private-source-template',
  'Private Source Template - DO NOT ENABLE',
  'PRIVATE_COMPANY_WEB',
  'HTML',
  'UNKNOWN',
  false,
  false,
  'Duplicate/configure this only after terms, robots/access rules and reuse permission are reviewed.'
)
on conflict (source_key) do nothing;
