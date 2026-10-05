-- Publish gate, admin hold and fail-closed entitlement checks (migration 0018).
-- All names, references, postcodes and dates are synthetic.
begin;
select no_plan();

insert into public.organizations (id, canonical_name, normalized_name, domain, postcode)
values (
  'a0000000-0000-4000-8000-000000000001',
  'Brynlow Vale County Borough Council',
  'brynlow vale county borough council',
  'brynlowvale.gov.uk',
  'XW7 2PL'
);

insert into public.deals (
  id, source_title, source_description, buyer_organization_id, reference,
  deal_type, buyer_sector, stage, status, submission_deadline
) values (
  'b0000000-0000-4000-8000-000000000001',
  'Highway lighting column renewal programme',
  'Renewal of ageing highway lighting columns across the borough with new LED lanterns and structural testing.',
  'a0000000-0000-4000-8000-000000000001',
  'BVCBC-2027-0417',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  '2027-03-14T12:00:00Z'
);

-- Clean preview publishes.
insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published
) values (
  'b0000000-0000-4000-8000-000000000001',
  'street-lighting-upgrade-b0000000',
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  'Wales',
  '["relevant street lighting experience"]'::jsonb,
  'LOW', true
);

select is(
  (select is_published from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  true,
  'clean preview stays published'
);

-- Every column update re-runs the gate, including slug-only changes.
update public.deal_previews
set slug = 'brynlow-vale-street-lighting-b0000000'
where deal_id = 'b0000000-0000-4000-8000-000000000001';

select is(
  (select leakage_risk::text from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  'HIGH',
  'buyer name in the slug raises HIGH risk'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  false,
  'buyer name in the slug unpublishes'
);

-- A client-supplied LOW cannot lower a detected risk.
update public.deal_previews
set leakage_risk = 'LOW', is_published = true
where deal_id = 'b0000000-0000-4000-8000-000000000001';

select is(
  (select leakage_risk::text from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  'HIGH',
  'writing LOW does not override the gate'
);

update public.deal_previews
set slug = 'street-lighting-upgrade-b0000000', leakage_risk = 'LOW', is_published = true
where deal_id = 'b0000000-0000-4000-8000-000000000001';

select is(
  (select is_published from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  true,
  'a regenerated clean preview can publish again'
);

-- Exact source date (London time) and day-month dates.
update public.deal_previews
set preview_summary = 'Responses are due by 15 March for this lighting upgrade.'
where deal_id = 'b0000000-0000-4000-8000-000000000001';

select is(
  (select leakage_risk::text from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  'HIGH',
  'source deadline within one day is HIGH'
);

update public.deal_previews
set preview_summary = 'Responses are due by 2 June for this lighting upgrade.', leakage_risk = 'LOW', is_published = true
where deal_id = 'b0000000-0000-4000-8000-000000000001';

select is(
  (select leakage_risk::text from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  'REVIEW',
  'any exact day-month date is at least REVIEW'
);

-- Unpublished admin failsafe and hold.
update public.deal_previews
set preview_summary = 'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
    leakage_risk = 'LOW', is_published = true, unpublished_by_admin = true
where deal_id = 'b0000000-0000-4000-8000-000000000001';

select is(
  (select is_published from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  false,
  'admin hold forces unpublished'
);

-- Ingestion-style upsert that tries to clear the hold and publish.
insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  leakage_risk, is_published, unpublished_by_admin
) values (
  'b0000000-0000-4000-8000-000000000001',
  'street-lighting-upgrade-b0000000',
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  'LOW', true, false
)
on conflict (deal_id) do update set
  preview_title = excluded.preview_title,
  leakage_risk = excluded.leakage_risk,
  is_published = excluded.is_published,
  unpublished_by_admin = excluded.unpublished_by_admin;

select is(
  (select unpublished_by_admin from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  true,
  'ingest upsert cannot clear an admin hold'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  false,
  'held row cannot publish via ingest'
);

set local session_replication_role = replica;
update public.deal_previews
set unpublished_by_admin = false, is_published = true
where deal_id = 'b0000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

select is(
  (select is_published from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  false,
  'gate still fires with session_replication_role = replica'
);

select set_config('dealatlas.release_preview_hold', 'b0000000-0000-4000-8000-000000000001', true);
update public.deal_previews
set unpublished_by_admin = false
where deal_id = 'b0000000-0000-4000-8000-000000000001';
select set_config('dealatlas.release_preview_hold', '', true);

select is(
  (select unpublished_by_admin from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  true,
  'a forged release setting cannot clear an admin hold'
);

delete from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001';
insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  leakage_risk, is_published, unpublished_by_admin
) values (
  'b0000000-0000-4000-8000-000000000001',
  'street-lighting-upgrade-b0000000',
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  'LOW', true, false
);

select is(
  (select unpublished_by_admin from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  true,
  'deleting and re-inserting the preview cannot clear an admin hold'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  false,
  're-inserted held preview stays unpublished'
);

-- Deleting the deal itself (which cascades to its preview) and re-creating it
-- with the same id must not clear the hold either.
delete from public.deals where id = 'b0000000-0000-4000-8000-000000000001';
insert into public.deals (
  id, source_title, source_description, buyer_organization_id, reference,
  deal_type, buyer_sector, stage, status, submission_deadline
) values (
  'b0000000-0000-4000-8000-000000000001',
  'Highway lighting column renewal programme',
  'Renewal of ageing highway lighting columns across the borough with new LED lanterns and structural testing.',
  'a0000000-0000-4000-8000-000000000001',
  'BVCBC-2027-0417',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  '2027-03-14T12:00:00Z'
);
insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, leakage_risk, is_published, unpublished_by_admin
) values (
  'b0000000-0000-4000-8000-000000000001',
  'street-lighting-upgrade-b0000000',
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  'Wales', 'LOW', true, false
);

select is(
  (select unpublished_by_admin from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  true,
  'deleting and re-creating the deal cannot clear an admin hold'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  false,
  're-created deal preview stays unpublished while held'
);

select ok(
  not has_table_privilege('service_role', 'private.preview_holds', 'select')
  and not has_table_privilege('service_role', 'private.preview_holds', 'delete')
  and not has_table_privilege('authenticated', 'private.preview_holds', 'delete')
  and not has_table_privilege('anon', 'private.preview_holds', 'delete'),
  'no API role can read or clear admin holds directly'
);

select is(
  public.admin_release_preview_hold('b0000000-0000-4000-8000-000000000001'),
  true,
  'admin release RPC reports the released row'
);
select is(
  (select unpublished_by_admin from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  false,
  'admin release RPC clears the hold'
);
select is(
  (select is_published from public.deal_previews where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  false,
  'releasing a hold does not auto-publish'
);
select ok(
  not exists (select 1 from private.preview_holds where deal_id = 'b0000000-0000-4000-8000-000000000001'),
  'admin release RPC removes the recorded hold'
);

select ok(
  (select tgenabled = 'A' from pg_trigger where tgname = 'enforce_preview_safety' and tgrelid = 'public.deal_previews'::regclass),
  'preview gate trigger is ENABLE ALWAYS'
);

select is(
  private.detect_preview_leakage(
    'b0000000-0000-4000-8000-00000000ffff', 'x-b0000000', 'Title', 'Summary', '[]'::jsonb
  )::text,
  'HIGH',
  'unknown deal ids are HIGH'
);

-- -----------------------------------------------------------------------------
-- private.is_user_pro fails closed on a missing period end.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-000000000001', 'null-period@example.test'),
  ('c0000000-0000-4000-8000-000000000002', 'paid@example.test'),
  ('c0000000-0000-4000-8000-000000000003', 'lapsed@example.test');

insert into public.subscriptions (user_id, status, current_period_end, is_current) values
  ('c0000000-0000-4000-8000-000000000001', 'ACTIVE', null, true),
  ('c0000000-0000-4000-8000-000000000002', 'ACTIVE', now() + interval '10 days', true),
  ('c0000000-0000-4000-8000-000000000003', 'ACTIVE', now() - interval '1 day', true);

select is(private.is_user_pro('c0000000-0000-4000-8000-000000000001'), false, 'ACTIVE with null period end is not Pro');
select is(private.is_user_pro('c0000000-0000-4000-8000-000000000002'), true, 'ACTIVE paid-through is Pro');
select is(private.is_user_pro('c0000000-0000-4000-8000-000000000003'), false, 'ACTIVE with lapsed period end is not Pro');

-- Every registered source's name is a platform marker for every deal, not
-- only for deals from that source.
select is(
  (
    select coalesce(array_agg(ds.name order by ds.name), '{}')
    from public.data_sources ds
    where ds.source_key <> 'private-source-template'
      and not exists (
        select 1 from private.leak_gate_terms t
        where t.kind = 'source_platform'
          and private.leak_norm(t.term) = private.leak_norm(ds.name)
      )
  ),
  '{}'::text[],
  'every data_sources name is a source_platform gate term'
);

select is(
  (
    select array_agg(t order by t)
    from unnest(array[
      'delta esourcing', 'delta e-sourcing', 'procontract', 'in-tend', 'intend', 'proactis', 'jaggaer',
      'atamis', 'mytenders', 'bravo', 'eu-supply', 'etenderwales', 'sell2wales', 'public contracts scotland',
      'etendersni', 'find a tender', 'contracts finder'
    ]) as t
    where not exists (select 1 from private.leak_gate_terms g where g.kind = 'source_platform' and g.term = t)
  ),
  null::text[],
  'the major UK procurement portals are source_platform gate terms'
);

select * from finish();
rollback;
