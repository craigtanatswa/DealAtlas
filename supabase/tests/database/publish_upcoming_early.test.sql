-- Migration 0068. UPCOMING + EARLY may first-publish and stay published.
-- All names, references and identifiers are synthetic.
begin;
select no_plan();

-- The function scans every preview. Clear committed rows inside this
-- transaction so the fixtures below are the only rows it can see.
truncate table public.deals cascade;
delete from private.publish_denylist;

-- publish_eligible_previews refuses to run when the denylist is empty.
insert into private.publish_denylist (deal_id, reason)
values ('00000000-0000-4000-8000-0000000000e1', 'test seed so publish can run');

insert into public.organizations (id, canonical_name, normalized_name, domain, postcode)
values (
  'a6800000-0000-4000-8000-000000000001',
  'Fenwick Quarry Parish Council',
  'fenwick quarry parish council',
  'fenwickquarry.gov.uk',
  'ZQ4 1RT'
);

insert into public.data_sources (id, source_key, name, source_type, access_method, reuse_status, enabled)
values (
  'd6800000-0000-4000-8000-000000000001',
  'pr68-licensed',
  'Licensed notice feed',
  'GOVERNMENT_OPEN_DATA',
  'JSON_API',
  'OPEN_LICENSE',
  true
);

insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
) values
  ('c6800000-0000-4000-8000-000000000001', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', pg_catalog.now() + interval '40 days'),
  ('c6800000-0000-4000-8000-000000000002', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', null),
  ('c6800000-0000-4000-8000-000000000003', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'UPCOMING', pg_catalog.now() + interval '40 days'),
  ('c6800000-0000-4000-8000-000000000004', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'OPEN', pg_catalog.now() + interval '40 days'),
  ('c6800000-0000-4000-8000-000000000005', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'CONTRACT', 'AWARDED', pg_catalog.now() + interval '40 days'),
  ('c6800000-0000-4000-8000-000000000006', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', pg_catalog.now() + interval '40 days'),
  ('c6800000-0000-4000-8000-000000000007', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', pg_catalog.now() - interval '2 days'),
  ('c6800000-0000-4000-8000-000000000008', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', pg_catalog.now() + interval '40 days'),
  ('c6800000-0000-4000-8000-000000000009', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', pg_catalog.now() - interval '2 days'),
  ('c6800000-0000-4000-8000-000000000010', 'd6800000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6800000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', null);

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
) values
  ('c6800000-0000-4000-8000-000000000001',
   'street-lighting-upgrade-for-a-local-authority-abcd6801',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6800000-0000-4000-8000-000000000002',
   'street-lighting-upgrade-for-a-local-authority-abcd6802',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6800000-0000-4000-8000-000000000003',
   'street-lighting-upgrade-for-a-local-authority-abcd6803',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'PLANNING', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6800000-0000-4000-8000-000000000004',
   'street-lighting-upgrade-for-a-local-authority-abcd6804',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6800000-0000-4000-8000-000000000005',
   'street-lighting-upgrade-for-a-local-authority-abcd6805',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'CONTRACT', 'AWARDED', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6800000-0000-4000-8000-000000000006',
   'street-lighting-upgrade-for-a-local-authority-abcd6806',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'HIGH', false, false),
  ('c6800000-0000-4000-8000-000000000007',
   'street-lighting-upgrade-for-a-local-authority-abcd6807',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
  ('c6800000-0000-4000-8000-000000000008',
   'street-lighting-upgrade-for-a-local-authority-abcd6808',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false),
  ('c6800000-0000-4000-8000-000000000009',
   'street-lighting-upgrade-for-a-local-authority-abcd6809',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false),
  ('c6800000-0000-4000-8000-000000000010',
   'street-lighting-upgrade-for-a-local-authority-abcd6810',
   'Street lighting upgrade for a local authority',
   'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
   'PUBLIC_TENDER', 'PUBLIC', 'EARLY', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', true, false);

select public.publish_eligible_previews(500, 'run-68');

select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000001'),
  true,
  'UPCOMING EARLY with a future deadline publishes'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000002'),
  true,
  'UPCOMING EARLY with a null deadline publishes'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000003'),
  true,
  'UPCOMING PLANNING still publishes'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000004'),
  false,
  'OPEN EARLY stays unpublished'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000005'),
  false,
  'AWARDED CONTRACT stays unpublished'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000006'),
  false,
  'UPCOMING EARLY with HIGH risk stays unpublished'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000007'),
  false,
  'UPCOMING EARLY with a past deadline stays unpublished'
);

select public.unpublish_stale_previews('run-68b');

select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000008'),
  true,
  'a published UPCOMING EARLY preview with a future deadline stays published'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000010'),
  true,
  'a published UPCOMING EARLY preview with a null deadline stays published'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000009'),
  false,
  'a published UPCOMING EARLY preview with a past deadline is unpublished'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6800000-0000-4000-8000-000000000001'),
  true,
  'unpublish leaves the newly published UPCOMING EARLY preview up'
);

select * from finish();
rollback;
