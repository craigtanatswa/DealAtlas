-- 0059: allow country-level regions (TED) in broad_region and in the
-- "Delivery within <region>" preview line. Country names only, mapped from the
-- ISO code; nothing finer. Function bodies are copied unchanged from 0018/0041
-- apart from the region arrays.

create or replace function private.preview_leak_findings(
  p_deal_id uuid,
  p_slug text,
  p_preview_title text,
  p_preview_summary text,
  p_requirements jsonb,
  p_relevance_tags text[] default '{}'::text[],
  p_broad_region text default null
)
returns table (finding_code text, finding_risk public.leakage_risk, finding_token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.deals%rowtype;
  b public.organizations%rowtype;
  v_has_buyer boolean := false;
  v_generic_org text[];
  v_generic_acr text[];
  v_generic_proper text[];
  v_broad text[];
  v_ref_prefix text[];
  v_postcode_like text[];
  v_stop text[];
  v_platforms text[];
  v_req text[];
  v_segments text[];
  v_prose_segments text[];
  v_slug text;
  v_slug_norm text;
  v_slug_tokens text[];
  v_text_cs text;
  v_all text;
  v_all_lower text;
  v_all_norm text;
  v_source_parts text[];
  v_source_raw text;
  v_source_norm text;
  v_source_acronyms text[];
  v_source_names text[];
  v_cs_tokens text[];
  v_term text;
  v_label text;
  v_norm text;
  v_words text[];
  v_window text;
  v_seg text;
  v_digits text;
  v_m text[];
  v_count integer;
  v_sim real;
  v_carried text[];
  v_k integer;
  v_amounts text[];
  i integer;
begin
  select * into d from public.deals where id = p_deal_id;
  if not found then
    return query select 'DEAL_MISSING'::text, 'HIGH'::public.leakage_risk, null::text;
    return;
  end if;

  select
    coalesce(array_agg(t.term) filter (where t.kind = 'generic_org_token'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'generic_acronym'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'generic_proper_word'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'broad_location'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'reference_prefix'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'postcode_like'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'phrase_stopword'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'source_platform'), '{}')
  into v_generic_org, v_generic_acr, v_generic_proper, v_broad, v_ref_prefix, v_postcode_like, v_stop, v_platforms
  from private.leak_gate_terms t;

  -- Every string leaf of requirements_preview is scanned, not just text/label.
  select coalesce(array_agg(btrim(v #>> '{}')) filter (where btrim(v #>> '{}') <> ''), '{}')
  into v_req
  from jsonb_path_query(
    case when jsonb_typeof(p_requirements) in ('array', 'object') then p_requirements else '[]'::jsonb end,
    'strict $.**'
  ) as v
  where jsonb_typeof(v) = 'string';

  v_prose_segments := array_remove(array[nullif(btrim(p_preview_summary), '')], null) || v_req;
  v_segments := array_remove(array[nullif(btrim(p_preview_title), '')], null) || v_prose_segments;
  v_slug := regexp_replace(lower(coalesce(p_slug, '')), '-[0-9a-f]{8}$', '');
  v_slug_norm := private.leak_norm(v_slug);
  v_slug_tokens := string_to_array(btrim(v_slug_norm), ' ');
  v_text_cs := concat_ws(' . ', nullif(array_to_string(v_segments, ' . '), ''), nullif(array_to_string(coalesce(p_relevance_tags, '{}'), ' . '), ''));
  v_all := concat_ws(' . ', nullif(v_text_cs, ''), nullif(v_slug, ''));
  v_all_lower := lower(v_all);
  v_all_norm := private.leak_norm(v_all);
  v_cs_tokens := array(select m[1] from regexp_matches(v_text_cs, '([A-Za-z0-9&]+)', 'g') as m);

  select array_remove(
    array[d.source_title, d.source_description]
    || coalesce((select array_agg(x) from public.lots l, unnest(array[l.source_title, l.source_description]) as x where l.deal_id = d.id), '{}')
    || coalesce((select array_agg(x) from public.requirements r, unnest(array[r.name, r.description]) as x where r.deal_id = d.id), '{}')
    || coalesce((select array[pod.project_name] || pod.goods_required || pod.services_required || pod.works_required
       from public.private_opportunity_details pod where pod.deal_id = d.id), '{}'),
    null
  ) into v_source_parts;
  v_source_raw := array_to_string(v_source_parts, ' . ');
  v_source_norm := private.leak_norm(v_source_raw);

  -- Names the source uses: standalone acronyms (outside all-caps fields and
  -- all-caps runs) and capitalised words that follow a lowercase word and never
  -- appear in lowercase. Matched case-insensitively so slugs and lowercased
  -- prose cannot carry them.
  select coalesce(array_agg(distinct lower(m[1])), '{}') into v_source_acronyms
  from unnest(v_source_parts) as part
  cross join lateral regexp_matches(
    regexp_replace(part, '\m[A-Z][A-Z0-9&]*(?:\s+[A-Z][A-Z0-9&]*\M)+', ' ', 'g'),
    '\m([A-Z][A-Z0-9]{2,5})\M', 'g'
  ) as m
  where length(regexp_replace(part, '[^A-Z]', '', 'g')) * 2 <= length(regexp_replace(part, '[^A-Za-z]', '', 'g'))
    and m[1] <> all(v_generic_acr)
    and lower(m[1]) <> all(v_generic_org)
    and lower(m[1]) <> all(v_generic_proper)
    and lower(m[1]) <> all(v_broad)
    and lower(m[1]) <> all(v_stop)
    and not exists (
      select 1 from regexp_matches(v_source_raw, '\m(' || m[1] || ')\M', 'gi') as o where o[1] <> m[1]
    );

  select coalesce(array_agg(distinct lower(m[1])), '{}') into v_source_names
  from unnest(v_source_parts) as part
  cross join lateral regexp_matches(part, '\m[a-z][a-z0-9''-]*[,;:)]?\s+([A-Z][a-z]{3,})\M', 'g') as m
  where lower(m[1]) <> all(v_generic_org)
    and lower(m[1]) <> all(v_generic_proper)
    and lower(m[1]) <> all(v_broad)
    and lower(m[1]) <> all(v_stop)
    and v_source_raw !~ ('\m' || lower(m[1]) || '\M');

  -- Direct identifiers -------------------------------------------------------
  return query select 'URL'::text, 'HIGH'::public.leakage_risk, left(m[1], 120)
    from regexp_matches(v_all, '((?:https?://|www\.)[^[:space:]]+)', 'gi') as m;

  return query select 'EMAIL'::text, 'HIGH'::public.leakage_risk, left(m[1], 120)
    from regexp_matches(v_all, '([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})', 'gi') as m;

  return query select 'DOMAIN'::text, 'HIGH'::public.leakage_risk, left(m[1], 120)
    from regexp_matches(v_all, '\m([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:uk|com|org|gov|eu|io|info|scot|wales|cymru))\M', 'gi') as m;

  for v_m in select regexp_matches(v_all, '(\+?[0-9][0-9 ().-]{8,18}[0-9])', 'g') loop
    v_digits := regexp_replace(v_m[1], '[^0-9]', '', 'g');
    if length(v_digits) between 10 and 13 and (v_digits like '0%' or v_digits like '44%') then
      return query select 'PHONE'::text, 'HIGH'::public.leakage_risk, v_m[1];
    end if;
  end loop;

  return query select 'OCID'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m(ocds-[a-z0-9]{3,}-[a-z0-9-]+)', 'gi') as m;

  return query select 'REFERENCE_ID'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([0-9]{6,}-[0-9]{4})\M', 'g') as m;

  return query select 'REFERENCE_ID'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\M', 'gi') as m;

  for v_term in
    select distinct btrim(x)
    from (
      select unnest(array[d.reference, d.ocid, d.external_primary_id]) as x
      union all select n.notice_identifier from public.notices n where n.deal_id = d.id
      union all select n.release_id from public.notices n where n.deal_id = d.id
      union all select pod.rfp_number from public.private_opportunity_details pod where pod.deal_id = d.id
      union all select pod.rfq_number from public.private_opportunity_details pod where pod.deal_id = d.id
      union all select c.contract_identifier from public.contracts c where c.deal_id = d.id
      union all select a.award_identifier from public.awards a where a.deal_id = d.id
      union all select l.source_lot_id from public.lots l where l.deal_id = d.id
      union all select oi.value from public.organization_identifiers oi where oi.organization_id = d.buyer_organization_id
    ) refs
    where x is not null
  loop
    v_norm := private.leak_norm(v_term);
    if v_term ~ '[0-9]' and length(btrim(v_norm)) >= 5 and position(v_norm in v_all_norm) > 0 then
      return query select 'REFERENCE_ID'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  return query select 'REFERENCE_PATTERN'::text, 'REVIEW'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m(([A-Za-z]{1,6})[-/_.]?[0-9]{3,}(?:[-/_.][A-Za-z0-9]+)*)\M', 'g') as m
    where lower(m[2]) <> all(v_ref_prefix);

  -- Dates --------------------------------------------------------------------
  foreach v_term in array array[
    '\m([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))\M',
    '\m([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?may,?\s+(?:19|20)[0-9]{2})\M',
    '\m((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+[0-3]?[0-9](?:st|nd|rd|th)?)\M',
    '\m(may\s+[0-3]?[0-9](?:st|nd|rd|th)?,?\s+(?:19|20)[0-9]{2})\M',
    '\m([0-3]?[0-9][/.-][01]?[0-9][/.-](?:19|20)?[0-9]{2})\M',
    '\m((?:19|20)[0-9]{2}[/.-][01]?[0-9][/.-][0-3]?[0-9])\M',
    '\m([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?may)\M(?!\s+(?:be|not|also|apply|have|include|need|require|vary|change|only|still|well)\M)',
    '\m(may\s+[0-3]?[0-9](?:st|nd|rd|th)?)\M',
    '(?<![0-9/.])((?:0?[1-9]|[12][0-9]|3[01])/(?:0?[1-9]|1[0-2]))(?![0-9/])',
    '\m([0-3]?[0-9]-(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:-(?:19|20)?[0-9]{2})?)\M'
  ]
  loop
    return query select 'DATE_EXACT'::text, 'REVIEW'::public.leakage_risk, m[1]
      from regexp_matches(v_all, v_term, 'gi') as m
      where m[1] <> '24/7';
  end loop;

  -- Source dates in Europe/London, +/- one day, in common written forms.
  for v_term in
    with src(dt) as (
      select (x at time zone 'Europe/London')::date
      from unnest(array[d.enquiry_deadline, d.submission_deadline, d.first_published_at]) as x
      where x is not null
      union
      select x
      from unnest(array[
        d.award_decision_date, d.contract_start_date, d.contract_end_date, d.extension_end_date,
        d.next_procurement_date, d.estimated_renewal_date
      ]) as x
      where x is not null
      union
      select (pod.expression_of_interest_deadline at time zone 'Europe/London')::date
      from public.private_opportunity_details pod
      where pod.deal_id = d.id and pod.expression_of_interest_deadline is not null
      union
      select pod.anticipated_award_date
      from public.private_opportunity_details pod
      where pod.deal_id = d.id and pod.anticipated_award_date is not null
      union
      select (n.published_at at time zone 'Europe/London')::date
      from public.notices n
      where n.deal_id = d.id and n.published_at is not null
      union
      select (l.submission_deadline at time zone 'Europe/London')::date
      from public.lots l
      where l.deal_id = d.id and l.submission_deadline is not null
      union
      select x
      from public.lots l, unnest(array[l.contract_start_date, l.contract_end_date]) as x
      where l.deal_id = d.id and x is not null
      union
      select a.award_date from public.awards a where a.deal_id = d.id and a.award_date is not null
      union
      select x
      from public.contracts c, unnest(array[c.start_date, c.end_date]) as x
      where c.deal_id = d.id and x is not null
    ),
    days(dt) as (
      select distinct s.dt + o
      from src s
      cross join generate_series(-1, 1) as o
    )
    select distinct to_char(days.dt, f)
    from days
    cross join unnest(array[
      'YYYY-MM-DD', 'DD/MM/YYYY', 'FMDD/FMMM/YYYY', 'DD/MM/YY', 'FMDD FMMonth',
      'FMDDth FMMonth', 'FMDD Mon', 'FMDDth Mon', 'FMMonth FMDD', 'FMMonth FMDDth', 'Mon FMDD',
      'DD/MM', 'FMDD/FMMM', 'DD.MM', 'FMDD.FMMM', 'DD-MM', 'FMDD-FMMM', 'DD MM'
    ]) as f
  loop
    -- Yearless numeric forms only count with digit boundaries, so decimals
    -- such as "14.035" or longer digit runs are not hits. A hyphen may follow
    -- so ranges like "14/03-21/03" still match.
    if (v_term ~ '^[0-9]+[/. -][0-9]+$'
        and v_all_lower ~ ('(?<![0-9/.,])' || replace(v_term, '.', '[.]') || '(?![0-9]|[/.,][0-9])'))
       or (v_term !~ '^[0-9]+[/. -][0-9]+$' and position(private.leak_norm(v_term) in v_all_norm) > 0)
    then
      return query select 'DATE_SOURCE'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  -- Postcodes and places -----------------------------------------------------
  return query select 'POSTCODE'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\M', 'gi') as m;

  for v_term in
    select distinct upper(left(c, length(c) - 3))
    from (
      select regexp_replace(upper(pc), '[^A-Z0-9]', '', 'g') as c
      from (
        select b2.postcode as pc from public.organizations b2 where b2.id = d.buyer_organization_id
        union all
        select o.postcode
        from public.deal_organizations dorg
        join public.organizations o on o.id = dorg.organization_id
        where dorg.deal_id = d.id
        union all
        select loc.postcode
        from public.deal_locations dl
        join public.locations loc on loc.id = dl.location_id
        where dl.deal_id = d.id
        union all
        select m[1]
        from regexp_matches(coalesce(v_source_raw, '') || ' ' || coalesce(d.exact_location_text, ''), '\m([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\M', 'gi') as m
      ) pcs
      where pc is not null
    ) compact
    where c ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$'
  loop
    if v_all ~* ('\m' || v_term || '\M') then
      return query select 'POSTCODE_KNOWN_OUTWARD'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  return query select 'POSTCODE_OUTWARD'::text, 'REVIEW'::public.leakage_risk, m[1]
    from regexp_matches(v_text_cs, '\m([A-Z]{1,2}[0-9][A-Z0-9]?)\M', 'g') as m
    where m[1] <> all(v_postcode_like);

  -- Slugs are lowercase, so postcode-shaped slug words are checked separately.
  return query select 'POSTCODE_OUTWARD'::text, 'REVIEW'::public.leakage_risk, upper(w)
    from unnest(v_slug_tokens) as w
    where w ~ '^[a-z]{1,2}[0-9][a-z0-9]?$' and upper(w) <> all(v_postcode_like);

  if d.buyer_organization_id is not null then
    select * into b from public.organizations where id = d.buyer_organization_id;
    v_has_buyer := found;
  end if;

  for v_term in
    select distinct btrim(part)
    from (
      select regexp_split_to_table(x, '[,;/|()]') as part
      from (
        select d.exact_location_text as x
        union all select l.exact_location_text from public.lots l where l.deal_id = d.id
      ) s
      where x is not null
      union all
      select unnest(array[loc.city, loc.county])
      from public.deal_locations dl
      join public.locations loc on loc.id = dl.location_id
      where dl.deal_id = d.id
      union all
      select unnest(array[b.city, b.county, b.address_line_1, b.address_line_2])
      where v_has_buyer
    ) parts
    where part is not null
  loop
    v_norm := private.leak_norm(v_term);
    if length(btrim(v_norm)) >= 4
       and btrim(v_norm) <> all(v_broad)
       and v_norm <> private.leak_norm(p_broad_region)
       and exists (
         select 1
         from unnest(string_to_array(btrim(v_norm), ' ')) as w
         where w <> all(v_generic_org) and w <> all(v_broad) and w !~ '^[0-9]+$'
       )
       and position(v_norm in v_all_norm) > 0
    then
      return query select 'LOCATION_EXACT'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;

    -- Single distinctive words of a location ("Brindlequay" from
    -- "Brindlequay, Ostbury Fenmoor"), in any case and in the slug.
    return query select 'LOCATION_TOKEN'::text,
        (case when length(w) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        w
      from unnest(string_to_array(btrim(v_norm), ' ')) as w
      where length(w) >= 4
        and w !~ '[0-9]'
        and w <> all(v_generic_org)
        and w <> all(v_generic_proper)
        and w <> all(v_broad)
        and w <> all(v_stop)
        and position(' ' || w || ' ' in coalesce(private.leak_norm(p_broad_region), '')) = 0
        and position(' ' || w || ' ' in v_all_norm) > 0;
  end loop;

  -- Buyer identity -----------------------------------------------------------
  if v_has_buyer then
    v_norm := private.leak_norm(b.canonical_name);
    if length(btrim(v_norm)) >= 3 and position(v_norm in v_all_norm) > 0 then
      return query select 'BUYER_NAME'::text, 'HIGH'::public.leakage_risk, b.canonical_name;
    elsif b.leak_match_name is not null and position(b.leak_match_name in v_all_norm) > 0 then
      return query select 'BUYER_NAME'::text, 'HIGH'::public.leakage_risk, b.canonical_name;
    end if;

    for v_term in
      select a.alias from public.organization_aliases a where a.organization_id = b.id
    loop
      v_label := replace(v_term, '.', '');
      -- Acronym-style aliases: all caps, or mixed case with two or more capitals.
      if v_label ~ '^[A-Za-z0-9&]{2,12}$'
         and ((v_label ~ '[A-Z]' and v_label !~ '[a-z]') or v_label ~ '[A-Z][^A-Z]*[A-Z]')
      then
        if v_label = any(v_cs_tokens)
           or (length(v_label) >= 3
               and upper(v_label) <> all(v_generic_acr)
               and lower(v_label) <> all(v_generic_org)
               and lower(v_label) <> all(v_generic_proper)
               and lower(v_label) <> all(v_stop)
               and position(private.leak_norm(v_label) in v_all_norm) > 0)
        then
          return query select 'BUYER_ACRONYM'::text, 'HIGH'::public.leakage_risk, v_term;
        end if;
        continue;
      end if;
      v_norm := private.leak_norm(v_term);
      if length(btrim(v_norm)) >= 4
         and exists (
           select 1 from unnest(string_to_array(btrim(v_norm), ' ')) as w
           where w <> all(v_generic_org) and w <> all(v_broad)
         )
         and position(v_norm in v_all_norm) > 0
      then
        return query select 'BUYER_ALIAS'::text, 'HIGH'::public.leakage_risk, v_term;
      elsif length(btrim(v_norm)) between 2 and 3
         and btrim(v_norm) <> all(v_generic_org)
         and btrim(v_norm) <> all(v_broad)
         and btrim(v_norm) <> all(v_stop)
         and upper(btrim(v_norm)) <> all(v_generic_acr)
         and position(v_norm in v_all_norm) > 0
      then
        return query select 'BUYER_ALIAS'::text, 'REVIEW'::public.leakage_risk, v_term;
      end if;
    end loop;

    for v_term in
      select distinct lower(regexp_replace(x, '^www\.', ''))
      from (
        select b.domain as x
        union all select regexp_replace(lower(b.website), '^[a-z][a-z0-9+.-]*://([^/:?#]+).*$', '\1')
        union all select split_part(b.email, '@', 2)
      ) hosts
      where x is not null and length(x) >= 4
    loop
      if position(v_term in v_all_lower) > 0 then
        return query select 'BUYER_DOMAIN'::text, 'HIGH'::public.leakage_risk, v_term;
      else
        v_label := split_part(v_term, '.', 1);
        if length(v_label) >= 5
           and v_label <> all(v_generic_org)
           and position(' ' || v_label || ' ' in v_all_norm) > 0
        then
          return query select 'BUYER_DOMAIN'::text, 'HIGH'::public.leakage_risk, v_label;
        end if;
      end if;
    end loop;

    for v_term in
      select distinct w
      from unnest(string_to_array(btrim(private.leak_norm(b.canonical_name)), ' ')) as w
      where length(w) >= 4
        and w !~ '^[0-9]+$'
        and w <> all(v_generic_org)
        and w <> all(v_generic_proper)
        and w <> all(v_broad)
        and w <> all(v_stop)
    loop
      if position(' ' || v_term || ' ' in v_all_norm) > 0 then
        return query select 'BUYER_TOKEN'::text,
          (case when length(v_term) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
          v_term;
      end if;
    end loop;

    for v_term in
      select upper(string_agg(left(w, 1), '' order by ord))
      from unnest(string_to_array(btrim(private.leak_norm(b.canonical_name)), ' ')) with ordinality as t(w, ord)
      where w not in ('and', 'of', 'the', 'for') and w !~ '^[0-9]+$'
      union
      select upper(string_agg(left(w, 1), '' order by ord))
      from unnest(string_to_array(btrim(b.leak_match_name), ' ')) with ordinality as t(w, ord)
      where w not in ('and', 'of', 'the', 'for') and w !~ '^[0-9]+$'
    loop
      if v_term is not null and length(v_term) >= 3
         and (v_term = any(v_cs_tokens) or (length(v_term) >= 4 and lower(v_term) = any(v_slug_tokens)))
      then
        return query select 'BUYER_ACRONYM'::text, 'HIGH'::public.leakage_risk, v_term;
      end if;
    end loop;
  end if;

  for v_term in
    select distinct lower(regexp_replace(regexp_replace(lower(u), '^[a-z][a-z0-9+.-]*://([^/:?#]+).*$', '\1'), '^www\.', ''))
    from unnest(array[d.source_url, d.application_url]) as u
    where u is not null
  loop
    if length(v_term) >= 4 and position(v_term in v_all_lower) > 0 then
      return query select 'BUYER_DOMAIN'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  -- Any known organisation (buyers, suppliers, incumbents) -------------------
  for v_term, v_norm in
    select o.canonical_name, o.leak_match_name
    from public.organizations o
    where o.leak_match_name is not null and position(o.leak_match_name in v_all_norm) > 0
    union
    select a.alias, a.leak_match_name
    from public.organization_aliases a
    where a.leak_match_name is not null and position(a.leak_match_name in v_all_norm) > 0
  loop
    select count(*) into v_count
    from unnest(string_to_array(btrim(v_norm), ' ')) as w
    where w <> all(v_generic_org) and w <> all(v_broad) and w <> all(v_stop) and w !~ '^[0-9]+$'
      and (length(btrim(v_norm)) >= 5 or (upper(w) <> all(v_generic_acr) and w <> all(v_generic_proper)));
    if v_count >= 2 then
      return query select 'ORG_NAME'::text, 'HIGH'::public.leakage_risk, v_term;
    elsif v_count = 1 then
      return query select 'ORG_NAME'::text, 'REVIEW'::public.leakage_risk, v_term;
    end if;
  end loop;

  for v_term in
    select distinct w
    from (
      select o.canonical_name as n
      from public.deal_organizations dorg
      join public.organizations o on o.id = dorg.organization_id
      where dorg.deal_id = d.id
      union
      select o.canonical_name
      from public.awards aw
      join public.award_suppliers s on s.award_id = aw.id
      join public.organizations o on o.id = s.organization_id
      where aw.deal_id = d.id
      union
      select o.canonical_name
      from public.deal_insights di
      join public.organizations o on o.id = di.incumbent_organization_id
      where di.deal_id = d.id
    ) names
    cross join lateral unnest(string_to_array(btrim(private.leak_norm(names.n)), ' ')) as w
    where length(w) >= 4
      and w !~ '^[0-9]+$'
      and w <> all(v_generic_org)
      and w <> all(v_generic_proper)
      and w <> all(v_broad)
      and w <> all(v_stop)
  loop
    if position(' ' || v_term || ' ' in v_all_norm) > 0 then
      return query select 'ORG_TOKEN'::text,
        (case when length(v_term) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        v_term;
    end if;
  end loop;

  return query select 'ORG_SUFFIX'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_text_cs, '((?:[A-Z][A-Za-z0-9&-]*\s+){1,4}(?:Ltd|LTD|Limited|LIMITED|LLP|PLC|Plc|plc|LLC|Inc|CIC))\M', 'g') as m;

  return query select 'ORG_SUFFIX'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m(ltd|llp)\M', 'gi') as m;

  -- Project / programme names ------------------------------------------------
  for v_term in
    select pod.project_name
    from public.private_opportunity_details pod
    where pod.deal_id = d.id and pod.project_name is not null
  loop
    v_norm := private.leak_norm(v_term);
    if length(btrim(v_norm)) >= 5 and position(v_norm in v_all_norm) > 0 then
      return query select 'PROJECT_NAME'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
    return query
      select 'PROJECT_NAME'::text,
        (case when length(w) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        w
      from (
        select distinct w
        from unnest(string_to_array(btrim(v_norm), ' ')) as w
        where length(w) >= 4
          and w !~ '^[0-9]+$'
          and w <> all(v_generic_org)
          and w <> all(v_generic_proper)
          and w <> all(v_broad)
          and w <> all(v_stop)
      ) tokens
      where position(' ' || w || ' ' in v_all_norm) > 0;
  end loop;

  for v_m in select regexp_matches(v_text_cs, '\m([A-Z][A-Z0-9&]{2,})\M', 'g') loop
    if v_m[1] <> all(v_generic_acr) then
      v_norm := private.leak_norm(v_m[1]);
      return query select 'ACRONYM'::text,
        (case when length(btrim(v_norm)) >= 3 and position(v_norm in v_source_norm) > 0 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        v_m[1];
    end if;
  end loop;

  -- Title-Case runs inside sentence-case prose (site/programme names).
  foreach v_seg in array v_prose_segments loop
    for v_m in select regexp_matches(v_seg, '\m[a-z][a-z0-9''-]*[,;:)]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)', 'g') loop
      select count(*) into v_count
      from unnest(string_to_array(btrim(private.leak_norm(v_m[1])), ' ')) as w
      where w <> all(v_generic_proper) and w <> all(v_generic_org) and w <> all(v_broad);
      if v_count > 0 then
        return query select 'PROPER_NOUN_RUN'::text,
          (case when position(private.leak_norm(v_m[1]) in v_source_norm) > 0 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
          v_m[1];
      end if;
    end loop;
  end loop;

  return query select 'SOURCE_NAME_TOKEN'::text, 'HIGH'::public.leakage_risk, w
    from unnest(v_source_acronyms) as w
    where position(' ' || w || ' ' in v_all_norm) > 0;

  return query select 'SOURCE_NAME_TOKEN'::text,
      (case when length(w) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
      w
    from unnest(v_source_names) as w
    where position(' ' || w || ' ' in v_all_norm) > 0;

  -- Capitalised source words in any position (Title-Case titles, sentence
  -- starts, ALL-CAPS headings) that the source never writes in lowercase and
  -- that fewer than three other deals use. Per-word form of COMBINATION, so
  -- REVIEW only; common words are filtered out by the corpus count.
  for v_term in
    select c.w
    from (
      select distinct lower(m[1]) as w
      from unnest(v_source_parts) as part
      cross join lateral regexp_matches(part, '\m([A-Z][a-z]{3,}|[A-Z]{4,})\M', 'g') as m
    ) c
    where c.w <> all(v_generic_org)
      and c.w <> all(v_generic_proper)
      and c.w <> all(v_broad)
      and c.w <> all(v_stop)
      and c.w <> all(v_source_names)
      and c.w <> all(v_source_acronyms)
      and v_source_raw !~ ('\m' || c.w || '\M')
      and position(' ' || c.w || ' ' in v_all_norm) > 0
    order by length(c.w) desc, c.w
    limit 20
  loop
    select count(*) into v_k
    from (
      select 1
      from public.deals x
      where x.id <> d.id
        and to_tsvector('simple'::regconfig, coalesce(x.source_title, '') || ' ' || coalesce(x.source_description, ''))
            @@ plainto_tsquery('simple'::regconfig, v_term)
      limit 3
    ) others;
    if v_k < 3 then
      return query select 'SOURCE_RARE_WORD'::text, 'REVIEW'::public.leakage_risk, v_term;
    end if;
  end loop;

  -- Similarity and copied phrases -------------------------------------------
  if length(btrim(coalesce(d.source_title, ''))) >= 4 then
    v_sim := extensions.similarity(lower(d.source_title), lower(coalesce(p_preview_title, '')));
    if v_sim >= 0.9 then
      return query select 'TITLE_SIMILARITY'::text, 'HIGH'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    elsif v_sim >= 0.8 then
      return query select 'TITLE_SIMILARITY'::text, 'REVIEW'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    end if;

    if btrim(v_slug_norm) <> '' then
      v_sim := extensions.similarity(lower(d.source_title), btrim(v_slug_norm));
      if v_sim >= 0.9 then
        return query select 'SLUG_SIMILARITY'::text, 'HIGH'::public.leakage_risk, to_char(v_sim, 'FM0.00');
      elsif v_sim >= 0.8 then
        return query select 'SLUG_SIMILARITY'::text, 'REVIEW'::public.leakage_risk, to_char(v_sim, 'FM0.00');
      end if;
    end if;
  end if;

  if length(btrim(coalesce(d.source_description, ''))) >= 40 then
    v_sim := extensions.similarity(lower(d.source_description), lower(coalesce(p_preview_summary, '')));
    if v_sim >= 0.85 then
      return query select 'DESCRIPTION_SIMILARITY'::text, 'HIGH'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    elsif v_sim >= 0.55 then
      return query select 'DESCRIPTION_SIMILARITY'::text, 'REVIEW'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    end if;
  end if;

  foreach v_seg in array v_segments loop
    v_words := string_to_array(btrim(private.leak_norm(v_seg)), ' ');
    if coalesce(cardinality(v_words), 0) >= 6 then
      for i in 1 .. cardinality(v_words) - 5 loop
        v_window := ' ' || array_to_string(v_words[i:i + 5], ' ') || ' ';
        select count(*) into v_count from unnest(v_words[i:i + 5]) as w where w <> all(v_stop);
        if v_count >= 2 and position(v_window in v_source_norm) > 0 then
          return query select 'PHRASE_OVERLAP'::text, 'HIGH'::public.leakage_risk, btrim(v_window);
          exit;
        end if;
      end loop;
    end if;
  end loop;

  -- Exact amounts ------------------------------------------------------------
  select coalesce(array_agg(distinct x), '{}') into v_amounts
  from (
    select round(v)::bigint::text as x
    from unnest(array[d.value_min_ex_vat, d.value_max_ex_vat]) as v
    where v is not null
    union all
    select round(v)::bigint::text
    from public.lots l, unnest(array[l.value_min, l.value_max]) as v
    where l.deal_id = d.id and v is not null
    union all
    select round(a.award_value)::bigint::text from public.awards a where a.deal_id = d.id and a.award_value is not null
    union all
    select round(v)::bigint::text
    from public.contracts c, unnest(array[c.original_value, c.current_value]) as v
    where c.deal_id = d.id and v is not null
    union all
    select regexp_replace(d.exact_value_text, '[^0-9]', '', 'g') where d.exact_value_text is not null
  ) amounts
  where length(x) >= 5;

  return query select 'EXACT_AMOUNT'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '(£\s?[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)', 'g') as m;

  return query select 'EXACT_AMOUNT'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([0-9]{5,}(?:\.[0-9]{1,2})?)\M', 'g') as m
    where split_part(m[1], '.', 1) = any(v_amounts);

  -- Source platform ----------------------------------------------------------
  return query
    select 'SOURCE_PLATFORM'::text, 'HIGH'::public.leakage_risk, marker
    from (
      select unnest(v_platforms) as marker
      union
      select source_marker
      from (
        select lower(ds.name) as source_marker from public.data_sources ds where ds.id = d.primary_source_id
        union
        select lower(ds.source_key) from public.data_sources ds where ds.id = d.primary_source_id
        union
        select replace(lower(ds.source_key), '-', ' ') from public.data_sources ds where ds.id = d.primary_source_id
      ) source_markers
      where length(source_marker) >= 5
        and exists (
          select 1 from unnest(string_to_array(btrim(private.leak_norm(source_marker)), ' ')) as w
          where w <> all(v_generic_org) and w <> all(v_broad)
        )
    ) markers
    -- Short all-letter markers match whole words only (lib/redaction/scan.ts
    -- platformSubstringOk).
    where ((marker ~ '[^a-z ]' or length(replace(marker, ' ', '')) >= 8)
           and position(marker in v_all_lower) > 0)
       or position(private.leak_norm(marker) in v_all_norm) > 0;

  -- broad_region is shown verbatim on cards, so it must be one of the fixed
  -- regions (lib/preview/region.ts BROAD_REGIONS).
  if nullif(btrim(p_broad_region), '') is not null
     and btrim(p_broad_region) <> all(array[
       'Nationwide', 'London', 'South East England', 'South West England', 'East of England',
       'East Midlands', 'West Midlands', 'Yorkshire and the Humber', 'North West England',
       'North East England', 'Scotland', 'Wales', 'Northern Ireland', 'Remote',
       -- Country-level regions (TED); lib/preview/region.ts COUNTRY_REGIONS.
       'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland'
     ]) then
    return query select 'BROAD_REGION'::text, 'HIGH'::public.leakage_risk, left(btrim(p_broad_region), 120);
  end if;

  -- Combination risk: distinctive words carried from the source that pin the
  -- preview to fewer than three deals.
  select coalesce(array_agg(w order by length(w) desc, w), '{}') into v_carried
  from (
    select distinct w
    from unnest(string_to_array(btrim(private.leak_norm(concat_ws(' . ', array_to_string(v_segments, ' . '), v_slug))), ' ')) as w
    where length(w) >= 5
      and w !~ '^[0-9]+$'
      and w <> all(v_generic_org)
      and w <> all(v_generic_proper)
      and w <> all(v_broad)
      and w <> all(v_stop)
      and position(' ' || w || ' ' in v_source_norm) > 0
  ) carried;

  if cardinality(v_carried) >= 3 then
    v_carried := v_carried[1:4];
    select count(*) into v_k
    from (
      select 1
      from public.deals x
      where x.id <> d.id
        and to_tsvector('simple'::regconfig, coalesce(x.source_title, '') || ' ' || coalesce(x.source_description, ''))
            @@ plainto_tsquery('simple'::regconfig, array_to_string(v_carried, ' '))
      limit 2
    ) others;
    if v_k + 1 < 3 then
      return query select 'COMBINATION'::text, 'REVIEW'::public.leakage_risk, array_to_string(v_carried, ' + ');
    end if;
  end if;

  return;
end;
$$;

revoke execute on function private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text)
  from public, anon, authenticated;
grant execute on function private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text)
  to service_role;

comment on function private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text) is
  'Preview leak gate v2 findings. Tokens can contain protected values; service-role/admin only.';

create or replace function private.detect_preview_leakage(

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
      'Remote',
      'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland'
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
          (select bool_and(x = 'UK-wide delivery' or (x like 'Delivery within %' and substr(x, 17) = any(v.regions) and substr(x, 17) <> 'Nationwide')) from unnest(i.parts) as x)
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
