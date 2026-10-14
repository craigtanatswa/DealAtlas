-- Migration 0040. Synthetic rows only.
begin;
select no_plan();

truncate table public.deals cascade;
delete from private.publish_denylist;

insert into private.publish_denylist (deal_id, reason)
values ('00000000-0000-4000-8000-0000000000d4', 'seed');

insert into public.organizations (id, canonical_name, normalized_name)
values (
  'a4000000-0000-4000-8000-000000000001',
  'Brynlow Vale County Borough Council',
  'brynlow vale county borough council'
);

alter table public.data_sources disable trigger enforce_source_enablement;

insert into public.data_sources (
  id, source_key, name, source_type, access_method, reuse_status, scraping_permitted, enabled
) values
  ('d4000000-0000-4000-8000-000000000001', 'pr40-unknown', 'Silent terms feed', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'UNKNOWN', true, true),
  ('d4000000-0000-4000-8000-000000000002', 'pr40-prohibited', 'Prohibited feed', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'PROHIBITED', true, true),
  ('d4000000-0000-4000-8000-000000000003', 'pr40-disabled', 'Disabled silent feed', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'UNKNOWN', true, false),
  ('d4000000-0000-4000-8000-000000000004', 'pr40-api', 'Official API feed', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'OPEN_LICENSE', false, true);

insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
) values
  ('c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a4000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002',
   'Highway lighting column renewal programme', 'a4000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c4000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000003',
   'Highway lighting column renewal programme', 'a4000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c4000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000004',
   'Highway lighting column renewal programme', 'a4000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days');

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
) values
  ('c4000000-0000-4000-8000-000000000001',
   'street-lighting-upgrade-for-a-local-authority-abcd4001',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c4000000-0000-4000-8000-000000000002',
   'street-lighting-upgrade-for-a-local-authority-abcd4002',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c4000000-0000-4000-8000-000000000003',
   'street-lighting-upgrade-for-a-local-authority-abcd4003',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c4000000-0000-4000-8000-000000000004',
   'street-lighting-upgrade-for-a-local-authority-abcd4004',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false);

select public.publish_eligible_previews(500, 'run-40');

select is(
  (select is_published from public.deal_previews where deal_id = 'c4000000-0000-4000-8000-000000000001'),
  true,
  'an enabled UNKNOWN source publishes'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c4000000-0000-4000-8000-000000000004'),
  true,
  'an OPEN_LICENSE API source with scraping_permitted=false still publishes'
);
select is(
  (select count(*)::int from public.deal_previews
    where deal_id in (
      'c4000000-0000-4000-8000-000000000002',
      'c4000000-0000-4000-8000-000000000003'
    )
    and is_published),
  0,
  'PROHIBITED and disabled sources never publish'
);

update public.deal_previews
set is_published = true
where deal_id in (
  'c4000000-0000-4000-8000-000000000002',
  'c4000000-0000-4000-8000-000000000003'
);

select public.unpublish_stale_previews('run-40b');

select is(
  (select count(*)::int from public.deal_previews
    where deal_id in (
      'c4000000-0000-4000-8000-000000000001',
      'c4000000-0000-4000-8000-000000000004'
    )
    and is_published),
  2,
  'UNKNOWN and scraping_permitted=false OPEN_LICENSE stay published'
);
select is(
  (select count(*)::int from public.deal_previews
    where deal_id in (
      'c4000000-0000-4000-8000-000000000002',
      'c4000000-0000-4000-8000-000000000003'
    )
    and is_published),
  0,
  'unpublish removes PROHIBITED and disabled rows'
);

select * from finish();
rollback;
