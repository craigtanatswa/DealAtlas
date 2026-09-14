-- DealAtlas migration 0002
-- Canonical procurement, source, intelligence and preview schema.

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  name text not null,
  source_type public.source_type not null,
  access_method public.access_method not null,
  base_url text,
  api_url text,
  terms_url text,
  licence_name text,
  licence_url text,
  reuse_status public.reuse_status not null default 'UNKNOWN',
  scraping_permitted boolean not null default false,
  enabled boolean not null default false,
  schedule_expression text,
  rate_limit_per_minute integer,
  robots_checked_at timestamptz,
  terms_checked_at timestamptz,
  compliance_notes text,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id) on delete restrict,
  status public.ingestion_status not null default 'QUEUED',
  trigger_type text not null default 'SCHEDULED',
  cursor_value text,
  started_at timestamptz,
  finished_at timestamptz,
  discovered_count integer not null default 0 check (discovered_count >= 0),
  fetched_count integer not null default 0 check (fetched_count >= 0),
  new_count integer not null default 0 check (new_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.raw_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id) on delete restrict,
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  external_record_id text not null,
  source_url text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  content_hash text not null,
  content_type text,
  raw_payload jsonb,
  raw_text text,
  parser_version text,
  created_at timestamptz not null default now(),
  unique (source_id, external_record_id, content_hash)
);

create table public.ingestion_errors (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.data_sources(id) on delete set null,
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  raw_record_id uuid references public.raw_records(id) on delete set null,
  external_record_id text,
  error_stage text not null,
  error_code text,
  message text not null,
  retryable boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  buyer_sector public.buyer_sector,
  website text,
  domain text,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  county text,
  postcode text,
  region text,
  country_code text default 'GB',
  is_sme boolean,
  is_vcse boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_identifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme text not null,
  value text not null,
  uri text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (scheme, value)
);

create table public.organization_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source_id uuid references public.data_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, normalized_alias)
);

create table public.organization_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  role_title text,
  email text,
  phone text,
  source_id uuid references public.data_sources(id) on delete set null,
  source_url text,
  published_for_procurement boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  primary_source_id uuid references public.data_sources(id) on delete set null,
  external_primary_id text,
  ocid text,
  reference text,
  source_title text not null,
  source_description text,
  buyer_organization_id uuid references public.organizations(id) on delete set null,
  deal_type public.deal_type not null,
  buyer_sector public.buyer_sector not null,
  stage public.deal_stage not null,
  status public.deal_status not null,
  main_category text,
  procurement_method text,
  special_regime text,
  currency text default 'GBP',
  value_min_ex_vat numeric(18,2),
  value_max_ex_vat numeric(18,2),
  exact_value_text text,
  exact_location_text text,
  enquiry_deadline timestamptz,
  submission_deadline timestamptz,
  award_decision_date date,
  contract_start_date date,
  contract_end_date date,
  extension_end_date date,
  next_procurement_date date,
  estimated_renewal_date date,
  is_recurring boolean not null default false,
  sme_suitable boolean,
  vcse_suitable boolean,
  source_url text,
  application_url text,
  first_published_at timestamptz,
  latest_source_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  data_quality_score smallint check (data_quality_score between 0 and 100),
  source_count integer not null default 1 check (source_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (primary_source_id, external_primary_id)
);

create table public.deal_previews (
  deal_id uuid primary key references public.deals(id) on delete cascade,
  slug text not null unique,
  preview_title text not null,
  preview_summary text not null,
  deal_type public.deal_type not null,
  buyer_sector public.buyer_sector not null,
  stage public.deal_stage not null,
  status public.deal_status not null,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text check (sme_suitability in ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  bid_complexity text check (bid_complexity in ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  competition_level text check (competition_level in ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  requirements_preview jsonb not null default '[]'::jsonb,
  relevance_tags text[] not null default '{}'::text[],
  freshness_label text,
  leakage_risk public.leakage_risk not null default 'REVIEW',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  source_id uuid not null references public.data_sources(id) on delete restrict,
  raw_record_id uuid references public.raw_records(id) on delete set null,
  notice_identifier text,
  release_id text,
  notice_type text,
  notice_stage text,
  source_url text,
  published_at timestamptz,
  modified_at timestamptz,
  is_current_version boolean not null default true,
  created_at timestamptz not null default now(),
  unique (source_id, notice_identifier, release_id)
);

create table public.notice_versions (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content_hash text not null,
  raw_payload jsonb,
  raw_text text,
  captured_at timestamptz not null default now(),
  unique (notice_id, version_number),
  unique (notice_id, content_hash)
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  source_lot_id text,
  lot_number text,
  source_title text,
  source_description text,
  status public.deal_status,
  currency text default 'GBP',
  value_min numeric(18,2),
  value_max numeric(18,2),
  exact_location_text text,
  submission_deadline timestamptz,
  contract_start_date date,
  contract_end_date date,
  extension_end_date date,
  maximum_suppliers integer,
  sme_suitable boolean,
  vcse_suitable boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, source_lot_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'GB',
  nation text,
  region text,
  county text,
  city text,
  postcode text,
  nuts_itl_code text,
  is_national boolean not null default false,
  is_remote boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.deal_locations (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  lot_id uuid references public.lots(id) on delete cascade
);

create table public.cpv_codes (
  code text primary key,
  description text not null,
  parent_code text references public.cpv_codes(code) on delete set null,
  level smallint,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  parent_id uuid references public.categories(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);

create table public.deal_classifications (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  lot_id uuid references public.lots(id) on delete cascade,
  cpv_code text references public.cpv_codes(code) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  source_scheme text,
  source_code text,
  source_description text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.deal_organizations (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.organization_role not null,
  lot_id uuid references public.lots(id) on delete cascade,
  source_id uuid references public.data_sources(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  lot_id uuid references public.lots(id) on delete cascade,
  requirement_type public.requirement_type not null,
  name text not null,
  description text,
  mandatory boolean,
  minimum_value numeric(18,2),
  unit text,
  evidence_required text,
  source_notice_id uuid references public.notices(id) on delete set null,
  source_document_id uuid,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  is_inferred boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.award_criteria (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  lot_id uuid references public.lots(id) on delete cascade,
  criterion_name text not null,
  criterion_description text,
  criterion_type text,
  weight_percent numeric(5,2) check (weight_percent is null or (weight_percent >= 0 and weight_percent <= 100)),
  order_of_importance integer,
  source_notice_id uuid references public.notices(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  notice_id uuid references public.notices(id) on delete set null,
  lot_id uuid references public.lots(id) on delete set null,
  source_id uuid references public.data_sources(id) on delete set null,
  name text not null,
  document_type text,
  source_url text not null,
  mime_type text,
  published_at timestamptz,
  content_hash text,
  extracted_text text,
  processing_status text not null default 'PENDING',
  redistribution_permitted boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.requirements
  add constraint requirements_source_document_fk
  foreign key (source_document_id) references public.documents(id) on delete set null;

create table public.document_insights (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  insight_type text not null,
  title text,
  value jsonb not null,
  evidence_reference text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  model_version text,
  generated_at timestamptz not null default now()
);

create table public.awards (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  lot_id uuid references public.lots(id) on delete set null,
  source_notice_id uuid references public.notices(id) on delete set null,
  award_identifier text,
  award_date date,
  award_value numeric(18,2),
  currency text default 'GBP',
  number_of_tenders integer,
  number_of_sme_tenders integer,
  number_of_vcse_tenders integer,
  standstill_end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.award_suppliers (
  award_id uuid not null references public.awards(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  awarded_value numeric(18,2),
  is_sme boolean,
  is_vcse boolean,
  created_at timestamptz not null default now(),
  primary key (award_id, organization_id)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  award_id uuid references public.awards(id) on delete set null,
  contract_identifier text,
  signed_date date,
  start_date date,
  end_date date,
  extension_end_date date,
  original_value numeric(18,2),
  current_value numeric(18,2),
  currency text default 'GBP',
  status text,
  last_changed_at timestamptz,
  terminated_at timestamptz,
  termination_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_changes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  source_notice_id uuid references public.notices(id) on delete set null,
  change_type text not null,
  description text,
  previous_value jsonb,
  new_value jsonb,
  effective_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.contract_payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  buyer_organization_id uuid references public.organizations(id) on delete set null,
  supplier_organization_id uuid references public.organizations(id) on delete set null,
  source_notice_id uuid references public.notices(id) on delete set null,
  payment_date date,
  amount_net_vat numeric(18,2),
  currency text default 'GBP',
  created_at timestamptz not null default now()
);

create table public.contract_performance (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  supplier_organization_id uuid references public.organizations(id) on delete set null,
  source_notice_id uuid references public.notices(id) on delete set null,
  report_date date,
  kpi_name text,
  kpi_description text,
  rating text,
  poor_performance boolean,
  breach_reported boolean,
  breach_description text,
  created_at timestamptz not null default now()
);

create table public.commercial_tools (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete set null,
  tool_type public.commercial_tool_type not null,
  name text not null,
  start_date date,
  end_date date,
  maximum_value numeric(18,2),
  currency text default 'GBP',
  maximum_suppliers integer,
  reopening_dates jsonb not null default '[]'::jsonb,
  award_method text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commercial_tool_members (
  id uuid primary key default gen_random_uuid(),
  commercial_tool_id uuid not null references public.commercial_tools(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.organization_role not null,
  lot_id uuid references public.lots(id) on delete set null,
  joined_at date,
  left_at date
);

create table public.private_opportunity_details (
  deal_id uuid primary key references public.deals(id) on delete cascade,
  procurement_type text,
  rfp_number text,
  rfq_number text,
  project_name text,
  project_sector text,
  goods_required text[],
  services_required text[],
  works_required text[],
  estimated_quantity text,
  estimated_budget_text text,
  expression_of_interest_deadline timestamptz,
  anticipated_award_date date,
  qualification_process text,
  registration_required boolean,
  prequalification_required boolean,
  submission_method text,
  portal_account_required boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deal_insights (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references public.deals(id) on delete cascade,
  summary text,
  buyer_need text,
  ideal_supplier text,
  key_deliverables jsonb not null default '[]'::jsonb,
  mandatory_requirements jsonb not null default '[]'::jsonb,
  competition_notes text,
  incumbent_organization_id uuid references public.organizations(id) on delete set null,
  previous_contract_id uuid references public.contracts(id) on delete set null,
  estimated_renewal_date date,
  sme_accessibility text,
  bid_complexity text,
  deadline_urgency text,
  risk_flags jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  model_version text,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.related_deals (
  deal_id uuid not null references public.deals(id) on delete cascade,
  related_deal_id uuid not null references public.deals(id) on delete cascade,
  relationship_type text not null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  primary key (deal_id, related_deal_id, relationship_type),
  check (deal_id <> related_deal_id)
);

create table public.data_changes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  source_id uuid references public.data_sources(id) on delete set null,
  change_type text not null,
  field_name text,
  previous_value jsonb,
  new_value jsonb,
  material boolean not null default true,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
