-- DealAtlas migration 0058
-- Enables the Public Contracts Scotland and Sell2Wales official OCDS API rows
-- added in 0045. Approved by Craig 1 Nov 2026. reuse_status is unchanged
-- (OPEN_LICENSE). 0057 is reserved by the private-discovery-stage2 branch.

update public.data_sources
set enabled = true,
    updated_at = now()
where source_key in ('public-contracts-scotland', 'sell2wales')
  and enabled = false;
