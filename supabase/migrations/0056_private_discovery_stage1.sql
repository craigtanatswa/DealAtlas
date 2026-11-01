-- Stage 1 private-opportunity discovery. Sources remain disabled; this migration
-- only adds configuration, candidate review storage, and service-role gates.

alter type public.deal_type add value if not exists 'ITT';
alter type public.deal_type add value if not exists 'SUPPLIER_ONBOARDING';
alter type public.deal_type add value if not exists 'OTHER';

create type public.discovery_method as enum ('RSS', 'HTML', 'JSON');
create type public.candidate_status as enum (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'DUPLICATE',
  'EXPIRED'
);
create type public.market_sector as enum ('PUBLIC', 'PRIVATE', 'MIXED');

comment on type public.candidate_status is
  'Review lifecycle for discovered private opportunities. Only APPROVED candidates may publish.';
comment on type public.market_sector is
  'Derived public/private/mixed market classification.';

alter table public.data_sources
  add column discovery_method public.discovery_method,
  add column parser_type text,
  add column parser_config jsonb not null default '{}'::jsonb,
  add column country text not null default 'GB',
  add column industry text,
  add column crawl_frequency_minutes integer not null default 1440,
  add column last_error text,
  add column opportunities_discovered integer not null default 0,
  add column reliability_score numeric(5,2) not null default 0,
  add column auto_publish boolean not null default false,
  add column auto_publish_min_confidence integer not null default 90,
  add column market_sector public.market_sector generated always as (
    case
      when source_type in (
        'GOVERNMENT_OPEN_DATA'::public.source_type,
        'GOVERNMENT_WEB'::public.source_type
      ) then 'PUBLIC'::public.market_sector
      when source_type in (
        'PRIVATE_COMPANY_WEB'::public.source_type,
        'SUPPLY_CHAIN_PLATFORM'::public.source_type
      ) then 'PRIVATE'::public.market_sector
      else 'MIXED'::public.market_sector
    end
  ) stored;

alter table public.data_sources
  add constraint data_sources_country_format
    check (country ~ '^[A-Z]{2}$'),
  add constraint data_sources_crawl_frequency_positive
    check (crawl_frequency_minutes > 0),
  add constraint data_sources_opportunities_discovered_non_negative
    check (opportunities_discovered >= 0),
  add constraint data_sources_reliability_score_range
    check (reliability_score >= 0 and reliability_score <= 100),
  add constraint data_sources_auto_publish_min_confidence_range
    check (auto_publish_min_confidence >= 0 and auto_publish_min_confidence <= 100),
  add constraint data_sources_parser_config_object
    check (jsonb_typeof(parser_config) = 'object');

comment on column public.data_sources.discovery_method is
  'Set for sources crawled by the generic discovery adapter. Null means an existing fixed adapter.';
comment on column public.data_sources.parser_config is
  'Selectors and feed paths for the generic discovery adapter. Never contains credentials.';
comment on column public.data_sources.auto_publish is
  'Off by default. When true, only APPROVED candidates at or above the confidence floor may auto-publish.';

create table public.discovery_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  normalized_keyword text not null unique,
  enabled boolean not null default true,
  match_count integer not null default 0 check (match_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_keywords_length
    check (char_length(trim(keyword)) between 2 and 120)
);

create table public.discovered_source_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id) on delete cascade,
  url text not null,
  normalized_url text not null,
  domain text,
  title text,
  published_at timestamptz,
  discovered_at timestamptz not null default now(),
  status public.candidate_status not null default 'PENDING_REVIEW',
  confidence integer not null default 0 check (confidence >= 0 and confidence <= 100),
  matched_keywords text[] not null default '{}'::text[],
  content_hash text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, normalized_url)
);

create table public.opportunity_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id) on delete cascade,
  discovered_candidate_id uuid references public.discovered_source_candidates(id)
    on delete set null,
  url text not null,
  raw_record_id uuid references public.raw_records(id) on delete set null,
  content_hash text not null,
  extraction jsonb not null default '{}'::jsonb,
  title text,
  buyer_name text,
  buyer_domain text,
  summary text,
  deadline timestamptz,
  confidence integer not null default 0 check (confidence >= 0 and confidence <= 100),
  opportunity_type public.deal_type,
  is_private boolean not null default true,
  market_sector public.market_sector not null default 'PRIVATE',
  status public.candidate_status not null default 'PENDING_REVIEW',
  reject_reason text,
  dedupe_key text not null,
  merged_deal_id uuid references public.deals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_candidates_extraction_object
    check (jsonb_typeof(extraction) = 'object'),
  unique (source_id, dedupe_key)
);

create table public.deal_source_links (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  source_id uuid not null references public.data_sources(id) on delete cascade,
  candidate_id uuid references public.opportunity_candidates(id) on delete set null,
  url text not null,
  normalized_url text not null,
  link_type text not null default 'DISCOVERED',
  created_at timestamptz not null default now(),
  constraint deal_source_links_link_type
    check (link_type in ('DISCOVERED', 'DUPLICATE', 'MERGED')),
  unique (source_id, normalized_url)
);

create index discovery_keywords_enabled_idx
  on public.discovery_keywords (normalized_keyword)
  where enabled;

create index discovered_source_candidates_review_idx
  on public.discovered_source_candidates (status, discovered_at desc);

create index discovered_source_candidates_source_idx
  on public.discovered_source_candidates (source_id, discovered_at desc);

create index opportunity_candidates_review_idx
  on public.opportunity_candidates (status, confidence desc, created_at desc);

create index opportunity_candidates_source_idx
  on public.opportunity_candidates (source_id, created_at desc);

create index opportunity_candidates_dedupe_idx
  on public.opportunity_candidates (dedupe_key);

create index opportunity_candidates_deal_idx
  on public.opportunity_candidates (merged_deal_id)
  where merged_deal_id is not null;

create index deal_source_links_deal_idx
  on public.deal_source_links (deal_id);

create or replace function private.derive_opportunity_candidate_market_sector()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_sector public.market_sector;
begin
  select s.market_sector
  into v_source_sector
  from public.data_sources s
  where s.id = new.source_id;

  new.market_sector := case
    when new.is_private then 'PRIVATE'::public.market_sector
    when v_source_sector = 'PUBLIC'::public.market_sector then 'PUBLIC'::public.market_sector
    else 'MIXED'::public.market_sector
  end;
  return new;
end;
$$;

revoke all on function private.derive_opportunity_candidate_market_sector()
  from public, anon, authenticated, service_role;

create trigger derive_opportunity_candidate_market_sector
before insert or update of is_private, source_id
on public.opportunity_candidates
for each row execute function private.derive_opportunity_candidate_market_sector();

-- Approved discovery candidates are a hard pre-condition for first
-- publication. Existing fixed-adapter sources are unaffected.
create or replace function private.enforce_discovery_candidate_publish_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_discovery public.discovery_method;
  v_approved boolean;
begin
  select s.discovery_method
  into v_discovery
  from public.deals d
  join public.data_sources s on s.id = d.primary_source_id
  where d.id = new.deal_id;

  if v_discovery is null then
    return new;
  end if;

  select exists (
    select 1
    from public.opportunity_candidates c
    where c.merged_deal_id = new.deal_id
      and c.status = 'APPROVED'::public.candidate_status
      and c.opportunity_type is distinct from 'SUPPLIER_ONBOARDING'::public.deal_type
  )
  into v_approved;

  if new.is_published and not v_approved then
    new.is_published := false;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_discovery_candidate_publish_gate()
  from public, anon, authenticated, service_role;

create trigger enforce_discovery_candidate_publish_gate
before insert or update of is_published
on public.deal_previews
for each row execute function private.enforce_discovery_candidate_publish_gate();

create or replace function private.unpublish_rejected_discovery_candidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.merged_deal_id is not null
    and (
      new.status in (
        'REJECTED'::public.candidate_status,
        'DUPLICATE'::public.candidate_status,
        'EXPIRED'::public.candidate_status
      )
      or new.opportunity_type = 'SUPPLIER_ONBOARDING'::public.deal_type
    )
  then
    update public.deal_previews dp
    set is_published = false,
        updated_at = now()
    where dp.deal_id = new.merged_deal_id
      and dp.is_published;
  end if;
  return new;
end;
$$;

revoke all on function private.unpublish_rejected_discovery_candidate()
  from public, anon, authenticated, service_role;

create trigger unpublish_rejected_discovery_candidate
after update of status, opportunity_type
on public.opportunity_candidates
for each row execute function private.unpublish_rejected_discovery_candidate();

alter table public.discovery_keywords enable row level security;
alter table public.discovered_source_candidates enable row level security;
alter table public.opportunity_candidates enable row level security;
alter table public.deal_source_links enable row level security;

revoke all on table public.discovery_keywords from public, anon, authenticated;
revoke all on table public.discovered_source_candidates from public, anon, authenticated;
revoke all on table public.opportunity_candidates from public, anon, authenticated;
revoke all on table public.deal_source_links from public, anon, authenticated;

grant select, insert, update, delete on table public.discovery_keywords to service_role;
grant select, insert, update, delete on table public.discovered_source_candidates to service_role;
grant select, insert, update, delete on table public.opportunity_candidates to service_role;
grant select, insert, update, delete on table public.deal_source_links to service_role;

insert into public.discovery_keywords (keyword, normalized_keyword)
values
  ('RFQ', 'rfq'),
  ('RFP', 'rfp'),
  ('ITT', 'itt'),
  ('invitation to tender', 'invitation to tender'),
  ('invitation to quote', 'invitation to quote'),
  ('request for quotation', 'request for quotation'),
  ('request for proposal', 'request for proposal'),
  ('expression of interest', 'expression of interest'),
  ('EOI', 'eoi'),
  ('RFI', 'rfi'),
  ('seeking suppliers', 'seeking suppliers'),
  ('suppliers wanted', 'suppliers wanted'),
  ('supplier opportunity', 'supplier opportunity'),
  ('subcontract opportunity', 'subcontract opportunity'),
  ('subcontractor wanted', 'subcontractor wanted'),
  ('framework opportunity', 'framework opportunity'),
  ('call for suppliers', 'call for suppliers'),
  ('purchasing requirement', 'purchasing requirement'),
  ('preferred supplier', 'preferred supplier'),
  ('procurement opportunity', 'procurement opportunity')
on conflict (normalized_keyword) do nothing;

comment on table public.discovery_keywords is
  'Free keyword vocabulary used to pre-filter discovered pages before any model call.';
comment on table public.opportunity_candidates is
  'Raw discovery output requiring admin review. Protected buyer/source fields never reach preview DTOs.';
comment on table public.deal_source_links is
  'Every discovered or merged source URL for a deal, used for cross-source deduplication.';
