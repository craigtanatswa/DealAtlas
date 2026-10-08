-- Publish eligibility and stale unpublish (migration 0021). Synthetic rows only.
begin;
select no_plan();

-- The function scans every preview. Clear committed rows inside this
-- transaction so the counts are only the fixtures below.
truncate table public.deals cascade;
delete from public.admin_audit_events
where action in ('preview.publish', 'preview.unpublish');

insert into public.organizations (id, canonical_name, normalized_name, domain, postcode)
values (
  'a6000000-0000-4000-8000-000000000001',
  'Brynlow Vale County Borough Council',
  'brynlow vale county borough council',
  'brynlowvale.gov.uk',
  'XW7 2PL'
);

insert into public.data_sources (id, source_key, name, source_type, access_method, reuse_status, enabled)
values
  ('d6000000-0000-4000-8000-000000000001', 'contracts-finder', 'Contracts Finder', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'OPEN_LICENSE', true),
  ('d6000000-0000-4000-8000-000000000002', 'pr6-unknown', 'Unknown feed', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'UNKNOWN', false),
  ('d6000000-0000-4000-8000-000000000028', 'pr6-licensed', 'Licensed notice feed', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'LICENSED', true),
  ('d6000000-0000-4000-8000-000000000029', 'pr6-terms', 'Terms reviewed feed', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'TERMS_REVIEWED', true),
  ('d6000000-0000-4000-8000-000000000030', 'pr6-disabled', 'Disabled notice feed', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'OPEN_LICENSE', false),
  ('d6000000-0000-4000-8000-000000000032', 'pr6-unpub-disabled', 'Unpublish disabled feed', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'OPEN_LICENSE', false);

insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
) values
  ('c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '10 days'),
  ('c6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'UPCOMING', pg_catalog.now() + interval '20 days'),
  ('c6000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'CLOSING_SOON', pg_catalog.now() + interval '30 days'),
  ('c6000000-0000-4000-8000-000000000004', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000005', 'd6000000-0000-4000-8000-000000000002',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000006', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'CLOSED', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000007', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000008', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000009', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '12 hours'),
  ('c6000000-0000-4000-8000-000000000010', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', null),
  ('c6000000-0000-4000-8000-000000000011', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000012-0000-4000-8000-000000000012', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000013', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '11 days'),
  ('c6000000-0000-4000-8000-000000000014', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000021', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000022', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'UPCOMING', null),
  ('c6000000-0000-4000-8000-000000000026', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000027', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000028', 'd6000000-0000-4000-8000-000000000028',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000029', 'd6000000-0000-4000-8000-000000000029',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000030', 'd6000000-0000-4000-8000-000000000030',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days');

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
) values
  ('c6000000-0000-4000-8000-000000000001',
   'street-lighting-upgrade-for-a-local-authority-abcd1001',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000002',
   'street-lighting-upgrade-for-a-local-authority-abcd1002',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000003',
   'street-lighting-upgrade-for-a-local-authority-abcd1003',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'CLOSING_SOON', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000004',
   'street-lighting-upgrade-for-a-local-authority-abcd1004',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'HIGH', false, false),
  ('c6000000-0000-4000-8000-000000000005',
   'street-lighting-upgrade-for-a-local-authority-abcd1005',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000006',
   'street-lighting-upgrade-for-a-local-authority-abcd1006',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'CLOSED', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000007',
   'street-lighting-upgrade-for-a-local-authority-abcd1007',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'CLOSED', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000008',
   'street-lighting-upgrade-for-a-local-authority-abcd1008',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000009',
   'street-lighting-upgrade-for-a-local-authority-abcd1009',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000010',
   'street-lighting-upgrade-for-a-local-authority-abcd1010',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000011',
   'street-lighting-upgrade-for-a-local-authority-abcd1011',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, true),
  ('c6000012-0000-4000-8000-000000000012',
   'street-lighting-upgrade-for-a-local-authority-c6000012',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000013',
   'street-lighting-upgrade-for-a-local-authority-abcd1013',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000014',
   'not-a-template',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000021',
   'street-lighting-upgrade-for-a-local-authority-abcd1021',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000022',
   'street-lighting-upgrade-for-a-local-authority-abcd1022',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000026',
   'street-lighting-upgrade-for-a-local-authority-abcd1026',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000027',
   'street-lighting-upgrade-for-a-local-authority-abcd1027',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000028',
   'street-lighting-upgrade-for-a-local-authority-abcd1028',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000029',
   'street-lighting-upgrade-for-a-local-authority-abcd1029',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6000000-0000-4000-8000-000000000030',
   'street-lighting-upgrade-for-a-local-authority-abcd1030',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false);

alter table public.deal_previews disable trigger enforce_preview_safety;
update public.deal_previews
set preview_summary = 'Brynlow Vale County Borough Council wants a contractor to replace roadside lighting.',
    leakage_risk = 'LOW'
where deal_id = 'c6000000-0000-4000-8000-000000000026';
alter table public.deal_previews enable always trigger enforce_preview_safety;

insert into private.preview_holds (deal_id)
values ('c6000000-0000-4000-8000-000000000027');

insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
)
select
  'c6000000-0000-4000-8000-000000000023', ds.id,
  'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'
from public.data_sources ds
where ds.source_key = 'uk-infrastructure-pipeline';

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
) values (
  'c6000000-0000-4000-8000-000000000023',
  'street-lighting-upgrade-for-a-local-authority-abcd1023',
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false
);

insert into private.publish_denylist (deal_id, reason)
values ('c6000000-0000-4000-8000-000000000013', 'test denylist');

select is(
  private.preview_slug_is_template(
    'street-lighting-upgrade-for-a-local-authority-abcd1001',
    'Street lighting upgrade for a local authority',
    'c6000000-0000-4000-8000-000000000001'
  ),
  true,
  'template slug matches the title fragment'
);
select is(
  private.preview_slug_is_template(
    'street-lighting-upgrade-for-a-local-authority-c6000012',
    'Street lighting upgrade for a local authority',
    'c6000012-0000-4000-8000-000000000012'
  ),
  false,
  'deal-id hex suffix is not a template slug'
);

create temp table pr6_pub (result jsonb);
insert into pr6_pub select public.publish_eligible_previews(1, 'run-41');

select is((select (result->>'selected')::int from pr6_pub), 3, 'three rows are eligible before the cap');
select is((select (result->>'published')::int from pr6_pub), 1, 'cap 1 publishes one row');
select is((select (result->>'skipped_cap')::int from pr6_pub), 2, 'cap leaves two eligible rows');
select is((select (result->>'skipped_risk')::int from pr6_pub), 2, 'stored HIGH and a live non-LOW rescore are skipped');
select is((select (result->>'skipped_source')::int from pr6_pub), 5, 'pipeline, licensed, terms-reviewed and disabled sources are skipped');
select is((select (result->>'skipped_status')::int from pr6_pub), 6, 'closed, mismatched, planning-open and undated upcoming rows are skipped');
select is((select (result->>'skipped_deadline')::int from pr6_pub), 1, 'a deadline inside 24 hours is skipped');
select is((select (result->>'skipped_held')::int from pr6_pub), 2, 'admin-held and preview-hold rows are skipped');
select is((select (result->>'skipped_slug')::int from pr6_pub), 2, 'legacy hex suffix and non-template slug are skipped');
select is((select (result->>'skipped_denylist')::int from pr6_pub), 1, 'denylist row is skipped');
select is((select (result->>'skipped_retired')::int from pr6_pub), 0, 'current slugs are not retired');
select ok(
  (select bool_and(jsonb_typeof(value) = 'number') from pr6_pub, lateral jsonb_each(result)),
  'publish output is numeric counts only'
);
select ok(
  (select result::text !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' from pr6_pub),
  'publish output contains no deal id'
);

select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000001'),
  true,
  'earliest eligible row is the one published'
);
select is(
  (select count(*)::int from public.deal_previews
    where is_published
      and deal_id <> 'c6000000-0000-4000-8000-000000000001'),
  0,
  'no other row is published'
);
select is(
  (select count(*)::int from public.admin_audit_events where action = 'preview.publish' and actor_id is null),
  1,
  'publish writes one system audit row'
);
select is(
  (select metadata->>'actor' from public.admin_audit_events where action = 'preview.publish'),
  'system:ingest-open',
  'publish audit actor is the system job'
);
select is(
  (select metadata->>'run_id' from public.admin_audit_events where action = 'preview.publish'),
  'run-41',
  'publish audit records the run id'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000021'),
  false,
  'an OPEN planning notice is not published'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000022'),
  false,
  'an upcoming notice with no deadline is not published'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000023'),
  false,
  'a pipeline source with a future deadline is not published'
);
select is(
  (select leakage_risk::text from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000026'),
  'LOW',
  'stored risk stays LOW when the live rescore is not'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000026'),
  false,
  'a stored LOW row with a non-LOW live rescore is not published'
);
select is(
  (select unpublished_by_admin from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000027'),
  false,
  'a hold-only row does not set the admin flag'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000027'),
  false,
  'a row held only in preview_holds is not published'
);
select is(
  (select count(*)::int from public.deal_previews
    where deal_id in (
      'c6000000-0000-4000-8000-000000000028',
      'c6000000-0000-4000-8000-000000000029',
      'c6000000-0000-4000-8000-000000000030'
    )
    and is_published),
  0,
  'licensed, terms-reviewed and disabled sources are not published'
);

create temp table pr6_clamp (result jsonb);
insert into pr6_clamp select public.publish_eligible_previews(0);
select is((select (result->>'published')::int from pr6_clamp), 1, 'cap 0 clamps to 1');
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000002'),
  true,
  'an upcoming notice with a dated deadline is published'
);

create temp table pr6_rest (result jsonb);
insert into pr6_rest select public.publish_eligible_previews(500, 'run-41b');
select is((select (result->>'published')::int from pr6_rest), 1, 'the remaining eligible row is published');
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000003'),
  true,
  'a closing-soon live notice is published'
);

-- Stale rows that are already published. The gate allows LOW rows to stay published.
insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
) values
  ('c6000000-0000-4000-8000-000000000015', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '50 days'),
  ('c6000000-0000-4000-8000-000000000016', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '50 days'),
  ('c6000000-0000-4000-8000-000000000017', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '50 days'),
  ('c6000000-0000-4000-8000-000000000018', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '50 days'),
  ('c6000000-0000-4000-8000-000000000019', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '50 days');

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
) values
  ('c6000000-0000-4000-8000-000000000015',
   'street-lighting-upgrade-for-a-local-authority-abcd1015',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false),
  ('c6000000-0000-4000-8000-000000000016',
   'street-lighting-upgrade-for-a-local-authority-abcd1016',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false),
  ('c6000000-0000-4000-8000-000000000017',
   'street-lighting-upgrade-for-a-local-authority-abcd1017',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false),
  ('c6000000-0000-4000-8000-000000000018',
   'street-lighting-upgrade-for-a-local-authority-abcd1018',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false),
  ('c6000000-0000-4000-8000-000000000019',
   'street-lighting-upgrade-for-a-local-authority-abcd1019',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false);

update public.deal_previews set is_published = true
where deal_id in (
  'c6000000-0000-4000-8000-000000000015',
  'c6000000-0000-4000-8000-000000000016',
  'c6000000-0000-4000-8000-000000000017',
  'c6000000-0000-4000-8000-000000000018',
  'c6000000-0000-4000-8000-000000000019'
);
update public.deals set submission_deadline = pg_catalog.now() - interval '1 hour'
where id = 'c6000000-0000-4000-8000-000000000015';
update public.deals set status = 'AWARDED' where id = 'c6000000-0000-4000-8000-000000000016';
update public.deal_previews set status = 'AWARDED' where deal_id = 'c6000000-0000-4000-8000-000000000016';
update public.deals set status = 'CANCELLED' where id = 'c6000000-0000-4000-8000-000000000017';
update public.deal_previews set status = 'CANCELLED' where deal_id = 'c6000000-0000-4000-8000-000000000017';
update public.deals set status = 'CLOSED' where id = 'c6000000-0000-4000-8000-000000000018';
update public.deal_previews set status = 'CLOSED' where deal_id = 'c6000000-0000-4000-8000-000000000018';
update public.deals set status = 'EXPIRED' where id = 'c6000000-0000-4000-8000-000000000019';
update public.deal_previews set status = 'EXPIRED' where deal_id = 'c6000000-0000-4000-8000-000000000019';

create temp table pr6_unpub (result jsonb);
insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
) values
  ('c6000000-0000-4000-8000-000000000024', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'WITHDRAWN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000025', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'AWARD', 'OPEN', pg_catalog.now() + interval '40 days');

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
) values
  ('c6000000-0000-4000-8000-000000000024',
   'street-lighting-upgrade-for-a-local-authority-abcd1024',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'WITHDRAWN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false),
  ('c6000000-0000-4000-8000-000000000025',
   'street-lighting-upgrade-for-a-local-authority-abcd1025',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'AWARD', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false);

insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
) values
  ('c6000000-0000-4000-8000-000000000031', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', null),
  ('c6000000-0000-4000-8000-000000000032', 'd6000000-0000-4000-8000-000000000032',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6000000-0000-4000-8000-000000000033', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days');

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
) values
  ('c6000000-0000-4000-8000-000000000031',
   'street-lighting-upgrade-for-a-local-authority-abcd1031',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false),
  ('c6000000-0000-4000-8000-000000000032',
   'street-lighting-upgrade-for-a-local-authority-abcd1032',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false),
  ('c6000000-0000-4000-8000-000000000033',
   'street-lighting-upgrade-for-a-local-authority-abcd1033',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false);

insert into private.publish_denylist (deal_id, reason)
values ('c6000000-0000-4000-8000-000000000033', 'test unpublish denylist');

insert into pr6_unpub select public.unpublish_stale_previews('run-42');

select is((select (result->>'selected')::int from pr6_unpub), 10, 'ten stale rows selected');
select is((select (result->>'unpublished')::int from pr6_unpub), 10, 'ten stale rows unpublished');
select ok(
  (select bool_and(jsonb_typeof(value) = 'number') from pr6_unpub, lateral jsonb_each(result)),
  'unpublish output is numeric counts only'
);
select ok(
  (select result::text !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' from pr6_unpub),
  'unpublish output contains no deal id'
);
select is(
  (select count(*)::int from public.deal_previews
    where deal_id in (
      'c6000000-0000-4000-8000-000000000015',
      'c6000000-0000-4000-8000-000000000016',
      'c6000000-0000-4000-8000-000000000017',
      'c6000000-0000-4000-8000-000000000018',
      'c6000000-0000-4000-8000-000000000019',
      'c6000000-0000-4000-8000-000000000024',
      'c6000000-0000-4000-8000-000000000025',
      'c6000000-0000-4000-8000-000000000031',
      'c6000000-0000-4000-8000-000000000032',
      'c6000000-0000-4000-8000-000000000033'
    )
    and is_published),
  0,
  'withdrawn, award-stage, null deadline, disabled source, denylist and closed rows are unpublished'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000001'),
  true,
  'a live open preview stays published'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000002'),
  true,
  'a dated upcoming preview stays published'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000003'),
  true,
  'a closing-soon preview stays published'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000004'),
  false,
  'unpublish never publishes an ineligible row'
);
select is(
  (select count(*)::int from public.admin_audit_events where action = 'preview.unpublish' and actor_id is null),
  10,
  'unpublish writes system audit rows'
);
select is(
  (select metadata->>'run_id' from public.admin_audit_events where action = 'preview.unpublish' limit 1),
  'run-42',
  'unpublish audit records the run id'
);

-- Retired current slug. The replacement is rolled back with this test.
update public.deal_previews
set is_published = false
where deal_id = 'c6000000-0000-4000-8000-000000000003';

create or replace function public.preview_slug_is_retired(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_slug = 'street-lighting-upgrade-for-a-local-authority-abcd1003';
$$;

create temp table pr6_cap (result jsonb);
insert into pr6_cap select public.publish_eligible_previews(500);

select is((select (result->>'published')::int from pr6_cap), 0, 'a retired slug is not published');
select is((select (result->>'skipped_retired')::int from pr6_cap), 1, 'retired slug is skipped');
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000003'),
  false,
  'retired closing row stays unpublished'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000002'),
  true,
  'unpublish leaves the dated upcoming notice published'
);

select ok(
  not has_function_privilege('anon', 'public.publish_eligible_previews(integer, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.publish_eligible_previews(integer, text)', 'execute')
  and not has_function_privilege('anon', 'public.unpublish_stale_previews(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.unpublish_stale_previews(text)', 'execute'),
  'anon and authenticated have no execute'
);
select ok(
  has_function_privilege('service_role', 'public.publish_eligible_previews(integer, text)', 'execute')
  and has_function_privilege('service_role', 'public.unpublish_stale_previews(text)', 'execute'),
  'service_role can execute both functions'
);

grant usage on schema extensions to anon, authenticated;
set local role anon;
select throws_ok(
  'select public.publish_eligible_previews(1)',
  '42501',
  NULL,
  'anon execute of publish_eligible_previews is denied'
);
select throws_ok(
  'select public.unpublish_stale_previews()',
  '42501',
  NULL,
  'anon execute of unpublish_stale_previews is denied'
);
reset role;
set local role authenticated;
select throws_ok(
  'select public.publish_eligible_previews(1)',
  '42501',
  NULL,
  'authenticated execute of publish_eligible_previews is denied'
);
select throws_ok(
  'select public.unpublish_stale_previews()',
  '42501',
  NULL,
  'authenticated execute of unpublish_stale_previews is denied'
);
reset role;

select * from finish();
rollback;
