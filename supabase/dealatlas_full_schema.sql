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

-- ============================================================================
-- BEGIN 0017_job_runs.sql
-- ============================================================================

-- DealAtlas migration 0017
-- Server-only operational job run history for scheduled ingestion, alerts, and checks.

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  trigger_type text not null default 'SCHEDULED',
  status public.ingestion_status not null default 'RUNNING',
  mode text not null default 'live'
    check (mode in ('live', 'test', 'dry-run')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists job_runs_job_started_idx
  on public.job_runs (job_name, started_at desc);

create index if not exists job_runs_status_started_idx
  on public.job_runs (status, started_at desc);

alter table public.job_runs enable row level security;
revoke all on table public.job_runs from public, anon, authenticated;
grant all on table public.job_runs to service_role;

comment on table public.job_runs is
  'Server-only history of scheduled ingestion, preview, alert, renewal, and data-quality jobs. Not readable by anon or authenticated clients.';

-- ============================================================================
-- END 0017_job_runs.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0018_preview_gate_v2_and_dto_rpcs.sql
-- ============================================================================

-- DealAtlas migration 0018
-- Preview publish gate v2, sanitised DTO read RPCs and fail-closed Pro check.
--
-- Additive only: apply BEFORE deploying the app that reads previews through the
-- DTO RPCs. Direct anon/authenticated table access is removed separately in
-- 0019, which must only be applied after that app deploy is live.

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm'
      and n.nspname = 'extensions'
  ) then
    raise exception 'pg_trgm must be installed in schema extensions before migration 0018';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Shared gate vocabulary. Mirrors lib/redaction/gate-vocabulary.ts; the pgTAP
-- parity suite fails when the two drift.
-- -----------------------------------------------------------------------------
create table if not exists private.leak_gate_terms (
  kind text not null check (
    kind in (
      'generic_org_token',
      'generic_acronym',
      'generic_proper_word',
      'broad_location',
      'reference_prefix',
      'postcode_like',
      'phrase_stopword',
      'source_platform'
    )
  ),
  term text not null check (length(term) between 1 and 80),
  primary key (kind, term)
);

revoke all on table private.leak_gate_terms from public, anon, authenticated;
grant select on table private.leak_gate_terms to service_role;

delete from private.leak_gate_terms;
insert into private.leak_gate_terms (kind, term) values
  ('generic_org_token', 'academies'),
  ('generic_org_token', 'academy'),
  ('generic_org_token', 'agency'),
  ('generic_org_token', 'ambulance'),
  ('generic_org_token', 'and'),
  ('generic_org_token', 'association'),
  ('generic_org_token', 'authorities'),
  ('generic_org_token', 'authority'),
  ('generic_org_token', 'board'),
  ('generic_org_token', 'borough'),
  ('generic_org_token', 'britain'),
  ('generic_org_token', 'british'),
  ('generic_org_token', 'care'),
  ('generic_org_token', 'central'),
  ('generic_org_token', 'cic'),
  ('generic_org_token', 'city'),
  ('generic_org_token', 'college'),
  ('generic_org_token', 'combined'),
  ('generic_org_token', 'commercial'),
  ('generic_org_token', 'commission'),
  ('generic_org_token', 'commissioner'),
  ('generic_org_token', 'community'),
  ('generic_org_token', 'companies'),
  ('generic_org_token', 'company'),
  ('generic_org_token', 'construction'),
  ('generic_org_token', 'consulting'),
  ('generic_org_token', 'contractors'),
  ('generic_org_token', 'corporation'),
  ('generic_org_token', 'council'),
  ('generic_org_token', 'councils'),
  ('generic_org_token', 'county'),
  ('generic_org_token', 'crown'),
  ('generic_org_token', 'department'),
  ('generic_org_token', 'dept'),
  ('generic_org_token', 'development'),
  ('generic_org_token', 'district'),
  ('generic_org_token', 'east'),
  ('generic_org_token', 'eastern'),
  ('generic_org_token', 'education'),
  ('generic_org_token', 'electricity'),
  ('generic_org_token', 'energy'),
  ('generic_org_token', 'engineering'),
  ('generic_org_token', 'england'),
  ('generic_org_token', 'english'),
  ('generic_org_token', 'enterprises'),
  ('generic_org_token', 'estates'),
  ('generic_org_token', 'executive'),
  ('generic_org_token', 'facilities'),
  ('generic_org_token', 'fire'),
  ('generic_org_token', 'for'),
  ('generic_org_token', 'foundation'),
  ('generic_org_token', 'gas'),
  ('generic_org_token', 'global'),
  ('generic_org_token', 'government'),
  ('generic_org_token', 'greater'),
  ('generic_org_token', 'group'),
  ('generic_org_token', 'groups'),
  ('generic_org_token', 'health'),
  ('generic_org_token', 'healthcare'),
  ('generic_org_token', 'highways'),
  ('generic_org_token', 'holdings'),
  ('generic_org_token', 'homes'),
  ('generic_org_token', 'hospital'),
  ('generic_org_token', 'hospitals'),
  ('generic_org_token', 'housing'),
  ('generic_org_token', 'industries'),
  ('generic_org_token', 'infrastructure'),
  ('generic_org_token', 'integrated'),
  ('generic_org_token', 'international'),
  ('generic_org_token', 'ireland'),
  ('generic_org_token', 'kingdom'),
  ('generic_org_token', 'limited'),
  ('generic_org_token', 'llc'),
  ('generic_org_token', 'llp'),
  ('generic_org_token', 'local'),
  ('generic_org_token', 'lower'),
  ('generic_org_token', 'ltd'),
  ('generic_org_token', 'majesty'),
  ('generic_org_token', 'majestys'),
  ('generic_org_token', 'management'),
  ('generic_org_token', 'metropolitan'),
  ('generic_org_token', 'ministry'),
  ('generic_org_token', 'national'),
  ('generic_org_token', 'network'),
  ('generic_org_token', 'networks'),
  ('generic_org_token', 'new'),
  ('generic_org_token', 'nhs'),
  ('generic_org_token', 'north'),
  ('generic_org_token', 'northern'),
  ('generic_org_token', 'office'),
  ('generic_org_token', 'parish'),
  ('generic_org_token', 'partners'),
  ('generic_org_token', 'partnership'),
  ('generic_org_token', 'plc'),
  ('generic_org_token', 'police'),
  ('generic_org_token', 'power'),
  ('generic_org_token', 'private'),
  ('generic_org_token', 'property'),
  ('generic_org_token', 'public'),
  ('generic_org_token', 'rail'),
  ('generic_org_token', 'railway'),
  ('generic_org_token', 'railways'),
  ('generic_org_token', 'regional'),
  ('generic_org_token', 'rescue'),
  ('generic_org_token', 'road'),
  ('generic_org_token', 'roads'),
  ('generic_org_token', 'royal'),
  ('generic_org_token', 'school'),
  ('generic_org_token', 'schools'),
  ('generic_org_token', 'scotland'),
  ('generic_org_token', 'scottish'),
  ('generic_org_token', 'service'),
  ('generic_org_token', 'services'),
  ('generic_org_token', 'solutions'),
  ('generic_org_token', 'south'),
  ('generic_org_token', 'southern'),
  ('generic_org_token', 'support'),
  ('generic_org_token', 'system'),
  ('generic_org_token', 'systems'),
  ('generic_org_token', 'technologies'),
  ('generic_org_token', 'technology'),
  ('generic_org_token', 'the'),
  ('generic_org_token', 'town'),
  ('generic_org_token', 'trading'),
  ('generic_org_token', 'transport'),
  ('generic_org_token', 'trust'),
  ('generic_org_token', 'trusts'),
  ('generic_org_token', 'united'),
  ('generic_org_token', 'university'),
  ('generic_org_token', 'upper'),
  ('generic_org_token', 'utilities'),
  ('generic_org_token', 'ventures'),
  ('generic_org_token', 'wales'),
  ('generic_org_token', 'water'),
  ('generic_org_token', 'welsh'),
  ('generic_org_token', 'west'),
  ('generic_org_token', 'western'),
  ('generic_org_token', 'with'),
  ('generic_acronym', 'A&E'),
  ('generic_acronym', 'AED'),
  ('generic_acronym', 'ANPR'),
  ('generic_acronym', 'API'),
  ('generic_acronym', 'APIS'),
  ('generic_acronym', 'ASB'),
  ('generic_acronym', 'AWS'),
  ('generic_acronym', 'BCP'),
  ('generic_acronym', 'BIM'),
  ('generic_acronym', 'BMS'),
  ('generic_acronym', 'BREEAM'),
  ('generic_acronym', 'BSI'),
  ('generic_acronym', 'BTEC'),
  ('generic_acronym', 'CAD'),
  ('generic_acronym', 'CCTV'),
  ('generic_acronym', 'CDM'),
  ('generic_acronym', 'CHAS'),
  ('generic_acronym', 'CMS'),
  ('generic_acronym', 'CNC'),
  ('generic_acronym', 'CO2'),
  ('generic_acronym', 'COSHH'),
  ('generic_acronym', 'COVID'),
  ('generic_acronym', 'COVID19'),
  ('generic_acronym', 'CPD'),
  ('generic_acronym', 'CPV'),
  ('generic_acronym', 'CQC'),
  ('generic_acronym', 'CRM'),
  ('generic_acronym', 'CSCS'),
  ('generic_acronym', 'CSR'),
  ('generic_acronym', 'DBS'),
  ('generic_acronym', 'DDA'),
  ('generic_acronym', 'DFMA'),
  ('generic_acronym', 'DPIA'),
  ('generic_acronym', 'DPS'),
  ('generic_acronym', 'EHCP'),
  ('generic_acronym', 'EHR'),
  ('generic_acronym', 'EOI'),
  ('generic_acronym', 'EPC'),
  ('generic_acronym', 'EPR'),
  ('generic_acronym', 'ERP'),
  ('generic_acronym', 'ESG'),
  ('generic_acronym', 'ESOL'),
  ('generic_acronym', 'EVCP'),
  ('generic_acronym', 'EVS'),
  ('generic_acronym', 'FOI'),
  ('generic_acronym', 'GBP'),
  ('generic_acronym', 'GCSE'),
  ('generic_acronym', 'GDPR'),
  ('generic_acronym', 'GIS'),
  ('generic_acronym', 'GPS'),
  ('generic_acronym', 'HGV'),
  ('generic_acronym', 'HSCN'),
  ('generic_acronym', 'HVAC'),
  ('generic_acronym', 'IAAS'),
  ('generic_acronym', 'IAM'),
  ('generic_acronym', 'ICT'),
  ('generic_acronym', 'ICU'),
  ('generic_acronym', 'IOT'),
  ('generic_acronym', 'IR35'),
  ('generic_acronym', 'ISO'),
  ('generic_acronym', 'ITT'),
  ('generic_acronym', 'JCT'),
  ('generic_acronym', 'KPI'),
  ('generic_acronym', 'KPIS'),
  ('generic_acronym', 'LAN'),
  ('generic_acronym', 'LED'),
  ('generic_acronym', 'LGV'),
  ('generic_acronym', 'LIMS'),
  ('generic_acronym', 'LOLER'),
  ('generic_acronym', 'LPG'),
  ('generic_acronym', 'M&E'),
  ('generic_acronym', 'MEP'),
  ('generic_acronym', 'MEWP'),
  ('generic_acronym', 'MFA'),
  ('generic_acronym', 'MMC'),
  ('generic_acronym', 'MOT'),
  ('generic_acronym', 'MPLS'),
  ('generic_acronym', 'MRI'),
  ('generic_acronym', 'NEC'),
  ('generic_acronym', 'NHS'),
  ('generic_acronym', 'NVQ'),
  ('generic_acronym', 'OEM'),
  ('generic_acronym', 'PAAS'),
  ('generic_acronym', 'PACS'),
  ('generic_acronym', 'PAS'),
  ('generic_acronym', 'PAT'),
  ('generic_acronym', 'PCR'),
  ('generic_acronym', 'PFI'),
  ('generic_acronym', 'PM10'),
  ('generic_acronym', 'PPE'),
  ('generic_acronym', 'PQQ'),
  ('generic_acronym', 'PSN'),
  ('generic_acronym', 'PSTN'),
  ('generic_acronym', 'R&D'),
  ('generic_acronym', 'RFI'),
  ('generic_acronym', 'RFP'),
  ('generic_acronym', 'RFQ'),
  ('generic_acronym', 'RIDDOR'),
  ('generic_acronym', 'SAAS'),
  ('generic_acronym', 'SCADA'),
  ('generic_acronym', 'SEN'),
  ('generic_acronym', 'SEND'),
  ('generic_acronym', 'SIEM'),
  ('generic_acronym', 'SIP'),
  ('generic_acronym', 'SLA'),
  ('generic_acronym', 'SLAS'),
  ('generic_acronym', 'SME'),
  ('generic_acronym', 'SMES'),
  ('generic_acronym', 'SOC'),
  ('generic_acronym', 'SQL'),
  ('generic_acronym', 'SSIP'),
  ('generic_acronym', 'SSO'),
  ('generic_acronym', 'STEM'),
  ('generic_acronym', 'TUPE'),
  ('generic_acronym', 'UAT'),
  ('generic_acronym', 'UKAS'),
  ('generic_acronym', 'UPS'),
  ('generic_acronym', 'VAT'),
  ('generic_acronym', 'VCSE'),
  ('generic_acronym', 'VOIP'),
  ('generic_acronym', 'VPN'),
  ('generic_acronym', 'WAN'),
  ('generic_acronym', 'WIFI'),
  ('generic_proper_word', 'act'),
  ('generic_proper_word', 'agreement'),
  ('generic_proper_word', 'amazon'),
  ('generic_proper_word', 'and'),
  ('generic_proper_word', 'applicant'),
  ('generic_proper_word', 'applicants'),
  ('generic_proper_word', 'april'),
  ('generic_proper_word', 'august'),
  ('generic_proper_word', 'avenue'),
  ('generic_proper_word', 'barn'),
  ('generic_proper_word', 'bidder'),
  ('generic_proper_word', 'bidders'),
  ('generic_proper_word', 'bridge'),
  ('generic_proper_word', 'britain'),
  ('generic_proper_word', 'british'),
  ('generic_proper_word', 'building'),
  ('generic_proper_word', 'business'),
  ('generic_proper_word', 'buyer'),
  ('generic_proper_word', 'buyers'),
  ('generic_proper_word', 'centre'),
  ('generic_proper_word', 'client'),
  ('generic_proper_word', 'close'),
  ('generic_proper_word', 'consultant'),
  ('generic_proper_word', 'contractor'),
  ('generic_proper_word', 'contractors'),
  ('generic_proper_word', 'contracts'),
  ('generic_proper_word', 'court'),
  ('generic_proper_word', 'crescent'),
  ('generic_proper_word', 'customer'),
  ('generic_proper_word', 'cyber'),
  ('generic_proper_word', 'data'),
  ('generic_proper_word', 'december'),
  ('generic_proper_word', 'depot'),
  ('generic_proper_word', 'dock'),
  ('generic_proper_word', 'drive'),
  ('generic_proper_word', 'east'),
  ('generic_proper_word', 'employer'),
  ('generic_proper_word', 'england'),
  ('generic_proper_word', 'english'),
  ('generic_proper_word', 'essentials'),
  ('generic_proper_word', 'estate'),
  ('generic_proper_word', 'european'),
  ('generic_proper_word', 'farm'),
  ('generic_proper_word', 'february'),
  ('generic_proper_word', 'field'),
  ('generic_proper_word', 'fields'),
  ('generic_proper_word', 'friday'),
  ('generic_proper_word', 'gardens'),
  ('generic_proper_word', 'gate'),
  ('generic_proper_word', 'goods'),
  ('generic_proper_word', 'google'),
  ('generic_proper_word', 'great'),
  ('generic_proper_word', 'green'),
  ('generic_proper_word', 'hall'),
  ('generic_proper_word', 'health'),
  ('generic_proper_word', 'hill'),
  ('generic_proper_word', 'house'),
  ('generic_proper_word', 'humber'),
  ('generic_proper_word', 'industrial'),
  ('generic_proper_word', 'ireland'),
  ('generic_proper_word', 'january'),
  ('generic_proper_word', 'july'),
  ('generic_proper_word', 'june'),
  ('generic_proper_word', 'kingdom'),
  ('generic_proper_word', 'lane'),
  ('generic_proper_word', 'living'),
  ('generic_proper_word', 'lodge'),
  ('generic_proper_word', 'london'),
  ('generic_proper_word', 'lot'),
  ('generic_proper_word', 'lots'),
  ('generic_proper_word', 'march'),
  ('generic_proper_word', 'may'),
  ('generic_proper_word', 'microsoft'),
  ('generic_proper_word', 'midlands'),
  ('generic_proper_word', 'mill'),
  ('generic_proper_word', 'modern'),
  ('generic_proper_word', 'monday'),
  ('generic_proper_word', 'nationwide'),
  ('generic_proper_word', 'net'),
  ('generic_proper_word', 'north'),
  ('generic_proper_word', 'northern'),
  ('generic_proper_word', 'november'),
  ('generic_proper_word', 'october'),
  ('generic_proper_word', 'of'),
  ('generic_proper_word', 'office'),
  ('generic_proper_word', 'park'),
  ('generic_proper_word', 'place'),
  ('generic_proper_word', 'plus'),
  ('generic_proper_word', 'private'),
  ('generic_proper_word', 'procurement'),
  ('generic_proper_word', 'protection'),
  ('generic_proper_word', 'provider'),
  ('generic_proper_word', 'providers'),
  ('generic_proper_word', 'public'),
  ('generic_proper_word', 'purchaser'),
  ('generic_proper_word', 'quay'),
  ('generic_proper_word', 'real'),
  ('generic_proper_word', 'regulations'),
  ('generic_proper_word', 'remote'),
  ('generic_proper_word', 'safety'),
  ('generic_proper_word', 'saturday'),
  ('generic_proper_word', 'scotland'),
  ('generic_proper_word', 'scottish'),
  ('generic_proper_word', 'sector'),
  ('generic_proper_word', 'september'),
  ('generic_proper_word', 'site'),
  ('generic_proper_word', 'slavery'),
  ('generic_proper_word', 'social'),
  ('generic_proper_word', 'south'),
  ('generic_proper_word', 'specification'),
  ('generic_proper_word', 'square'),
  ('generic_proper_word', 'station'),
  ('generic_proper_word', 'store'),
  ('generic_proper_word', 'street'),
  ('generic_proper_word', 'sunday'),
  ('generic_proper_word', 'supplier'),
  ('generic_proper_word', 'suppliers'),
  ('generic_proper_word', 'tenderer'),
  ('generic_proper_word', 'tenderers'),
  ('generic_proper_word', 'terrace'),
  ('generic_proper_word', 'the'),
  ('generic_proper_word', 'thursday'),
  ('generic_proper_word', 'tuesday'),
  ('generic_proper_word', 'union'),
  ('generic_proper_word', 'unit'),
  ('generic_proper_word', 'united'),
  ('generic_proper_word', 'units'),
  ('generic_proper_word', 'value'),
  ('generic_proper_word', 'wage'),
  ('generic_proper_word', 'wales'),
  ('generic_proper_word', 'wednesday'),
  ('generic_proper_word', 'welsh'),
  ('generic_proper_word', 'west'),
  ('generic_proper_word', 'wharf'),
  ('generic_proper_word', 'works'),
  ('generic_proper_word', 'workspace'),
  ('generic_proper_word', 'yard'),
  ('generic_proper_word', 'yorkshire'),
  ('generic_proper_word', 'zero'),
  ('broad_location', 'britain'),
  ('broad_location', 'east'),
  ('broad_location', 'east midlands'),
  ('broad_location', 'east of england'),
  ('broad_location', 'england'),
  ('broad_location', 'europe'),
  ('broad_location', 'gb'),
  ('broad_location', 'great britain'),
  ('broad_location', 'ireland'),
  ('broad_location', 'london'),
  ('broad_location', 'midlands'),
  ('broad_location', 'nationwide'),
  ('broad_location', 'north'),
  ('broad_location', 'north east'),
  ('broad_location', 'north east england'),
  ('broad_location', 'north west'),
  ('broad_location', 'north west england'),
  ('broad_location', 'northern ireland'),
  ('broad_location', 'remote'),
  ('broad_location', 'scotland'),
  ('broad_location', 'south'),
  ('broad_location', 'south east'),
  ('broad_location', 'south east england'),
  ('broad_location', 'south west'),
  ('broad_location', 'south west england'),
  ('broad_location', 'uk'),
  ('broad_location', 'united kingdom'),
  ('broad_location', 'wales'),
  ('broad_location', 'west'),
  ('broad_location', 'west midlands'),
  ('broad_location', 'yorkshire and the humber'),
  ('reference_prefix', 'bs'),
  ('reference_prefix', 'bsen'),
  ('reference_prefix', 'en'),
  ('reference_prefix', 'g'),
  ('reference_prefix', 'hbn'),
  ('reference_prefix', 'htm'),
  ('reference_prefix', 'iec'),
  ('reference_prefix', 'ipv'),
  ('reference_prefix', 'iso'),
  ('reference_prefix', 'jct'),
  ('reference_prefix', 'lot'),
  ('reference_prefix', 'm'),
  ('reference_prefix', 'nec'),
  ('reference_prefix', 'office'),
  ('reference_prefix', 'pas'),
  ('reference_prefix', 'phase'),
  ('reference_prefix', 'shtm'),
  ('reference_prefix', 'tier'),
  ('reference_prefix', 'year'),
  ('postcode_like', 'A3'),
  ('postcode_like', 'A4'),
  ('postcode_like', 'A5'),
  ('postcode_like', 'B2B'),
  ('postcode_like', 'B2C'),
  ('postcode_like', 'B2G'),
  ('postcode_like', 'CO2'),
  ('postcode_like', 'E2E'),
  ('postcode_like', 'G2G'),
  ('postcode_like', 'H2'),
  ('postcode_like', 'H2O'),
  ('postcode_like', 'IR35'),
  ('postcode_like', 'KS1'),
  ('postcode_like', 'KS2'),
  ('postcode_like', 'KS3'),
  ('postcode_like', 'KS4'),
  ('postcode_like', 'KS5'),
  ('postcode_like', 'NO2'),
  ('postcode_like', 'P2P'),
  ('postcode_like', 'PM10'),
  ('postcode_like', 'SO2'),
  ('phrase_stopword', 'a'),
  ('phrase_stopword', 'across'),
  ('phrase_stopword', 'all'),
  ('phrase_stopword', 'also'),
  ('phrase_stopword', 'an'),
  ('phrase_stopword', 'and'),
  ('phrase_stopword', 'any'),
  ('phrase_stopword', 'are'),
  ('phrase_stopword', 'as'),
  ('phrase_stopword', 'at'),
  ('phrase_stopword', 'be'),
  ('phrase_stopword', 'been'),
  ('phrase_stopword', 'being'),
  ('phrase_stopword', 'by'),
  ('phrase_stopword', 'can'),
  ('phrase_stopword', 'contract'),
  ('phrase_stopword', 'contracts'),
  ('phrase_stopword', 'could'),
  ('phrase_stopword', 'delivery'),
  ('phrase_stopword', 'for'),
  ('phrase_stopword', 'framework'),
  ('phrase_stopword', 'from'),
  ('phrase_stopword', 'has'),
  ('phrase_stopword', 'have'),
  ('phrase_stopword', 'in'),
  ('phrase_stopword', 'include'),
  ('phrase_stopword', 'including'),
  ('phrase_stopword', 'into'),
  ('phrase_stopword', 'is'),
  ('phrase_stopword', 'it'),
  ('phrase_stopword', 'its'),
  ('phrase_stopword', 'may'),
  ('phrase_stopword', 'must'),
  ('phrase_stopword', 'no'),
  ('phrase_stopword', 'not'),
  ('phrase_stopword', 'of'),
  ('phrase_stopword', 'on'),
  ('phrase_stopword', 'opportunity'),
  ('phrase_stopword', 'or'),
  ('phrase_stopword', 'other'),
  ('phrase_stopword', 'our'),
  ('phrase_stopword', 'over'),
  ('phrase_stopword', 'per'),
  ('phrase_stopword', 'provision'),
  ('phrase_stopword', 'requirement'),
  ('phrase_stopword', 'requirements'),
  ('phrase_stopword', 'service'),
  ('phrase_stopword', 'services'),
  ('phrase_stopword', 'should'),
  ('phrase_stopword', 'such'),
  ('phrase_stopword', 'supply'),
  ('phrase_stopword', 'tender'),
  ('phrase_stopword', 'that'),
  ('phrase_stopword', 'the'),
  ('phrase_stopword', 'their'),
  ('phrase_stopword', 'these'),
  ('phrase_stopword', 'this'),
  ('phrase_stopword', 'those'),
  ('phrase_stopword', 'to'),
  ('phrase_stopword', 'under'),
  ('phrase_stopword', 'up'),
  ('phrase_stopword', 'was'),
  ('phrase_stopword', 'we'),
  ('phrase_stopword', 'were'),
  ('phrase_stopword', 'which'),
  ('phrase_stopword', 'who'),
  ('phrase_stopword', 'will'),
  ('phrase_stopword', 'with'),
  ('phrase_stopword', 'within'),
  ('phrase_stopword', 'would'),
  ('phrase_stopword', 'you'),
  ('source_platform', 'achilles uvdb'),
  ('source_platform', 'atamis'),
  ('source_platform', 'balfour beatty supply chain'),
  ('source_platform', 'blue light procurement database'),
  ('source_platform', 'bluelight'),
  ('source_platform', 'bravo'),
  ('source_platform', 'bravosolution'),
  ('source_platform', 'competefor'),
  ('source_platform', 'constructionline'),
  ('source_platform', 'contracts finder'),
  ('source_platform', 'contractsfinder'),
  ('source_platform', 'crown commercial service'),
  ('source_platform', 'crown marketplace'),
  ('source_platform', 'delta e-sourcing'),
  ('source_platform', 'delta esourcing'),
  ('source_platform', 'digital marketplace'),
  ('source_platform', 'due north'),
  ('source_platform', 'e-tenders ni'),
  ('source_platform', 'etendersni'),
  ('source_platform', 'etenderwales'),
  ('source_platform', 'eu-supply'),
  ('source_platform', 'find a tender'),
  ('source_platform', 'find-a-tender'),
  ('source_platform', 'find-tender'),
  ('source_platform', 'hinkley point c supply chain'),
  ('source_platform', 'hs2 direct contract opportunities'),
  ('source_platform', 'hs2 indirect supply chain opportunities'),
  ('source_platform', 'in-tend'),
  ('source_platform', 'intend'),
  ('source_platform', 'jaggaer'),
  ('source_platform', 'mytenders'),
  ('source_platform', 'national grid suppliers'),
  ('source_platform', 'national highways contracts pipeline'),
  ('source_platform', 'national infrastructure and construction pipeline'),
  ('source_platform', 'national infrastructure and construction pipeline 2023'),
  ('source_platform', 'network rail procurement pipeline'),
  ('source_platform', 'nista'),
  ('source_platform', 'pro-contract'),
  ('source_platform', 'proactis'),
  ('source_platform', 'procontract'),
  ('source_platform', 'public contracts scotland'),
  ('source_platform', 'sell 2 wales'),
  ('source_platform', 'sell2wales'),
  ('source_platform', 'sizewell c jaggaer supply chain'),
  ('source_platform', 'supply2gov'),
  ('source_platform', 'ted.europa.eu'),
  ('source_platform', 'tenders direct'),
  ('source_platform', 'tenders electronic daily'),
  ('source_platform', 'thames water capital delivery pipeline'),
  ('source_platform', 'the chest'),
  ('source_platform', 'tideway supply chain'),
  ('source_platform', 'tideway supply chain (competefor)'),
  ('source_platform', 'uk infrastructure pipeline')
;

-- -----------------------------------------------------------------------------
-- Normalisation shared with lib/redaction/gate-normalize.ts: lowercase ASCII
-- alphanumerics separated by single spaces, padded so word containment is a
-- plain position() check.
-- -----------------------------------------------------------------------------
create or replace function private.leak_norm(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select ' ' || pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g')) || ' ';
$$;

revoke execute on function private.leak_norm(text) from public, anon, authenticated;

-- Organisation names with legal suffixes removed, for matching any known
-- organisation (buyer, supplier, incumbent) in preview text. Built-ins only so
-- the generated columns stay immutable and privilege-free.
alter table public.organizations
  add column if not exists leak_match_name text generated always as (
    case
      when length(btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(canonical_name, '')), '[^a-z0-9]+', ' ', 'g'), '\m(ltd|limited|llp|plc|llc|inc|cic|co|the)\M', ' ', 'g'), '\s+', ' ', 'g'))) >= 3
      then ' ' || btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(canonical_name, '')), '[^a-z0-9]+', ' ', 'g'), '\m(ltd|limited|llp|plc|llc|inc|cic|co|the)\M', ' ', 'g'), '\s+', ' ', 'g')) || ' '
    end
  ) stored;

alter table public.organization_aliases
  add column if not exists leak_match_name text generated always as (
    case
      when length(btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(alias, '')), '[^a-z0-9]+', ' ', 'g'), '\m(ltd|limited|llp|plc|llc|inc|cic|co|the)\M', ' ', 'g'), '\s+', ' ', 'g'))) >= 3
      then ' ' || btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(alias, '')), '[^a-z0-9]+', ' ', 'g'), '\m(ltd|limited|llp|plc|llc|inc|cic|co|the)\M', ' ', 'g'), '\s+', ' ', 'g')) || ' '
    end
  ) stored;

comment on column public.organizations.leak_match_name is
  'Server-only normalised name used by the preview leak gate. Never expose.';
comment on column public.organization_aliases.leak_match_name is
  'Server-only normalised alias used by the preview leak gate. Never expose.';

-- Word index over source text for the combination (k-anonymity) rule.
create index if not exists deals_leak_source_tsv_idx on public.deals using gin (
  to_tsvector('simple'::regconfig, coalesce(source_title, '') || ' ' || coalesce(source_description, ''))
);

-- -----------------------------------------------------------------------------
-- Preview leak findings v2. Every rule returns (code, risk, token). Tokens may
-- contain protected values: this function is private and its output must only
-- reach service-role/admin code.
-- -----------------------------------------------------------------------------
create or replace function private.preview_leak_findings(
  p_deal_id uuid,
  p_slug text,
  p_preview_title text,
  p_preview_summary text,
  p_requirements jsonb,
  p_relevance_tags text[] default '{}'::text[],
  p_broad_region text default null
)
returns table (finding_code text, finding_risk public.leakage_risk, finding_token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.deals%rowtype;
  b public.organizations%rowtype;
  v_has_buyer boolean := false;
  v_generic_org text[];
  v_generic_acr text[];
  v_generic_proper text[];
  v_broad text[];
  v_ref_prefix text[];
  v_postcode_like text[];
  v_stop text[];
  v_platforms text[];
  v_req text[];
  v_segments text[];
  v_prose_segments text[];
  v_slug text;
  v_slug_norm text;
  v_slug_tokens text[];
  v_text_cs text;
  v_all text;
  v_all_lower text;
  v_all_norm text;
  v_source_parts text[];
  v_source_raw text;
  v_source_norm text;
  v_source_acronyms text[];
  v_source_names text[];
  v_cs_tokens text[];
  v_term text;
  v_label text;
  v_norm text;
  v_words text[];
  v_window text;
  v_seg text;
  v_digits text;
  v_m text[];
  v_count integer;
  v_sim real;
  v_carried text[];
  v_k integer;
  v_amounts text[];
  i integer;
begin
  select * into d from public.deals where id = p_deal_id;
  if not found then
    return query select 'DEAL_MISSING'::text, 'HIGH'::public.leakage_risk, null::text;
    return;
  end if;

  select
    coalesce(array_agg(t.term) filter (where t.kind = 'generic_org_token'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'generic_acronym'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'generic_proper_word'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'broad_location'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'reference_prefix'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'postcode_like'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'phrase_stopword'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'source_platform'), '{}')
  into v_generic_org, v_generic_acr, v_generic_proper, v_broad, v_ref_prefix, v_postcode_like, v_stop, v_platforms
  from private.leak_gate_terms t;

  -- Every string leaf of requirements_preview is scanned, not just text/label.
  select coalesce(array_agg(btrim(v #>> '{}')) filter (where btrim(v #>> '{}') <> ''), '{}')
  into v_req
  from jsonb_path_query(
    case when jsonb_typeof(p_requirements) in ('array', 'object') then p_requirements else '[]'::jsonb end,
    'strict $.**'
  ) as v
  where jsonb_typeof(v) = 'string';

  v_prose_segments := array_remove(array[nullif(btrim(p_preview_summary), '')], null) || v_req;
  v_segments := array_remove(array[nullif(btrim(p_preview_title), '')], null) || v_prose_segments;
  v_slug := regexp_replace(lower(coalesce(p_slug, '')), '-[0-9a-f]{8}$', '');
  v_slug_norm := private.leak_norm(v_slug);
  v_slug_tokens := string_to_array(btrim(v_slug_norm), ' ');
  v_text_cs := concat_ws(' . ', nullif(array_to_string(v_segments, ' . '), ''), nullif(array_to_string(coalesce(p_relevance_tags, '{}'), ' . '), ''));
  v_all := concat_ws(' . ', nullif(v_text_cs, ''), nullif(v_slug, ''));
  v_all_lower := lower(v_all);
  v_all_norm := private.leak_norm(v_all);
  v_cs_tokens := array(select m[1] from regexp_matches(v_text_cs, '([A-Za-z0-9&]+)', 'g') as m);

  select array_remove(
    array[d.source_title, d.source_description]
    || coalesce((select array_agg(x) from public.lots l, unnest(array[l.source_title, l.source_description]) as x where l.deal_id = d.id), '{}')
    || coalesce((select array_agg(x) from public.requirements r, unnest(array[r.name, r.description]) as x where r.deal_id = d.id), '{}')
    || coalesce((select array[pod.project_name] || pod.goods_required || pod.services_required || pod.works_required
       from public.private_opportunity_details pod where pod.deal_id = d.id), '{}'),
    null
  ) into v_source_parts;
  v_source_raw := array_to_string(v_source_parts, ' . ');
  v_source_norm := private.leak_norm(v_source_raw);

  -- Names the source uses: standalone acronyms (outside all-caps fields and
  -- all-caps runs) and capitalised words that follow a lowercase word and never
  -- appear in lowercase. Matched case-insensitively so slugs and lowercased
  -- prose cannot carry them.
  select coalesce(array_agg(distinct lower(m[1])), '{}') into v_source_acronyms
  from unnest(v_source_parts) as part
  cross join lateral regexp_matches(
    regexp_replace(part, '\m[A-Z][A-Z0-9&]*(?:\s+[A-Z][A-Z0-9&]*\M)+', ' ', 'g'),
    '\m([A-Z][A-Z0-9]{2,5})\M', 'g'
  ) as m
  where length(regexp_replace(part, '[^A-Z]', '', 'g')) * 2 <= length(regexp_replace(part, '[^A-Za-z]', '', 'g'))
    and m[1] <> all(v_generic_acr)
    and lower(m[1]) <> all(v_generic_org)
    and lower(m[1]) <> all(v_generic_proper)
    and lower(m[1]) <> all(v_broad)
    and lower(m[1]) <> all(v_stop)
    and not exists (
      select 1 from regexp_matches(v_source_raw, '\m(' || m[1] || ')\M', 'gi') as o where o[1] <> m[1]
    );

  select coalesce(array_agg(distinct lower(m[1])), '{}') into v_source_names
  from unnest(v_source_parts) as part
  cross join lateral regexp_matches(part, '\m[a-z][a-z0-9''-]*[,;:)]?\s+([A-Z][a-z]{3,})\M', 'g') as m
  where lower(m[1]) <> all(v_generic_org)
    and lower(m[1]) <> all(v_generic_proper)
    and lower(m[1]) <> all(v_broad)
    and lower(m[1]) <> all(v_stop)
    and v_source_raw !~ ('\m' || lower(m[1]) || '\M');

  -- Direct identifiers -------------------------------------------------------
  return query select 'URL'::text, 'HIGH'::public.leakage_risk, left(m[1], 120)
    from regexp_matches(v_all, '((?:https?://|www\.)[^[:space:]]+)', 'gi') as m;

  return query select 'EMAIL'::text, 'HIGH'::public.leakage_risk, left(m[1], 120)
    from regexp_matches(v_all, '([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})', 'gi') as m;

  return query select 'DOMAIN'::text, 'HIGH'::public.leakage_risk, left(m[1], 120)
    from regexp_matches(v_all, '\m([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:uk|com|org|gov|eu|io|info|scot|wales|cymru))\M', 'gi') as m;

  for v_m in select regexp_matches(v_all, '(\+?[0-9][0-9 ().-]{8,18}[0-9])', 'g') loop
    v_digits := regexp_replace(v_m[1], '[^0-9]', '', 'g');
    if length(v_digits) between 10 and 13 and (v_digits like '0%' or v_digits like '44%') then
      return query select 'PHONE'::text, 'HIGH'::public.leakage_risk, v_m[1];
    end if;
  end loop;

  return query select 'OCID'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m(ocds-[a-z0-9]{3,}-[a-z0-9-]+)', 'gi') as m;

  return query select 'REFERENCE_ID'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([0-9]{6,}-[0-9]{4})\M', 'g') as m;

  return query select 'REFERENCE_ID'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\M', 'gi') as m;

  for v_term in
    select distinct btrim(x)
    from (
      select unnest(array[d.reference, d.ocid, d.external_primary_id]) as x
      union all select n.notice_identifier from public.notices n where n.deal_id = d.id
      union all select n.release_id from public.notices n where n.deal_id = d.id
      union all select pod.rfp_number from public.private_opportunity_details pod where pod.deal_id = d.id
      union all select pod.rfq_number from public.private_opportunity_details pod where pod.deal_id = d.id
      union all select c.contract_identifier from public.contracts c where c.deal_id = d.id
      union all select a.award_identifier from public.awards a where a.deal_id = d.id
      union all select l.source_lot_id from public.lots l where l.deal_id = d.id
      union all select oi.value from public.organization_identifiers oi where oi.organization_id = d.buyer_organization_id
    ) refs
    where x is not null
  loop
    v_norm := private.leak_norm(v_term);
    if v_term ~ '[0-9]' and length(btrim(v_norm)) >= 5 and position(v_norm in v_all_norm) > 0 then
      return query select 'REFERENCE_ID'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  return query select 'REFERENCE_PATTERN'::text, 'REVIEW'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m(([A-Za-z]{1,6})[-/_.]?[0-9]{3,}(?:[-/_.][A-Za-z0-9]+)*)\M', 'g') as m
    where lower(m[2]) <> all(v_ref_prefix);

  -- Dates --------------------------------------------------------------------
  foreach v_term in array array[
    '\m([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))\M',
    '\m([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?may,?\s+(?:19|20)[0-9]{2})\M',
    '\m((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+[0-3]?[0-9](?:st|nd|rd|th)?)\M',
    '\m(may\s+[0-3]?[0-9](?:st|nd|rd|th)?,?\s+(?:19|20)[0-9]{2})\M',
    '\m([0-3]?[0-9][/.-][01]?[0-9][/.-](?:19|20)?[0-9]{2})\M',
    '\m((?:19|20)[0-9]{2}[/.-][01]?[0-9][/.-][0-3]?[0-9])\M',
    '\m([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?may)\M(?!\s+(?:be|not|also|apply|have|include|need|require|vary|change|only|still|well)\M)',
    '\m(may\s+[0-3]?[0-9](?:st|nd|rd|th)?)\M',
    '(?<![0-9/.])((?:0?[1-9]|[12][0-9]|3[01])/(?:0?[1-9]|1[0-2]))(?![0-9/])',
    '\m([0-3]?[0-9]-(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:-(?:19|20)?[0-9]{2})?)\M'
  ]
  loop
    return query select 'DATE_EXACT'::text, 'REVIEW'::public.leakage_risk, m[1]
      from regexp_matches(v_all, v_term, 'gi') as m
      where m[1] <> '24/7';
  end loop;

  -- Source dates in Europe/London, +/- one day, in common written forms.
  for v_term in
    with src(dt) as (
      select (x at time zone 'Europe/London')::date
      from unnest(array[d.enquiry_deadline, d.submission_deadline, d.first_published_at]) as x
      where x is not null
      union
      select x
      from unnest(array[
        d.award_decision_date, d.contract_start_date, d.contract_end_date, d.extension_end_date,
        d.next_procurement_date, d.estimated_renewal_date
      ]) as x
      where x is not null
      union
      select (pod.expression_of_interest_deadline at time zone 'Europe/London')::date
      from public.private_opportunity_details pod
      where pod.deal_id = d.id and pod.expression_of_interest_deadline is not null
      union
      select pod.anticipated_award_date
      from public.private_opportunity_details pod
      where pod.deal_id = d.id and pod.anticipated_award_date is not null
      union
      select (n.published_at at time zone 'Europe/London')::date
      from public.notices n
      where n.deal_id = d.id and n.published_at is not null
      union
      select (l.submission_deadline at time zone 'Europe/London')::date
      from public.lots l
      where l.deal_id = d.id and l.submission_deadline is not null
      union
      select x
      from public.lots l, unnest(array[l.contract_start_date, l.contract_end_date]) as x
      where l.deal_id = d.id and x is not null
      union
      select a.award_date from public.awards a where a.deal_id = d.id and a.award_date is not null
      union
      select x
      from public.contracts c, unnest(array[c.start_date, c.end_date]) as x
      where c.deal_id = d.id and x is not null
    ),
    days(dt) as (
      select distinct s.dt + o
      from src s
      cross join generate_series(-1, 1) as o
    )
    select distinct to_char(days.dt, f)
    from days
    cross join unnest(array[
      'YYYY-MM-DD', 'DD/MM/YYYY', 'FMDD/FMMM/YYYY', 'DD/MM/YY', 'FMDD FMMonth',
      'FMDDth FMMonth', 'FMDD Mon', 'FMDDth Mon', 'FMMonth FMDD', 'FMMonth FMDDth', 'Mon FMDD',
      'DD/MM', 'FMDD/FMMM', 'DD.MM', 'FMDD.FMMM', 'DD-MM', 'FMDD-FMMM', 'DD MM'
    ]) as f
  loop
    -- Yearless numeric forms only count with digit boundaries, so decimals
    -- such as "14.035" or longer digit runs are not hits. A hyphen may follow
    -- so ranges like "14/03-21/03" still match.
    if (v_term ~ '^[0-9]+[/. -][0-9]+$'
        and v_all_lower ~ ('(?<![0-9/.,])' || replace(v_term, '.', '[.]') || '(?![0-9]|[/.,][0-9])'))
       or (v_term !~ '^[0-9]+[/. -][0-9]+$' and position(private.leak_norm(v_term) in v_all_norm) > 0)
    then
      return query select 'DATE_SOURCE'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  -- Postcodes and places -----------------------------------------------------
  return query select 'POSTCODE'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\M', 'gi') as m;

  for v_term in
    select distinct upper(left(c, length(c) - 3))
    from (
      select regexp_replace(upper(pc), '[^A-Z0-9]', '', 'g') as c
      from (
        select b2.postcode as pc from public.organizations b2 where b2.id = d.buyer_organization_id
        union all
        select o.postcode
        from public.deal_organizations dorg
        join public.organizations o on o.id = dorg.organization_id
        where dorg.deal_id = d.id
        union all
        select loc.postcode
        from public.deal_locations dl
        join public.locations loc on loc.id = dl.location_id
        where dl.deal_id = d.id
        union all
        select m[1]
        from regexp_matches(coalesce(v_source_raw, '') || ' ' || coalesce(d.exact_location_text, ''), '\m([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\M', 'gi') as m
      ) pcs
      where pc is not null
    ) compact
    where c ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$'
  loop
    if v_all ~* ('\m' || v_term || '\M') then
      return query select 'POSTCODE_KNOWN_OUTWARD'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  return query select 'POSTCODE_OUTWARD'::text, 'REVIEW'::public.leakage_risk, m[1]
    from regexp_matches(v_text_cs, '\m([A-Z]{1,2}[0-9][A-Z0-9]?)\M', 'g') as m
    where m[1] <> all(v_postcode_like);

  -- Slugs are lowercase, so postcode-shaped slug words are checked separately.
  return query select 'POSTCODE_OUTWARD'::text, 'REVIEW'::public.leakage_risk, upper(w)
    from unnest(v_slug_tokens) as w
    where w ~ '^[a-z]{1,2}[0-9][a-z0-9]?$' and upper(w) <> all(v_postcode_like);

  if d.buyer_organization_id is not null then
    select * into b from public.organizations where id = d.buyer_organization_id;
    v_has_buyer := found;
  end if;

  for v_term in
    select distinct btrim(part)
    from (
      select regexp_split_to_table(x, '[,;/|()]') as part
      from (
        select d.exact_location_text as x
        union all select l.exact_location_text from public.lots l where l.deal_id = d.id
      ) s
      where x is not null
      union all
      select unnest(array[loc.city, loc.county])
      from public.deal_locations dl
      join public.locations loc on loc.id = dl.location_id
      where dl.deal_id = d.id
      union all
      select unnest(array[b.city, b.county, b.address_line_1, b.address_line_2])
      where v_has_buyer
    ) parts
    where part is not null
  loop
    v_norm := private.leak_norm(v_term);
    if length(btrim(v_norm)) >= 4
       and btrim(v_norm) <> all(v_broad)
       and v_norm <> private.leak_norm(p_broad_region)
       and exists (
         select 1
         from unnest(string_to_array(btrim(v_norm), ' ')) as w
         where w <> all(v_generic_org) and w <> all(v_broad) and w !~ '^[0-9]+$'
       )
       and position(v_norm in v_all_norm) > 0
    then
      return query select 'LOCATION_EXACT'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;

    -- Single distinctive words of a location ("Brindlequay" from
    -- "Brindlequay, Ostbury Fenmoor"), in any case and in the slug.
    return query select 'LOCATION_TOKEN'::text,
        (case when length(w) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        w
      from unnest(string_to_array(btrim(v_norm), ' ')) as w
      where length(w) >= 4
        and w !~ '[0-9]'
        and w <> all(v_generic_org)
        and w <> all(v_generic_proper)
        and w <> all(v_broad)
        and w <> all(v_stop)
        and position(' ' || w || ' ' in coalesce(private.leak_norm(p_broad_region), '')) = 0
        and position(' ' || w || ' ' in v_all_norm) > 0;
  end loop;

  -- Buyer identity -----------------------------------------------------------
  if v_has_buyer then
    v_norm := private.leak_norm(b.canonical_name);
    if length(btrim(v_norm)) >= 3 and position(v_norm in v_all_norm) > 0 then
      return query select 'BUYER_NAME'::text, 'HIGH'::public.leakage_risk, b.canonical_name;
    elsif b.leak_match_name is not null and position(b.leak_match_name in v_all_norm) > 0 then
      return query select 'BUYER_NAME'::text, 'HIGH'::public.leakage_risk, b.canonical_name;
    end if;

    for v_term in
      select a.alias from public.organization_aliases a where a.organization_id = b.id
    loop
      v_label := replace(v_term, '.', '');
      -- Acronym-style aliases: all caps, or mixed case with two or more capitals.
      if v_label ~ '^[A-Za-z0-9&]{2,12}$'
         and ((v_label ~ '[A-Z]' and v_label !~ '[a-z]') or v_label ~ '[A-Z][^A-Z]*[A-Z]')
      then
        if v_label = any(v_cs_tokens)
           or (length(v_label) >= 3
               and upper(v_label) <> all(v_generic_acr)
               and lower(v_label) <> all(v_generic_org)
               and lower(v_label) <> all(v_generic_proper)
               and lower(v_label) <> all(v_stop)
               and position(private.leak_norm(v_label) in v_all_norm) > 0)
        then
          return query select 'BUYER_ACRONYM'::text, 'HIGH'::public.leakage_risk, v_term;
        end if;
        continue;
      end if;
      v_norm := private.leak_norm(v_term);
      if length(btrim(v_norm)) >= 4
         and exists (
           select 1 from unnest(string_to_array(btrim(v_norm), ' ')) as w
           where w <> all(v_generic_org) and w <> all(v_broad)
         )
         and position(v_norm in v_all_norm) > 0
      then
        return query select 'BUYER_ALIAS'::text, 'HIGH'::public.leakage_risk, v_term;
      elsif length(btrim(v_norm)) between 2 and 3
         and btrim(v_norm) <> all(v_generic_org)
         and btrim(v_norm) <> all(v_broad)
         and btrim(v_norm) <> all(v_stop)
         and upper(btrim(v_norm)) <> all(v_generic_acr)
         and position(v_norm in v_all_norm) > 0
      then
        return query select 'BUYER_ALIAS'::text, 'REVIEW'::public.leakage_risk, v_term;
      end if;
    end loop;

    for v_term in
      select distinct lower(regexp_replace(x, '^www\.', ''))
      from (
        select b.domain as x
        union all select regexp_replace(lower(b.website), '^[a-z][a-z0-9+.-]*://([^/:?#]+).*$', '\1')
        union all select split_part(b.email, '@', 2)
      ) hosts
      where x is not null and length(x) >= 4
    loop
      if position(v_term in v_all_lower) > 0 then
        return query select 'BUYER_DOMAIN'::text, 'HIGH'::public.leakage_risk, v_term;
      else
        v_label := split_part(v_term, '.', 1);
        if length(v_label) >= 5
           and v_label <> all(v_generic_org)
           and position(' ' || v_label || ' ' in v_all_norm) > 0
        then
          return query select 'BUYER_DOMAIN'::text, 'HIGH'::public.leakage_risk, v_label;
        end if;
      end if;
    end loop;

    for v_term in
      select distinct w
      from unnest(string_to_array(btrim(private.leak_norm(b.canonical_name)), ' ')) as w
      where length(w) >= 4
        and w !~ '^[0-9]+$'
        and w <> all(v_generic_org)
        and w <> all(v_generic_proper)
        and w <> all(v_broad)
        and w <> all(v_stop)
    loop
      if position(' ' || v_term || ' ' in v_all_norm) > 0 then
        return query select 'BUYER_TOKEN'::text,
          (case when length(v_term) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
          v_term;
      end if;
    end loop;

    for v_term in
      select upper(string_agg(left(w, 1), '' order by ord))
      from unnest(string_to_array(btrim(private.leak_norm(b.canonical_name)), ' ')) with ordinality as t(w, ord)
      where w not in ('and', 'of', 'the', 'for') and w !~ '^[0-9]+$'
      union
      select upper(string_agg(left(w, 1), '' order by ord))
      from unnest(string_to_array(btrim(b.leak_match_name), ' ')) with ordinality as t(w, ord)
      where w not in ('and', 'of', 'the', 'for') and w !~ '^[0-9]+$'
    loop
      if v_term is not null and length(v_term) >= 3
         and (v_term = any(v_cs_tokens) or (length(v_term) >= 4 and lower(v_term) = any(v_slug_tokens)))
      then
        return query select 'BUYER_ACRONYM'::text, 'HIGH'::public.leakage_risk, v_term;
      end if;
    end loop;
  end if;

  for v_term in
    select distinct lower(regexp_replace(regexp_replace(lower(u), '^[a-z][a-z0-9+.-]*://([^/:?#]+).*$', '\1'), '^www\.', ''))
    from unnest(array[d.source_url, d.application_url]) as u
    where u is not null
  loop
    if length(v_term) >= 4 and position(v_term in v_all_lower) > 0 then
      return query select 'BUYER_DOMAIN'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  -- Any known organisation (buyers, suppliers, incumbents) -------------------
  for v_term, v_norm in
    select o.canonical_name, o.leak_match_name
    from public.organizations o
    where o.leak_match_name is not null and position(o.leak_match_name in v_all_norm) > 0
    union
    select a.alias, a.leak_match_name
    from public.organization_aliases a
    where a.leak_match_name is not null and position(a.leak_match_name in v_all_norm) > 0
  loop
    select count(*) into v_count
    from unnest(string_to_array(btrim(v_norm), ' ')) as w
    where w <> all(v_generic_org) and w <> all(v_broad) and w <> all(v_stop) and w !~ '^[0-9]+$'
      and (length(btrim(v_norm)) >= 5 or (upper(w) <> all(v_generic_acr) and w <> all(v_generic_proper)));
    if v_count >= 2 then
      return query select 'ORG_NAME'::text, 'HIGH'::public.leakage_risk, v_term;
    elsif v_count = 1 then
      return query select 'ORG_NAME'::text, 'REVIEW'::public.leakage_risk, v_term;
    end if;
  end loop;

  for v_term in
    select distinct w
    from (
      select o.canonical_name as n
      from public.deal_organizations dorg
      join public.organizations o on o.id = dorg.organization_id
      where dorg.deal_id = d.id
      union
      select o.canonical_name
      from public.awards aw
      join public.award_suppliers s on s.award_id = aw.id
      join public.organizations o on o.id = s.organization_id
      where aw.deal_id = d.id
      union
      select o.canonical_name
      from public.deal_insights di
      join public.organizations o on o.id = di.incumbent_organization_id
      where di.deal_id = d.id
    ) names
    cross join lateral unnest(string_to_array(btrim(private.leak_norm(names.n)), ' ')) as w
    where length(w) >= 4
      and w !~ '^[0-9]+$'
      and w <> all(v_generic_org)
      and w <> all(v_generic_proper)
      and w <> all(v_broad)
      and w <> all(v_stop)
  loop
    if position(' ' || v_term || ' ' in v_all_norm) > 0 then
      return query select 'ORG_TOKEN'::text,
        (case when length(v_term) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        v_term;
    end if;
  end loop;

  return query select 'ORG_SUFFIX'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_text_cs, '((?:[A-Z][A-Za-z0-9&-]*\s+){1,4}(?:Ltd|LTD|Limited|LIMITED|LLP|PLC|Plc|plc|LLC|Inc|CIC))\M', 'g') as m;

  return query select 'ORG_SUFFIX'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m(ltd|llp)\M', 'gi') as m;

  -- Project / programme names ------------------------------------------------
  for v_term in
    select pod.project_name
    from public.private_opportunity_details pod
    where pod.deal_id = d.id and pod.project_name is not null
  loop
    v_norm := private.leak_norm(v_term);
    if length(btrim(v_norm)) >= 5 and position(v_norm in v_all_norm) > 0 then
      return query select 'PROJECT_NAME'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
    return query
      select 'PROJECT_NAME'::text,
        (case when length(w) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        w
      from (
        select distinct w
        from unnest(string_to_array(btrim(v_norm), ' ')) as w
        where length(w) >= 4
          and w !~ '^[0-9]+$'
          and w <> all(v_generic_org)
          and w <> all(v_generic_proper)
          and w <> all(v_broad)
          and w <> all(v_stop)
      ) tokens
      where position(' ' || w || ' ' in v_all_norm) > 0;
  end loop;

  for v_m in select regexp_matches(v_text_cs, '\m([A-Z][A-Z0-9&]{2,})\M', 'g') loop
    if v_m[1] <> all(v_generic_acr) then
      v_norm := private.leak_norm(v_m[1]);
      return query select 'ACRONYM'::text,
        (case when length(btrim(v_norm)) >= 3 and position(v_norm in v_source_norm) > 0 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        v_m[1];
    end if;
  end loop;

  -- Title-Case runs inside sentence-case prose (site/programme names).
  foreach v_seg in array v_prose_segments loop
    for v_m in select regexp_matches(v_seg, '\m[a-z][a-z0-9''-]*[,;:)]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)', 'g') loop
      select count(*) into v_count
      from unnest(string_to_array(btrim(private.leak_norm(v_m[1])), ' ')) as w
      where w <> all(v_generic_proper) and w <> all(v_generic_org) and w <> all(v_broad);
      if v_count > 0 then
        return query select 'PROPER_NOUN_RUN'::text,
          (case when position(private.leak_norm(v_m[1]) in v_source_norm) > 0 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
          v_m[1];
      end if;
    end loop;
  end loop;

  return query select 'SOURCE_NAME_TOKEN'::text, 'HIGH'::public.leakage_risk, w
    from unnest(v_source_acronyms) as w
    where position(' ' || w || ' ' in v_all_norm) > 0;

  return query select 'SOURCE_NAME_TOKEN'::text,
      (case when length(w) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
      w
    from unnest(v_source_names) as w
    where position(' ' || w || ' ' in v_all_norm) > 0;

  -- Capitalised source words in any position (Title-Case titles, sentence
  -- starts, ALL-CAPS headings) that the source never writes in lowercase and
  -- that fewer than three other deals use. Per-word form of COMBINATION, so
  -- REVIEW only; common words are filtered out by the corpus count.
  for v_term in
    select c.w
    from (
      select distinct lower(m[1]) as w
      from unnest(v_source_parts) as part
      cross join lateral regexp_matches(part, '\m([A-Z][a-z]{3,}|[A-Z]{4,})\M', 'g') as m
    ) c
    where c.w <> all(v_generic_org)
      and c.w <> all(v_generic_proper)
      and c.w <> all(v_broad)
      and c.w <> all(v_stop)
      and c.w <> all(v_source_names)
      and c.w <> all(v_source_acronyms)
      and v_source_raw !~ ('\m' || c.w || '\M')
      and position(' ' || c.w || ' ' in v_all_norm) > 0
    order by length(c.w) desc, c.w
    limit 20
  loop
    select count(*) into v_k
    from (
      select 1
      from public.deals x
      where x.id <> d.id
        and to_tsvector('simple'::regconfig, coalesce(x.source_title, '') || ' ' || coalesce(x.source_description, ''))
            @@ plainto_tsquery('simple'::regconfig, v_term)
      limit 3
    ) others;
    if v_k < 3 then
      return query select 'SOURCE_RARE_WORD'::text, 'REVIEW'::public.leakage_risk, v_term;
    end if;
  end loop;

  -- Similarity and copied phrases -------------------------------------------
  if length(btrim(coalesce(d.source_title, ''))) >= 4 then
    v_sim := extensions.similarity(lower(d.source_title), lower(coalesce(p_preview_title, '')));
    if v_sim >= 0.9 then
      return query select 'TITLE_SIMILARITY'::text, 'HIGH'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    elsif v_sim >= 0.8 then
      return query select 'TITLE_SIMILARITY'::text, 'REVIEW'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    end if;

    if btrim(v_slug_norm) <> '' then
      v_sim := extensions.similarity(lower(d.source_title), btrim(v_slug_norm));
      if v_sim >= 0.9 then
        return query select 'SLUG_SIMILARITY'::text, 'HIGH'::public.leakage_risk, to_char(v_sim, 'FM0.00');
      elsif v_sim >= 0.8 then
        return query select 'SLUG_SIMILARITY'::text, 'REVIEW'::public.leakage_risk, to_char(v_sim, 'FM0.00');
      end if;
    end if;
  end if;

  if length(btrim(coalesce(d.source_description, ''))) >= 40 then
    v_sim := extensions.similarity(lower(d.source_description), lower(coalesce(p_preview_summary, '')));
    if v_sim >= 0.85 then
      return query select 'DESCRIPTION_SIMILARITY'::text, 'HIGH'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    elsif v_sim >= 0.55 then
      return query select 'DESCRIPTION_SIMILARITY'::text, 'REVIEW'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    end if;
  end if;

  foreach v_seg in array v_segments loop
    v_words := string_to_array(btrim(private.leak_norm(v_seg)), ' ');
    if coalesce(cardinality(v_words), 0) >= 6 then
      for i in 1 .. cardinality(v_words) - 5 loop
        v_window := ' ' || array_to_string(v_words[i:i + 5], ' ') || ' ';
        select count(*) into v_count from unnest(v_words[i:i + 5]) as w where w <> all(v_stop);
        if v_count >= 2 and position(v_window in v_source_norm) > 0 then
          return query select 'PHRASE_OVERLAP'::text, 'HIGH'::public.leakage_risk, btrim(v_window);
          exit;
        end if;
      end loop;
    end if;
  end loop;

  -- Exact amounts ------------------------------------------------------------
  select coalesce(array_agg(distinct x), '{}') into v_amounts
  from (
    select round(v)::bigint::text as x
    from unnest(array[d.value_min_ex_vat, d.value_max_ex_vat]) as v
    where v is not null
    union all
    select round(v)::bigint::text
    from public.lots l, unnest(array[l.value_min, l.value_max]) as v
    where l.deal_id = d.id and v is not null
    union all
    select round(a.award_value)::bigint::text from public.awards a where a.deal_id = d.id and a.award_value is not null
    union all
    select round(v)::bigint::text
    from public.contracts c, unnest(array[c.original_value, c.current_value]) as v
    where c.deal_id = d.id and v is not null
    union all
    select regexp_replace(d.exact_value_text, '[^0-9]', '', 'g') where d.exact_value_text is not null
  ) amounts
  where length(x) >= 5;

  return query select 'EXACT_AMOUNT'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '(£\s?[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)', 'g') as m;

  return query select 'EXACT_AMOUNT'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([0-9]{5,}(?:\.[0-9]{1,2})?)\M', 'g') as m
    where split_part(m[1], '.', 1) = any(v_amounts);

  -- Source platform ----------------------------------------------------------
  return query
    select 'SOURCE_PLATFORM'::text, 'HIGH'::public.leakage_risk, marker
    from (
      select unnest(v_platforms) as marker
      union
      select source_marker
      from (
        select lower(ds.name) as source_marker from public.data_sources ds where ds.id = d.primary_source_id
        union
        select lower(ds.source_key) from public.data_sources ds where ds.id = d.primary_source_id
        union
        select replace(lower(ds.source_key), '-', ' ') from public.data_sources ds where ds.id = d.primary_source_id
      ) source_markers
      where length(source_marker) >= 5
        and exists (
          select 1 from unnest(string_to_array(btrim(private.leak_norm(source_marker)), ' ')) as w
          where w <> all(v_generic_org) and w <> all(v_broad)
        )
    ) markers
    -- Short all-letter markers match whole words only (lib/redaction/scan.ts
    -- platformSubstringOk).
    where ((marker ~ '[^a-z ]' or length(replace(marker, ' ', '')) >= 8)
           and position(marker in v_all_lower) > 0)
       or position(private.leak_norm(marker) in v_all_norm) > 0;

  -- Combination risk: distinctive words carried from the source that pin the
  -- preview to fewer than three deals.
  select coalesce(array_agg(w order by length(w) desc, w), '{}') into v_carried
  from (
    select distinct w
    from unnest(string_to_array(btrim(private.leak_norm(concat_ws(' . ', array_to_string(v_segments, ' . '), v_slug))), ' ')) as w
    where length(w) >= 5
      and w !~ '^[0-9]+$'
      and w <> all(v_generic_org)
      and w <> all(v_generic_proper)
      and w <> all(v_broad)
      and w <> all(v_stop)
      and position(' ' || w || ' ' in v_source_norm) > 0
  ) carried;

  if cardinality(v_carried) >= 3 then
    v_carried := v_carried[1:4];
    select count(*) into v_k
    from (
      select 1
      from public.deals x
      where x.id <> d.id
        and to_tsvector('simple'::regconfig, coalesce(x.source_title, '') || ' ' || coalesce(x.source_description, ''))
            @@ plainto_tsquery('simple'::regconfig, array_to_string(v_carried, ' '))
      limit 2
    ) others;
    if v_k + 1 < 3 then
      return query select 'COMBINATION'::text, 'REVIEW'::public.leakage_risk, array_to_string(v_carried, ' + ');
    end if;
  end if;

  return;
end;
$$;

revoke execute on function private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text)
  from public, anon, authenticated;
grant execute on function private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text)
  to service_role;

comment on function private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text) is
  'Preview leak gate v2 findings. Tokens can contain protected values; service-role/admin only.';

create or replace function private.detect_preview_leakage(
  p_deal_id uuid,
  p_slug text,
  p_preview_title text,
  p_preview_summary text,
  p_requirements jsonb,
  p_relevance_tags text[] default '{}'::text[],
  p_broad_region text default null
)
returns public.leakage_risk
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(f.finding_risk), 'LOW'::public.leakage_risk)
  from private.preview_leak_findings(
    p_deal_id, p_slug, p_preview_title, p_preview_summary, p_requirements, p_relevance_tags, p_broad_region
  ) as f;
$$;

revoke execute on function private.detect_preview_leakage(uuid, text, text, text, jsonb, text[], text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Admin holds. Recorded per deal id (not per preview row) so deleting and
-- re-inserting the preview cannot clear them, and kept in a table no API role
-- can read or write. Only public.admin_release_preview_hold deletes a hold.
-- No foreign key: a hold must survive the deal being deleted and re-created
-- with the same id.
-- -----------------------------------------------------------------------------
create table if not exists private.preview_holds (
  deal_id uuid primary key,
  held_at timestamptz not null default now()
);

revoke all on table private.preview_holds from public, anon, authenticated, service_role;

insert into private.preview_holds (deal_id)
select dp.deal_id from public.deal_previews dp where dp.unpublished_by_admin
on conflict (deal_id) do nothing;

-- -----------------------------------------------------------------------------
-- Publish gate. Runs on every INSERT/UPDATE (all columns) and fires even under
-- session_replication_role = replica. The detected risk can only raise the
-- stored risk; anything other than LOW, or an admin hold, forces unpublished.
-- -----------------------------------------------------------------------------
create or replace function private.enforce_preview_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  detected public.leakage_risk;
begin
  if exists (select 1 from private.preview_holds h where h.deal_id = new.deal_id) then
    new.unpublished_by_admin := true;
  elsif new.unpublished_by_admin then
    insert into private.preview_holds (deal_id) values (new.deal_id)
    on conflict (deal_id) do nothing;
  end if;

  begin
    detected := private.detect_preview_leakage(
      new.deal_id,
      new.slug,
      new.preview_title,
      new.preview_summary,
      new.requirements_preview,
      new.relevance_tags,
      new.broad_region
    );
  exception when others then
    raise warning 'preview leak gate failed for deal %: %', new.deal_id, sqlerrm;
    detected := 'REVIEW';
  end;

  if detected > new.leakage_risk then
    new.leakage_risk := detected;
  end if;

  if new.leakage_risk <> 'LOW' then
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
before insert or update
on public.deal_previews
for each row execute function private.enforce_preview_safety();

alter table public.deal_previews enable always trigger enforce_preview_safety;

drop function if exists private.detect_preview_leakage(uuid, text, text, jsonb);

create or replace function public.admin_release_preview_hold(p_deal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  delete from private.preview_holds where deal_id = p_deal_id;
  update public.deal_previews
  set unpublished_by_admin = false,
      is_published = false
  where deal_id = p_deal_id;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke execute on function public.admin_release_preview_hold(uuid) from public, anon, authenticated;
grant execute on function public.admin_release_preview_hold(uuid) to service_role;

comment on function public.admin_release_preview_hold(uuid) is
  'Service-role only. The sole path that clears unpublished_by_admin; called after an application ADMIN check.';

-- -----------------------------------------------------------------------------
-- Fail-closed entitlement: a missing current_period_end never grants Pro.
-- Mirrors isPaidThrough() in lib/entitlements/policy.ts.
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
      and s.current_period_end is not null
      and s.current_period_end > now()
      and (
        s.status = 'ACTIVE'
        or (s.status = 'CANCELLED' and s.cancel_at_period_end = true)
      )
  );
$$;

revoke execute on function private.is_user_pro(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Sanitised preview DTO RPCs. SECURITY DEFINER so client roles never need
-- table access to deal_previews; they return no deal_id, timestamps, source,
-- buyer, reference, contact or document fields.
-- -----------------------------------------------------------------------------
create or replace function private.preview_dto_requirements(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(s.t) order by s.ord), '[]'::jsonb)
  from (
    select x.t, x.ord
    from (
      select
        btrim(
          case jsonb_typeof(e)
            when 'string' then e #>> '{}'
            when 'object' then coalesce(e ->> 'text', e ->> 'label')
          end
        ) as t,
        ord
      from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)
        with ordinality as a(e, ord)
    ) x
    where x.t is not null and x.t <> '' and length(x.t) <= 500
    order by x.ord
    limit 20
  ) s;
$$;

create or replace function private.preview_freshness_label(p_created_at timestamptz, p_updated_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_created_at >= now() - interval '7 days' then 'New this week'
    when p_updated_at >= now() - interval '7 days' then 'Updated this week'
    else 'Open opportunity'
  end;
$$;

revoke execute on function private.preview_dto_requirements(jsonb) from public, anon, authenticated;
revoke execute on function private.preview_freshness_label(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.search_preview_dtos(
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_statuses public.deal_status[] default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_min_score numeric default null,
  p_sort text default 'updated',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
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
security definer
set search_path = ''
as $$
  with viewer as (
    select cp.id as company_profile_id
    from public.company_profiles cp
    where cp.user_id = auth.uid()
    limit 1
  ),
  q as (
    select nullif(btrim(left(coalesce(p_query, ''), 200)), '') as text
  ),
  ranked as (
    select
      dp.*,
      dm.relevance_score as match_score,
      dm.preview_reasons as match_reasons,
      case
        when q.text is null then 0
        else ts_rank(
          to_tsvector('english'::regconfig, coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')),
          websearch_to_tsquery('english'::regconfig, q.text)
        )
      end as query_rank
    from public.deal_previews dp
    cross join q
    left join viewer v on true
    left join public.deal_matches dm
      on dm.deal_id = dp.deal_id
     and dm.company_profile_id = v.company_profile_id
    where dp.is_published = true
      and dp.leakage_risk = 'LOW'
      and dp.unpublished_by_admin = false
      and (p_category is null or dp.main_category = p_category)
      and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
      and (p_deal_type is null or dp.deal_type = p_deal_type)
      and (p_region is null or dp.broad_region = p_region)
      and (p_status is null or dp.status = p_status)
      and (p_statuses is null or cardinality(p_statuses) = 0 or dp.status = any(p_statuses))
      and (p_value_band is null or dp.value_band = p_value_band)
      and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
      and (p_min_score is null or coalesce(dm.relevance_score, -1) >= p_min_score)
      and (
        q.text is null
        or to_tsvector('english'::regconfig, coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
             @@ websearch_to_tsquery('english'::regconfig, q.text)
        or dp.preview_title operator(extensions.%) q.text
      )
  )
  select
    r.slug,
    r.preview_title,
    r.preview_summary,
    r.deal_type,
    r.buyer_sector,
    r.stage,
    r.status,
    r.main_category,
    r.broad_region,
    r.value_band,
    r.deadline_band,
    r.duration_band,
    r.sme_suitability,
    r.bid_complexity,
    r.competition_level,
    private.preview_dto_requirements(r.requirements_preview),
    r.relevance_tags[1:12],
    private.preview_freshness_label(r.created_at, r.updated_at),
    r.match_score,
    coalesce(r.match_reasons, '[]'::jsonb),
    count(*) over ()
  from ranked r
  order by
    case when lower(coalesce(p_sort, 'updated')) = 'relevance' then coalesce(r.match_score, -1) else 0 end desc,
    r.query_rank desc,
    r.updated_at desc,
    r.slug
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;

create or replace function public.get_preview_dto_by_slug(p_slug text)
returns table (
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
  preview_reasons jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
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
    private.preview_dto_requirements(dp.requirements_preview),
    dp.relevance_tags[1:12],
    private.preview_freshness_label(dp.created_at, dp.updated_at),
    dm.relevance_score,
    coalesce(dm.preview_reasons, '[]'::jsonb)
  from public.deal_previews dp
  left join public.company_profiles cp on cp.user_id = auth.uid()
  left join public.deal_matches dm
    on dm.deal_id = dp.deal_id
   and dm.company_profile_id = cp.id
  where length(coalesce(p_slug, '')) between 1 and 200
    and dp.slug = p_slug
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  limit 1;
$$;

create or replace function public.get_preview_dto_by_deal_id(p_deal_id uuid)
returns table (
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
  preview_reasons jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
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
    private.preview_dto_requirements(dp.requirements_preview),
    dp.relevance_tags[1:12],
    private.preview_freshness_label(dp.created_at, dp.updated_at),
    dm.relevance_score,
    coalesce(dm.preview_reasons, '[]'::jsonb)
  from public.deal_previews dp
  left join public.company_profiles cp on cp.user_id = auth.uid()
  left join public.deal_matches dm
    on dm.deal_id = dp.deal_id
   and dm.company_profile_id = cp.id
  where auth.uid() is not null
    and dp.deal_id = p_deal_id
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  limit 1;
$$;

create or replace function public.resolve_preview_deal_id(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select dp.deal_id
  from public.deal_previews dp
  where auth.uid() is not null
    and length(coalesce(p_slug, '')) between 1 and 200
    and dp.slug = p_slug
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  limit 1;
$$;

create or replace function public.list_saved_deal_previews()
returns table (
  saved_deal_id uuid,
  deal_id uuid,
  notes text,
  saved_at timestamptz,
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
  freshness_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sd.id,
    sd.deal_id,
    sd.notes,
    sd.created_at,
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
    case when dp.deal_id is null then null else private.preview_dto_requirements(dp.requirements_preview) end,
    dp.relevance_tags[1:12],
    case when dp.deal_id is null then null else private.preview_freshness_label(dp.created_at, dp.updated_at) end
  from public.saved_deals sd
  left join public.deal_previews dp
    on dp.deal_id = sd.deal_id
   and dp.is_published = true
   and dp.leakage_risk = 'LOW'
   and dp.unpublished_by_admin = false
  where sd.user_id = auth.uid()
  order by sd.created_at desc;
$$;

create or replace function public.list_preview_sitemap_entries(
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  status public.deal_status,
  last_modified date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.status,
    date_trunc('week', dp.updated_at)::date
  from public.deal_previews dp
  where dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  order by dp.updated_at desc, dp.slug
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 1000000));
$$;

create or replace function public.count_preview_sitemap_entries()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.deal_previews dp
  where dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false;
$$;

revoke all on function public.search_preview_dtos(
  text, text, public.buyer_sector, public.deal_type, text, public.deal_status, public.deal_status[],
  text, text, numeric, text, integer, integer
) from public;
revoke all on function public.get_preview_dto_by_slug(text) from public;
revoke all on function public.get_preview_dto_by_deal_id(uuid) from public;
revoke all on function public.resolve_preview_deal_id(text) from public;
revoke all on function public.list_saved_deal_previews() from public;
revoke all on function public.list_preview_sitemap_entries(integer, integer) from public;
revoke all on function public.count_preview_sitemap_entries() from public;

grant execute on function public.search_preview_dtos(
  text, text, public.buyer_sector, public.deal_type, text, public.deal_status, public.deal_status[],
  text, text, numeric, text, integer, integer
) to anon, authenticated, service_role;
grant execute on function public.get_preview_dto_by_slug(text) to anon, authenticated, service_role;
grant execute on function public.list_preview_sitemap_entries(integer, integer) to anon, authenticated, service_role;
grant execute on function public.count_preview_sitemap_entries() to anon, authenticated, service_role;
grant execute on function public.get_preview_dto_by_deal_id(uuid) to authenticated, service_role;
grant execute on function public.resolve_preview_deal_id(text) to authenticated, service_role;
grant execute on function public.list_saved_deal_previews() to authenticated, service_role;

comment on function public.search_preview_dtos is
  'Sanitised public/free preview search. No deal_id or timestamps. Relevance only for the caller''s own company profile (auth.uid()).';
comment on function public.get_preview_dto_by_slug(text) is
  'Sanitised preview DTO for one published LOW-risk slug.';
comment on function public.get_preview_dto_by_deal_id(uuid) is
  'Signed-in only. Sanitised preview DTO for a published deal id.';
comment on function public.resolve_preview_deal_id(text) is
  'Signed-in only. Maps a published slug to its internal deal id for save/reveal actions.';
comment on function public.list_saved_deal_previews() is
  'Signed-in only. The caller''s saved deals with sanitised previews (null when no longer published).';

-- ============================================================================
-- END 0018_preview_gate_v2_and_dto_rpcs.sql
-- ============================================================================

-- ============================================================================
-- BEGIN 0019_revoke_client_preview_table_access.sql
-- ============================================================================

-- DealAtlas migration 0019
-- Lock down client roles after the DTO-RPC app deploy is live.
--
-- DEPLOY ORDER: apply 0018, deploy the app that reads previews only through
-- the 0018 DTO RPCs, verify it, THEN apply this migration. Applying it first
-- breaks every public preview page still querying deal_previews directly.

-- Function and schema ACLs as they were before this migration, so
-- supabase/rollback/0019_rollback.sql can restore exactly what is revoked
-- below (hosted default privileges differ per project). Server-only.
create table if not exists private.pre_0019_acl (
  kind text not null check (kind in ('function', 'schema', 'default_acl')),
  object text not null,
  acl aclitem[],
  primary key (kind, object)
);
revoke all on table private.pre_0019_acl from public, anon, authenticated, service_role;

-- Signatures are rendered with an empty search_path so names and argument
-- types are schema-qualified and the rollback resolves them under any path.
select pg_catalog.set_config('dealatlas.pre_0019_search_path', pg_catalog.current_setting('search_path'), false);
select pg_catalog.set_config('search_path', '', false);

insert into private.pre_0019_acl (kind, object, acl)
select 'function', p.oid::regprocedure::text, p.proacl
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and not exists (
    select 1
    from pg_catalog.pg_depend dep
    where dep.classid = 'pg_catalog.pg_proc'::regclass
      and dep.objid = p.oid
      and dep.deptype = 'e'
  )
union all
select 'schema', n.nspname, n.nspacl
from pg_catalog.pg_namespace n
where n.nspname in ('public', 'private', 'extensions')
union all
select 'default_acl', coalesce(n.nspname, '*'), d.defaclacl
from pg_catalog.pg_default_acl d
left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype = 'f'
  and d.defaclrole = (select r.oid from pg_catalog.pg_roles r where r.rolname = current_user)
  and (d.defaclnamespace = 0 or n.nspname = 'public')
on conflict (kind, object) do nothing;

select pg_catalog.set_config('search_path', pg_catalog.current_setting('dealatlas.pre_0019_search_path'), false);

-- Client roles no longer read deal_previews; the DTO RPCs (SECURITY DEFINER)
-- are the only client path.
drop policy if exists "published low-risk previews are readable" on public.deal_previews;
revoke all on table public.deal_previews from public, anon, authenticated;
grant all on table public.deal_previews to service_role;

-- Legacy invoker search RPCs return deal_id and are kept for service-role code
-- (exports) only.
revoke all on function public.search_deal_previews(
  text, text, public.buyer_sector, public.deal_type, text, public.deal_status, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.search_deal_previews(
  text, text, public.buyer_sector, public.deal_type, text, public.deal_status, text, text, integer, integer
) to service_role;

revoke all on function public.search_deal_previews_for_profile(
  uuid, text, text, public.buyer_sector, public.deal_type, text, public.deal_status,
  text, text, numeric, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.search_deal_previews_for_profile(
  uuid, text, text, public.buyer_sector, public.deal_type, text, public.deal_status,
  text, text, numeric, text, integer, integer
) to service_role;

-- Every other non-extension function in public loses its implicit PUBLIC
-- EXECUTE grant. Only the sanitised DTO RPCs stay client-callable.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature, p.proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from pg_catalog.pg_depend dep
        where dep.classid = 'pg_catalog.pg_proc'::regclass
          and dep.objid = p.oid
          and dep.deptype = 'e'
      )
      and p.proname not in (
        'search_preview_dtos',
        'get_preview_dto_by_slug',
        'get_preview_dto_by_deal_id',
        'resolve_preview_deal_id',
        'list_saved_deal_previews',
        'list_preview_sitemap_entries',
        'count_preview_sitemap_entries'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;

-- Functions created later by the migration role are not client-callable by
-- default: the global PUBLIC default and any per-schema anon/authenticated
-- default (hosted Supabase adds one) are both removed.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;

-- Client roles keep USAGE on public (DTO RPCs, own-row tables) and auth
-- (auth.uid() inside RLS policies). The DealAtlas server-only schemas are
-- named explicitly; Supabase-managed schemas (storage, realtime, graphql,
-- vault, ...) keep their platform grants.
do $$
declare
  s text;
begin
  foreach s in array array['private', 'extensions'] loop
    if exists (select 1 from pg_catalog.pg_namespace where nspname = s) then
      begin
        execute format('revoke all on schema %I from public, anon, authenticated', s);
      exception when insufficient_privilege then
        raise warning 'could not revoke client usage on schema % (insufficient privilege)', s;
      end;
    end if;
  end loop;
end $$;

-- ============================================================================
-- END 0019_revoke_client_preview_table_access.sql
-- ============================================================================
