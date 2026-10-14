-- Attaching a Contracts Finder notice must not change Find a Tender publish eligibility.
begin;
select no_plan();

truncate table public.deals cascade;
delete from public.admin_audit_events
where action in ('preview.publish', 'preview.unpublish', 'preview.release_hold');
delete from private.publish_denylist;

insert into private.publish_denylist (deal_id, reason)
values ('00000000-0000-4000-8000-0000000000d1', 'test seed so publish can run');

update public.data_sources
set scraping_permitted = true
where source_key = 'find-a-tender';

insert into public.organizations (id, canonical_name, normalized_name)
values (
  'a7000000-0000-4000-8000-000000000001',
  'Example Borough Council',
  'example borough council'
);

insert into public.deals (
  id, primary_source_id, ocid, source_title, buyer_organization_id,
  deal_type, buyer_sector, stage, status, submission_deadline
)
select
  'c7000000-0000-4000-8000-000000000001',
  s.id,
  'ocds-h6vhtk-fixture-shared',
  'Find a Tender original title',
  'a7000000-0000-4000-8000-000000000001',
  'PUBLIC_TENDER',
  'PUBLIC',
  'LIVE',
  'OPEN',
  timestamptz '2027-06-01 12:00:00+00'
from public.data_sources s
where s.source_key = 'find-a-tender';

insert into public.deal_previews (
  deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status,
  broad_region, requirements_preview, leakage_risk, is_published, unpublished_by_admin
) values (
  'c7000000-0000-4000-8000-000000000001',
  'street-lighting-upgrade-for-a-local-authority-abcd1001',
  'Street lighting upgrade for a local authority',
  'A public body in Wales wants a contractor to replace roadside lighting with efficient units.',
  'PUBLIC_TENDER', 'PUBLIC', 'LIVE', 'OPEN', 'Wales',
  '["relevant street lighting experience"]'::jsonb, 'LOW', false, false
);

create temp table cf_before as
select d.status, d.stage, d.submission_deadline, d.primary_source_id, dp.is_published
from public.deals d
join public.deal_previews dp on dp.deal_id = d.id
where d.id = 'c7000000-0000-4000-8000-000000000001';

create temp table cf_pub_before as
select public.publish_eligible_previews(10, 'cf-before') as result;

select is(
  (select is_published from public.deal_previews where deal_id = 'c7000000-0000-4000-8000-000000000001'),
  true,
  'the Find a Tender preview publishes before a Contracts Finder notice is attached'
);

create temp table cf_unpub_before as
select public.unpublish_stale_previews('cf-before') as result;

select is(
  (select result ->> 'unpublished' from cf_unpub_before),
  '0',
  'a published Find a Tender preview stays published before the attach'
);

update public.deal_previews
set is_published = false
where deal_id = 'c7000000-0000-4000-8000-000000000001';

insert into public.notices (
  deal_id, source_id, notice_identifier, release_id, source_url, is_current_version
)
select
  'c7000000-0000-4000-8000-000000000001',
  s.id,
  'cf-000004-2026',
  'cf-000004-2026',
  'https://www.contractsfinder.service.gov.uk/Notice/cf-000004-2026',
  false
from public.data_sources s
where s.source_key = 'contracts-finder';

select results_eq(
  $$select d.status, d.stage, d.submission_deadline, d.primary_source_id, dp.is_published
    from public.deals d
    join public.deal_previews dp on dp.deal_id = d.id
    where d.id = 'c7000000-0000-4000-8000-000000000001'$$,
  $$select status, stage, submission_deadline, primary_source_id, is_published from cf_before$$,
  'status, stage, deadline, primary source and is_published are unchanged'
);

create temp table cf_pub_after as
select public.publish_eligible_previews(10, 'cf-after') as result;

select is(
  (select result from cf_pub_after),
  (select result from cf_pub_before),
  'publish_eligible_previews returns the same counts after the attach'
);

create temp table cf_unpub_after as
select public.unpublish_stale_previews('cf-after') as result;

select is(
  (select result from cf_unpub_after),
  (select result from cf_unpub_before),
  'unpublish_stale_previews returns the same counts after the attach'
);

select * from finish();
rollback;
