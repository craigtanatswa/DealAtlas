-- DealAtlas migration 0060
-- Top-level Private/Public buyer type plus the canonical deal sector taxonomy.
-- Legacy buyer_sector is retained as-is for compatibility and historical data.

create type public.buyer_type as enum ('PUBLIC', 'PRIVATE');

create type public.deal_sector as enum (
  'UTILITIES',
  'HEALTHCARE',
  'EDUCATION',
  'CONSTRUCTION_INFRASTRUCTURE',
  'TRANSPORT',
  'TECHNOLOGY',
  'DEFENCE_SECURITY',
  'FACILITIES_PROPERTY',
  'PROFESSIONAL_SERVICES',
  'ENVIRONMENT_WASTE',
  'HOUSING',
  'SOCIAL_CARE',
  'FOOD_CATERING',
  'MANUFACTURING_EQUIPMENT',
  'CHARITY_NONPROFIT',
  'OTHER'
);

alter table public.deals
  add column buyer_type public.buyer_type default 'PUBLIC'::public.buyer_type,
  add column sector public.deal_sector default 'OTHER'::public.deal_sector;

alter table public.deal_previews
  add column buyer_type public.buyer_type default 'PUBLIC'::public.buyer_type,
  add column sector public.deal_sector default 'OTHER'::public.deal_sector;

create function private.deal_sector_from_cpv(p_code text)
returns public.deal_sector
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.left(pg_catalog.regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g'), 2)
    when '09' then 'UTILITIES'::public.deal_sector
    when '40' then 'UTILITIES'::public.deal_sector
    when '41' then 'UTILITIES'::public.deal_sector
    when '65' then 'UTILITIES'::public.deal_sector
    when '76' then 'UTILITIES'::public.deal_sector
    when '33' then 'HEALTHCARE'::public.deal_sector
    when '85' then 'HEALTHCARE'::public.deal_sector
    when '80' then 'EDUCATION'::public.deal_sector
    when '44' then 'CONSTRUCTION_INFRASTRUCTURE'::public.deal_sector
    when '45' then 'CONSTRUCTION_INFRASTRUCTURE'::public.deal_sector
    when '71' then 'CONSTRUCTION_INFRASTRUCTURE'::public.deal_sector
    when '34' then 'TRANSPORT'::public.deal_sector
    when '60' then 'TRANSPORT'::public.deal_sector
    when '63' then 'TRANSPORT'::public.deal_sector
    when '30' then 'TECHNOLOGY'::public.deal_sector
    when '32' then 'TECHNOLOGY'::public.deal_sector
    when '38' then 'TECHNOLOGY'::public.deal_sector
    when '48' then 'TECHNOLOGY'::public.deal_sector
    when '64' then 'TECHNOLOGY'::public.deal_sector
    when '72' then 'TECHNOLOGY'::public.deal_sector
    when '73' then 'TECHNOLOGY'::public.deal_sector
    when '35' then 'DEFENCE_SECURITY'::public.deal_sector
    when '50' then 'FACILITIES_PROPERTY'::public.deal_sector
    when '51' then 'FACILITIES_PROPERTY'::public.deal_sector
    when '70' then 'FACILITIES_PROPERTY'::public.deal_sector
    when '66' then 'PROFESSIONAL_SERVICES'::public.deal_sector
    when '74' then 'PROFESSIONAL_SERVICES'::public.deal_sector
    when '79' then 'PROFESSIONAL_SERVICES'::public.deal_sector
    when '90' then 'ENVIRONMENT_WASTE'::public.deal_sector
    when '03' then 'FOOD_CATERING'::public.deal_sector
    when '15' then 'FOOD_CATERING'::public.deal_sector
    when '55' then 'FOOD_CATERING'::public.deal_sector
    when '77' then 'FOOD_CATERING'::public.deal_sector
    when '14' then 'MANUFACTURING_EQUIPMENT'::public.deal_sector
    when '18' then 'MANUFACTURING_EQUIPMENT'::public.deal_sector
    when '19' then 'MANUFACTURING_EQUIPMENT'::public.deal_sector
    when '31' then 'MANUFACTURING_EQUIPMENT'::public.deal_sector
    when '42' then 'MANUFACTURING_EQUIPMENT'::public.deal_sector
    when '43' then 'MANUFACTURING_EQUIPMENT'::public.deal_sector
    when '98' then 'OTHER'::public.deal_sector
    else 'OTHER'::public.deal_sector
  end;
$$;

create function private.deal_sector_from_cofog(p_code text)
returns public.deal_sector
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.left(pg_catalog.regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g'), 2)
    when '06' then 'HOUSING'::public.deal_sector
    when '07' then 'HEALTHCARE'::public.deal_sector
    when '09' then 'EDUCATION'::public.deal_sector
    when '10' then 'SOCIAL_CARE'::public.deal_sector
    else null
  end;
$$;

create function private.deal_sector_from_text(p_value text)
returns public.deal_sector
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(coalesce(p_value, ''));
begin
  if btrim(v) = '' then
    return 'OTHER'::public.deal_sector;
  end if;
  if v ~* '\m(social care|adult care|childcare|children''s care|domiciliary care)\M'
     and v !~* '\mhealth\M' then
    return 'SOCIAL_CARE'::public.deal_sector;
  end if;
  if v ~* '\m(nhs|health|hospital|medical|clinical|pharmaceutical|social care)\M' then
    return 'HEALTHCARE'::public.deal_sector;
  end if;
  if v ~* '\m(education|school|university|college|academy|training|learning)\M' then
    return 'EDUCATION'::public.deal_sector;
  end if;
  if v ~* '\m(utility|utilities|energy|water|wastewater|gas|electric|electricity|power|grid|transmission|nuclear|oil)\M' then
    return 'UTILITIES'::public.deal_sector;
  end if;
  if v ~* '\m(transport|rail|railway|road|highway|bus|coach|aviation|airport|port|shipping|maritime|fleet|logistics)\M' then
    return 'TRANSPORT'::public.deal_sector;
  end if;
  if v ~* '\m(defence|defense|military|security|police|fire service|cyber security)\M' then
    return 'DEFENCE_SECURITY'::public.deal_sector;
  end if;
  if v ~* '\m(environment|waste|recycling|pollution|conservation|green|decarbonisation)\M' then
    return 'ENVIRONMENT_WASTE'::public.deal_sector;
  end if;
  if v ~* '\m(housing|homes|residential|regeneration|homelessness)\M' then
    return 'HOUSING'::public.deal_sector;
  end if;
  if v ~* '\m(facilities|property|estate|real estate|cleaning|maintenance|repairs)\M' then
    return 'FACILITIES_PROPERTY'::public.deal_sector;
  end if;
  if v ~* '\m(food|catering|meals|drink|beverage|agriculture|farming|forestry)\M' then
    return 'FOOD_CATERING'::public.deal_sector;
  end if;
  if v ~* '\m(technology|software|hardware|digital|data|computing|computer|cloud|network|telecom|information technology|cyber|artificial intelligence|ai)\M' then
    return 'TECHNOLOGY'::public.deal_sector;
  end if;
  if v ~* '\m(manufacturing|manufacture|equipment|machinery|industrial|engineering|vehicles|materials)\M' then
    return 'MANUFACTURING_EQUIPMENT'::public.deal_sector;
  end if;
  if v ~* '\m(charity|charitable|non-profit|nonprofit|not-for-profit|voluntary)\M' then
    return 'CHARITY_NONPROFIT'::public.deal_sector;
  end if;
  if v ~* '\m(professional|consultancy|consulting|legal|financial|finance|audit|accounting|human resources|recruitment|marketing|advertising|business services)\M' then
    return 'PROFESSIONAL_SERVICES'::public.deal_sector;
  end if;
  if v ~* '\m(construction|infrastructure|building|civil engineering|works)\M' then
    return 'CONSTRUCTION_INFRASTRUCTURE'::public.deal_sector;
  end if;
  return 'OTHER'::public.deal_sector;
end;
$$;

revoke all on function private.deal_sector_from_cpv(text)
  from public, anon, authenticated, service_role;
revoke all on function private.deal_sector_from_cofog(text)
  from public, anon, authenticated, service_role;
revoke all on function private.deal_sector_from_text(text)
  from public, anon, authenticated, service_role;

with fts as (
  select
    n.deal_id,
    bool_or(
      lower(coalesce(c->>'scheme', '')) = 'uk_ca_type'
      and lower(coalesce(c->>'id', '')) = 'privateutility'
    ) as private_utility,
    array_agg(distinct pg_catalog.left(
      pg_catalog.regexp_replace(coalesce(c->>'id', ''), '[^0-9]', '', 'g'),
      2
    )) filter (where lower(coalesce(c->>'scheme', '')) = 'cofog') as cofog_codes
  from public.notices n
  join public.data_sources s on s.id = n.source_id
  join public.deals d on d.id = n.deal_id
  join public.raw_records rr on rr.id = n.raw_record_id
  cross join lateral jsonb_path_query(rr.raw_payload, '$.**') c
  where s.source_key in ('find-a-tender', 'public-contracts-scotland', 'sell2wales')
    and jsonb_typeof(c) = 'object'
    and d.ocid is not null
    and rr.raw_payload::text like '%' || to_jsonb(d.ocid)::text || '%'
  group by n.deal_id
),
ted as (
  select n.deal_id
  from public.notices n
  join public.data_sources s on s.id = n.source_id
  join public.raw_records rr on rr.id = n.raw_record_id
  cross join lateral jsonb_path_query(rr.raw_payload, '$.**."buyer-legal-type"') legal
  cross join lateral jsonb_path_query(legal, '$.**') item
  where s.source_key = 'ted'
    and jsonb_typeof(item) = 'string'
    and (
      lower(item #>> '{}') = 'spec-rights-entity'
      or lower(item #>> '{}') like 'org-sub%'
    )
  group by n.deal_id
),
ukip as (
  select
    n.deal_id,
    max(lower(coalesce(
      rr.raw_payload #>> '{body,record,is_this_project_programme_drawing_on_public_or_private_funds}',
      ''
    ))) as funding,
    max(coalesce(
      rr.raw_payload #>> '{body,record,sector}',
      rr.raw_payload #>> '{body,record,key_client}',
      ''
    )) as sector_text
  from public.notices n
  join public.data_sources s on s.id = n.source_id
  join public.raw_records rr on rr.id = n.raw_record_id
  where s.source_key = 'uk-infrastructure-pipeline'
  group by n.deal_id
),
private_discovery as (
  select d.id as deal_id
  from public.deals d
  join public.data_sources s on s.id = d.primary_source_id
  where s.discovery_method is not null
  union
  select c.merged_deal_id as deal_id
  from public.opportunity_candidates c
  where c.is_private
    and c.merged_deal_id is not null
),
primary_cpv as (
  select distinct on (dc.deal_id)
    dc.deal_id,
    dc.cpv_code
  from public.deal_classifications dc
  where dc.cpv_code is not null
  order by dc.deal_id, dc.is_primary desc nulls last, dc.created_at, dc.id
),
computed as (
  select
    d.id,
    case
      when coalesce(f.private_utility, false) then 'PRIVATE'::public.buyer_type
      when u.funding ~ '\mpublic\M' then 'PUBLIC'::public.buyer_type
      when u.funding ~ '\mprivate\M' then 'PRIVATE'::public.buyer_type
      when t.deal_id is not null then 'PRIVATE'::public.buyer_type
      when pd.deal_id is not null then 'PRIVATE'::public.buyer_type
      when d.buyer_sector in ('PRIVATE'::public.buyer_sector, 'NONPROFIT'::public.buyer_sector)
        then 'PRIVATE'::public.buyer_type
      else 'PUBLIC'::public.buyer_type
    end as buyer_type,
    case
      when coalesce(f.private_utility, false) then 'UTILITIES'::public.deal_sector
      when f.cofog_codes is not null and '07' = any(f.cofog_codes) then 'HEALTHCARE'::public.deal_sector
      when f.cofog_codes is not null and '09' = any(f.cofog_codes) then 'EDUCATION'::public.deal_sector
      when f.cofog_codes is not null and '06' = any(f.cofog_codes) then 'HOUSING'::public.deal_sector
      when f.cofog_codes is not null and '10' = any(f.cofog_codes) then 'SOCIAL_CARE'::public.deal_sector
      when f.deal_id is not null then coalesce(
        nullif(private.deal_sector_from_cpv(pc.cpv_code), 'OTHER'::public.deal_sector),
        nullif(private.deal_sector_from_text(d.main_category), 'OTHER'::public.deal_sector),
        'OTHER'::public.deal_sector
      )
      when u.deal_id is not null then coalesce(
        nullif(private.deal_sector_from_text(u.sector_text), 'OTHER'::public.deal_sector),
        nullif(private.deal_sector_from_cpv(pc.cpv_code), 'OTHER'::public.deal_sector),
        nullif(private.deal_sector_from_text(d.main_category), 'OTHER'::public.deal_sector),
        'OTHER'::public.deal_sector
      )
      when d.buyer_sector = 'UTILITY'::public.buyer_sector then 'UTILITIES'::public.deal_sector
      when d.buyer_sector = 'HEALTHCARE'::public.buyer_sector then 'HEALTHCARE'::public.deal_sector
      when d.buyer_sector = 'EDUCATION'::public.buyer_sector then 'EDUCATION'::public.deal_sector
      when d.buyer_sector = 'NONPROFIT'::public.buyer_sector then 'CHARITY_NONPROFIT'::public.deal_sector
      else coalesce(
        nullif(private.deal_sector_from_cpv(pc.cpv_code), 'OTHER'::public.deal_sector),
        nullif(private.deal_sector_from_text(d.main_category), 'OTHER'::public.deal_sector),
        'OTHER'::public.deal_sector
      )
    end as sector
  from public.deals d
  left join fts f on f.deal_id = d.id
  left join ted t on t.deal_id = d.id
  left join ukip u on u.deal_id = d.id
  left join private_discovery pd on pd.deal_id = d.id
  left join primary_cpv pc on pc.deal_id = d.id
)
update public.deals d
set buyer_type = c.buyer_type,
    sector = c.sector
from computed c
where c.id = d.id;

update public.deal_previews dp
set buyer_type = d.buyer_type,
    sector = d.sector
from public.deals d
where d.id = dp.deal_id;

do $$
begin
  if exists (
    select 1 from public.deals
    where buyer_type is null or sector is null
  ) then
    raise exception 'deals have null buyer_type or sector after backfill';
  end if;
  if exists (
    select 1 from public.deal_previews
    where buyer_type is null or sector is null
  ) then
    raise exception 'deal_previews have null buyer_type or sector after backfill';
  end if;
end;
$$;

alter table public.deals
  alter column buyer_type set not null,
  alter column sector set not null;

alter table public.deal_previews
  alter column buyer_type set not null,
  alter column sector set not null;

create index deals_buyer_type_sector_idx
  on public.deals (buyer_type, sector);

create index deal_previews_buyer_type_sector_idx
  on public.deal_previews (buyer_type, sector);

comment on column public.deals.buyer_type is
  'Top-level buyer type: PUBLIC or PRIVATE. Legacy buyer_sector remains unchanged.';
comment on column public.deals.sector is
  'Canonical 16-value buyer sector derived at ingestion and backfilled for existing rows.';

drop function if exists public.get_preview_dto_by_slug(text);

create function public.get_preview_dto_by_slug(p_slug text)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  buyer_type public.buyer_type,
  sector public.deal_sector,
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
  preview_reasons jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.buyer_type,
    dp.sector,
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
    private.preview_dto_requirements(dp.requirements_preview),
    dp.relevance_tags[1:12],
    private.preview_freshness_label(dp.created_at, dp.updated_at),
    dm.relevance_score,
    private.preview_dto_reasons(dm.preview_reasons)
  from public.deal_previews dp
  left join public.company_profiles cp
    on cp.user_id = auth.uid()
   and coalesce(private.is_user_pro(auth.uid()), false)
  left join public.deal_matches dm
    on dm.deal_id = dp.deal_id
   and dm.company_profile_id = cp.id
  where length(coalesce(p_slug, '')) between 1 and 200
    and dp.slug = p_slug
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
    and not private.preview_slug_is_legacy(dp.slug, dp.deal_id)
  limit 1;
$$;

revoke all on function public.get_preview_dto_by_slug(text) from public;
grant execute on function public.get_preview_dto_by_slug(text)
  to anon, authenticated, service_role;

drop function if exists public.get_preview_dto_by_deal_id(uuid);

create function public.get_preview_dto_by_deal_id(p_deal_id uuid)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  buyer_type public.buyer_type,
  sector public.deal_sector,
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
  preview_reasons jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.buyer_type,
    dp.sector,
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
    private.preview_dto_requirements(dp.requirements_preview),
    dp.relevance_tags[1:12],
    private.preview_freshness_label(dp.created_at, dp.updated_at),
    dm.relevance_score,
    private.preview_dto_reasons(dm.preview_reasons)
  from public.deal_previews dp
  left join public.company_profiles cp
    on cp.user_id = auth.uid()
   and coalesce(private.is_user_pro(auth.uid()), false)
  left join public.deal_matches dm
    on dm.deal_id = dp.deal_id
   and dm.company_profile_id = cp.id
  where auth.uid() is not null
    and dp.deal_id = p_deal_id
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  limit 1;
$$;

revoke all on function public.get_preview_dto_by_deal_id(uuid) from public, anon;
grant execute on function public.get_preview_dto_by_deal_id(uuid)
  to authenticated, service_role;

drop function if exists public.list_saved_deal_previews();

create function public.list_saved_deal_previews()
returns table (
  saved_deal_id uuid,
  deal_id uuid,
  notes text,
  saved_at timestamptz,
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  buyer_type public.buyer_type,
  sector public.deal_sector,
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
  freshness_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sd.id,
    sd.deal_id,
    sd.notes,
    sd.created_at,
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.buyer_type,
    dp.sector,
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
    case when dp.deal_id is null then null else private.preview_dto_requirements(dp.requirements_preview) end,
    dp.relevance_tags[1:12],
    case when dp.deal_id is null then null else private.preview_freshness_label(dp.created_at, dp.updated_at) end
  from public.saved_deals sd
  left join public.deal_previews dp
    on dp.deal_id = sd.deal_id
   and dp.is_published = true
   and dp.leakage_risk = 'LOW'
   and dp.unpublished_by_admin = false
  where sd.user_id = auth.uid()
    and (dp.deal_id is not null or private.is_user_pro(auth.uid()))
  order by sd.created_at desc;
$$;

revoke all on function public.list_saved_deal_previews() from public, anon;
grant execute on function public.list_saved_deal_previews()
  to authenticated, service_role;

drop function if exists public.search_preview_dtos(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  public.deal_status[],
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
);

create function public.search_preview_dtos(
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_statuses public.deal_status[] default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_min_score numeric default null,
  p_sort text default 'updated',
  p_limit integer default 20,
  p_offset integer default 0,
  p_categories text[] default null
)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  buyer_type public.buyer_type,
  sector public.deal_sector,
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
  with opts as (
    select
      coalesce(private.is_user_pro(auth.uid()), false) as pro,
      lower(coalesce(p_sort, 'updated')) as requested_sort
  ),
  eff as (
    select
      o.pro,
      case
        when o.requested_sort = 'relevance' and not o.pro then 'biddable'
        else o.requested_sort
      end as sort,
      case when o.pro then p_min_score end as min_score
    from opts o
  ),
  viewer as (
    select cp.id as company_profile_id
    from public.company_profiles cp
    cross join eff
    where cp.user_id = auth.uid()
      and eff.pro
    limit 1
  ),
  q as (
    select nullif(btrim(left(coalesce(p_query, ''), 200)), '') as text
  ),
  ranked as (
    select
      dp.*,
      eff.sort,
      dm.relevance_score as match_score,
      dm.preview_reasons as match_reasons,
      case
        when q.text is null then 0
        else ts_rank(
          to_tsvector('english'::regconfig, coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')),
          websearch_to_tsquery('english'::regconfig, q.text)
        )
      end as query_rank
    from public.deal_previews dp
    cross join q
    cross join eff
    left join viewer v on true
    left join public.deal_matches dm
      on dm.deal_id = dp.deal_id
     and dm.company_profile_id = v.company_profile_id
    where dp.is_published = true
      and dp.leakage_risk = 'LOW'
      and dp.unpublished_by_admin = false
      and (
        case
          when p_categories is not null and cardinality(p_categories) > 0
            then dp.main_category = any(p_categories)
          else (p_category is null or dp.main_category = p_category)
        end
      )
      and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
      and (p_deal_type is null or dp.deal_type = p_deal_type)
      and (p_region is null or dp.broad_region = p_region)
      and (p_status is null or dp.status = p_status)
      and (p_statuses is null or cardinality(p_statuses) = 0 or dp.status = any(p_statuses))
      and (p_value_band is null or dp.value_band = p_value_band)
      and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
      and (eff.min_score is null or coalesce(dm.relevance_score, -1) >= eff.min_score)
      and (
        q.text is null
        or to_tsvector('english'::regconfig, coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
             @@ websearch_to_tsquery('english'::regconfig, q.text)
      )
  ),
  paged as (
    select
      r.*,
      count(*) over () as total_count,
      case when r.sort = 'relevance' then coalesce(r.match_score, -1) else 0 end as sort_score,
      case
        when r.sort = 'biddable' and r.status = 'CLOSING_SOON'::public.deal_status then 0
        when r.sort = 'biddable' and r.status = 'OPEN'::public.deal_status then 1
        when r.sort = 'biddable' and r.status = 'UPCOMING'::public.deal_status then 2
        when r.sort = 'biddable' then 3
        else 0
      end as sort_status,
      case
        when r.sort in ('biddable', 'deadline') then (
          select d.submission_deadline
          from public.deals d
          where d.id = r.deal_id
        )
      end as sort_deadline,
      case when r.sort = 'relevance' then r.query_rank else 0 end as sort_rank
    from ranked r
    order by sort_score desc, sort_status asc, sort_deadline asc nulls last, sort_rank desc, r.updated_at desc, r.slug
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(0, least(coalesce(p_offset, 0), 10000))
  )
  select
    p.slug,
    p.preview_title,
    p.preview_summary,
    p.deal_type,
    p.buyer_sector,
    p.buyer_type,
    p.sector,
    p.stage,
    p.status,
    p.main_category,
    p.broad_region,
    p.value_band,
    p.deadline_band,
    p.duration_band,
    p.sme_suitability,
    p.bid_complexity,
    p.competition_level,
    private.preview_dto_requirements(p.requirements_preview),
    p.relevance_tags[1:12],
    private.preview_freshness_label(p.created_at, p.updated_at),
    p.match_score,
    private.preview_dto_reasons(p.match_reasons),
    p.total_count
  from paged p
  order by p.sort_score desc, p.sort_status asc, p.sort_deadline asc nulls last, p.sort_rank desc, p.updated_at desc, p.slug;
$$;

revoke all on function public.search_preview_dtos(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  public.deal_status[],
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
) from public;
grant execute on function public.search_preview_dtos(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  public.deal_status[],
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
) to anon, authenticated, service_role;

drop function if exists public.search_deal_previews(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  integer,
  integer,
  text[]
);

create function public.search_deal_previews(
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_categories text[] default null
)
returns table (
  deal_id uuid,
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  buyer_type public.buyer_type,
  sector public.deal_sector,
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
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  select
    dp.deal_id,
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.buyer_type,
    dp.sector,
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
    count(*) over() as total_count
  from public.deal_previews dp
  where dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and (
      case
        when p_categories is not null and cardinality(p_categories) > 0
          then dp.main_category = any(p_categories)
        else (p_category is null or dp.main_category = p_category)
      end
    )
    and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
    and (p_deal_type is null or dp.deal_type = p_deal_type)
    and (p_region is null or dp.broad_region = p_region)
    and (p_status is null or dp.status = p_status)
    and (p_value_band is null or dp.value_band = p_value_band)
    and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
    and (
      p_query is null
      or btrim(p_query) = ''
      or to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
           @@ websearch_to_tsquery('english', p_query)
      or dp.preview_title % p_query
    )
  order by
    case when p_query is null or btrim(p_query) = '' then 0
      else ts_rank(
        to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')),
        websearch_to_tsquery('english', p_query)
      )
    end desc,
    dp.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_deal_previews(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  integer,
  integer,
  text[]
) from public, anon, authenticated;
grant execute on function public.search_deal_previews(
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  integer,
  integer,
  text[]
) to service_role;

drop function if exists public.search_deal_previews_for_profile(
  uuid,
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
);

create function public.search_deal_previews_for_profile(
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
  p_offset integer default 0,
  p_categories text[] default null
)
returns table (
  deal_id uuid,
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  buyer_type public.buyer_type,
  sector public.deal_sector,
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
      dp.buyer_type,
      dp.sector,
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
      and (
        case
          when p_categories is not null and cardinality(p_categories) > 0
            then dp.main_category = any(p_categories)
          else (p_category is null or dp.main_category = p_category)
        end
      )
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
    ranked.buyer_type,
    ranked.sector,
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

revoke all on function public.search_deal_previews_for_profile(
  uuid,
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
) from public, anon, authenticated;
grant execute on function public.search_deal_previews_for_profile(
  uuid,
  text,
  text,
  public.buyer_sector,
  public.deal_type,
  text,
  public.deal_status,
  text,
  text,
  numeric,
  text,
  integer,
  integer,
  text[]
) to service_role;

create function public.admin_deal_taxonomy_counts()
returns table (
  buyer_type public.buyer_type,
  sector public.deal_sector,
  deal_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.buyer_type,
    d.sector,
    count(*) as deal_count
  from public.deals d
  group by d.buyer_type, d.sector
  order by d.buyer_type, d.sector;
$$;

revoke all on function public.admin_deal_taxonomy_counts()
  from public, anon, authenticated;
grant execute on function public.admin_deal_taxonomy_counts()
  to service_role;
