-- Project allow-listed free-preview detail lines out of requirements_preview.
-- Lines are stored as "<field>: <text>". Unknown field prefixes are dropped.
-- Plain requirement labels are unchanged. 8-digit CPV codes are stripped
-- before a line can leave the database.

create or replace function private.preview_dto_requirements(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with allowed(field) as (
    select unnest(array[
      'goodsServices',
      'quantities',
      'technicalSpecs',
      'standards',
      'keyDates',
      'procedureType',
      'lotCount',
      'framework',
      'deliveryRequirements',
      'scope',
      'commercialRequirements',
      'currency',
      'specificSector'
    ]::text[])
  ),
  raw as (
    select
      a.ord,
      case
        when jsonb_typeof(a.e) = 'object' and (a.e ->> 'field') in (select field from allowed)
          then a.e ->> 'field'
        when jsonb_typeof(a.e) = 'string'
          and position(': ' in btrim(a.e #>> '{}')) > 0
          and split_part(btrim(a.e #>> '{}'), ': ', 1) in (select field from allowed)
          then split_part(btrim(a.e #>> '{}'), ': ', 1)
        else null
      end as field,
      btrim(
        case
          when jsonb_typeof(a.e) = 'object' and (a.e ->> 'field') in (select field from allowed)
            then coalesce(a.e ->> 'text', '')
          when jsonb_typeof(a.e) = 'string'
            and position(': ' in btrim(a.e #>> '{}')) > 0
            and split_part(btrim(a.e #>> '{}'), ': ', 1) in (select field from allowed)
            then substr(
              btrim(a.e #>> '{}'),
              length(split_part(btrim(a.e #>> '{}'), ': ', 1)) + 3
            )
          when jsonb_typeof(a.e) = 'string'
            and position(': ' in btrim(a.e #>> '{}')) > 0
            and split_part(btrim(a.e #>> '{}'), ': ', 1) ~ '^[a-z][A-Za-z0-9]+$'
            then ''
          when jsonb_typeof(a.e) = 'string' then a.e #>> '{}'
          when jsonb_typeof(a.e) = 'object' and (a.e ->> 'field') is null
            then coalesce(a.e ->> 'text', a.e ->> 'label')
          else ''
        end
      ) as body
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)
      with ordinality as a(e, ord)
  ),
  cleaned as (
    select
      ord,
      field,
      btrim(regexp_replace(body, '\m\d{8}(-\d)?\M', '', 'g')) as body
    from raw
  )
  select coalesce(jsonb_agg(
    case
      when s.field is not null then jsonb_build_object('field', s.field, 'text', s.body)
      else to_jsonb(s.body)
    end
    order by s.ord
  ), '[]'::jsonb)
  from (
    select ord, field, body
    from cleaned
    where body is not null
      and body <> ''
      and length(body) <= 500
      and body !~ 'https?://'
    order by ord
    limit 40
  ) s;
$$;

revoke execute on function private.preview_dto_requirements(jsonb) from public, anon, authenticated;
