-- ============================================================================
-- BEGIN 0001_extensions_and_types.sql
-- ============================================================================

-- DealAtlas migration 0001
-- Extensions, private schema and enums.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create type public.app_role as enum ('USER', 'ADMIN');
create type public.subscription_status as enum ('PENDING', 'ACTIVE', 'ON_HOLD', 'CANCELLED', 'FAILED', 'EXPIRED', 'UNKNOWN');
create type public.billing_interval as enum ('MONTHLY', 'ANNUAL');
create type public.source_type as enum (
  'GOVERNMENT_OPEN_DATA',
  'GOVERNMENT_WEB',
  'PRIVATE_COMPANY_WEB',
  'PROCUREMENT_PLATFORM',
  'SUPPLY_CHAIN_PLATFORM',
  'LICENSED_FEED',
  'PARTNER_FEED',
  'MANUAL_REVIEW'
);
create type public.access_method as enum (
  'OCDS_API',
  'JSON_API',
  'XML_API',
  'RSS',
  'CSV',
  'HTML',
  'PDF_LINK_DISCOVERY',
  'LICENSED_FEED',
  'MANUAL'
);
create type public.reuse_status as enum (
  'OPEN_LICENSE',
  'PERMISSION_GRANTED',
  'LICENSED',
  'TERMS_REVIEWED',
  'UNKNOWN',
  'PROHIBITED'
);
create type public.ingestion_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED');
create type public.deal_type as enum (
  'PUBLIC_TENDER',
  'PRIVATE_TENDER',
  'RFP',
  'RFQ',
  'RFI',
  'EOI',
  'SUPPLY_CHAIN_OPPORTUNITY',
  'SUBCONTRACT_OPPORTUNITY',
  'FRAMEWORK',
  'DYNAMIC_MARKET',
  'PROCUREMENT_PIPELINE',
  'SUPPLIER_SEARCH',
  'EARLY_MARKET_ENGAGEMENT',
  'CONTRACT_RENEWAL',
  'AWARD'
);
create type public.buyer_sector as enum ('PUBLIC', 'PRIVATE', 'NONPROFIT', 'UTILITY', 'EDUCATION', 'HEALTHCARE', 'OTHER');
create type public.deal_stage as enum ('EARLY', 'PLANNING', 'LIVE', 'AWARD', 'CONTRACT', 'ENDED');
create type public.deal_status as enum ('UPCOMING', 'OPEN', 'CLOSING_SOON', 'CLOSED', 'AWARDED', 'CANCELLED', 'ACTIVE', 'EXPIRED', 'WITHDRAWN');
create type public.organization_role as enum (
  'BUYER',
  'LEAD_BUYER',
  'JOINT_BUYER',
  'SUPPLIER',
  'AWARDED_SUPPLIER',
  'INCUMBENT',
  'PRIME_CONTRACTOR',
  'FUNDER',
  'FRAMEWORK_AUTHORITY'
);
create type public.requirement_type as enum (
  'TECHNICAL',
  'FINANCIAL',
  'LEGAL',
  'SECURITY',
  'COMPLIANCE',
  'INSURANCE',
  'EXPERIENCE',
  'SOCIAL_VALUE',
  'OTHER'
);
create type public.commercial_tool_type as enum ('FRAMEWORK', 'OPEN_FRAMEWORK', 'DYNAMIC_MARKET', 'OTHER');
create type public.leakage_risk as enum ('LOW', 'REVIEW', 'HIGH');
create type public.alert_type as enum ('NEW_MATCH', 'DEAL_CHANGED', 'DEADLINE', 'BUYER_ACTIVITY', 'SUPPLIER_ACTIVITY', 'RENEWAL');
create type public.alert_status as enum ('UNREAD', 'READ', 'SENT', 'DISMISSED');
create type public.billing_event_status as enum ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- ============================================================================
-- END 0001_extensions_and_types.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0002_core_schema.sql
-- ============================================================================

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

-- ============================================================================
-- END 0002_core_schema.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0003_user_billing_schema.sql
-- ============================================================================

-- DealAtlas migration 0003
-- User-owned data, billing mirror, matching, alerts and export usage.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.app_role not null default 'USER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  company_name text,
  company_description text,
  products_services text[] not null default '{}'::text[],
  preferred_category_slugs text[] not null default '{}'::text[],
  preferred_cpv_codes text[] not null default '{}'::text[],
  keywords text[] not null default '{}'::text[],
  negative_keywords text[] not null default '{}'::text[],
  preferred_regions text[] not null default '{}'::text[],
  minimum_deal_value numeric(18,2),
  maximum_deal_value numeric(18,2),
  certifications text[] not null default '{}'::text[],
  framework_memberships text[] not null default '{}'::text[],
  preferred_buyer_sectors public.buyer_sector[] not null default '{}'::public.buyer_sector[],
  company_size text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_deal_value is null or minimum_deal_value >= 0),
  check (maximum_deal_value is null or maximum_deal_value >= 0),
  check (minimum_deal_value is null or maximum_deal_value is null or minimum_deal_value <= maximum_deal_value)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'DODO',
  dodo_customer_id text,
  dodo_subscription_id text,
  dodo_product_id text,
  plan_key text not null default 'PRO',
  status public.subscription_status not null default 'PENDING',
  billing_interval public.billing_interval,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  last_provider_event_at timestamptz,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dodo_subscription_id)
);

create unique index subscriptions_one_current_per_user_idx
  on public.subscriptions(user_id)
  where is_current = true;

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'DODO',
  provider_event_id text not null,
  event_type text not null,
  payload_hash text not null,
  payload jsonb not null,
  status public.billing_event_status not null default 'RECEIVED',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, provider_event_id)
);

create table public.deal_matches (
  id uuid primary key default gen_random_uuid(),
  company_profile_id uuid not null references public.company_profiles(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  relevance_score numeric(5,2) not null check (relevance_score >= 0 and relevance_score <= 100),
  category_score numeric(5,2) check (category_score is null or (category_score >= 0 and category_score <= 100)),
  location_score numeric(5,2) check (location_score is null or (location_score >= 0 and location_score <= 100)),
  value_score numeric(5,2) check (value_score is null or (value_score >= 0 and value_score <= 100)),
  semantic_score numeric(5,2) check (semantic_score is null or (semantic_score >= 0 and semantic_score <= 100)),
  preview_reasons jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (company_profile_id, deal_id)
);

create table public.saved_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, deal_id)
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  alert_cadence text not null default 'WEEKLY' check (alert_cadence in ('NONE', 'IMMEDIATE', 'DAILY', 'WEEKLY')),
  enabled boolean not null default true,
  last_evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.watched_organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  watch_type text not null check (watch_type in ('BUYER', 'SUPPLIER')),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id, watch_type)
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  new_match_enabled boolean not null default true,
  deal_change_enabled boolean not null default true,
  deadline_enabled boolean not null default true,
  renewal_enabled boolean not null default true,
  digest_cadence text not null default 'DAILY' check (digest_cadence in ('IMMEDIATE', 'DAILY', 'WEEKLY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  alert_type public.alert_type not null,
  status public.alert_status not null default 'UNREAD',
  title text not null,
  message text not null,
  protected_payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.export_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  export_type text not null default 'DEALS_CSV',
  row_count integer not null check (row_count > 0),
  billing_month date not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- END 0003_user_billing_schema.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0004_security_and_rls.sql
-- ============================================================================

-- DealAtlas migration 0004
-- RLS, table grants and client security boundary.

-- Future tables created by this migration role must not inherit client grants.
-- service_role keeps full access for trusted server/admin/worker paths and bypasses RLS.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- Enable RLS on every public table created so far.
do $$
declare
  t text;
begin
  foreach t in array array[
    'data_sources','ingestion_runs','raw_records','ingestion_errors','organizations',
    'organization_identifiers','organization_aliases','organization_contacts','deals','deal_previews',
    'notices','notice_versions','lots','locations','deal_locations','cpv_codes','categories',
    'deal_classifications','deal_organizations','requirements','award_criteria','documents','document_insights',
    'awards','award_suppliers','contracts','contract_changes','contract_payments','contract_performance',
    'commercial_tools','commercial_tool_members','private_opportunity_details','deal_insights','related_deals',
    'data_changes','profiles','company_profiles','subscriptions','billing_events','deal_matches','saved_deals',
    'saved_searches','watched_organizations','notification_preferences','alerts','export_usage'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- PUBLIC PREVIEW: only published LOW-risk rows are client readable.
grant select on table public.deal_previews to anon, authenticated;
create policy "published low-risk previews are readable"
  on public.deal_previews
  for select
  to anon, authenticated
  using (is_published = true and leakage_risk = 'LOW');

-- PROFILES: authenticated user can read own profile and update display name only.
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

create policy "users read own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "users update own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- COMPANY PROFILE: one user-owned matching profile.
grant select, insert, delete on table public.company_profiles to authenticated;
grant update (
  company_name, company_description, products_services, preferred_category_slugs,
  preferred_cpv_codes, keywords, negative_keywords, preferred_regions,
  minimum_deal_value, maximum_deal_value, certifications, framework_memberships,
  preferred_buyer_sectors, company_size
) on table public.company_profiles to authenticated;

create policy "users read own company profile"
  on public.company_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own company profile"
  on public.company_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own company profile"
  on public.company_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users delete own company profile"
  on public.company_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

-- DEAL MATCHES: safe preview relevance only. Worker/server writes.
grant select on table public.deal_matches to authenticated;
create policy "users read own deal matches"
  on public.deal_matches for select to authenticated
  using (
    exists (
      select 1
      from public.company_profiles cp
      where cp.id = deal_matches.company_profile_id
        and cp.user_id = (select auth.uid())
    )
  );

-- SAVED DEALS
grant select, insert, delete on table public.saved_deals to authenticated;
grant update (notes) on table public.saved_deals to authenticated;

create policy "users read own saved deals"
  on public.saved_deals for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own saved deals"
  on public.saved_deals for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own saved deals"
  on public.saved_deals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users delete own saved deals"
  on public.saved_deals for delete to authenticated
  using ((select auth.uid()) = user_id);

-- SAVED SEARCHES
grant select, insert, delete on table public.saved_searches to authenticated;
grant update (name, filters, alert_cadence, enabled) on table public.saved_searches to authenticated;

create policy "users read own saved searches"
  on public.saved_searches for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own saved searches"
  on public.saved_searches for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own saved searches"
  on public.saved_searches for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users delete own saved searches"
  on public.saved_searches for delete to authenticated
  using ((select auth.uid()) = user_id);

-- WATCHED ORGANIZATIONS: Pro-only enforcement is added by trigger in migration 0005.
grant select, insert, delete on table public.watched_organizations to authenticated;

create policy "users read own watched organizations"
  on public.watched_organizations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own watched organizations"
  on public.watched_organizations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users delete own watched organizations"
  on public.watched_organizations for delete to authenticated
  using ((select auth.uid()) = user_id);

-- NOTIFICATION PREFERENCES
grant select, insert on table public.notification_preferences to authenticated;
grant update (
  email_enabled, new_match_enabled, deal_change_enabled, deadline_enabled,
  renewal_enabled, digest_cadence
) on table public.notification_preferences to authenticated;

create policy "users read own notification preferences"
  on public.notification_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own notification preferences"
  on public.notification_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own notification preferences"
  on public.notification_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ALERTS: server-only because an alert may contain protected deal/source context.
-- The application exposes an explicit safe DTO after entitlement checks.

-- IMPORTANT: subscriptions, billing_events, export_usage and all canonical/source-bearing tables
-- intentionally have no anon/authenticated grants or policies. They are server-only.

-- ============================================================================
-- END 0004_security_and_rls.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0005_functions_and_indexes.sql
-- ============================================================================

-- DealAtlas migration 0005
-- Trigger functions, safety gates, search RPC and performance indexes.

-- -----------------------------------------------------------------------------
-- Updated-at helper
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.touch_updated_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Auth profile creation
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Backfill profiles safely if auth users existed before this migration.
insert into public.profiles (id, email, display_name)
select
  u.id,
  coalesce(u.email, ''),
  nullif(coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
on conflict (id) do nothing;

insert into public.notification_preferences (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- Entitlement helper for database-side quota triggers.
-- It is in a non-exposed schema and is not callable by ordinary client roles.
-- -----------------------------------------------------------------------------
create or replace function private.is_user_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.is_current = true
      and (
        s.status = 'ACTIVE'
        or (
          s.status = 'CANCELLED'
          and s.cancel_at_period_end = true
          and s.current_period_end is not null
          and s.current_period_end > now()
        )
      )
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

revoke execute on function private.is_user_pro(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- User quota enforcement
-- -----------------------------------------------------------------------------
create or replace function private.enforce_saved_deal_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  max_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  max_count := case when private.is_user_pro(new.user_id) then 10000 else 5 end;
  select count(*) into current_count from public.saved_deals where user_id = new.user_id;
  if current_count >= max_count then
    raise exception 'saved deal limit reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_saved_deal_limit() from public, anon, authenticated;

drop trigger if exists enforce_saved_deal_limit on public.saved_deals;
create trigger enforce_saved_deal_limit
before insert on public.saved_deals
for each row execute function private.enforce_saved_deal_limit();

create or replace function private.enforce_saved_search_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  max_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 1));
  max_count := case when private.is_user_pro(new.user_id) then 50 else 1 end;
  select count(*) into current_count from public.saved_searches where user_id = new.user_id;
  if current_count >= max_count then
    raise exception 'saved search limit reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_saved_search_limit() from public, anon, authenticated;

drop trigger if exists enforce_saved_search_limit on public.saved_searches;
create trigger enforce_saved_search_limit
before insert on public.saved_searches
for each row execute function private.enforce_saved_search_limit();

create or replace function private.enforce_watch_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if not private.is_user_pro(new.user_id) then
    raise exception 'DealAtlas Pro subscription required to watch organizations';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.watch_type, 2));
  select count(*) into current_count
  from public.watched_organizations
  where user_id = new.user_id and watch_type = new.watch_type;

  if current_count >= 50 then
    raise exception 'organization watch limit reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_watch_limit() from public, anon, authenticated;

drop trigger if exists enforce_watch_limit on public.watched_organizations;
create trigger enforce_watch_limit
before insert on public.watched_organizations
for each row execute function private.enforce_watch_limit();

-- -----------------------------------------------------------------------------
-- Source compliance gates
-- -----------------------------------------------------------------------------
create or replace function private.enforce_source_enablement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.enabled then
    if new.reuse_status not in ('OPEN_LICENSE', 'PERMISSION_GRANTED', 'LICENSED', 'TERMS_REVIEWED') then
      raise exception 'source cannot be enabled with reuse status %', new.reuse_status;
    end if;

    if new.access_method in ('HTML', 'PDF_LINK_DISCOVERY') and new.scraping_permitted is not true then
      raise exception 'HTML/PDF discovery source cannot be enabled until scraping_permitted=true';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_source_enablement() from public, anon, authenticated;

drop trigger if exists enforce_source_enablement on public.data_sources;
create trigger enforce_source_enablement
before insert or update of enabled, reuse_status, access_method, scraping_permitted
on public.data_sources
for each row execute function private.enforce_source_enablement();

create or replace function private.enforce_ingestion_run_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.data_sources%rowtype;
begin
  if new.status not in ('QUEUED', 'RUNNING') then
    return new;
  end if;

  select * into s from public.data_sources where id = new.source_id;
  if not found then
    raise exception 'source not found';
  end if;
  if not s.enabled then
    raise exception 'source is disabled';
  end if;
  if s.reuse_status not in ('OPEN_LICENSE', 'PERMISSION_GRANTED', 'LICENSED', 'TERMS_REVIEWED') then
    raise exception 'source reuse status does not permit production ingestion';
  end if;
  if s.access_method in ('HTML', 'PDF_LINK_DISCOVERY') and s.scraping_permitted is not true then
    raise exception 'source scraping is not approved';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_ingestion_run_source() from public, anon, authenticated;

drop trigger if exists enforce_ingestion_run_source on public.ingestion_runs;
create trigger enforce_ingestion_run_source
before insert or update of status, source_id
on public.ingestion_runs
for each row execute function private.enforce_ingestion_run_source();

-- -----------------------------------------------------------------------------
-- Preview leakage failsafe.
-- The application-level scanner should be stricter. This database trigger catches
-- obvious identifiers before publication and never lowers a pre-existing risk.
-- -----------------------------------------------------------------------------
create or replace function private.detect_preview_leakage(
  p_deal_id uuid,
  p_preview_title text,
  p_preview_summary text,
  p_requirements jsonb
)
returns public.leakage_risk
language plpgsql
stable
security definer
-- pg_trgm may live in public (local) or extensions (hosted). Keep both on the
-- path so similarity() and related operators resolve without weakening
-- schema-qualified table access.
set search_path = pg_catalog, public, extensions
as $$
declare
  d public.deals%rowtype;
  o public.organizations%rowtype;
  combined text;
  a record;
begin
  select * into d from public.deals where id = p_deal_id;
  if not found then
    return 'HIGH';
  end if;

  combined := lower(
    coalesce(p_preview_title, '') || ' ' ||
    coalesce(p_preview_summary, '') || ' ' ||
    coalesce(p_requirements::text, '')
  );

  if combined ~* '(https?://|www\.|[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})' then
    return 'HIGH';
  end if;

  if d.ocid is not null and length(d.ocid) >= 6 and position(lower(d.ocid) in combined) > 0 then
    return 'HIGH';
  end if;

  if d.reference is not null and length(d.reference) >= 6 and position(lower(d.reference) in combined) > 0 then
    return 'HIGH';
  end if;

  if d.buyer_organization_id is not null then
    select * into o from public.organizations where id = d.buyer_organization_id;
    if found then
      if length(coalesce(o.canonical_name, '')) >= 4 and position(lower(o.canonical_name) in combined) > 0 then
        return 'HIGH';
      end if;
      if length(coalesce(o.domain, '')) >= 4 and position(lower(o.domain) in combined) > 0 then
        return 'HIGH';
      end if;

      for a in
        select alias
        from public.organization_aliases
        where organization_id = d.buyer_organization_id
      loop
        if length(coalesce(a.alias, '')) >= 5 and position(lower(a.alias) in combined) > 0 then
          return 'HIGH';
        end if;
      end loop;
    end if;
  end if;

  if length(coalesce(d.source_title, '')) >= 20
     and similarity(lower(d.source_title), lower(coalesce(p_preview_title, ''))) >= 0.80 then
    return 'REVIEW';
  end if;

  return 'LOW';
end;
$$;

revoke execute on function private.detect_preview_leakage(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function private.enforce_preview_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  detected public.leakage_risk;
begin
  detected := private.detect_preview_leakage(new.deal_id, new.preview_title, new.preview_summary, new.requirements_preview);

  if detected = 'HIGH' then
    new.leakage_risk := 'HIGH';
    new.is_published := false;
  elsif detected = 'REVIEW' then
    if new.leakage_risk = 'LOW' then
      new.leakage_risk := 'REVIEW';
    end if;
    new.is_published := false;
  elsif new.leakage_risk <> 'LOW' then
    -- A deterministic LOW result does not override an application/manual REVIEW/HIGH status.
    new.is_published := false;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_preview_safety() from public, anon, authenticated;

drop trigger if exists enforce_preview_safety on public.deal_previews;
create trigger enforce_preview_safety
before insert or update of preview_title, preview_summary, requirements_preview, leakage_risk, is_published
on public.deal_previews
for each row execute function private.enforce_preview_safety();

-- -----------------------------------------------------------------------------
-- Safe public search RPC. It only touches deal_previews.
-- -----------------------------------------------------------------------------
create or replace function public.search_deal_previews(
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  deal_id uuid,
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  select
    dp.deal_id,
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.stage,
    dp.status,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.duration_band,
    dp.sme_suitability,
    dp.bid_complexity,
    dp.competition_level,
    dp.requirements_preview,
    dp.relevance_tags,
    dp.freshness_label,
    count(*) over() as total_count
  from public.deal_previews dp
  where dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and (p_category is null or dp.main_category = p_category)
    and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
    and (p_deal_type is null or dp.deal_type = p_deal_type)
    and (p_region is null or dp.broad_region = p_region)
    and (p_status is null or dp.status = p_status)
    and (
      p_query is null
      or btrim(p_query) = ''
      or to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
           @@ websearch_to_tsquery('english', p_query)
      or dp.preview_title % p_query
    )
  order by
    case when p_query is null or btrim(p_query) = '' then 0
      else ts_rank(
        to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')),
        websearch_to_tsquery('english', p_query)
      )
    end desc,
    dp.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_deal_previews(text, text, public.buyer_sector, public.deal_type, text, public.deal_status, integer, integer)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Updated-at triggers
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'data_sources','organizations','organization_contacts','deals','deal_previews','lots','documents',
    'awards','contracts','commercial_tools','private_opportunity_details','deal_insights',
    'profiles','company_profiles','subscriptions','saved_deals','saved_searches','notification_preferences'
  ]
  loop
    execute format('drop trigger if exists touch_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger touch_%I_updated_at before update on public.%I for each row execute function private.touch_updated_at()',
      t, t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Indexes: sources/ingestion
-- -----------------------------------------------------------------------------
create index if not exists data_sources_enabled_idx on public.data_sources(enabled);
create index if not exists ingestion_runs_source_created_idx on public.ingestion_runs(source_id, created_at desc);
create index if not exists raw_records_source_external_idx on public.raw_records(source_id, external_record_id);
create index if not exists raw_records_fetched_idx on public.raw_records(fetched_at desc);
create index if not exists ingestion_errors_run_idx on public.ingestion_errors(ingestion_run_id);

-- Organizations
create index if not exists organizations_normalized_name_idx on public.organizations(normalized_name);
create index if not exists organizations_normalized_name_trgm_idx on public.organizations using gin (normalized_name extensions.gin_trgm_ops);
create index if not exists organizations_domain_idx on public.organizations(domain);
create index if not exists organization_aliases_normalized_idx on public.organization_aliases(normalized_alias);
create index if not exists organization_aliases_org_idx on public.organization_aliases(organization_id);
create index if not exists organization_contacts_org_idx on public.organization_contacts(organization_id);

-- Deals/previews
create index if not exists deals_primary_source_idx on public.deals(primary_source_id);
create index if not exists deals_buyer_idx on public.deals(buyer_organization_id);
create index if not exists deals_status_idx on public.deals(status);
create index if not exists deals_stage_idx on public.deals(stage);
create index if not exists deals_type_idx on public.deals(deal_type);
create index if not exists deals_submission_deadline_idx on public.deals(submission_deadline);
create index if not exists deals_estimated_renewal_idx on public.deals(estimated_renewal_date);
create index if not exists deals_updated_idx on public.deals(updated_at desc);
create index if not exists deals_ocid_idx on public.deals(ocid) where ocid is not null;

create index if not exists deal_previews_publish_idx on public.deal_previews(is_published, leakage_risk, updated_at desc);
create index if not exists deal_previews_status_idx on public.deal_previews(status);
create index if not exists deal_previews_type_idx on public.deal_previews(deal_type);
create index if not exists deal_previews_sector_idx on public.deal_previews(buyer_sector);
create index if not exists deal_previews_category_idx on public.deal_previews(main_category);
create index if not exists deal_previews_region_idx on public.deal_previews(broad_region);
create index if not exists deal_previews_title_trgm_idx on public.deal_previews using gin (preview_title extensions.gin_trgm_ops);
create index if not exists deal_previews_fts_idx on public.deal_previews using gin (
  to_tsvector('english', coalesce(preview_title, '') || ' ' || coalesce(preview_summary, '') || ' ' || coalesce(main_category, ''))
);

-- Related procurement entities
create index if not exists notices_deal_idx on public.notices(deal_id);
create index if not exists notices_source_idx on public.notices(source_id);
create index if not exists lots_deal_idx on public.lots(deal_id);
create index if not exists deal_locations_deal_idx on public.deal_locations(deal_id);
create unique index if not exists deal_locations_no_lot_unique_idx on public.deal_locations(deal_id, location_id) where lot_id is null;
create unique index if not exists deal_locations_with_lot_unique_idx on public.deal_locations(deal_id, location_id, lot_id) where lot_id is not null;
create index if not exists deal_classifications_deal_idx on public.deal_classifications(deal_id);
create index if not exists deal_classifications_cpv_idx on public.deal_classifications(cpv_code);
create index if not exists deal_organizations_org_idx on public.deal_organizations(organization_id);
create unique index if not exists deal_organizations_no_lot_unique_idx on public.deal_organizations(deal_id, organization_id, role) where lot_id is null;
create unique index if not exists deal_organizations_with_lot_unique_idx on public.deal_organizations(deal_id, organization_id, role, lot_id) where lot_id is not null;
create unique index if not exists commercial_tool_members_no_lot_unique_idx on public.commercial_tool_members(commercial_tool_id, organization_id, role) where lot_id is null;
create unique index if not exists commercial_tool_members_with_lot_unique_idx on public.commercial_tool_members(commercial_tool_id, organization_id, role, lot_id) where lot_id is not null;
create index if not exists requirements_deal_idx on public.requirements(deal_id);
create index if not exists award_criteria_deal_idx on public.award_criteria(deal_id);
create index if not exists documents_deal_idx on public.documents(deal_id);
create index if not exists awards_deal_idx on public.awards(deal_id);
create index if not exists award_suppliers_org_idx on public.award_suppliers(organization_id);
create index if not exists contracts_deal_idx on public.contracts(deal_id);
create index if not exists contracts_end_date_idx on public.contracts(end_date);
create index if not exists contract_payments_contract_idx on public.contract_payments(contract_id);
create index if not exists contract_performance_contract_idx on public.contract_performance(contract_id);
create index if not exists data_changes_deal_time_idx on public.data_changes(deal_id, occurred_at desc);

-- User/RLS-performance indexes
create index if not exists company_profiles_user_idx on public.company_profiles(user_id);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id);
create index if not exists subscriptions_user_status_idx on public.subscriptions(user_id, is_current, status, current_period_end);
create index if not exists deal_matches_profile_idx on public.deal_matches(company_profile_id);
create index if not exists deal_matches_deal_idx on public.deal_matches(deal_id);
create index if not exists saved_deals_user_idx on public.saved_deals(user_id);
create index if not exists saved_searches_user_idx on public.saved_searches(user_id);
create index if not exists watched_organizations_user_idx on public.watched_organizations(user_id);
create index if not exists alerts_user_created_idx on public.alerts(user_id, created_at desc);
create index if not exists export_usage_user_month_idx on public.export_usage(user_id, billing_month);

-- ============================================================================
-- END 0005_functions_and_indexes.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0006_seed_reference_data.sql
-- ============================================================================

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

-- ============================================================================
-- END 0006_seed_reference_data.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0007_search_preview_filters.sql
-- ============================================================================

-- DealAtlas migration 0007
-- Extend public search_deal_previews with value-band and closing-window filters.
-- The function still reads deal_previews only.

drop function if exists public.search_deal_previews(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  integer,
  integer
);

create or replace function public.search_deal_previews(
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  deal_id uuid,
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  select
    dp.deal_id,
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.stage,
    dp.status,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.duration_band,
    dp.sme_suitability,
    dp.bid_complexity,
    dp.competition_level,
    dp.requirements_preview,
    dp.relevance_tags,
    dp.freshness_label,
    count(*) over() as total_count
  from public.deal_previews dp
  where dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and (p_category is null or dp.main_category = p_category)
    and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
    and (p_deal_type is null or dp.deal_type = p_deal_type)
    and (p_region is null or dp.broad_region = p_region)
    and (p_status is null or dp.status = p_status)
    and (p_value_band is null or dp.value_band = p_value_band)
    and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
    and (
      p_query is null
      or btrim(p_query) = ''
      or to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
           @@ websearch_to_tsquery('english', p_query)
      or dp.preview_title % p_query
    )
  order by
    case when p_query is null or btrim(p_query) = '' then 0
      else ts_rank(
        to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')),
        websearch_to_tsquery('english', p_query)
      )
    end desc,
    dp.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_deal_previews(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  integer,
  integer
) to anon, authenticated, service_role;

create index if not exists deal_previews_value_band_idx on public.deal_previews(value_band);
create index if not exists deal_previews_deadline_band_idx on public.deal_previews(deadline_band);

-- ============================================================================
-- END 0007_search_preview_filters.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0008_find_a_tender_ocds.sql
-- ============================================================================

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

-- ============================================================================
-- END 0008_find_a_tender_ocds.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0009_private_source_onboarding.sql
-- ============================================================================

-- DealAtlas migration 0009
-- Private / supply-chain source onboarding. Only clearly licensed sources are enabled.

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
    'uk-infrastructure-pipeline',
    'UK Infrastructure Pipeline',
    'GOVERNMENT_OPEN_DATA',
    'JSON_API',
    'https://pipeline.nista.grid.civilservice.gov.uk/',
    'https://pipeline.nista.grid.civilservice.gov.uk/_dash-layout',
    'Open Government Licence v3.0',
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    'https://www.gov.uk/help/terms-conditions',
    'OPEN_LICENSE',
    false,
    true,
    '0 6 * * *',
    6,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Official NISTA/GOV.UK pipeline of public and privately delivered infrastructure projects. GOV.UK states the full dataset is downloadable. Ingest the dashboard JSON layout payload. Do not scrape HTML. See docs/SOURCE_COMPLIANCE_REPORT.md.'
  ),
  (
    'nicp-govuk-2023',
    'National Infrastructure and Construction Pipeline 2023',
    'GOVERNMENT_OPEN_DATA',
    'CSV',
    'https://www.gov.uk/government/publications/national-infrastructure-and-construction-pipeline-2023',
    'https://assets.publishing.service.gov.uk/media/65bb870e4965c5000de8a362/National_Infrastructure_and_Construction_Pipeline_2023.xlsx',
    'Open Government Licence v3.0',
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    'https://www.gov.uk/help/terms-conditions',
    'OPEN_LICENSE',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Official GOV.UK XLSX under OGL. February 2024 snapshot superseded by the live NISTA pipeline. Represented but not scheduled.'
  ),
  (
    'national-highways-contracts-pipeline',
    'National Highways Contracts Pipeline',
    'GOVERNMENT_OPEN_DATA',
    'PDF_LINK_DISCOVERY',
    'https://nationalhighways.co.uk/',
    'https://nationalhighways.co.uk/media/arqkd5zt/national-highways-activity-pipeline.pdf',
    'Open Government Licence v3.0',
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    'https://nationalhighways.co.uk/about-us/our-responsibilities/your-information-rights/publication-scheme/',
    'OPEN_LICENSE',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'RIS2 PDF carries an OGL reuse notice. No current machine-readable contracts datasheet was found on 2026-09-14. Do not scrape eSourcing.'
  ),
  (
    'hs2-direct-contract-opportunities',
    'HS2 Direct Contract Opportunities',
    'SUPPLY_CHAIN_PLATFORM',
    'HTML',
    'https://www.hs2.org.uk/suppliers/direct-contract-opportunities/',
    null,
    null,
    null,
    'https://www.hs2.org.uk/suppliers/direct-contract-opportunities/',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Public Excel/HTML lists exist but hs2.org.uk asserts HS2 Ltd copyright without a site-wide OGL. Not automated.'
  ),
  (
    'hs2-indirect-contract-opportunities',
    'HS2 Indirect / Supply-Chain Opportunities',
    'SUPPLY_CHAIN_PLATFORM',
    'HTML',
    'https://www.hs2.org.uk/suppliers/indirect-contract-opportunities/',
    null,
    null,
    null,
    'https://www.hs2.org.uk/suppliers/indirect-contract-opportunities/',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Same copyright reservation as HS2 direct lists. Live applications often require CompeteFor. Not automated.'
  ),
  (
    'network-rail-procurement-pipeline',
    'Network Rail Procurement Pipeline',
    'SUPPLY_CHAIN_PLATFORM',
    'HTML',
    'https://www.networkrail.co.uk/industry-and-commercial/supply-chain/procurement/',
    null,
    null,
    null,
    'https://www.networkrail.co.uk/industry-and-commercial/supply-chain/procurement/',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Pipeline is described as downloadable but no stable public file URL was found. BravoNR is a login portal. Do not scrape or log in.'
  ),
  (
    'competefor',
    'CompeteFor',
    'SUPPLY_CHAIN_PLATFORM',
    'HTML',
    'https://www.competefor.com/',
    null,
    null,
    null,
    'https://www.competefor.com/terms-and-conditions/',
    'PROHIBITED',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Terms forbid republication except under a syndication agreement and require login. Blocked.'
  ),
  (
    'tideway-competefor',
    'Tideway Supply Chain (CompeteFor)',
    'SUPPLY_CHAIN_PLATFORM',
    'HTML',
    'https://www.competefor.com/tideway/',
    null,
    null,
    null,
    'https://www.competefor.com/terms-and-conditions/',
    'PROHIBITED',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Tideway supply-chain portal is CompeteFor. Same republication prohibition.'
  ),
  (
    'sizewell-c-jaggaer',
    'Sizewell C Jaggaer Supply Chain',
    'PROCUREMENT_PLATFORM',
    'HTML',
    'https://sizewellcsupplychain.co.uk/',
    null,
    null,
    null,
    'https://sizewellcsupplychain.co.uk/',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Jaggaer source-to-contract portal with registration/login. Do not bypass.'
  ),
  (
    'hinkley-point-c-supply-chain',
    'Hinkley Point C Supply Chain',
    'SUPPLY_CHAIN_PLATFORM',
    'HTML',
    'https://www.hinkleysupplychain.co.uk/',
    null,
    null,
    null,
    'https://www.hinkleysupplychain.co.uk/terms-conditions/',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Registration/login matching portal. No open reuse licence for listings.'
  ),
  (
    'national-grid-suppliers',
    'National Grid Suppliers',
    'PRIVATE_COMPANY_WEB',
    'HTML',
    'https://www.nationalgrid.com/suppliers/new-suppliers',
    null,
    null,
    null,
    'https://www.nationalgrid.com/suppliers/new-suppliers',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Achilles UVDB, Coupa and Ariba. No public opportunity feed.'
  ),
  (
    'thames-water-capital-pipeline',
    'Thames Water Capital Delivery Pipeline',
    'PRIVATE_COMPANY_WEB',
    'HTML',
    'https://www.thameswater.co.uk/',
    null,
    null,
    null,
    'https://www.thameswater.co.uk/',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Indicative pipeline webpage with no reuse licence found. Regulated notices remain available via Find a Tender.'
  ),
  (
    'balfour-beatty-supply-chain',
    'Balfour Beatty Supply Chain',
    'PRIVATE_COMPANY_WEB',
    'HTML',
    'https://www.balfourbeatty.com/',
    null,
    null,
    null,
    'https://www.balfourbeatty.com/',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Prime-contractor channel. No clear public reuse licence. Do not log into supplier portals.'
  ),
  (
    'constructionline',
    'Constructionline',
    'PROCUREMENT_PLATFORM',
    'HTML',
    'https://www.constructionline.co.uk/',
    null,
    null,
    null,
    'https://www.constructionline.co.uk/',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Commercial supplier-register platform. Not a public open feed.'
  ),
  (
    'achilles-uvdb',
    'Achilles UVDB',
    'PROCUREMENT_PLATFORM',
    'HTML',
    'https://www.achilles.com/',
    null,
    null,
    null,
    'https://www.achilles.com/',
    'UNKNOWN',
    false,
    false,
    null,
    null,
    timestamptz '2026-09-14T00:00:00Z',
    timestamptz '2026-09-14T00:00:00Z',
    'Paid/login qualification database used by utilities. Do not bypass login.'
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

-- ============================================================================
-- END 0009_private_source_onboarding.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0010_intelligence_preview_pipeline.sql
-- ============================================================================

-- DealAtlas migration 0010
-- Intelligence provenance plus server-only preview generation audit.
-- Application leak scanning is the primary control; the deal_previews trigger remains a failsafe.

alter table public.deal_insights
  add column if not exists generation_method text
    check (generation_method is null or generation_method in ('RULES', 'LLM', 'HYBRID')),
  add column if not exists field_provenance jsonb not null default '{}'::jsonb,
  add column if not exists competition_level text
    check (competition_level is null or competition_level in ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'));

comment on column public.deal_insights.generation_method is
  'Overall DealAtlas generation method. Inference, not an official source fact.';
comment on column public.deal_insights.field_provenance is
  'Per-field provenance: method, model/version, confidence, evidence references, generated_at.';
comment on column public.deal_insights.competition_level is
  'DealAtlas inferred competition level. Inference, not an official source fact.';

create table if not exists public.preview_generation_runs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  leakage_risk public.leakage_risk not null,
  is_published boolean not null default false,
  findings jsonb not null default '[]'::jsonb,
  generation_method text,
  model_version text,
  preview_title text,
  preview_summary text,
  created_at timestamptz not null default now()
);

create index if not exists preview_generation_runs_deal_idx
  on public.preview_generation_runs (deal_id, created_at desc);

alter table public.preview_generation_runs enable row level security;
revoke all on table public.preview_generation_runs from public, anon, authenticated;
grant all on table public.preview_generation_runs to service_role;

comment on table public.preview_generation_runs is
  'Server-only leak-scan and publish audit for admin review. Not readable by anon or authenticated clients.';

-- ============================================================================
-- END 0010_intelligence_preview_pipeline.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0011_matching_pipeline.sql
-- ============================================================================

-- DealAtlas migration 0011
-- Company-profile relevance matching: extra score columns, server-only
-- detail reasons, match job queue, and authenticated relevance search.

alter table public.deal_matches
  add column if not exists keyword_score numeric(5,2)
    check (keyword_score is null or (keyword_score >= 0 and keyword_score <= 100)),
  add column if not exists sector_score numeric(5,2)
    check (sector_score is null or (sector_score >= 0 and sector_score <= 100)),
  add column if not exists certification_score numeric(5,2)
    check (certification_score is null or (certification_score >= 0 and certification_score <= 100)),
  add column if not exists detail_reasons jsonb not null default '[]'::jsonb;

comment on column public.deal_matches.preview_reasons is
  'Sanitised match/mismatch reasons safe for authenticated clients. Never store source identity or exact protected requirement text.';
comment on column public.deal_matches.detail_reasons is
  'Server-only richer mismatch/match notes for entitled Pro reads. Still must not copy source identity.';

grant all on table public.deal_matches to service_role;

revoke select (detail_reasons) on table public.deal_matches from anon, authenticated;

create index if not exists deal_matches_profile_score_idx
  on public.deal_matches (company_profile_id, relevance_score desc);

create table if not exists public.match_jobs (
  id uuid primary key default gen_random_uuid(),
  company_profile_id uuid references public.company_profiles(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RUNNING', 'DONE', 'ERROR')),
  cursor_offset integer not null default 0 check (cursor_offset >= 0),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  check (company_profile_id is not null or deal_id is not null)
);

create unique index if not exists match_jobs_pending_profile_idx
  on public.match_jobs (company_profile_id)
  where status = 'PENDING'
    and company_profile_id is not null
    and deal_id is null;

create unique index if not exists match_jobs_pending_deal_idx
  on public.match_jobs (deal_id)
  where status = 'PENDING'
    and deal_id is not null
    and company_profile_id is null;

create unique index if not exists match_jobs_pending_pair_idx
  on public.match_jobs (company_profile_id, deal_id)
  where status = 'PENDING'
    and company_profile_id is not null
    and deal_id is not null;

create index if not exists match_jobs_status_requested_idx
  on public.match_jobs (status, requested_at);

alter table public.match_jobs enable row level security;
revoke all on table public.match_jobs from public, anon, authenticated;
grant all on table public.match_jobs to service_role;

comment on table public.match_jobs is
  'Server-only queue for recalculating deal_matches after profile edits or preview publish.';

create or replace function public.search_deal_previews_for_profile(
  p_company_profile_id uuid,
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_min_score numeric default null,
  p_sort text default 'updated',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  deal_id uuid,
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  relevance_score numeric,
  preview_reasons jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  with ranked as (
    select
      dp.deal_id,
      dp.slug,
      dp.preview_title,
      dp.preview_summary,
      dp.deal_type,
      dp.buyer_sector,
      dp.stage,
      dp.status,
      dp.main_category,
      dp.broad_region,
      dp.value_band,
      dp.deadline_band,
      dp.duration_band,
      dp.sme_suitability,
      dp.bid_complexity,
      dp.competition_level,
      dp.requirements_preview,
      dp.relevance_tags,
      dp.freshness_label,
      dm.relevance_score,
      coalesce(dm.preview_reasons, '[]'::jsonb) as preview_reasons,
      dp.updated_at,
      case
        when p_query is null or btrim(p_query) = '' then 0
        else ts_rank(
          to_tsvector(
            'english',
            coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')
          ),
          websearch_to_tsquery('english', p_query)
        )
      end as query_rank
    from public.deal_previews dp
    left join public.deal_matches dm
      on dm.deal_id = dp.deal_id
     and dm.company_profile_id = p_company_profile_id
    where dp.is_published = true
      and dp.leakage_risk = 'LOW'
      and (p_category is null or dp.main_category = p_category)
      and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
      and (p_deal_type is null or dp.deal_type = p_deal_type)
      and (p_region is null or dp.broad_region = p_region)
      and (p_status is null or dp.status = p_status)
      and (p_value_band is null or dp.value_band = p_value_band)
      and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
      and (
        p_min_score is null
        or coalesce(dm.relevance_score, -1) >= p_min_score
      )
      and (
        p_query is null
        or btrim(p_query) = ''
        or to_tsvector(
             'english',
             coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')
           ) @@ websearch_to_tsquery('english', p_query)
        or dp.preview_title % p_query
      )
  )
  select
    ranked.deal_id,
    ranked.slug,
    ranked.preview_title,
    ranked.preview_summary,
    ranked.deal_type,
    ranked.buyer_sector,
    ranked.stage,
    ranked.status,
    ranked.main_category,
    ranked.broad_region,
    ranked.value_band,
    ranked.deadline_band,
    ranked.duration_band,
    ranked.sme_suitability,
    ranked.bid_complexity,
    ranked.competition_level,
    ranked.requirements_preview,
    ranked.relevance_tags,
    ranked.freshness_label,
    ranked.relevance_score,
    ranked.preview_reasons,
    count(*) over() as total_count
  from ranked
  order by
    case when lower(coalesce(p_sort, 'updated')) = 'relevance'
      then coalesce(ranked.relevance_score, -1)
      else 0
    end desc,
    ranked.query_rank desc,
    ranked.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_deal_previews_for_profile(
  uuid, text, text, public.buyer_sector, public.deal_type, text, public.deal_status,
  text, text, numeric, text, integer, integer
) from public, anon;

grant execute on function public.search_deal_previews_for_profile(
  uuid, text, text, public.buyer_sector, public.deal_type, text, public.deal_status,
  text, text, numeric, text, integer, integer
) to authenticated, service_role;

comment on function public.search_deal_previews_for_profile is
  'Authenticated search over published deal_previews with optional relevance sort/filter. Join to deal_matches is RLS-constrained.';

-- ============================================================================
-- END 0011_matching_pipeline.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0012_deal_match_column_privileges.sql
-- ============================================================================

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

-- ============================================================================
-- END 0012_deal_match_column_privileges.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0013_alert_dedupe_and_digest.sql
-- ============================================================================

-- DealAtlas migration 0013
-- Alert deduplication and digest cursor. Alerts remain server-only.

alter table public.alerts
  add column if not exists dedupe_key text;

update public.alerts
set dedupe_key = concat_ws(
  ':',
  alert_type::text,
  coalesce(deal_id::text, 'none'),
  id::text
)
where dedupe_key is null;

alter table public.alerts
  alter column dedupe_key set not null;

create unique index if not exists alerts_user_dedupe_key_uidx
  on public.alerts (user_id, dedupe_key);

create index if not exists alerts_user_status_created_idx
  on public.alerts (user_id, status, created_at desc);

alter table public.notification_preferences
  add column if not exists last_digest_sent_at timestamptz;

-- No anon/authenticated grants on alerts. Digest timestamps are worker-written.

-- ============================================================================
-- END 0013_alert_dedupe_and_digest.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0014_intelligence_query_indexes.sql
-- ============================================================================

-- DealAtlas migration 0014
-- Query indexes for paid buyer/supplier/contract intelligence.
-- Aggregation stays query-time; no client grants.

create index if not exists contracts_extension_end_date_idx
  on public.contracts(extension_end_date);

create index if not exists deals_next_procurement_idx
  on public.deals(next_procurement_date);

create index if not exists related_deals_related_idx
  on public.related_deals(related_deal_id);

create index if not exists deal_insights_estimated_renewal_idx
  on public.deal_insights(estimated_renewal_date);

create index if not exists organizations_canonical_name_trgm_idx
  on public.organizations using gin (canonical_name extensions.gin_trgm_ops);

-- ============================================================================
-- END 0014_intelligence_query_indexes.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0015_export_usage_quota.sql
-- ============================================================================

-- DealAtlas migration 0015
-- Transactional Pro CSV export quota on export_usage.
-- Ordinary client roles still have no grants; trusted server code inserts
-- after entitlement checks. The trigger serializes usage per user/month.

create or replace function private.enforce_export_usage_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_rows integer;
  max_rows integer := 1000;
begin
  if not private.is_user_pro(new.user_id) then
    raise exception 'DealAtlas Pro subscription required to export';
  end if;

  new.billing_month := (date_trunc('month', timezone('utc', now())))::date;
  new.export_type := coalesce(nullif(btrim(new.export_type), ''), 'DEALS_CSV');

  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || ':export:' || new.billing_month::text, 4)
  );

  select coalesce(sum(row_count), 0)
    into current_rows
  from public.export_usage
  where user_id = new.user_id
    and billing_month = new.billing_month;

  if current_rows + new.row_count > max_rows then
    raise exception 'export row limit reached';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_export_usage_limit() from public, anon, authenticated;

drop trigger if exists enforce_export_usage_limit on public.export_usage;
create trigger enforce_export_usage_limit
before insert on public.export_usage
for each row execute function private.enforce_export_usage_limit();

comment on function private.enforce_export_usage_limit() is
  'Serializes Pro CSV export_usage inserts and rejects rows that would exceed 1000/month.';

-- ============================================================================
-- END 0015_export_usage_quota.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0016_admin_operations.sql
-- ============================================================================

-- DealAtlas migration 0016
-- Admin operations: unpublished preview hold, organisation merge, audit log.

alter table public.deal_previews
  add column if not exists unpublished_by_admin boolean not null default false;

comment on column public.deal_previews.unpublished_by_admin is
  'Admin hold. When true the preview stays unpublished even if leakage_risk is LOW.';

create or replace function private.enforce_preview_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  detected public.leakage_risk;
begin
  detected := private.detect_preview_leakage(new.deal_id, new.preview_title, new.preview_summary, new.requirements_preview);

  if detected = 'HIGH' then
    new.leakage_risk := 'HIGH';
    new.is_published := false;
  elsif detected = 'REVIEW' then
    if new.leakage_risk = 'LOW' then
      new.leakage_risk := 'REVIEW';
    end if;
    new.is_published := false;
  elsif new.leakage_risk <> 'LOW' then
    -- A deterministic LOW result does not override an application/manual REVIEW/HIGH status.
    new.is_published := false;
  end if;

  if new.unpublished_by_admin then
    new.is_published := false;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_preview_safety() from public, anon, authenticated;

drop trigger if exists enforce_preview_safety on public.deal_previews;
create trigger enforce_preview_safety
before insert or update of preview_title, preview_summary, requirements_preview, leakage_risk, is_published, unpublished_by_admin
on public.deal_previews
for each row execute function private.enforce_preview_safety();

create or replace function private.merge_organizations(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'merge requires two distinct organization ids';
  end if;

  if not exists (select 1 from public.organizations where id = p_keep) then
    raise exception 'keep organization not found';
  end if;

  if not exists (select 1 from public.organizations where id = p_drop) then
    raise exception 'drop organization not found';
  end if;

  update public.organization_identifiers as dropped
  set organization_id = p_keep
  where organization_id = p_drop
    and not exists (
      select 1
      from public.organization_identifiers as kept
      where kept.scheme = dropped.scheme
        and kept.value = dropped.value
    );
  delete from public.organization_identifiers where organization_id = p_drop;

  update public.organization_aliases as dropped
  set organization_id = p_keep
  where organization_id = p_drop
    and not exists (
      select 1
      from public.organization_aliases as kept
      where kept.organization_id = p_keep
        and kept.normalized_alias = dropped.normalized_alias
    );
  delete from public.organization_aliases where organization_id = p_drop;

  update public.organization_contacts
  set organization_id = p_keep
  where organization_id = p_drop;

  update public.deals
  set buyer_organization_id = p_keep
  where buyer_organization_id = p_drop;

  delete from public.deal_organizations as dropped
  where dropped.organization_id = p_drop
    and exists (
      select 1
      from public.deal_organizations as kept
      where kept.deal_id = dropped.deal_id
        and kept.role = dropped.role
        and kept.organization_id = p_keep
        and kept.lot_id is not distinct from dropped.lot_id
    );
  update public.deal_organizations
  set organization_id = p_keep
  where organization_id = p_drop;

  delete from public.award_suppliers as dropped
  where dropped.organization_id = p_drop
    and exists (
      select 1
      from public.award_suppliers as kept
      where kept.award_id = dropped.award_id
        and kept.organization_id = p_keep
    );
  update public.award_suppliers
  set organization_id = p_keep
  where organization_id = p_drop;

  update public.contract_payments
  set buyer_organization_id = p_keep
  where buyer_organization_id = p_drop;

  update public.contract_payments
  set supplier_organization_id = p_keep
  where supplier_organization_id = p_drop;

  update public.contract_performance
  set supplier_organization_id = p_keep
  where supplier_organization_id = p_drop;

  update public.deal_insights
  set incumbent_organization_id = p_keep
  where incumbent_organization_id = p_drop;

  delete from public.watched_organizations as dropped
  where dropped.organization_id = p_drop
    and exists (
      select 1
      from public.watched_organizations as kept
      where kept.user_id = dropped.user_id
        and kept.organization_id = p_keep
        and kept.watch_type = dropped.watch_type
    );
  update public.watched_organizations
  set organization_id = p_keep
  where organization_id = p_drop;

  update public.alerts
  set organization_id = p_keep
  where organization_id = p_drop;

  update public.commercial_tool_members
  set organization_id = p_keep
  where organization_id = p_drop;

  insert into public.organization_aliases (organization_id, alias, normalized_alias)
  select p_keep, source.canonical_name, source.normalized_name
  from public.organizations as source
  where source.id = p_drop
  on conflict (organization_id, normalized_alias) do nothing;

  delete from public.organizations where id = p_drop;
end;
$$;

revoke execute on function private.merge_organizations(uuid, uuid) from public, anon, authenticated;
grant execute on function private.merge_organizations(uuid, uuid) to service_role;

create or replace function public.admin_merge_organizations(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.merge_organizations(p_keep, p_drop);
end;
$$;

revoke execute on function public.admin_merge_organizations(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_merge_organizations(uuid, uuid) to service_role;

comment on function public.admin_merge_organizations(uuid, uuid) is
  'Service-role organisation merge used by the admin console after an application ADMIN check.';

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_idx
  on public.admin_audit_events (created_at desc);

create index if not exists admin_audit_events_entity_idx
  on public.admin_audit_events (entity_type, entity_id);

alter table public.admin_audit_events enable row level security;
revoke all on table public.admin_audit_events from public, anon, authenticated;
grant all on table public.admin_audit_events to service_role;

comment on table public.admin_audit_events is
  'Server-only audit of meaningful admin mutations. Not readable by anon or authenticated clients.';

-- ============================================================================
-- END 0016_admin_operations.sql
-- ============================================================================
