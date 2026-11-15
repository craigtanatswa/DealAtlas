-- DealAtlas migration 0066
-- Data-only reclassification of private buyers. No schema or function changes.
--
-- Purpose:
--   * TED notices whose eForms buyer-legal-type is spec-rights-entity, org-sub
--     or any org-sub-* variant belong to private buyers.
--   * Find a Tender / Public Contracts Scotland / Sell2Wales deals whose legacy
--     buyer_sector is NONPROFIT are private even though buyer_type was PUBLIC.
--   * deal_previews must carry the same buyer type/sector and the organisation
--     noun in its text must match the stored sector.
--
-- Root cause: PR #83 reversed the owner decision from PR #78 by treating the
-- TED private legal types as PUBLIC. This migration restores the approved rule.
--
-- Do not apply this migration without the owner's explicit OK.
--
-- Reverse steps a and b (only with the owner's OK): set buyer_type back to
-- PUBLIC for the same TED legal-type predicate and set buyer_type back to
-- PUBLIC for the NONPROFIT rows this migration changed, then sync the previews
-- and nouns back in the opposite direction.

-- a. TED private legal types always make the whole deal private.
with ted_private as (
  select distinct n.deal_id
  from public.notices n
  join public.data_sources s on s.id = n.source_id
  join public.raw_records rr on rr.id = n.raw_record_id
  cross join lateral jsonb_path_query(rr.raw_payload, 'strict $.**."buyer-legal-type"') v0
  cross join lateral jsonb_array_elements_text(
    case jsonb_typeof(v0) when 'array' then v0 else jsonb_build_array(v0) end
  ) v
  where s.source_key = 'ted'
    and lower(btrim(v)) ~ '^(spec-rights-entity|org-sub(-[a-z]+)?)$'
)
update public.deals d
set buyer_type = 'PRIVATE'::public.buyer_type,
    buyer_sector = 'PRIVATE'::public.buyer_sector
where d.buyer_type = 'PUBLIC'::public.buyer_type
  and d.id in (select deal_id from ted_private);

-- b. NONPROFIT legacy buyers are private too. Keep buyer_sector NONPROFIT.
update public.deals
set buyer_type = 'PRIVATE'::public.buyer_type
where buyer_sector = 'NONPROFIT'::public.buyer_sector
  and buyer_type = 'PUBLIC'::public.buyer_type;

-- c. Sync deal_previews from the affected deals only.
with affected as (
  select distinct n.deal_id
  from public.notices n
  join public.data_sources s on s.id = n.source_id
  join public.raw_records rr on rr.id = n.raw_record_id
  cross join lateral jsonb_path_query(rr.raw_payload, 'strict $.**."buyer-legal-type"') v0
  cross join lateral jsonb_array_elements_text(
    case jsonb_typeof(v0) when 'array' then v0 else jsonb_build_array(v0) end
  ) v
  where s.source_key = 'ted'
    and lower(btrim(v)) ~ '^(spec-rights-entity|org-sub(-[a-z]+)?)$'
  union
  select d.id
  from public.deals d
  where d.buyer_sector = 'NONPROFIT'::public.buyer_sector
    and d.buyer_type = 'PRIVATE'::public.buyer_type
)
update public.deal_previews dp
set buyer_type = d.buyer_type,
    buyer_sector = d.buyer_sector
from public.deals d
where d.id = dp.deal_id
  and d.id in (select id from affected)
  and (dp.buyer_type is distinct from d.buyer_type
       or dp.buyer_sector is distinct from d.buyer_sector);

-- d. Rewrite only the organisation noun, and only when it changes.
-- Private previews: a/A public organisation -> a/A private organisation.
update public.deal_previews
set preview_title = regexp_replace(
      regexp_replace(preview_title, '\ma public organisation\M', 'a private organisation', 'g'),
      '\mA public organisation\M', 'A private organisation', 'g')
where buyer_sector = 'PRIVATE'::public.buyer_sector
  and preview_title ~ '\m[aA] public organisation\M';

update public.deal_previews
set preview_summary = regexp_replace(
      regexp_replace(preview_summary, '\ma public organisation\M', 'a private organisation', 'g'),
      '\mA public organisation\M', 'A private organisation', 'g')
where buyer_sector = 'PRIVATE'::public.buyer_sector
  and preview_summary ~ '\m[aA] public organisation\M';

update public.deal_previews dp
set requirements_preview = (
  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(item.value) = 'string' then
          to_jsonb(
            regexp_replace(
              regexp_replace(item.value #>> '{}', '\ma public organisation\M', 'a private organisation', 'g'),
              '\mA public organisation\M', 'A private organisation', 'g'
            )
          )
        else item.value
      end
      order by item.ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(dp.requirements_preview) with ordinality as item(value, ordinality)
)
where dp.buyer_sector = 'PRIVATE'::public.buyer_sector
  and case
    when jsonb_typeof(dp.requirements_preview) = 'array' then
      exists (
        select 1
        from jsonb_array_elements(dp.requirements_preview) as element(value)
        where jsonb_typeof(element.value) = 'string'
          and element.value #>> '{}' ~ '\m[aA] public organisation\M'
      )
    else false
  end;

-- Public previews: a/A private organisation -> a/A public organisation.
update public.deal_previews
set preview_title = regexp_replace(
      regexp_replace(preview_title, '\ma private organisation\M', 'a public organisation', 'g'),
      '\mA private organisation\M', 'A public organisation', 'g')
where buyer_sector = 'PUBLIC'::public.buyer_sector
  and preview_title ~ '\m[aA] private organisation\M';

update public.deal_previews
set preview_summary = regexp_replace(
      regexp_replace(preview_summary, '\ma private organisation\M', 'a public organisation', 'g'),
      '\mA private organisation\M', 'A public organisation', 'g')
where buyer_sector = 'PUBLIC'::public.buyer_sector
  and preview_summary ~ '\m[aA] private organisation\M';

update public.deal_previews dp
set requirements_preview = (
  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(item.value) = 'string' then
          to_jsonb(
            regexp_replace(
              regexp_replace(item.value #>> '{}', '\ma private organisation\M', 'a public organisation', 'g'),
              '\mA private organisation\M', 'A public organisation', 'g'
            )
          )
        else item.value
      end
      order by item.ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(dp.requirements_preview) with ordinality as item(value, ordinality)
)
where dp.buyer_sector = 'PUBLIC'::public.buyer_sector
  and case
    when jsonb_typeof(dp.requirements_preview) = 'array' then
      exists (
        select 1
        from jsonb_array_elements(dp.requirements_preview) as element(value)
        where jsonb_typeof(element.value) = 'string'
          and element.value #>> '{}' ~ '\m[aA] private organisation\M'
      )
    else false
  end;

-- Dry run (no writes): uncomment this block to count the rows each step would
-- change before applying the migration.
--
-- select 'ted deals' as step, count(*) as rows
-- from (
--   select distinct n.deal_id
--   from public.notices n
--   join public.data_sources s on s.id = n.source_id
--   join public.raw_records rr on rr.id = n.raw_record_id
--   cross join lateral jsonb_path_query(rr.raw_payload, 'strict $.**."buyer-legal-type"') v0
--   cross join lateral jsonb_array_elements_text(
--     case jsonb_typeof(v0) when 'array' then v0 else jsonb_build_array(v0) end
--   ) v
--   where s.source_key = 'ted'
--     and lower(btrim(v)) ~ '^(spec-rights-entity|org-sub(-[a-z]+)?)$'
-- ) q
-- union all
-- select 'nonprofit deals', count(*)
-- from public.deals
-- where buyer_sector = 'NONPROFIT'::public.buyer_sector
--   and buyer_type = 'PUBLIC'::public.buyer_type
-- union all
-- select 'preview buyer sync', count(*)
-- from public.deal_previews dp
-- join public.deals d on d.id = dp.deal_id
-- where (dp.buyer_type is distinct from d.buyer_type
--        or dp.buyer_sector is distinct from d.buyer_sector)
--   and (
--     d.id in (
--       select distinct n.deal_id
--       from public.notices n
--       join public.data_sources s on s.id = n.source_id
--       join public.raw_records rr on rr.id = n.raw_record_id
--       cross join lateral jsonb_path_query(rr.raw_payload, 'strict $.**."buyer-legal-type"') v0
--       cross join lateral jsonb_array_elements_text(
--         case jsonb_typeof(v0) when 'array' then v0 else jsonb_build_array(v0) end
--       ) v
--       where s.source_key = 'ted'
--         and lower(btrim(v)) ~ '^(spec-rights-entity|org-sub(-[a-z]+)?)$'
--     )
--     or (d.buyer_sector = 'NONPROFIT'::public.buyer_sector
--         and d.buyer_type = 'PRIVATE'::public.buyer_type)
--   )
-- union all
-- select 'private preview nouns', count(*)
-- from public.deal_previews
-- where buyer_sector = 'PRIVATE'::public.buyer_sector
--   and (
--     preview_title ~ '\m[aA] public organisation\M'
--     or preview_summary ~ '\m[aA] public organisation\M'
--     or case
--       when jsonb_typeof(requirements_preview) = 'array' then
--         exists (
--           select 1
--           from jsonb_array_elements(requirements_preview) as element(value)
--           where jsonb_typeof(element.value) = 'string'
--             and element.value #>> '{}' ~ '\m[aA] public organisation\M'
--         )
--       else false
--     end
--   )
-- union all
-- select 'public preview nouns', count(*)
-- from public.deal_previews
-- where buyer_sector = 'PUBLIC'::public.buyer_sector
--   and (
--     preview_title ~ '\m[aA] private organisation\M'
--     or preview_summary ~ '\m[aA] private organisation\M'
--     or case
--       when jsonb_typeof(requirements_preview) = 'array' then
--         exists (
--           select 1
--           from jsonb_array_elements(requirements_preview) as element(value)
--           where jsonb_typeof(element.value) = 'string'
--             and element.value #>> '{}' ~ '\m[aA] private organisation\M'
--         )
--       else false
--     end
--   );
