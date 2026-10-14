-- Migration 0028. Synthetic rows only.
begin;
select no_plan();

truncate table public.deals cascade;
delete from private.publish_denylist;

insert into private.publish_denylist (deal_id, reason)
values ('00000000-0000-4000-8000-0000000000d2', 'seed');

insert into public.organizations (id, canonical_name, normalized_name)
values (
  'a8000000-0000-4000-8000-000000000001',
  'Brynlow Vale County Borough Council',
  'brynlow vale county borough council'
);

insert into public.data_sources (id, source_key, name, source_type, access_method, reuse_status, enabled)
values
  ('d8000000-0000-4000-8000-000000000001', 'pr28-json', 'JSON notice feed', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'OPEN_LICENSE', true),
  ('d8000000-0000-4000-8000-000000000002', 'pr28-unknown', 'Unknown feed', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'UNKNOWN', false),
  ('d8000000-0000-4000-8000-000000000003', 'pr28-prohibited', 'Prohibited feed', 'GOVERNMENT_OPEN_DATA', 'OCDS_API', 'PROHIBITED', false),
  ('d8000000-0000-4000-8000-000000000004', 'pr28-disabled', 'Disabled feed', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'OPEN_LICENSE', false);

insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
) values
  ('c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a8000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', null),
  ('c8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000002',
   'Highway lighting column renewal programme', 'a8000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c8000000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000003',
   'Highway lighting column renewal programme', 'a8000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c8000000-0000-4000-8000-000000000004', 'd8000000-0000-4000-8000-000000000004',
   'Highway lighting column renewal programme', 'a8000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c8000000-0000-4000-8000-000000000005', 'd8000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a8000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() - interval '2 days'),
  ('c8000000-0000-4000-8000-000000000006', 'd8000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a8000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c8000000-0000-4000-8000-000000000007', 'd8000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a8000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c8000000-0000-4000-8000-000000000008', 'd8000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a8000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'CONTRACT', 'ACTIVE', pg_catalog.now() + interval '40 days'),
  ('c8000000-0000-4000-8000-000000000009', 'd8000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a8000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'UPCOMING', null);

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
) values
  ('c8000000-0000-4000-8000-000000000001',
   'street-lighting-upgrade-for-a-local-authority-abcd2801',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c8000000-0000-4000-8000-000000000002',
   'street-lighting-upgrade-for-a-local-authority-abcd2802',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c8000000-0000-4000-8000-000000000003',
   'street-lighting-upgrade-for-a-local-authority-abcd2803',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c8000000-0000-4000-8000-000000000004',
   'street-lighting-upgrade-for-a-local-authority-abcd2804',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c8000000-0000-4000-8000-000000000005',
   'street-lighting-upgrade-for-a-local-authority-abcd2805',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c8000000-0000-4000-8000-000000000006',
   'street-lighting-upgrade-for-a-local-authority-abcd2806',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'HIGH', false, false),
  ('c8000000-0000-4000-8000-000000000007',
   'street-lighting-upgrade-for-a-local-authority-abcd2807',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c8000000-0000-4000-8000-000000000008',
   'street-lighting-upgrade-for-a-local-authority-abcd2808',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'CONTRACT', 'ACTIVE', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c8000000-0000-4000-8000-000000000009',
   'street-lighting-upgrade-for-a-local-authority-abcd2809',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false);

select public.publish_eligible_previews(500, 'run-28');

select is(
  (select is_published from public.deal_previews where deal_id = 'c8000000-0000-4000-8000-000000000001'),
  true,
  'a JSON_API OPEN_LICENSE source publishes a null-deadline OPEN row'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c8000000-0000-4000-8000-000000000009'),
  true,
  'UPCOMING PLANNING publishes from a JSON_API source'
);
select is(
  (select count(*)::int from public.deal_previews
    where deal_id in (
      'c8000000-0000-4000-8000-000000000002',
      'c8000000-0000-4000-8000-000000000003',
      'c8000000-0000-4000-8000-000000000004'
    )
    and is_published),
  0,
  'an UNKNOWN, PROHIBITED or disabled source never publishes'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c8000000-0000-4000-8000-000000000005'),
  false,
  'an expired deadline never publishes'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c8000000-0000-4000-8000-000000000006'),
  false,
  'a HIGH-risk row never publishes'
);
select is(
  (select count(*)::int from public.deal_previews
    where deal_id in (
      'c8000000-0000-4000-8000-000000000007',
      'c8000000-0000-4000-8000-000000000008'
    )
    and is_published),
  0,
  'EARLY and ACTIVE CONTRACT stay unpublished'
);

select * from finish();
rollback;
