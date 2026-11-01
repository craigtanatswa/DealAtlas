-- Stage 2 private discovery adds only observability columns and leak vocabulary.
-- Candidate and source rows remain service-role-only behind Stage 1 RLS.

alter table public.discovered_source_candidates
  add column discovery_channel text not null default 'UNKNOWN',
  add column blocked_reason text,
  add constraint discovered_source_candidates_discovery_channel
    check (discovery_channel in ('SEARCH', 'CRAWL', 'UNKNOWN'));

create index discovered_source_candidates_channel_idx
  on public.discovered_source_candidates (discovery_channel, discovered_at desc);

create index discovered_source_candidates_blocked_idx
  on public.discovered_source_candidates (domain, discovered_at desc)
  where blocked_reason is not null;

insert into private.leak_gate_terms (kind, term)
values
  ('source_platform', 'achilles'),
  ('source_platform', 'achilles.com'),
  ('source_platform', 'build uk'),
  ('source_platform', 'builduk.org'),
  ('source_platform', 'chartered institute of procurement and supply'),
  ('source_platform', 'cips'),
  ('source_platform', 'cips.org'),
  ('source_platform', 'contractsfinder.service.gov.uk'),
  ('source_platform', 'constructionline.co.uk'),
  ('source_platform', 'crowncommercial.gov.uk'),
  ('source_platform', 'energy uk'),
  ('source_platform', 'energy-uk.org.uk'),
  ('source_platform', 'energyuk'),
  ('source_platform', 'hs2'),
  ('source_platform', 'hs2.org.uk'),
  ('source_platform', 'make uk'),
  ('source_platform', 'makeuk.org'),
  ('source_platform', 'national grid'),
  ('source_platform', 'nationalgrid.com'),
  ('source_platform', 'network rail'),
  ('source_platform', 'networkrail.co.uk'),
  ('source_platform', 'publiccontractsscotland.gov.uk'),
  ('source_platform', 'rail forum'),
  ('source_platform', 'railforum.uk'),
  ('source_platform', 'sell2wales.gov.wales'),
  ('source_platform', 'supplychain.nhs.uk'),
  ('source_platform', 'techuk'),
  ('source_platform', 'techuk.org'),
  ('source_platform', 'thames water'),
  ('source_platform', 'thameswater.co.uk'),
  ('source_platform', 'united utilities'),
  ('source_platform', 'unitedutilities.com')
on conflict (kind, term) do nothing;

comment on column public.discovered_source_candidates.discovery_channel is
  'SEARCH results, CRAWL portal links, or UNKNOWN for Stage 1 rows.';
comment on column public.discovered_source_candidates.blocked_reason is
  'Compliance or access block recorded instead of bypassing the source.';
