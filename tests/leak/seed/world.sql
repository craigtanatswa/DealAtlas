-- Leak-probe synthetic world (spec pr1-local-probes.md section 2).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -v free_id=... -v free_lapsed_id=... \
--     -v free_expired_id=... -v pro_id=... -v include_residuals=0 -f tests/leak/seed/world.sql
--
-- Runs as postgres, so the real publish gate (private.enforce_preview_safety)
-- decides every preview's outcome. Every organisation, place, person,
-- reference, phone number and date is INVENTED; domains are .example/.invalid,
-- phone numbers are from the Ofcom drama range and ZE9 is not a real
-- postcode district. The only real names are generic portal names.
--
-- Ids: deals 5eed0000-0000-4000-8000-<row>, organisations ...-9000-...,
-- child rows ...-a000-<row><n>.

\set ON_ERROR_STOP on

begin;

select set_config('leak.free_id', :'free_id', true),
       set_config('leak.free_lapsed_id', :'free_lapsed_id', true),
       set_config('leak.free_expired_id', :'free_expired_id', true),
       set_config('leak.pro_id', :'pro_id', true),
       set_config('leak.include_residuals', :'include_residuals', true);

-- 1. Sources ------------------------------------------------------------------
insert into public.data_sources (source_key, name, source_type, access_method, base_url, reuse_status, scraping_permitted, enabled)
values
  ('zq-eprocure', 'Zarqwell eProcure', 'PROCUREMENT_PLATFORM', 'JSON_API', 'https://eprocure.zarqwell-bc.example/', 'UNKNOWN', false, false),
  ('zq-delta', 'Delta eSourcing', 'PROCUREMENT_PLATFORM', 'JSON_API', 'https://zarqwell.delta.invalid/', 'UNKNOWN', false, false),
  ('zq-vantrexo-portal', 'Vantrexo Supplier Portal', 'PRIVATE_COMPANY_WEB', 'HTML', 'https://suppliers.vantrexo-fm.example/', 'UNKNOWN', false, false);

-- 2. Organisations ----------------------------------------------------------------
insert into public.organizations
  (id, canonical_name, normalized_name, buyer_sector, website, domain, email, phone, address_line_1, city, county, postcode, region, country_code)
values
  ('5eed0000-0000-4000-9000-000000000001', 'Zarqwell Borough Council', 'zarqwell borough council', 'PUBLIC',
   'https://www.zarqwell-bc.example', 'zarqwell-bc.example', 'procurement@zarqwell-bc.example', '+44 20 7946 0417',
   'Civic Hall, 1 Harl Lane', 'Zarqwell', 'Zarqwellshire', 'ZE9 7QX', 'South East England', 'GB'),
  ('5eed0000-0000-4000-9000-000000000002', 'Vantrexo Facilities Ltd', 'vantrexo facilities ltd', 'PRIVATE',
   'https://www.vantrexo-fm.example', 'vantrexo-fm.example', null, '+44 20 7946 0388', null, null, null, null, null, 'GB'),
  ('5eed0000-0000-4000-9000-000000000003', 'Orlembic Systems Limited', 'orlembic systems limited', 'PRIVATE',
   'https://www.orlembic.example', 'orlembic.example', null, null, null, null, null, null, null, 'GB'),
  ('5eed0000-0000-4000-9000-000000000004', 'Zarqwell Learning Trust', 'zarqwell learning trust', 'EDUCATION',
   null, null, null, null, null, null, null, null, null, 'GB'),
  ('5eed0000-0000-4000-9000-000000000005', 'Ostravane District Council', 'ostravane district council', 'PUBLIC',
   null, null, null, null, null, null, null, null, null, 'GB');

insert into public.organization_aliases (id, organization_id, alias, normalized_alias)
values
  ('5eed0000-0000-4000-a000-0000000a0001', '5eed0000-0000-4000-9000-000000000001', 'ZqBC', 'zqbc'),
  ('5eed0000-0000-4000-a000-0000000a0002', '5eed0000-0000-4000-9000-000000000001', 'Zarqwell BC', 'zarqwell bc'),
  ('5eed0000-0000-4000-a000-0000000a0003', '5eed0000-0000-4000-9000-000000000001', 'Zarqwell Council', 'zarqwell council'),
  ('5eed0000-0000-4000-a000-0000000a0004', '5eed0000-0000-4000-9000-000000000002', 'Vantrexo FM', 'vantrexo fm');

insert into public.organization_identifiers (id, organization_id, scheme, value, is_primary)
values
  ('5eed0000-0000-4000-a000-0000000a0011', '5eed0000-0000-4000-9000-000000000001', 'GB-LAE', 'ZQBC-0091', true),
  ('5eed0000-0000-4000-a000-0000000a0012', '5eed0000-0000-4000-9000-000000000002', 'GB-COH', 'ZQ771204', true);

insert into public.organization_contacts (id, organization_id, name, role_title, email, phone, published_for_procurement)
values
  ('5eed0000-0000-4000-a000-0000000a0021', '5eed0000-0000-4000-9000-000000000001', 'Ysolde Pemberthwick',
   'Procurement Lead', 'y.pemberthwick@zarqwell-bc.example', '+44 20 7946 0418', true);

-- 3-4. Deals and their source worlds ----------------------------------------------
create function pg_temp.child_id(p_row text, p_n integer) returns uuid
language sql immutable as $$
  select ('5eed0000-0000-4000-a000-' || lpad(p_row, 8, '0') || lpad(p_n::text, 4, '0'))::uuid
$$;

create function pg_temp.deal_id(p_row text) returns uuid
language sql immutable as $$
  select ('5eed0000-0000-4000-8000-' || lpad(p_row, 12, '0'))::uuid
$$;

create function pg_temp.source_id(p_key text) returns uuid
language sql stable as $$
  select id from public.data_sources where source_key = p_key
$$;

-- Inserts a deal and the full source world of one B-row kind. Every token in
-- the world lives only in source and private fields; previews come later.
create function pg_temp.seed_deal(p_row text, p_kind text, p_source_key text default null)
returns void
language plpgsql as $$
declare
  v_deal uuid := pg_temp.deal_id(p_row);
  v_o1 constant uuid := '5eed0000-0000-4000-9000-000000000001';
  v_o2 constant uuid := '5eed0000-0000-4000-9000-000000000002';
  v_o3 constant uuid := '5eed0000-0000-4000-9000-000000000003';
  v_o4 constant uuid := '5eed0000-0000-4000-9000-000000000004';
  v_o5 constant uuid := '5eed0000-0000-4000-9000-000000000005';
  v_source uuid;
  v_title text;
  v_description text;
  v_text text;
  v_buyer uuid := v_o1;
  v_type public.deal_type := 'PUBLIC_TENDER';
  v_sector public.buyer_sector := 'PUBLIC';
  v_stage public.deal_stage := 'LIVE';
  v_status public.deal_status := 'OPEN';
  v_category text := 'Facilities & Property';
  v_reference text;
  v_ocid text;
  v_external text;
  v_value numeric;
  v_value_text text;
  v_location text;
  v_submission timestamptz;
  v_enquiry timestamptz;
  v_start date;
  v_renewal date;
  v_source_url text;
  v_application_url text;
  v_lot uuid := pg_temp.child_id(p_row, 1);
  v_notice uuid := pg_temp.child_id(p_row, 2);
  v_raw uuid := pg_temp.child_id(p_row, 3);
  v_location_id uuid := pg_temp.child_id(p_row, 4);
  v_document uuid := pg_temp.child_id(p_row, 5);
  v_award uuid := pg_temp.child_id(p_row, 6);
  v_contract uuid := pg_temp.child_id(p_row, 7);
begin
  case p_kind
    when 'b1' then
      v_source := pg_temp.source_id(coalesce(p_source_key, 'zq-eprocure'));
      v_title := 'ZARQWELL BOROUGH COUNCIL - Quellmoor Depot Grounds Maintenance (QMRP Lot 2)';
      v_description := 'Zarqwell Borough Council invites tenders for grounds maintenance at Quellmoor Depot, Harl Lane, ZE9 7QX, under the Quellmoor Modernisation & Resurfacing Programme (QMRP). Tenders via Zarqwell eProcure (Delta eSourcing) by 12:00 on 17 November 2031. Contact Ysolde Pemberthwick, procurement@zarqwell-bc.example, +44 20 7946 0418. Estimated value £1,234,567.';
      v_reference := 'ZQ/PROC/8812';
      v_ocid := 'ocds-zq9x7k-000123';
      v_external := 'ZQN-2026-004417';
      v_value := 1234567;
      v_value_text := '£1,234,567';
      v_location := 'Quellmoor Depot, Harl Lane, Zarqwell ZE9 7QX';
      v_submission := '2031-11-17 12:00 Europe/London';
      v_enquiry := '2031-11-03 12:00 Europe/London';
      v_start := '2032-01-04';
      v_source_url := 'https://eprocure.zarqwell-bc.example/notice/ZQN-2026-004417';
      v_application_url := 'https://eprocure.zarqwell-bc.example/apply/8812';
    when 'b2' then
      v_source := pg_temp.source_id(coalesce(p_source_key, 'zq-eprocure'));
      v_title := 'Award: Vantrexo Facilities Ltd - Zarqwell facilities management';
      v_description := 'Zarqwell Borough Council awarded contract ZQ-CON-55120 (award ZQ-AWD-2026-0417) to Vantrexo Facilities Ltd for facilities management, worth £1,234,567, starting 17 November 2031.';
      v_type := 'AWARD';
      v_stage := 'AWARD';
      v_status := 'AWARDED';
      v_reference := 'ZQ-AWD-2026-0417';
      v_external := 'ZQ-AWD-2026-0417';
      v_value := 1234567;
      v_value_text := '£1,234,567';
      v_start := '2031-11-17';
      v_source_url := 'https://eprocure.zarqwell-bc.example/award/ZQ-AWD-2026-0417';
    when 'b3' then
      v_source := pg_temp.source_id(coalesce(p_source_key, 'find-a-tender'));
      v_title := 'OSTRAVEL RIVERSIDE WORKS - LOT 1 Highway Resurfacing';
      v_description := 'Brindlewick Yard will host the site compound. Works form part of QMRP. Notice 994417-2099 (2099/S 000-994417).';
      v_category := 'Construction & Infrastructure';
      v_reference := '994417-2099';
      v_external := '994417-2099';
      v_location := 'Brindlewick Yard, Ostravel Riverside';
      v_submission := '2031-11-17 12:00 Europe/London';
      v_source_url := 'https://www.find-tender.service.gov.uk/Notice/994417-2099';
    when 'b4' then
      v_source := pg_temp.source_id(coalesce(p_source_key, 'zq-vantrexo-portal'));
      v_title := 'Orlembic Systems Limited - Project Kestrovane managed IT support (RFQ-ZQ-3391)';
      v_description := 'Orlembic Systems Limited requests quotes for managed IT support under Project Kestrovane. Submit through the ProContract portal by 17 November 2031. Budget £1,234,567.';
      v_buyer := v_o3;
      v_type := 'PRIVATE_TENDER';
      v_sector := 'PRIVATE';
      v_category := 'Technology';
      v_reference := 'RFQ-ZQ-3391';
      v_external := 'RFQ-ZQ-3391';
      v_value_text := '£1,234,567';
      v_submission := '2031-11-17 12:00 Europe/London';
      v_source_url := 'https://suppliers.vantrexo-fm.example/rfq/RFQ-ZQ-3391';
    when 'b5' then
      v_source := pg_temp.source_id(coalesce(p_source_key, 'zq-eprocure'));
      v_title := 'Zarqwell Borough Council fleet maintenance contract (Vantrexo FM) - renewal';
      v_description := 'The fleet maintenance contract with Vantrexo Facilities Ltd at Quellmoor Depot ends on 17 November 2031; Zarqwell Borough Council expects to procure again.';
      v_type := 'CONTRACT_RENEWAL';
      v_stage := 'PLANNING';
      v_status := 'UPCOMING';
      v_category := 'Transport & Logistics';
      v_reference := 'ZQ-CON-55120';
      v_renewal := '2031-11-17';
      v_source_url := 'https://eprocure.zarqwell-bc.example/contract/ZQ-CON-55120';
    when 'b6' then
      v_source := pg_temp.source_id(coalesce(p_source_key, 'find-a-tender'));
      v_title := 'Zarqwell Learning Trust - school catering';
      v_description := 'Published on Public Contracts Scotland, Sell2Wales and eTendersNI by Zarqwell Learning Trust; see Contracts Finder and Find a Tender.';
      v_buyer := v_o4;
      v_sector := 'EDUCATION';
      v_category := 'Food & Catering';
      v_submission := '2031-11-17 12:00 Europe/London';
      v_source_url := 'https://www.find-tender.service.gov.uk/Notice/ZQ-LT-0001';
    when 'filler' then
      v_source := pg_temp.source_id('find-a-tender');
      v_buyer := v_o5;
      v_title := case p_row
        when 'f1' then 'Grounds maintenance and highway resurfacing works for a public organisation'
        when 'f2' then 'Facilities management contract award and fleet maintenance contract renewal'
        when 'f3' then 'Catering services for schools and grounds maintenance services'
        when 'f4' then 'Managed IT support services for a private organisation and public sector sites'
        when 'f5' then 'Highway resurfacing works and fleet maintenance services across several sites'
        else 'Facilities management, catering services and managed IT support contract renewal'
      end;
      v_description := 'Scope list for a public organisation: upkeep of grounds; maintenance of highway; resurfacing works; facilities management; fleet servicing; catering for schools; managed IT support; service desk; device management; grass cutting; hedge work; seasonal planting; contract award; contract renewal; several sites; buildings; road network.';
      v_category := case p_row
        when 'f1' then 'Construction & Infrastructure' when 'f2' then 'Facilities & Property'
        when 'f3' then 'Food & Catering' when 'f4' then 'Technology'
        when 'f5' then 'Transport & Logistics' else 'Facilities & Property' end;
      v_source_url := 'https://www.find-tender.service.gov.uk/Notice/filler-' || p_row;
    else
      raise exception 'unknown world kind %', p_kind;
  end case;

  insert into public.deals
    (id, primary_source_id, external_primary_id, ocid, reference, source_title, source_description,
     buyer_organization_id, deal_type, buyer_sector, stage, status, main_category, value_min_ex_vat,
     value_max_ex_vat, exact_value_text, exact_location_text, enquiry_deadline, submission_deadline,
     contract_start_date, estimated_renewal_date, next_procurement_date, source_url, application_url,
     first_published_at, latest_source_at)
  values
    (v_deal, v_source, case when p_row ~ '^b[1-6]$' then coalesce(v_external, 'leak-' || p_row)
                            else coalesce(v_external, 'leak') || '-' || p_row end,
     v_ocid, v_reference, v_title, v_description, v_buyer, v_type, v_sector, v_stage, v_status, v_category,
     v_value, v_value, v_value_text, v_location, v_enquiry, v_submission, v_start, v_renewal, v_renewal,
     v_source_url, v_application_url, now() - interval '2 days', now() - interval '1 day');

  insert into public.deal_organizations (id, deal_id, organization_id, role, source_id)
  values (pg_temp.child_id(p_row, 10), v_deal, v_buyer, 'BUYER', v_source);

  v_text := concat_ws(' | ', v_title, v_description, v_reference, v_ocid, v_external, v_value_text, v_location,
                      v_source_url, v_application_url, to_char(v_submission at time zone 'Europe/London', 'DD Month YYYY'));

  insert into public.raw_records (id, source_id, external_record_id, source_url, published_at, content_hash, content_type, raw_payload, raw_text)
  values (v_raw, v_source, 'leak-' || p_row || '-' || coalesce(v_external, p_row), v_source_url, now() - interval '2 days',
          md5('leak-raw-' || p_row), 'application/json',
          jsonb_build_object('title', v_title, 'description', v_description, 'reference', v_reference, 'ocid', v_ocid,
                             'buyer', 'Zarqwell Borough Council', 'contact', 'Ysolde Pemberthwick',
                             'email', 'procurement@zarqwell-bc.example', 'phone', '+44 20 7946 0418'),
          v_text);

  insert into public.notices (id, deal_id, source_id, raw_record_id, notice_identifier, release_id, notice_type, source_url, published_at, is_current_version)
  values (v_notice, v_deal, v_source, v_raw,
          case when p_row ~ '^b[1-6]$' then coalesce(v_external, 'leak-' || p_row) else coalesce(v_external, 'leak') || '-' || p_row end,
          case when v_ocid is not null then v_ocid || '-01' end, 'tender', v_source_url, now() - interval '2 days', true);

  insert into public.notice_versions (id, notice_id, version_number, content_hash, raw_payload, raw_text)
  values (pg_temp.child_id(p_row, 8), v_notice, 1, md5('leak-notice-' || p_row),
          jsonb_build_object('title', v_title, 'reference', v_reference), v_text);

  if p_kind = 'filler' then
    return;
  end if;

  insert into public.lots (id, deal_id, source_lot_id, lot_number, source_title, source_description, exact_location_text, submission_deadline, value_max)
  values (v_lot, v_deal, 'LOT-' || p_row, case when p_kind = 'b3' then '1' else '2' end,
          case p_kind when 'b3' then 'LOT 1 Highway Resurfacing - Ostravel Riverside' else 'Lot 2 - Quellmoor Depot grounds' end,
          case p_kind when 'b3' then 'Brindlewick Yard site compound' else 'Grounds at Quellmoor Depot, Harl Lane' end,
          case p_kind when 'b3' then 'Brindlewick Yard, Ostravel Riverside' else 'Quellmoor Depot, Harl Lane, Zarqwell ZE9 7QX' end,
          v_submission, v_value);

  insert into public.locations (id, country_code, region, county, city, postcode)
  values (v_location_id, 'GB', 'South East England', 'Zarqwellshire',
          case when p_kind = 'b3' then 'Quellmoor' else 'Zarqwell' end, 'ZE9 7QX');
  insert into public.deal_locations (id, deal_id, location_id, lot_id)
  values (pg_temp.child_id(p_row, 11), v_deal, v_location_id, v_lot);

  insert into public.documents (id, deal_id, notice_id, lot_id, source_id, name, document_type, source_url, mime_type, extracted_text)
  values (v_document, v_deal, v_notice, v_lot, v_source, 'QMRP-Lot2-Specification.pdf', 'specification',
          'https://docs.zarqwell.invalid/QMRP-Lot2-Specification.pdf', 'application/pdf',
          'Specification for Quellmoor Depot grounds, Harl Lane ZE9 7QX. Queries to Ysolde Pemberthwick.');

  insert into public.document_insights (id, document_id, insight_type, title, value, evidence_reference)
  values (pg_temp.child_id(p_row, 12), v_document, 'summary', 'Quellmoor Depot scope',
          jsonb_build_object('text', 'Zarqwell Borough Council needs Quellmoor Depot upkeep'), 'QMRP-Lot2-Specification.pdf p4');

  insert into public.requirements (id, deal_id, lot_id, requirement_type, name, description, mandatory)
  values (pg_temp.child_id(p_row, 13), v_deal, v_lot, 'COMPLIANCE', 'Compliance with ZQ/PROC/8812 Schedule 4',
          'Quellmoor Depot site rules apply', true);

  insert into public.award_criteria (id, deal_id, lot_id, criterion_name, criterion_description, weight_percent)
  values (pg_temp.child_id(p_row, 14), v_deal, v_lot, 'Quellmoor site method statement', 'Method statement for Harl Lane access', 40);

  insert into public.deal_insights (id, deal_id, buyer_need, competition_notes, incumbent_organization_id)
  values (pg_temp.child_id(p_row, 15), v_deal, 'Zarqwell needs Quellmoor Depot upkeep',
          case when p_kind = 'b5' then 'Vantrexo FM expected to rebid; Zarqwell''s fleet at Quellmoor Depot'
               else 'Vantrexo Facilities Ltd incumbent' end,
          case when p_kind in ('b2', 'b5') then v_o2 end);

  if p_kind = 'b2' then
    insert into public.awards (id, deal_id, lot_id, source_notice_id, award_identifier, award_date, award_value, currency)
    values (v_award, v_deal, v_lot, v_notice, 'ZQ-AWD-2026-0417', '2031-11-17', 1234567, 'GBP');
    insert into public.award_suppliers (award_id, organization_id, awarded_value) values (v_award, v_o2, 1234567);
    insert into public.deal_organizations (id, deal_id, organization_id, role, source_id)
    values (pg_temp.child_id(p_row, 16), v_deal, v_o2, 'AWARDED_SUPPLIER', v_source);
    insert into public.contracts (id, deal_id, award_id, contract_identifier, start_date, original_value, current_value, currency, status)
    values (v_contract, v_deal, v_award, 'ZQ-CON-55120', '2031-11-17', 1234567, 1234567, 'GBP', 'active');
  elsif p_kind = 'b5' then
    insert into public.deal_organizations (id, deal_id, organization_id, role, source_id)
    values (pg_temp.child_id(p_row, 16), v_deal, v_o2, 'INCUMBENT', v_source);
    insert into public.contracts (id, deal_id, contract_identifier, start_date, end_date, original_value, currency, status)
    values (v_contract, v_deal, 'ZQ-CON-55120', '2027-11-18', '2031-11-17', 1234567, 'GBP', 'active');
  elsif p_kind = 'b4' then
    insert into public.private_opportunity_details
      (deal_id, procurement_type, rfq_number, project_name, estimated_budget_text, expression_of_interest_deadline, submission_method)
    values (v_deal, 'RFQ', 'RFQ-ZQ-3391', 'Project Kestrovane', '£1,234,567', '2031-11-17 12:00 Europe/London', 'ProContract portal');
  end if;
end;
$$;

select pg_temp.seed_deal('b1', 'b1');
select pg_temp.seed_deal('b2', 'b2');
select pg_temp.seed_deal('b3', 'b3');
select pg_temp.seed_deal('b4', 'b4');
select pg_temp.seed_deal('b5', 'b5');
select pg_temp.seed_deal('b6', 'b6');
select pg_temp.seed_deal(r, 'filler') from unnest(array['f1', 'f2', 'f3', 'f4', 'f5', 'f6']) as r;
select pg_temp.seed_deal(r, 'b1') from unnest(array['a1', 'a2', 'a3', 'a4', 'e1']) as r;
select pg_temp.seed_deal(r, 'b1')
from unnest(array['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c15', 'c16', 'c17']) as r;
select pg_temp.seed_deal('c12', 'b5');
select pg_temp.seed_deal('c13', 'b1', 'find-a-tender');
select pg_temp.seed_deal('c14', 'b1', 'zq-delta');
select pg_temp.seed_deal('c18', 'b3');
select pg_temp.seed_deal('c19', 'b3');
select pg_temp.seed_deal('c20', 'b4');
select pg_temp.seed_deal(r, 'b1') from unnest(array['d1', 'd2', 'd3', 'd5']) as r;
select pg_temp.seed_deal('d4', 'b5');
select pg_temp.seed_deal('d6', 'b3');
select pg_temp.seed_deal(r, 'b1') from unnest(array['ee01', 'ee02']) as r
where current_setting('leak.include_residuals') = '1';

-- 5. Previews (the gate fires here) ------------------------------------------------
create function pg_temp.preview(
  p_row text,
  p_slug text,
  p_title text,
  p_summary text,
  p_requirements jsonb,
  p_tags text[],
  p_region text,
  p_value_band text default '£1m–£5m',
  p_risk public.leakage_risk default 'LOW',
  p_published boolean default true,
  p_admin_hold boolean default false
) returns void
language sql as $$
  insert into public.deal_previews
    (deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status, main_category,
     broad_region, value_band, deadline_band, duration_band, sme_suitability, bid_complexity, competition_level,
     requirements_preview, relevance_tags, freshness_label, leakage_risk, is_published, unpublished_by_admin)
  select d.id, p_slug, p_title, p_summary, d.deal_type, d.buyer_sector, d.stage, d.status, d.main_category,
         p_region, p_value_band, 'More than 30 days', '1–2 years', 'HIGH', 'MEDIUM', 'UNKNOWN',
         p_requirements, p_tags, 'Open opportunity', p_risk, p_published, p_admin_hold
  from public.deals d where d.id = pg_temp.deal_id(p_row)
$$;

-- (b) published LOW
select pg_temp.preview('b1', 'grounds-maintenance-services-4c1e9a07',
  'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance, including grass cutting, hedge work and seasonal planting across several sites. qelvantor',
  '["Grounds maintenance experience", "Public liability insurance"]', array['grounds maintenance', 'facilities'], 'South East England');
select pg_temp.preview('b2', 'facilities-management-contract-award-9b2f61d4',
  'Facilities management contract award',
  'A public sector organisation has made a contract award for facilities management across several sites.',
  '["Facilities management experience"]', array['facilities management'], 'South East England');
select pg_temp.preview('b3', 'highway-resurfacing-works-0e7d5c22',
  'Highway resurfacing works',
  'A public sector organisation is seeking a contractor for highway resurfacing works across several sites.',
  '["Highway resurfacing experience"]', array['highway resurfacing'], 'South East England');
select pg_temp.preview('b4', 'managed-it-support-services-6a3c0f18',
  'Managed IT support for a private organisation',
  'A private organisation is seeking a supplier for managed IT support, including service desk and device management.',
  '["Service desk capability"]', array['managed it support'], 'London');
select pg_temp.preview('b5', 'fleet-maintenance-contract-renewal-3d8e4b90',
  'Fleet maintenance contract renewal',
  'A public sector organisation expects to renew the contract for fleet maintenance across several sites.',
  '["Fleet maintenance experience"]', array['fleet maintenance'], 'South East England');
select pg_temp.preview('b6', 'school-catering-services-7f1a2e5c',
  'Catering services for schools',
  'A public sector organisation is seeking a contractor for catering services for schools across several sites.',
  '["Catering experience"]', array['catering services'], 'Scotland');

select pg_temp.preview(r, s, t, 'A public body needs a supplier for routine upkeep work at its premises.',
  '["Maintenance experience"]', array['maintenance'], 'East of England', '£100k–£250k')
from (values
  ('f1', 'grounds-and-site-services-1f0a0001', 'Grounds and site services for a public organisation'),
  ('f2', 'facilities-and-fleet-services-1f0a0002', 'Facilities and fleet maintenance services'),
  ('f3', 'catering-and-cleaning-services-1f0a0003', 'Catering services for a public organisation'),
  ('f4', 'it-support-and-maintenance-1f0a0004', 'Managed IT support services'),
  ('f5', 'highway-maintenance-works-1f0a0005', 'Highway maintenance works'),
  ('f6', 'contract-renewal-services-1f0a0006', 'Maintenance contract renewal')
) as f(r, s, t);

-- (a) held or unpublished; each carries a held marker (T30) found in no source field
select pg_temp.preview('a1', 'grounds-care-services-a1c0ffee', 'Grounds care services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites. brevantile',
  '["Grounds maintenance experience"]', array['grounds maintenance'], 'South East England', p_admin_hold => true);
select pg_temp.preview('a2', 'grounds-upkeep-services-a2c0ffee', 'Grounds upkeep services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites. cordumyre',
  '["Grounds maintenance experience"]', array['grounds maintenance'], 'South East England', p_published => false);
select pg_temp.preview('a3', 'grounds-works-services-a3c0ffee', 'Grounds works services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites. fenstrovic',
  '["Grounds maintenance experience"]', array['grounds maintenance'], 'South East England', p_risk => 'REVIEW');
select pg_temp.preview('a4', 'grounds-support-services-a4c0ffee', 'Grounds support services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites. galtreyne',
  '["Grounds maintenance experience"]', array['grounds maintenance'], 'South East England', p_risk => 'HIGH');
select pg_temp.preview('e1', 'grounds-programme-services-e1c0ffee', 'Grounds programme services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites. hollowvane',
  '["Grounds maintenance experience"]', array['grounds maintenance'], 'South East England');

-- (c) adversarial: the token is in the preview itself
create function pg_temp.adversarial(p_row text, p_title text, p_summary text,
  p_requirements jsonb default '["Grounds maintenance experience"]', p_tags text[] default array['grounds maintenance'],
  p_region text default 'South East England') returns void
language sql as $$
  select pg_temp.preview(p_row, 'adversarial-preview-5eedc' || lpad(substr(p_row, 2), 3, '0'),
    p_title, p_summary, p_requirements, p_tags, p_region)
$$;

select pg_temp.adversarial('c1', 'Zarqwell Borough Council grounds maintenance',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites.');
select pg_temp.adversarial('c2', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance for ZqBC across several sites.');
select pg_temp.adversarial('c3', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance at the quellmoor depot.');
select pg_temp.adversarial('c4', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites.',
  '["QMRP lot experience"]');
select pg_temp.adversarial('c5', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance; the tender closes 17 November 2031.');
select pg_temp.adversarial('c6', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance, with responses by 17/11 (17.11).');
select pg_temp.adversarial('c7', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites.',
  '["Quote ZQN-2026-004417"]');
select pg_temp.adversarial('c8', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance, ocds-zq9x7k-000123.');
select pg_temp.adversarial('c9', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance, ref ZQ/PROC/8812.');
select pg_temp.adversarial('c10', 'Grounds maintenance services for a public organisation',
  'Apply at https://eprocure.zarqwell-bc.example/notice/ZQN-2026-004417, email procurement@zarqwell-bc.example or call +44 20 7946 0417.');
select pg_temp.adversarial('c11', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance valued at £1,234,567.');
select pg_temp.adversarial('c12', 'Fleet maintenance contract renewal',
  'A public sector organisation expects to renew the contract with incumbent Vantrexo Facilities Ltd.');
select pg_temp.adversarial('c13', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance, advertised on Find a Tender.');
select pg_temp.adversarial('c14', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance; submit via Delta eSourcing or ProContract.');
select pg_temp.adversarial('c15', 'Grounds maintenance services for a public organisation',
  'A contractor is needed for grounds maintenance at Zarqwell''s depot.');
select pg_temp.adversarial('c16', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites.',
  p_tags => array['quellmoor']);
select pg_temp.adversarial('c17', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance across several sites.',
  p_region => 'Zarqwellshire');
select pg_temp.adversarial('c18', 'Highway resurfacing works',
  'The brindlewick yard compound will support highway resurfacing works.',
  '["Highway resurfacing experience"]', array['highway resurfacing']);
select pg_temp.adversarial('c19', 'OSTRAVEL riverside resurfacing',
  'A public sector organisation is seeking a contractor for highway resurfacing works across several sites.',
  '["Highway resurfacing experience"]', array['highway resurfacing']);
select pg_temp.adversarial('c20', 'Managed IT support for a private organisation',
  'A private organisation is seeking a supplier for managed IT support for Project Kestrovane (RFQ-ZQ-3391).',
  '["Service desk capability"]', array['managed it support'], 'London');

-- (d) token-bearing slugs; title and summary are clean
select pg_temp.preview(r, s, t, u, q::jsonb, array[g], 'South East England')
from (values
  ('d1', 'zarqwell-grounds-maintenance-3f9a1c2e', 'Grounds maintenance services for a public organisation',
   'A public sector organisation is seeking a contractor for grounds maintenance across several sites.', '["Grounds maintenance experience"]', 'grounds maintenance'),
  ('d2', 'quellmoor-depot-gritting-fleet-7b2d4e10', 'Grounds maintenance services for a public organisation',
   'A public sector organisation is seeking a contractor for grounds maintenance across several sites.', '["Grounds maintenance experience"]', 'grounds maintenance'),
  ('d3', 'qmrp-resurfacing-works-0c4e8a19', 'Grounds maintenance services for a public organisation',
   'A public sector organisation is seeking a contractor for grounds maintenance across several sites.', '["Grounds maintenance experience"]', 'grounds maintenance'),
  ('d4', 'vantrexo-fm-renewal-5d1f3b7a', 'Fleet maintenance contract renewal',
   'A public sector organisation expects to renew the contract for fleet maintenance across several sites.', '["Fleet maintenance experience"]', 'fleet maintenance'),
  ('d5', 'zq-proc-8812-grounds-1a6b9c3d', 'Grounds maintenance services for a public organisation',
   'A public sector organisation is seeking a contractor for grounds maintenance across several sites.', '["Grounds maintenance experience"]', 'grounds maintenance'),
  ('d6', 'brindlewick-yard-compound-8e2a4f61', 'Highway resurfacing works',
   'A public sector organisation is seeking a contractor for highway resurfacing works across several sites.', '["Highway resurfacing experience"]', 'highway resurfacing')
) as x(r, s, t, u, q, g);

-- (r) residual rows (non-blocking, LEAK_INCLUDE_RESIDUALS=1 only)
select pg_temp.preview('ee01', 'residual-spelled-date-ee000001', 'Grounds maintenance services for a public organisation',
  'A public sector organisation is seeking a contractor for grounds maintenance; the tender closes on the seventeenth of November.',
  '["Grounds maintenance experience"]', array['grounds maintenance'], 'South East England')
where current_setting('leak.include_residuals') = '1';
select pg_temp.preview('ee02', 'residual-zero-width-ee000002', 'Grounds maintenance services for a public organisation',
  E'A public sector organisation is seeking a contractor for grounds maintenance for Zarq\u200bwell across several sites.',
  '["Grounds maintenance experience"]', array['grounds maintenance'], 'South East England')
where current_setting('leak.include_residuals') = '1';

-- 6-8. User-owned rows. They carry no tokens, except where a row exists to prove
-- stored text is never served (deal_matches B3 labels, legacy alert columns).
create function pg_temp.user_id(p_role text) returns uuid
language sql stable as $$ select nullif(current_setting('leak.' || p_role || '_id'), '')::uuid $$;

insert into public.subscriptions
  (user_id, provider, dodo_customer_id, dodo_subscription_id, dodo_product_id, plan_key, status, billing_interval,
   current_period_start, current_period_end, cancel_at_period_end, is_current, last_provider_event_at)
values
  (pg_temp.user_id('free_lapsed'), 'dodo', 'cus_leak_lapsed', 'sub_leak_lapsed', 'prod_leak_monthly', 'PRO_MONTHLY', 'ACTIVE', 'MONTHLY',
   now() - interval '40 days', null, false, true, now() - interval '40 days'),
  (pg_temp.user_id('free_expired'), 'dodo', 'cus_leak_expired', 'sub_leak_expired', 'prod_leak_monthly', 'PRO_MONTHLY', 'ACTIVE', 'MONTHLY',
   now() - interval '31 days', now() - interval '1 day', false, true, now() - interval '31 days'),
  (pg_temp.user_id('pro'), 'dodo', 'cus_leak_pro', 'sub_leak_pro', 'prod_leak_monthly', 'PRO_MONTHLY', 'ACTIVE', 'MONTHLY',
   now() - interval '1 day', now() + interval '30 days', false, true, now() - interval '1 day');

insert into public.company_profiles (id, user_id, company_name, keywords, preferred_buyer_sectors, preferred_regions)
select pg_temp.child_id('ff0' || n, 1), pg_temp.user_id(r), 'Leakprobe Test Supplier',
       array['grounds', 'maintenance', 'fleet'], array['PUBLIC']::public.buyer_sector[], array['South East England']
from (values (1, 'free'), (2, 'free_lapsed'), (3, 'free_expired'), (4, 'pro')) as u(n, r);

insert into public.deal_matches (company_profile_id, deal_id, relevance_score, preview_reasons, detail_reasons)
select cp.id, pg_temp.deal_id('b1'), 81,
       '[{"code":"KEYWORD_OVERLAP","kind":"match","surface":"preview","label":"Keyword overlap with your profile"}]'::jsonb,
       '[{"code":"KEYWORD_OVERLAP","kind":"match","surface":"detail","label":"Keyword overlap with your profile"}]'::jsonb
from public.company_profiles cp where cp.company_name = 'Leakprobe Test Supplier'
union all
select cp.id, pg_temp.deal_id('b3'), 64,
       '[{"code":"KEYWORD_OVERLAP","kind":"match","surface":"preview","label":"Matches Zarqwell Borough Council history"}]'::jsonb,
       '[{"code":"KEYWORD_OVERLAP","kind":"match","surface":"detail","label":"trevossian detail Quellmoor"}]'::jsonb
from public.company_profiles cp where cp.company_name = 'Leakprobe Test Supplier';

insert into public.saved_deals (user_id, deal_id)
values (pg_temp.user_id('free'), pg_temp.deal_id('b1')),
       (pg_temp.user_id('free'), pg_temp.deal_id('a1')),
       (pg_temp.user_id('free'), pg_temp.deal_id('e1')),
       (pg_temp.user_id('pro'), pg_temp.deal_id('b1')),
       (pg_temp.user_id('pro'), pg_temp.deal_id('a1'));

insert into public.saved_searches (user_id, name, filters, alert_cadence)
values (pg_temp.user_id('free'), 'Grounds', '{"query":"grounds"}', 'IMMEDIATE');

insert into public.notification_preferences (user_id, email_enabled, digest_cadence, last_digest_sent_at)
select pg_temp.user_id(r), true, 'IMMEDIATE', null
from unnest(array['free', 'free_lapsed', 'free_expired', 'pro']) as r
on conflict (user_id) do update set email_enabled = true, digest_cadence = 'IMMEDIATE', last_digest_sent_at = null;

insert into public.watched_organizations (user_id, organization_id, watch_type)
values (pg_temp.user_id('pro'), '5eed0000-0000-4000-9000-000000000001', 'BUYER');

-- Alerts AL-1..AL-6 for every role. The legacy title/message columns carry
-- tokens to prove they are never served.
insert into public.alerts (user_id, deal_id, organization_id, alert_type, title, message, protected_payload, dedupe_key)
select pg_temp.user_id(r), a.deal_id, a.organization_id, a.alert_type::public.alert_type,
       'New match: Zarqwell Borough Council Quellmoor Depot',
       'Preview: Zarqwell grounds maintenance closes 17 November 2031',
       a.payload, 'leak:' || r || ':' || a.n
from unnest(array['free', 'free_lapsed', 'free_expired', 'pro']) as r
cross join (values
  (1, pg_temp.deal_id('b1'), null::uuid, 'NEW_MATCH', jsonb_build_object(
     'previewTitle', 'Grounds maintenance services for a public organisation',
     'previewSummary', 'Zarqwell grounds maintenance at Quellmoor Depot',
     'slug', 'zarqwell-grounds-maintenance-3f9a1c2e',
     'sourceTitle', 'ZARQWELL BOROUGH COUNCIL - Quellmoor Depot Grounds Maintenance (QMRP Lot 2)',
     'buyerName', 'Zarqwell Borough Council',
     'sourceUrl', 'https://eprocure.zarqwell-bc.example/notice/ZQN-2026-004417',
     'applicationUrl', 'https://eprocure.zarqwell-bc.example/apply/8812',
     'reference', 'ZQ/PROC/8812',
     'exactDeadline', '2031-11-17T12:00:00Z',
     'exactValue', '£1,234,567')),
  (2, pg_temp.deal_id('a1'), null, 'DEAL_CHANGED', jsonb_build_object(
     'previewTitle', 'brevantile grounds for Zarqwell Borough Council',
     'buyerName', 'Zarqwell Borough Council', 'changeType', 'DEADLINE_CHANGED', 'fieldName', 'submission_deadline')),
  (3, pg_temp.deal_id('c1'), null, 'DEADLINE', jsonb_build_object(
     'previewTitle', 'Zarqwell Borough Council grounds maintenance', 'exactDeadline', '2031-11-17T12:00:00Z')),
  (4, pg_temp.deal_id('e1'), null, 'NEW_MATCH', jsonb_build_object(
     'previewTitle', 'Grounds programme services hollowvane', 'buyerName', 'Zarqwell Borough Council')),
  (5, null, '5eed0000-0000-4000-9000-000000000001'::uuid, 'BUYER_ACTIVITY', jsonb_build_object(
     'buyerName', 'Zarqwell Borough Council')),
  (6, pg_temp.deal_id('b5'), null, 'RENEWAL', jsonb_build_object(
     'renewalDate', '2031-11-17', 'buyerName', 'Zarqwell Borough Council',
     'previewTitle', 'Fleet maintenance contract renewal'))
) as a(n, deal_id, organization_id, alert_type, payload);

commit;
