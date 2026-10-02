begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Client grants: canonical tables and deal_previews stay unreachable; the
-- sanitised DTO RPCs are the only client preview path (0018/0019).
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.deal_previews', 'select'), 'anon cannot select deal_previews');
select ok(not has_table_privilege('authenticated', 'public.deal_previews', 'select'), 'authenticated cannot select deal_previews');
select ok(not has_table_privilege('anon', 'public.deal_previews', 'insert'), 'anon cannot insert deal_previews');
select ok(not has_table_privilege('anon', 'public.deal_previews', 'update'), 'anon cannot update deal_previews');
select ok(not has_table_privilege('anon', 'public.deal_previews', 'delete'), 'anon cannot delete deal_previews');
select ok(not has_table_privilege('authenticated', 'public.deal_previews', 'update'), 'authenticated cannot update deal_previews');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'deal_previews'),
  0,
  'deal_previews has no client read policy'
);

select ok(has_schema_privilege('anon', 'public', 'usage'), 'anon keeps usage on public');
select ok(has_schema_privilege('anon', 'auth', 'usage'), 'anon keeps usage on auth for RLS helpers');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon has no usage on private');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated has no usage on private');
select ok(not has_schema_privilege('anon', 'extensions', 'usage'), 'anon has no usage on extensions');
select ok(not has_schema_privilege('authenticated', 'extensions', 'usage'), 'authenticated has no usage on extensions');
select ok(not has_schema_privilege('anon', 'public', 'create'), 'anon cannot create in public');

create function public.zz_rls_default_privilege_probe() returns integer language sql as $$ select 1 $$;
select ok(
  not has_function_privilege('anon', 'public.zz_rls_default_privilege_probe()', 'execute')
  and not has_function_privilege('authenticated', 'public.zz_rls_default_privilege_probe()', 'execute'),
  'functions created after 0019 by the migration role are not client-callable by default'
);
drop function public.zz_rls_default_privilege_probe();
select ok(
  not has_table_privilege('service_role', 'private.pre_0019_acl', 'select')
  and not has_table_privilege('anon', 'private.pre_0019_acl', 'select'),
  'the 0019 ACL snapshot is not readable by API roles'
);

select ok(
  has_function_privilege('anon', 'public.search_preview_dtos(text, text, public.buyer_sector, public.deal_type, text, public.deal_status, public.deal_status[], text, text, numeric, text, integer, integer)', 'execute'),
  'anon can execute the DTO search RPC'
);
select ok(has_function_privilege('anon', 'public.get_preview_dto_by_slug(text)', 'execute'), 'anon can execute DTO by slug');
select ok(has_function_privilege('anon', 'public.list_preview_sitemap_entries(integer, integer)', 'execute'), 'anon can list sitemap entries');
select ok(not has_function_privilege('anon', 'public.get_preview_dto_by_deal_id(uuid)', 'execute'), 'anon cannot load DTO by deal id');
select ok(not has_function_privilege('anon', 'public.resolve_preview_deal_id(text)', 'execute'), 'anon cannot resolve deal ids');
select ok(not has_function_privilege('anon', 'public.list_saved_deal_previews()', 'execute'), 'anon cannot list saved deals');
select ok(
  not has_function_privilege('anon', 'public.search_deal_previews(text, text, public.buyer_sector, public.deal_type, text, public.deal_status, text, text, integer, integer)', 'execute'),
  'anon cannot execute the legacy deal_id-bearing search RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.search_deal_previews_for_profile(uuid, text, text, public.buyer_sector, public.deal_type, text, public.deal_status, text, text, numeric, text, integer, integer)', 'execute'),
  'authenticated cannot execute the legacy profile search RPC'
);
select ok(not has_function_privilege('anon', 'public.admin_release_preview_hold(uuid)', 'execute'), 'anon cannot release preview holds');
select ok(not has_function_privilege('authenticated', 'public.admin_release_preview_hold(uuid)', 'execute'), 'authenticated cannot release preview holds');
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in ('search_preview_dtos', 'get_preview_dto_by_slug', 'list_preview_sitemap_entries', 'count_preview_sitemap_entries')
      and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')
  ),
  'anon can only execute the public DTO RPCs in schema public'
);

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
-- Anon reads go through the DTO RPCs only.
-- pgTAP lives in `extensions`, which client roles can no longer use; grant it
-- back inside this rolled-back transaction purely so assertions can run.
-- ---------------------------------------------------------------------------
grant usage on schema extensions to anon, authenticated;

set local role anon;

select throws_ok(
  'select slug from public.deal_previews limit 1',
  '42501',
  NULL,
  'anon select on deal_previews is denied'
);

select is(
  (select array_agg(slug order by slug) from public.search_preview_dtos()),
  array['published-low-risk-preview'],
  'anon DTO search returns only the published LOW-risk fixture preview'
);

select ok(
  not exists (
    select 1
    from public.search_preview_dtos() as r
    where to_jsonb(r) ?| array[
      'deal_id', 'source_url', 'source_title', 'reference', 'ocid', 'buyer_organization_id',
      'canonical_name', 'email', 'phone', 'application_url', 'created_at', 'updated_at',
      'leakage_risk', 'is_published', 'unpublished_by_admin'
    ]
  ),
  'anon DTO rows contain no identifying or internal fields'
);

select is(
  (select relevance_score from public.search_preview_dtos() limit 1),
  null::numeric,
  'anon DTO rows carry no relevance score'
);

select is(
  (select count(*)::integer from public.get_preview_dto_by_slug('unpublished-low-risk-preview')),
  0,
  'anon cannot load an unpublished preview by slug'
);

select is(
  (select count(*)::integer from public.get_preview_dto_by_slug('high-risk-unpublished-preview')),
  0,
  'anon cannot load a HIGH-risk preview by slug'
);

select is(
  (select preview_title from public.get_preview_dto_by_slug('published-low-risk-preview')),
  'Managed IT support for a public organisation',
  'anon can load the published preview DTO by slug'
);

select ok(
  not exists (
    select 1
    from public.search_preview_dtos() as r
    where r.preview_title ilike '%canary%' or r.preview_summary ilike '%canary%'
  ),
  'anon DTO previews do not contain canary source markers'
);

select is(public.count_preview_sitemap_entries(), 1::bigint, 'sitemap count only covers published LOW-risk previews');

select throws_ok(
  $$ select public.resolve_preview_deal_id('published-low-risk-preview') $$,
  '42501',
  NULL,
  'anon cannot resolve a deal id'
);

select throws_ok(
  $$ select * from public.search_deal_previews() $$,
  '42501',
  NULL,
  'anon cannot call the legacy search RPC'
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

select throws_ok(
  'select id from public.lots limit 1',
  '42501',
  NULL,
  'anon select on lots is denied'
);

select throws_ok(
  'select id from public.contracts limit 1',
  '42501',
  NULL,
  'anon select on contracts is denied'
);

select throws_ok(
  'select id from public.organization_contacts limit 1',
  '42501',
  NULL,
  'anon select on organization_contacts is denied'
);

select throws_ok(
  'select id from public.raw_records limit 1',
  '42501',
  NULL,
  'anon select on raw_records is denied'
);

reset role;

-- ---------------------------------------------------------------------------
-- Authenticated role still has no canonical table grants.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('55555555-5555-4555-8555-555555555555', 'free-user@example.test');
insert into public.company_profiles (id, user_id, company_name)
values ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'Example Co');
insert into public.deal_matches (company_profile_id, deal_id, relevance_score, preview_reasons)
values ('66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222', 72, '[]'::jsonb);
insert into public.saved_deals (user_id, deal_id) values
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222'),
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);

select throws_ok(
  'select slug from public.deal_previews limit 1',
  '42501',
  NULL,
  'authenticated select on deal_previews is denied'
);

select is(
  (select relevance_score from public.search_preview_dtos() where slug = 'published-low-risk-preview'),
  72::numeric,
  'signed-in DTO search carries only the caller''s own relevance score'
);

select is(
  public.resolve_preview_deal_id('published-low-risk-preview'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'signed-in users can resolve a published slug for save/reveal'
);

select is(
  public.resolve_preview_deal_id('unpublished-low-risk-preview'),
  null::uuid,
  'unpublished slugs do not resolve'
);

select is(
  (select slug from public.get_preview_dto_by_deal_id('22222222-2222-4222-8222-222222222222')),
  'published-low-risk-preview',
  'signed-in users can load a published DTO by deal id'
);

select is(
  (select count(*)::integer from public.get_preview_dto_by_deal_id('44444444-4444-4444-8444-444444444444')),
  0,
  'HIGH-risk previews are not returned by deal id'
);

select is(
  (select array_agg(coalesce(slug, '<hidden>') order by slug nulls last) from public.list_saved_deal_previews()),
  array['published-low-risk-preview', '<hidden>'],
  'saved deals list exposes previews only while published'
);

select ok(
  not exists (
    select 1 from public.list_saved_deal_previews() as r
    where to_jsonb(r) ?| array['source_url', 'source_title', 'reference', 'ocid', 'leakage_risk', 'is_published']
  ),
  'saved deal DTO rows contain no source fields'
);

select set_config('request.jwt.claims', '', true);

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
