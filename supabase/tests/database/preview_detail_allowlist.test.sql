-- Migration 0041 (PR #42, S&B anti-bypass P1-1..P1-4, P2-1, P2-3). Synthetic strings only.
begin;
select no_plan();

-- P1-3: fail-closed risk detector.
select ok(private.preview_detail_text_risky(t), 'risky: ' || t)
from unnest(array[
  'Delivered for WESTFORD BOROUGH COUNCIL',
  'Email bids@westford.gov.uk',
  'See https://westford.example',
  'Details at www.example.org',
  'Details at westford-procurement.co.uk',
  'Call 01793 466000',
  'ext 42',
  'Release ocds-h6vhtk-1',
  'Id tender_123456',
  'Notice 012345-2026',
  'Ref: ABC/XYZ',
  'Under rm6187 terms',
  'Closes in 21 days',
  'Questions close in 3 days',
  'Deliver to SN1 2JH',
  'Use the esourcing portal',
  'Bids through in-tend',
  'Hosted on proactis',
  'Listed on g-cloud',
  'Technology Products and Services',
  'Crown Commercial Service call-off',
  'Code WBC/ICT/77'
]) as t;

select ok(not private.preview_detail_text_risky(t), 'safe: ' || t)
from unnest(array[
  'Managed service desk and endpoint management for staff',
  'ISO 27001 and Cyber Essentials Plus required with GDPR duties',
  'Install LED lighting and CCTV across sites',
  'IT services: consulting, software development, Internet and support'
]) as t;

-- P1-1, P1-2, P1-3, P2-1, P2-3: the DTO keeps only allow-listed, in-vocabulary, risk-free lines.
select is(
  private.preview_dto_requirements(jsonb_build_array(
    'goodsServices: Construction work',
    'goodsServices: Westford hospital cleaning',
    'standards: ISO 27001 information security',
    'keyDates: Closing window Within 30 days. Contract term 1–2 years',
    'keyDates: Closes in 21 days',
    'keyDates: Closing window Within 30 days. Published September 2026',
    'quantities: Quantities specified (devices)',
    'quantities: Quantity 240 devices',
    'deliveryRequirements: Delivery within South West England',
    'deliveryRequirements: Delivery within Nationwide',
    'deliveryRequirements: UK-wide delivery',
    'deliveryRequirements: Delivery within Swindon',
    'commercialRequirements: Price scored',
    'commercialRequirements: Price scored at 40 percent',
    'scope: Managed service desk and endpoint management for staff',
    'scope: Contact bids@westford.gov.uk',
    'technicalSpecs: Hosted via In-Tend',
    'lotCount: 3',
    'procedureType: open procedure',
    'framework: yes',
    'Contact: x@y.com',
    'Some random source sentence',
    'financial capacity evidence',
    'IT services 72000000'
  )),
  jsonb_build_array(
    jsonb_build_object('field', 'goodsServices', 'text', 'Construction work'),
    jsonb_build_object('field', 'standards', 'text', 'ISO 27001 information security'),
    jsonb_build_object('field', 'keyDates', 'text', 'Closing window Within 30 days. Contract term 1–2 years'),
    jsonb_build_object('field', 'quantities', 'text', 'Quantities specified (devices)'),
    jsonb_build_object('field', 'deliveryRequirements', 'text', 'Delivery within South West England'),
    jsonb_build_object('field', 'deliveryRequirements', 'text', 'UK-wide delivery'),
    jsonb_build_object('field', 'commercialRequirements', 'text', 'Price scored'),
    jsonb_build_object('field', 'scope', 'text', 'Managed service desk and endpoint management for staff'),
    to_jsonb('financial capacity evidence'::text)
  ),
  'DTO drops risky, banned and out-of-vocabulary lines'
);

-- P1-4: the publish gate flags those strings inside "field: text" lines.
select ok(
  exists (select 1 from private.preview_detail_findings('t', 's', jsonb_build_array('scope: ' || t)) f where f.finding_risk = 'HIGH'),
  'gate flags scope line: ' || t
)
from unnest(array[
  'WESTFORD BOROUGH COUNCIL', 'bids@westford.gov.uk', 'westford.gov.uk', '01793 466000',
  'ocds-h6vhtk-1', 'tender_123456', '012345-2026', 'Ref: ABC', 'RM6187', 'g-cloud', 'in-tend', 'SN1 2JH'
]) as t;

select ok(
  exists (select 1 from private.preview_detail_findings('t', 'Closes in 21 days.', '[]'::jsonb) f where f.finding_code = 'DATE_DAY_COUNT'),
  'gate flags a day count in the summary'
);
select ok(
  exists (select 1 from private.preview_detail_findings('t', 's', '["lotCount: 3"]'::jsonb) f where f.finding_code = 'DETAIL_FIELD_BANNED'),
  'gate flags a banned lotCount line'
);
select is(
  (select count(*)::int from private.preview_detail_findings(
    'IT services for a public organisation',
    'A public organisation is procuring IT services. Closing window Within 30 days.',
    '["keyDates: Closing window Within 30 days", "standards: ISO 27001 information security"]'::jsonb)),
  0,
  'clean banded preview has no detail findings'
);

-- Grants.
select ok(not has_function_privilege('anon', 'private.preview_dto_requirements(jsonb)', 'execute'), 'anon cannot call DTO filter directly');
select ok(not has_function_privilege('anon', 'private.preview_detail_text_risky(text)', 'execute'), 'anon cannot call risk detector');

select * from finish();
rollback;
