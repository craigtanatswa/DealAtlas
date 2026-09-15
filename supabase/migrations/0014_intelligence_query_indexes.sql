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
