begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Client grants: canonical tables stay unreachable; previews are select-only.
-- ---------------------------------------------------------------------------
select ok(has_table_privilege('anon', 'public.deal_previews', 'select'), 'anon can select deal_previews');
select ok(has_table_privilege('authenticated', 'public.deal_previews', 'select'), 'authenticated can select deal_previews');
select ok(not has_table_privilege('anon', 'public.deal_previews', 'insert'), 'anon cannot insert deal_previews');
select ok(not has_table_privilege('anon', 'public.deal_previews', 'update'), 'anon cannot update deal_previews');
select ok(not has_table_privilege('anon', 'public.deal_previews', 'delete'), 'anon cannot delete deal_previews');

select ok(not has_table_privilege('anon', 'public.deals', 'select'), 'anon cannot select deals');
select ok(not has_table_privilege('anon', 'public.organizations', 'select'), 'anon cannot select organizations');
select ok(not has_table_privilege('anon', 'public.notices', 'select'), 'anon cannot select notices');
select ok(not has_table_privilege('anon', 'public.documents', 'select'), 'anon cannot select documents');
select ok(not has_table_privilege('anon', 'public.data_sources', 'select'), 'anon cannot select data_sources');

select ok(not has_table_privilege('authenticated', 'public.deals', 'select'), 'authenticated cannot select deals');
select ok(not has_table_privilege('authenticated', 'public.organizations', 'select'), 'authenticated cannot select organizations');
select ok(not has_table_privilege('authenticated', 'public.notices', 'select'), 'authenticated cannot select notices');
select ok(not has_table_privilege('authenticated', 'public.documents', 'select'), 'authenticated cannot select documents');
select ok(not has_table_privilege('authenticated', 'public.data_sources', 'select'), 'authenticated cannot select data_sources');
select ok(not has_table_privilege('authenticated', 'public.subscriptions', 'select'), 'authenticated cannot select subscriptions');
select ok(not has_table_privilege('authenticated', 'public.billing_events', 'select'), 'authenticated cannot select billing_events');
select ok(not has_table_privilege('authenticated', 'public.alerts', 'select'), 'authenticated cannot select alerts');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_events', 'select'), 'authenticated cannot select admin_audit_events');
select ok(not has_table_privilege('anon', 'public.admin_audit_events', 'select'), 'anon cannot select admin_audit_events');
select ok(
  not has_function_privilege('authenticated', 'public.admin_merge_organizations(uuid, uuid)', 'execute'),
  'authenticated cannot execute admin organisation merge'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'update'),
  'authenticated cannot update profiles.role'
);

-- ---------------------------------------------------------------------------
-- Preview fixtures. Buyer/source canaries must not appear in published rows.
-- ---------------------------------------------------------------------------
insert into public.organizations (
  id, canonical_name, normalized_name, domain
) values (
  '11111111-1111-4111-8111-111111111111',
  'CANARY BUYER NEVER FREE',
  'canary buyer never free',
  'canary-protected.example'
);

insert into public.deals (
  id,
  primary_source_id,
  external_primary_id,
  ocid,
  reference,
  source_title,
  buyer_organization_id,
  deal_type,
  buyer_sector,
  stage,
  status
)
select
  '22222222-2222-4222-8222-222222222222',
  ds.id,
  'CANARY-EXT-1',
  'ocds-canary-123456',
  'CANARY-REF-987654',
  'CANARY SOURCE TITLE NEVER FREE for specialised software implementation',
  '11111111-1111-4111-8111-111111111111',
  'PUBLIC_TENDER',
  'PUBLIC',
  'LIVE',
  'OPEN'
from public.data_sources ds
where ds.source_key = 'find-a-tender';

insert into public.deal_previews (
  deal_id,
  slug,
  preview_title,
  preview_summary,
  deal_type,
  buyer_sector,
  stage,
  status,
  main_category,
  broad_region,
  leakage_risk,
  is_published
) values
(
  '22222222-2222-4222-8222-222222222222',
  'published-low-risk-preview',
  'Managed IT support for a public organisation',
  'A public organisation needs ongoing technology support without exposing source identity.',
  'PUBLIC_TENDER',
  'PUBLIC',
  'LIVE',
  'OPEN',
  'technology',
  'UK',
  'LOW',
  true
);

insert into public.deals (
  id,
  primary_source_id,
  external_primary_id,
  source_title,
  deal_type,
  buyer_sector,
  stage,
  status
)
select
  '33333333-3333-4333-8333-333333333333',
  ds.id,
  'CANARY-EXT-2',
  'Another protected canonical source title that must stay unpublished',
  'PUBLIC_TENDER',
  'PUBLIC',
  'LIVE',
  'OPEN'
from public.data_sources ds
where ds.source_key = 'find-a-tender';

insert into public.deal_previews (
  deal_id,
  slug,
  preview_title,
  preview_summary,
  deal_type,
  buyer_sector,
  stage,
  status,
  leakage_risk,
  is_published
) values
(
  '33333333-3333-4333-8333-333333333333',
  'unpublished-low-risk-preview',
  'Facilities maintenance framework opportunity',
  'A summarised facilities opportunity kept unpublished for review.',
  'PUBLIC_TENDER',
  'PUBLIC',
  'LIVE',
  'OPEN',
  'LOW',
  false
);

insert into public.deals (
  id,
  primary_source_id,
  external_primary_id,
  source_title,
  deal_type,
  buyer_sector,
  stage,
  status
)
select
  '44444444-4444-4444-8444-444444444444',
  ds.id,
  'CANARY-EXT-3',
  'Third protected canonical source title used for leak failsafe',
  'PUBLIC_TENDER',
  'PUBLIC',
  'LIVE',
  'OPEN'
from public.data_sources ds
where ds.source_key = 'find-a-tender';

insert into public.deal_previews (
  deal_id,
  slug,
  preview_title,
  preview_summary,
  deal_type,
  buyer_sector,
  stage,
  status,
  leakage_risk,
  is_published
) values
(
  '44444444-4444-4444-8444-444444444444',
  'high-risk-unpublished-preview',
  'Opportunity with a leak',
  'Contains https://canary-protected.example which must not publish.',
  'PUBLIC_TENDER',
  'PUBLIC',
  'LIVE',
  'OPEN',
  'LOW',
  true
);

select is(
  (select is_published from public.deal_previews where slug = 'published-low-risk-preview'),
  true,
  'safe preview remains published'
);

select is(
  (select leakage_risk::text from public.deal_previews where slug = 'high-risk-unpublished-preview'),
  'HIGH',
  'preview leak failsafe raises HIGH risk'
);

select is(
  (select is_published from public.deal_previews where slug = 'high-risk-unpublished-preview'),
  false,
  'leaky preview cannot stay published'
);

-- ---------------------------------------------------------------------------
-- Anon row filter
-- ---------------------------------------------------------------------------
set local role anon;

select is(
  (select count(*)::integer from public.deal_previews),
  1,
  'anon sees only published LOW-risk deal_previews'
);

select is(
  (select slug from public.deal_previews),
  'published-low-risk-preview',
  'anon published preview is the safe LOW-risk row'
);

select throws_ok(
  'select id from public.deals limit 1',
  '42501',
  NULL,
  'anon select on deals is denied'
);

select throws_ok(
  'select id from public.organizations limit 1',
  '42501',
  NULL,
  'anon select on organizations is denied'
);

select throws_ok(
  'select id from public.notices limit 1',
  '42501',
  NULL,
  'anon select on notices is denied'
);

select throws_ok(
  'select id from public.documents limit 1',
  '42501',
  NULL,
  'anon select on documents is denied'
);

select throws_ok(
  'select id from public.data_sources limit 1',
  '42501',
  NULL,
  'anon select on data_sources is denied'
);

select isnt_empty(
  $$ select slug from public.search_deal_previews() $$,
  'anon can call search_deal_previews'
);

reset role;

-- ---------------------------------------------------------------------------
-- Authenticated role still has no canonical table grants.
-- ---------------------------------------------------------------------------
set local role authenticated;

select throws_ok(
  'select id from public.deals limit 1',
  '42501',
  NULL,
  'authenticated select on deals is denied'
);

select throws_ok(
  'select id from public.organizations limit 1',
  '42501',
  NULL,
  'authenticated select on organizations is denied'
);

select throws_ok(
  'select id from public.notices limit 1',
  '42501',
  NULL,
  'authenticated select on notices is denied'
);

select throws_ok(
  'select id from public.documents limit 1',
  '42501',
  NULL,
  'authenticated select on documents is denied'
);

select throws_ok(
  'select id from public.data_sources limit 1',
  '42501',
  NULL,
  'authenticated select on data_sources is denied'
);

select throws_ok(
  'select id from public.subscriptions limit 1',
  '42501',
  NULL,
  'authenticated select on subscriptions is denied'
);

select throws_ok(
  'select id from public.export_usage limit 1',
  '42501',
  NULL,
  'authenticated select on export_usage is denied'
);

select throws_ok(
  $$ insert into public.export_usage (user_id, row_count, billing_month)
     values ('00000000-0000-4000-8000-000000000000', 1, '2026-09-01') $$,
  '42501',
  NULL,
  'authenticated insert on export_usage is denied'
);

reset role;

select * from finish();
rollback;
