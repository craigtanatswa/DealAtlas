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
  ('d6000000-0000-4000-8000-000000000001', 'pr6-open', 'Open feed', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'OPEN_LICENSE', true),
  ('d6000000-0000-4000-8000-000000000002', 'pr6-unknown', 'Unknown feed', 'GOVERNMENT_OPEN_DATA', 'JSON_API', 'UNKNOWN', false);

insert into public.deals (
  id, primary_source_id, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
) values
  ('c6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', pg_catalog.now() + interval '10 days'),
  ('c6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000001',
   'Highway lighting column renewal programme', 'a6000000-0000-4000-8000-000000000001',
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'UPCOMING', pg_catalog.now() + interval '20 days'),
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
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'UPCOMING', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false),
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
   'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales', '["relevant street lighting experience"]'::jsonb, 'LOW', false, false);

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
insert into pr6_pub select public.publish_eligible_previews(1);

select is((select (result->>'selected')::int from pr6_pub), 3, 'three rows are eligible before the cap');
select is((select (result->>'published')::int from pr6_pub), 1, 'cap 1 publishes one row');
select is((select (result->>'skipped_cap')::int from pr6_pub), 2, 'cap leaves two eligible rows');
select is((select (result->>'skipped_risk')::int from pr6_pub), 1, 'stored HIGH is skipped');
select is((select (result->>'skipped_source')::int from pr6_pub), 1, 'non-approved source is skipped');
select is((select (result->>'skipped_status')::int from pr6_pub), 3, 'closed, mismatched status and mismatched stage are skipped');
select is((select (result->>'skipped_deadline')::int from pr6_pub), 2, 'null and sub-24h deadlines are skipped');
select is((select (result->>'skipped_held')::int from pr6_pub), 1, 'held row is skipped');
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
insert into pr6_unpub select public.unpublish_stale_previews();

select is((select (result->>'selected')::int from pr6_unpub), 5, 'five stale rows selected');
select is((select (result->>'unpublished')::int from pr6_unpub), 5, 'five stale rows unpublished');
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
      'c6000000-0000-4000-8000-000000000019'
    )
    and is_published),
  0,
  'expired, awarded, cancelled, closed and expired-status rows are unpublished'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000001'),
  true,
  'a live open preview stays published'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000004'),
  false,
  'unpublish never publishes an ineligible row'
);
select is(
  (select count(*)::int from public.admin_audit_events where action = 'preview.unpublish' and actor_id is null),
  5,
  'unpublish writes system audit rows'
);

-- Cap clamp and a retired current slug. The replacement is rolled back with this test.
create or replace function public.preview_slug_is_retired(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_slug = 'street-lighting-upgrade-for-a-local-authority-abcd1002';
$$;

create temp table pr6_cap (result jsonb);
insert into pr6_cap select public.publish_eligible_previews(0);

select is((select (result->>'published')::int from pr6_cap), 1, 'cap 0 clamps to 1');
select is((select (result->>'skipped_retired')::int from pr6_cap), 1, 'retired slug is not published');
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000002'),
  false,
  'retired upcoming row stays unpublished'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'c6000000-0000-4000-8000-000000000003'),
  true,
  'the next eligible row publishes under the clamped cap'
);

select ok(
  not has_function_privilege('anon', 'public.publish_eligible_previews(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.publish_eligible_previews(integer)', 'execute')
  and not has_function_privilege('anon', 'public.unpublish_stale_previews()', 'execute')
  and not has_function_privilege('authenticated', 'public.unpublish_stale_previews()', 'execute'),
  'anon and authenticated have no execute'
);
select ok(
  has_function_privilege('service_role', 'public.publish_eligible_previews(integer)', 'execute')
  and has_function_privilege('service_role', 'public.unpublish_stale_previews()', 'execute'),
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
