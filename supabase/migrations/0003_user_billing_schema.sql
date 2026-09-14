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
