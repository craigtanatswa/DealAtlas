-- 0041 Rich free previews: allow-listed, vocabulary-bounded detail lines.
--
-- Principle: hide the source, not the value. Detail lines are stored in
-- deal_previews.requirements_preview as "<field>: <text>". Before any line can
-- leave the database through an anon/authenticated DTO RPC it must:
--   * use an allow-listed field (lotCount, procedureType and framework are NOT
--     allowed: they are quasi-identifiers, S&B PR42 P1-2);
--   * for structured fields, match a fixed vocabulary (CPV division titles,
--     standards, commercial lines, banded key dates, broad regions, quantity
--     units). Out-of-vocabulary text is dropped, so no new high-cardinality
--     quasi-identifier can ship (P1-2);
--   * for free-text fields (scope, technicalSpecs) and every other line, pass
--     private.preview_detail_text_risky. Any hit drops the line (fail-closed,
--     P1-3, P2-1);
--   * untagged lines must be one of the closed requirement labels (P2-3).
-- The publish gate (private.detect_preview_leakage) also raises HIGH for any
-- risky detail line or a deadline day count in the title/summary (P1-1, P1-3).
-- search_deal_previews_for_profile now projects through the same filter (P2-4).
-- The vocabularies mirror lib/preview/*.ts; tests/unit/migrations.test.ts
-- checks parity.

-- ---------------------------------------------------------------------------
-- Risk detector. Mirrors lib/preview/risk.ts freeTextRisk.
-- ---------------------------------------------------------------------------
create or replace function private.preview_detail_text_risky(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lower text := lower(coalesce(p, ''));
  v_tok text;
  v_term text;
  v_safe text[] := array[
      'ISO',
      'IEC',
      'PAS',
      'GDPR',
      'UK',
      'IT',
      'ICT',
      'SME',
      'SMES',
      'VAT',
      'HR',
      'AI',
      'CCTV',
      'LED',
      'PPE',
      'BIM',
      'HVAC',
      'GBP',
      'EUR',
      'USD',
      'BS',
      'EN',
      'PC',
      'PCS',
      'TV',
      'CPD',
      'KPI',
      'KPIS',
      'SLA',
      'SLAS',
      'API',
      'APIS',
      'PDF'
    ]::text[];
  v_terms text[] := array[
      'esourcing',
      'in-tend',
      'proactis',
      'bluelight',
      'jaggaer',
      'atamis',
      'delta esourcing',
      'contracts finder',
      'find a tender',
      'sell2wales',
      'public contracts scotland',
      'publiccontractsscotland',
      'etendersni',
      'bravo',
      'mytenders',
      'due north',
      'procontract',
      'tenders electronic daily',
      'ted',
      'supply2gov',
      'achilles',
      'constructionline',
      'eu-supply',
      'crown commercial service',
      'ccs',
      'ypo',
      'espo',
      'nepo',
      'nhs supply chain',
      'g-cloud',
      'gcloud',
      'digital outcomes',
      'technology products and services',
      'network services',
      'pagabo',
      'fusion21',
      'lhc',
      'scape',
      'procure22',
      'procure 22',
      'nhs sbs',
      'shared business services',
      'pretium',
      'lot 1'
    ]::text[];
begin
  if p is null or btrim(p) = '' then
    return false;
  end if;
  if p ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'                                   -- email
     or p ~* 'https?://|\mwww\.'                                                     -- url
     or p ~* '\m[a-z0-9-]+\.(co\.uk|org\.uk|gov\.uk|nhs\.uk|ac\.uk|com|org|net|uk|io|eu)\M' -- domain
     or p ~* '\mocds-'
     or p ~* '\mtender_[a-z0-9]+'
     or p ~ '\m[0-9]{6}-[0-9]{4}\M'                                              -- FTS notice id
     or p ~* '\m[0-9a-f]{8}-[0-9a-f]{4}-'                                          -- CF / uuid ids
     or p ~* '\mref(erence)?\s*(no\.?|number)?\s*[:#]'
     or p ~* '\mrm\s?[0-9]{3,4}\M'
     or p ~* '\m(closes?|closing|due|questions?\s+close)\s+in\s+[0-9]+\s+days?\M'    -- day count
     or p ~* '(\+?[0-9][0-9 ().-]{5,}[0-9])|\mext(ension)?\.?\s*[0-9]+'            -- phone
     or p ~* '\m[a-z]{1,2}[0-9][a-z0-9]?\s*[0-9][a-z]{2}\M'                       -- postcode
     or p ~* '\m(?=[a-z_]*[0-9])(?=[0-9]*[a-z_])[a-z0-9_]{4,}([/-][a-z0-9_]+)+\M'     -- long codes
  then
    return true;
  end if;
  -- ALL-CAPS tokens (acronyms of bodies, shouted names), except generic ones.
  for v_tok in select m[1] from regexp_matches(p, '\m([A-Z][A-Z0-9&]{1,})\M', 'g') as m loop
    if v_tok <> all(v_safe) then
      return true;
    end if;
  end loop;
  -- Portal and framework names.
  foreach v_term in array v_terms loop
    if v_lower ~ ('(^|[^a-z0-9])' || regexp_replace(v_term, '([.*+?^${}()|\[\]\\-])', '\\\1', 'g') || '($|[^a-z0-9])') then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

revoke execute on function private.preview_detail_text_risky(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- DTO projection. Allow-list + vocabulary + fail-closed risk check.
-- ---------------------------------------------------------------------------
create or replace function private.preview_dto_requirements(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with vocab as (
    select
      array[
      'Agricultural, farming, fishing and forestry products',
      'Petroleum, fuel, electricity and other energy',
      'Mining, basic metals and related products',
      'Food, beverages, tobacco and related products',
      'Agricultural machinery',
      'Clothing, footwear, luggage and accessories',
      'Leather, textile, plastic and rubber materials',
      'Printed matter and related products',
      'Chemical products',
      'Office and computing machinery and supplies',
      'Electrical machinery, apparatus and lighting',
      'Communications and telecommunications equipment',
      'Medical equipment, pharmaceuticals and personal care',
      'Transport equipment',
      'Security, fire-fighting and defence equipment',
      'Musical instruments, sports goods, games and toys',
      'Laboratory, optical and precision equipment',
      'Furniture, furnishings, domestic appliances and cleaning products',
      'Collected and purified water',
      'Industrial machinery',
      'Mining, quarrying and construction machinery',
      'Construction structures and materials',
      'Construction work',
      'Software packages and information systems',
      'Repair and maintenance services',
      'Installation services',
      'Hotel, restaurant and retail services',
      'Transport services',
      'Supporting transport and travel-agency services',
      'Postal and telecommunications services',
      'Public utilities',
      'Financial and insurance services',
      'Real estate services',
      'Architectural, engineering and inspection services',
      'IT services: consulting, software development, Internet and support',
      'Research and development services',
      'Administration, defence and social security services',
      'Oil and gas industry services',
      'Agricultural, forestry and horticultural services',
      'Business services: law, marketing, consulting, recruitment and security',
      'Education and training services',
      'Health and social work services',
      'Sewage, refuse, cleaning and environmental services',
      'Recreational, cultural and sporting services',
      'Other community, social and personal services'
    ]::text[] as cpv_divisions,
      array[
      'ISO 27001 information security',
      'ISO 9001 quality management',
      'ISO 14001 environmental management',
      'Cyber Essentials Plus',
      'Cyber Essentials',
      'PAS 91 construction prequalification',
      'UK data-protection duties'
    ]::text[] as standards,
      array[
      'Price scored',
      'Quality scored',
      'Social value scored'
    ]::text[] as commercial,
      array[
      'financial capacity evidence',
      'information-security capability',
      'appropriate insurance cover',
      'data-protection capability',
      'evidence of comparable delivery',
      'social value contribution',
      'ongoing support capability',
      'implementation and mobilisation capability'
    ]::text[] as labels,
      array[
      'Nationwide',
      'London',
      'South East England',
      'South West England',
      'East of England',
      'East Midlands',
      'West Midlands',
      'Yorkshire and the Humber',
      'North West England',
      'North East England',
      'Scotland',
      'Wales',
      'Northern Ireland',
      'Remote'
    ]::text[] as regions,
      array[
      'Closing window Closing today',
      'Closing window Closing today. Contract term Under 3 months',
      'Closing window Closing today. Contract term 3–6 months',
      'Closing window Closing today. Contract term 6–12 months',
      'Closing window Closing today. Contract term 1–2 years',
      'Closing window Closing today. Contract term 2–3 years',
      'Closing window Closing today. Contract term 3–5 years',
      'Closing window Closing today. Contract term 5+ years',
      'Closing window Within 3 days',
      'Closing window Within 3 days. Contract term Under 3 months',
      'Closing window Within 3 days. Contract term 3–6 months',
      'Closing window Within 3 days. Contract term 6–12 months',
      'Closing window Within 3 days. Contract term 1–2 years',
      'Closing window Within 3 days. Contract term 2–3 years',
      'Closing window Within 3 days. Contract term 3–5 years',
      'Closing window Within 3 days. Contract term 5+ years',
      'Closing window Within 7 days',
      'Closing window Within 7 days. Contract term Under 3 months',
      'Closing window Within 7 days. Contract term 3–6 months',
      'Closing window Within 7 days. Contract term 6–12 months',
      'Closing window Within 7 days. Contract term 1–2 years',
      'Closing window Within 7 days. Contract term 2–3 years',
      'Closing window Within 7 days. Contract term 3–5 years',
      'Closing window Within 7 days. Contract term 5+ years',
      'Closing window Within 14 days',
      'Closing window Within 14 days. Contract term Under 3 months',
      'Closing window Within 14 days. Contract term 3–6 months',
      'Closing window Within 14 days. Contract term 6–12 months',
      'Closing window Within 14 days. Contract term 1–2 years',
      'Closing window Within 14 days. Contract term 2–3 years',
      'Closing window Within 14 days. Contract term 3–5 years',
      'Closing window Within 14 days. Contract term 5+ years',
      'Closing window Within 30 days',
      'Closing window Within 30 days. Contract term Under 3 months',
      'Closing window Within 30 days. Contract term 3–6 months',
      'Closing window Within 30 days. Contract term 6–12 months',
      'Closing window Within 30 days. Contract term 1–2 years',
      'Closing window Within 30 days. Contract term 2–3 years',
      'Closing window Within 30 days. Contract term 3–5 years',
      'Closing window Within 30 days. Contract term 5+ years',
      'Closing window More than 30 days',
      'Closing window More than 30 days. Contract term Under 3 months',
      'Closing window More than 30 days. Contract term 3–6 months',
      'Closing window More than 30 days. Contract term 6–12 months',
      'Closing window More than 30 days. Contract term 1–2 years',
      'Closing window More than 30 days. Contract term 2–3 years',
      'Closing window More than 30 days. Contract term 3–5 years',
      'Closing window More than 30 days. Contract term 5+ years',
      'Closing window Closed',
      'Closing window Closed. Contract term Under 3 months',
      'Closing window Closed. Contract term 3–6 months',
      'Closing window Closed. Contract term 6–12 months',
      'Closing window Closed. Contract term 1–2 years',
      'Closing window Closed. Contract term 2–3 years',
      'Closing window Closed. Contract term 3–5 years',
      'Closing window Closed. Contract term 5+ years',
      'Closing window Upcoming / date not yet fixed',
      'Closing window Upcoming / date not yet fixed. Contract term Under 3 months',
      'Closing window Upcoming / date not yet fixed. Contract term 3–6 months',
      'Closing window Upcoming / date not yet fixed. Contract term 6–12 months',
      'Closing window Upcoming / date not yet fixed. Contract term 1–2 years',
      'Closing window Upcoming / date not yet fixed. Contract term 2–3 years',
      'Closing window Upcoming / date not yet fixed. Contract term 3–5 years',
      'Closing window Upcoming / date not yet fixed. Contract term 5+ years',
      'Closing window Not disclosed',
      'Closing window Not disclosed. Contract term Under 3 months',
      'Closing window Not disclosed. Contract term 3–6 months',
      'Closing window Not disclosed. Contract term 6–12 months',
      'Closing window Not disclosed. Contract term 1–2 years',
      'Closing window Not disclosed. Contract term 2–3 years',
      'Closing window Not disclosed. Contract term 3–5 years',
      'Closing window Not disclosed. Contract term 5+ years',
      'Contract term Under 3 months',
      'Contract term 3–6 months',
      'Contract term 6–12 months',
      'Contract term 1–2 years',
      'Contract term 2–3 years',
      'Contract term 3–5 years',
      'Contract term 5+ years'
    ]::text[] as key_dates,
      array[
      'device',
      'devices',
      'each',
      'hour',
      'hours',
      'item',
      'items',
      'licences',
      'litre',
      'litres',
      'set',
      'sets',
      'site',
      'sites',
      'tonne',
      'tonnes',
      'unit',
      'units',
      'user',
      'users',
      'vehicle',
      'vehicles'
    ]::text[] as units
  ),
  raw as (
    select
      a.ord,
      case
        when jsonb_typeof(a.e) = 'object' then nullif(a.e ->> 'field', '')
        when jsonb_typeof(a.e) = 'string'
          and split_part(btrim(a.e #>> '{}'), ': ', 1) ~ '^[a-z][A-Za-z0-9]+$'
          and position(': ' in btrim(a.e #>> '{}')) > 0
          then split_part(btrim(a.e #>> '{}'), ': ', 1)
        else null
      end as field,
      btrim(
        case
          when jsonb_typeof(a.e) = 'object' then coalesce(a.e ->> 'text', a.e ->> 'label', '')
          when jsonb_typeof(a.e) = 'string'
            and split_part(btrim(a.e #>> '{}'), ': ', 1) ~ '^[a-z][A-Za-z0-9]+$'
            and position(': ' in btrim(a.e #>> '{}')) > 0
            then substr(btrim(a.e #>> '{}'), length(split_part(btrim(a.e #>> '{}'), ': ', 1)) + 3)
          when jsonb_typeof(a.e) = 'string' then a.e #>> '{}'
          else ''
        end
      ) as body
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)
      with ordinality as a(e, ord)
  ),
  items as (
    -- List fields are joined with " · "; every item is checked on its own.
    select r.ord, r.field, r.body,
      coalesce(
        (select array_agg(btrim(x)) from unnest(string_to_array(r.body, ' · ')) as x where btrim(x) <> ''),
        '{}'::text[]
      ) as parts
    from raw r
  ),
  checked as (
    select i.ord, i.field, i.body
    from items i, vocab v
    where i.body <> ''
      and length(i.body) <= 500
      and i.body !~ '\m[0-9]{8}(-[0-9])?\M'
      and not private.preview_detail_text_risky(i.body)
      and cardinality(i.parts) > 0
      and case i.field
        when 'goodsServices' then i.parts <@ v.cpv_divisions
        when 'specificSector' then i.parts <@ v.cpv_divisions and cardinality(i.parts) = 1
        when 'standards' then i.parts <@ v.standards
        when 'commercialRequirements' then i.parts <@ v.commercial
        when 'keyDates' then i.body = any(v.key_dates)
        when 'deliveryRequirements' then
          (select bool_and(x like 'Delivery within %' and substr(x, 17) = any(v.regions)) from unnest(i.parts) as x)
        when 'quantities' then
          (select bool_and(x ~ '^Quantities specified \([a-z]+\)$'
                           and rtrim(substr(x, 23, length(x) - 23), 's') = any(
                             select rtrim(u, 's') from unnest(v.units) as u))
           from unnest(i.parts) as x)
        when 'currency' then i.body ~ '^[A-Z]{3}$'
        when 'scope' then true
        when 'technicalSpecs' then true
        else i.field is null and i.body = any(v.labels)
      end
  )
  select coalesce(jsonb_agg(
    case
      when c.field is not null then jsonb_build_object('field', c.field, 'text', c.body)
      else to_jsonb(c.body)
    end
    order by c.ord
  ), '[]'::jsonb)
  from (select * from checked order by ord limit 40) c;
$$;

revoke execute on function private.preview_dto_requirements(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publish gate: extra findings for the rich-preview fields.
-- ---------------------------------------------------------------------------
create or replace function private.preview_detail_findings(
  p_preview_title text,
  p_preview_summary text,
  p_requirements jsonb
)
returns table (finding_code text, finding_risk public.leakage_risk, finding_token text)
language sql
immutable
set search_path = ''
as $$
  select 'DATE_DAY_COUNT'::text, 'HIGH'::public.leakage_risk, left(t, 120)
  from unnest(array[p_preview_title, p_preview_summary]) as t
  where t ~* '\m(closes?|closing|due|questions?\s+close)\s+in\s+[0-9]+\s+days?\M'
  union all
  select 'DETAIL_RISK'::text, 'HIGH'::public.leakage_risk, left(btrim(v #>> '{}'), 120)
  from jsonb_path_query(
    case when jsonb_typeof(p_requirements) in ('array', 'object') then p_requirements else '[]'::jsonb end,
    'strict $.**'
  ) as v
  where jsonb_typeof(v) = 'string'
    and private.preview_detail_text_risky(
      case
        when (v #>> '{}') ~ '^[a-z][A-Za-z0-9]+: ' then substr(v #>> '{}', position(': ' in (v #>> '{}')) + 2)
        else v #>> '{}'
      end
    )
  union all
  select 'DETAIL_FIELD_BANNED'::text, 'HIGH'::public.leakage_risk, left(btrim(v #>> '{}'), 120)
  from jsonb_path_query(
    case when jsonb_typeof(p_requirements) in ('array', 'object') then p_requirements else '[]'::jsonb end,
    'strict $.**'
  ) as v
  where jsonb_typeof(v) = 'string'
    and (v #>> '{}') ~ '^(lotCount|procedureType|framework)(: |$)';
$$;

revoke execute on function private.preview_detail_findings(text, text, jsonb) from public, anon, authenticated;

create or replace function private.detect_preview_leakage(
  p_deal_id uuid,
  p_slug text,
  p_preview_title text,
  p_preview_summary text,
  p_requirements jsonb,
  p_relevance_tags text[] default '{}'::text[],
  p_broad_region text default null
)
returns public.leakage_risk
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(f.r), 'LOW'::public.leakage_risk)
  from (
    select lf.finding_risk as r
    from private.preview_leak_findings(
      p_deal_id, p_slug, p_preview_title, p_preview_summary, p_requirements, p_relevance_tags, p_broad_region
    ) as lf
    union all
    select df.finding_risk
    from private.preview_detail_findings(p_preview_title, p_preview_summary, p_requirements) as df
  ) f;
$$;

revoke execute on function private.detect_preview_leakage(uuid, text, text, text, jsonb, text[], text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- P2-4: the legacy profile search projects requirements through the filter.
-- Body unchanged from 0018 except that one column. Existing grants (revoked
-- from client roles by 0019) are preserved by CREATE OR REPLACE.
-- ---------------------------------------------------------------------------
create or replace function public.search_deal_previews_for_profile(
  p_company_profile_id uuid,
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_min_score numeric default null,
  p_sort text default 'updated',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  deal_id uuid,
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  relevance_score numeric,
  preview_reasons jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      dp.deal_id,
      dp.slug,
      dp.preview_title,
      dp.preview_summary,
      dp.deal_type,
      dp.buyer_sector,
      dp.stage,
      dp.status,
      dp.main_category,
      dp.broad_region,
      dp.value_band,
      dp.deadline_band,
      dp.duration_band,
      dp.sme_suitability,
      dp.bid_complexity,
      dp.competition_level,
      dp.requirements_preview,
      dp.relevance_tags,
      dp.freshness_label,
      dm.relevance_score,
      case
        when auth.role() = 'service_role' then coalesce(dm.preview_reasons, '[]'::jsonb)
        else '[]'::jsonb
      end as preview_reasons,
      dp.updated_at,
      case
        when p_query is null or btrim(p_query) = '' then 0
        else ts_rank(
          to_tsvector(
            'english',
            coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')
          ),
          websearch_to_tsquery('english', p_query)
        )
      end as query_rank
    from public.deal_previews dp
    left join public.deal_matches dm
      on dm.deal_id = dp.deal_id
     and dm.company_profile_id = p_company_profile_id
     and (
       auth.role() = 'service_role'
       or exists (
         select 1
         from public.company_profiles cp
         where cp.id = p_company_profile_id
           and cp.user_id = auth.uid()
       )
     )
    where dp.is_published = true
      and dp.leakage_risk = 'LOW'
      and (p_category is null or dp.main_category = p_category)
      and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
      and (p_deal_type is null or dp.deal_type = p_deal_type)
      and (p_region is null or dp.broad_region = p_region)
      and (p_status is null or dp.status = p_status)
      and (p_value_band is null or dp.value_band = p_value_band)
      and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
      and (
        p_min_score is null
        or coalesce(dm.relevance_score, -1) >= p_min_score
      )
      and (
        p_query is null
        or btrim(p_query) = ''
        or to_tsvector(
             'english',
             coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')
           ) @@ websearch_to_tsquery('english', p_query)
      )
  )
  select
    ranked.deal_id,
    ranked.slug,
    ranked.preview_title,
    ranked.preview_summary,
    ranked.deal_type,
    ranked.buyer_sector,
    ranked.stage,
    ranked.status,
    ranked.main_category,
    ranked.broad_region,
    ranked.value_band,
    ranked.deadline_band,
    ranked.duration_band,
    ranked.sme_suitability,
    ranked.bid_complexity,
    ranked.competition_level,
    private.preview_dto_requirements(ranked.requirements_preview),
    ranked.relevance_tags,
    ranked.freshness_label,
    ranked.relevance_score,
    ranked.preview_reasons,
    count(*) over() as total_count
  from ranked
  order by
    case when lower(coalesce(p_sort, 'updated')) = 'relevance'
      then coalesce(ranked.relevance_score, -1)
      else 0
    end desc,
    ranked.query_rank desc,
    ranked.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

