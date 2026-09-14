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
