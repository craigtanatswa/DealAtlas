begin;
select no_plan();

select ok(
  (
    select bool_and(to_regclass(format('public.%I', t)) is not null)
    from unnest(array[
      'data_sources','ingestion_runs','raw_records','ingestion_errors','organizations',
      'organization_identifiers','organization_aliases','organization_contacts','deals','deal_previews',
      'notices','notice_versions','lots','locations','deal_locations','cpv_codes','categories',
      'deal_classifications','deal_organizations','requirements','award_criteria','documents','document_insights',
      'awards','award_suppliers','contracts','contract_changes','contract_payments','contract_performance',
      'commercial_tools','commercial_tool_members','private_opportunity_details','deal_insights','related_deals',
      'data_changes','profiles','company_profiles','subscriptions','billing_events','deal_matches','saved_deals',
      'saved_searches','watched_organizations','notification_preferences','alerts','export_usage'
    ]::text[]) as t
  ),
  'all DealAtlas application tables exist'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname = any(array[
        'data_sources','ingestion_runs','raw_records','ingestion_errors','organizations',
        'organization_identifiers','organization_aliases','organization_contacts','deals','deal_previews',
        'notices','notice_versions','lots','locations','deal_locations','cpv_codes','categories',
        'deal_classifications','deal_organizations','requirements','award_criteria','documents','document_insights',
        'awards','award_suppliers','contracts','contract_changes','contract_payments','contract_performance',
        'commercial_tools','commercial_tool_members','private_opportunity_details','deal_insights','related_deals',
        'data_changes','profiles','company_profiles','subscriptions','billing_events','deal_matches','saved_deals',
        'saved_searches','watched_organizations','notification_preferences','alerts','export_usage'
      ]::text[])
  ),
  'RLS is enabled on every DealAtlas application table'
);

select ok(
  exists (select 1 from pg_extension where extname = 'pg_trgm'),
  'pg_trgm extension is installed'
);

select has_function(
  'public',
  'search_deal_previews',
  'public search RPC exists'
);

select ok(
  (select enabled from public.data_sources where source_key = 'find-a-tender'),
  'Find a Tender source is seeded and enabled'
);

select is(
  (select api_url from public.data_sources where source_key = 'find-a-tender'),
  'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages',
  'Find a Tender official OCDS API URL is recorded'
);

select is(
  (select reuse_status::text from public.data_sources where source_key = 'private-source-template'),
  'UNKNOWN',
  'private source template remains UNKNOWN'
);

select throws_ok(
  $$ update public.data_sources set enabled = true where source_key = 'private-source-template' $$,
  'P0001',
  'source cannot be enabled with reuse status UNKNOWN',
  'UNKNOWN sources cannot be enabled'
);

select isnt_empty(
  $$ select slug from public.categories where slug = 'technology' $$,
  'reference categories are seeded'
);

select * from finish();
rollback;
