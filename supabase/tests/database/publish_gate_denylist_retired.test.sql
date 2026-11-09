-- Publish gate enforces the denylist and retired preview slugs (migration 0061).
-- All names, references and identifiers are synthetic.
begin;
select no_plan();

insert into public.organizations (id, canonical_name, normalized_name, domain, postcode)
values (
  'a9100000-0000-4000-8000-000000000001',
  'Fenwick Quarry Parish Council',
  'fenwick quarry parish council',
  'fenwickquarry.gov.uk',
  'ZQ4 1RT'
);

insert into public.deals (
  id, source_title, source_description, buyer_organization_id, reference,
  deal_type, buyer_sector, stage, status, submission_deadline
) values (
  'b9100000-0000-4000-8000-000000000001',
  'Highway lighting column renewal programme',
  'Renewal of ageing highway lighting columns across the borough with new LED lanterns and structural testing.',
  'a9100000-0000-4000-8000-000000000001',
  'FQPC-2027-0611',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  '2027-04-18T12:00:00Z'
);

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published
) values (
  'b9100000-0000-4000-8000-000000000001',
  'street-lighting-upgrade-b9100000',
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  'Wales',
  '["relevant street lighting experience"]'::jsonb,
  'LOW', false
);

-- Denylisted deals cannot be flipped live.
insert into private.publish_denylist (deal_id, reason)
values ('b9100000-0000-4000-8000-000000000001', 'test hold');

update public.deal_previews
set is_published = true
where deal_id = 'b9100000-0000-4000-8000-000000000001';

select is(
  (select is_published from public.deal_previews where deal_id = 'b9100000-0000-4000-8000-000000000001'),
  false,
  'a denylisted preview stays unpublished'
);

-- Removing the denylist entry allows the same row to publish. The preview
-- text is deliberately disjoint from the source/buyer/slug so the leak gate
-- stays LOW and the denylist is the only thing holding it back.
delete from private.publish_denylist
where deal_id = 'b9100000-0000-4000-8000-000000000001';

update public.deal_previews
set is_published = true, leakage_risk = 'LOW'
where deal_id = 'b9100000-0000-4000-8000-000000000001';

select is(
  (select is_published from public.deal_previews where deal_id = 'b9100000-0000-4000-8000-000000000001'),
  true,
  'a preview publishes once it is no longer denylisted'
);

-- Retired slugs cannot be flipped live, using the same hash comparison as
-- public.preview_slug_is_retired.
select public.retire_preview_slug('street-lighting-upgrade-b9100000');

update public.deal_previews
set is_published = false
where deal_id = 'b9100000-0000-4000-8000-000000000001';

update public.deal_previews
set is_published = true
where deal_id = 'b9100000-0000-4000-8000-000000000001';

select is(
  (select is_published from public.deal_previews where deal_id = 'b9100000-0000-4000-8000-000000000001'),
  false,
  'a preview with a retired slug stays unpublished'
);

-- Direct inserts that claim to be published are also held.
insert into public.deals (
  id, source_title, source_description, buyer_organization_id, reference,
  deal_type, buyer_sector, stage, status, submission_deadline
) values (
  'b9100000-0000-4000-8000-000000000002',
  'Highway lighting column renewal programme',
  'Renewal of ageing highway lighting columns across the borough with new LED lanterns and structural testing.',
  'a9100000-0000-4000-8000-000000000001',
  'FQPC-2027-0612',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  '2027-04-18T12:00:00Z'
);

select public.retire_preview_slug('street-lighting-upgrade-b9100002');

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published
) values (
  'b9100000-0000-4000-8000-000000000002',
  'street-lighting-upgrade-b9100002',
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN',
  'Wales',
  '["relevant street lighting experience"]'::jsonb,
  'LOW', true
);

select is(
  (select is_published from public.deal_previews where deal_id = 'b9100000-0000-4000-8000-000000000002'),
  false,
  'a retired slug keeps a direct insert unpublished'
);

select * from finish();
rollback;
