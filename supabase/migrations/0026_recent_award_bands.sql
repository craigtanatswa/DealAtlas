-- Coarse recently-awarded bands for anonymous and signed-in clients.
-- The function reads awards on the server and returns only sector, region,
-- value band, a 2/4/8-week bucket, and a rounded window aggregate.
-- No ids, names, titles, dates, exact values, slugs or references.

create or replace function private.format_award_total(p_amount numeric)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  rounded numeric;
  magnitude integer;
  unit numeric;
  suffix text;
  coeff numeric;
begin
  if p_amount is null or p_amount < 1 then
    return null;
  end if;

  -- Two significant figures from the digit length, so an exact power of ten
  -- cannot fall through a non-exact logarithm.
  magnitude := length(trunc(p_amount)::text) - 1;
  rounded := round(p_amount / power(10::numeric, magnitude - 1))
             * power(10::numeric, magnitude - 1);

  if rounded >= 1000000 then
    unit := 1000000;
    suffix := 'm';
  elsif rounded >= 1000 then
    unit := 1000;
    suffix := 'k';
  else
    return '£' || trunc(rounded)::text;
  end if;

  coeff := rounded / unit;
  if coeff >= 10 then
    return '£' || trunc(coeff)::text || suffix;
  end if;
  -- One decimal, with a dot, so the label does not follow lc_numeric.
  return '£' || trunc(coeff)::text || '.' || trunc((coeff - trunc(coeff)) * 10)::text || suffix;
end;
$$;

create or replace function private.round_award_count(p_count integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_count is null then null
    when p_count >= 50 then p_count
    else (round(p_count / 5.0) * 5)::integer
  end;
$$;

revoke all on function private.format_award_total(numeric) from public, anon, authenticated;
revoke all on function private.round_award_count(integer) from public, anon, authenticated;

create or replace function public.list_recent_award_bands()
returns table (
  sector text,
  region text,
  value_band text,
  recency_weeks integer,
  aggregate_value_label text,
  aggregate_contract_count integer,
  aggregate_window_weeks integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with regions(name) as (
    -- BROAD_REGIONS
    values
      ('Nationwide'),
      ('London'),
      ('South East England'),
      ('South West England'),
      ('East of England'),
      ('East Midlands'),
      ('West Midlands'),
      ('Yorkshire and the Humber'),
      ('North West England'),
      ('North East England'),
      ('Scotland'),
      ('Wales'),
      ('Northern Ireland'),
      ('Remote')
    -- END BROAD_REGIONS
  ),
  windowed as (
    select
      case d.buyer_sector
        when 'PUBLIC' then 'Public'
        when 'PRIVATE' then 'Private'
        when 'NONPROFIT' then 'Non-profit'
        when 'UTILITY' then 'Utility'
        when 'EDUCATION' then 'Education'
        when 'HEALTHCARE' then 'Healthcare'
        else 'Other'
      end as sector,
      coalesce(
        (
          select dp.broad_region
          from public.deal_previews dp
          where dp.deal_id = d.id
            and dp.broad_region in (select regions.name from regions)
          order by dp.broad_region
          limit 1
        ),
        (
          select l.region
          from public.deal_locations dl
          join public.locations l on l.id = dl.location_id
          where dl.deal_id = d.id
            and l.region in (select regions.name from regions)
          order by l.region
          limit 1
        ),
        (
          select case
            when bool_or(l.is_national) then 'Nationwide'
            when bool_or(l.is_remote) then 'Remote'
            else null
          end
          from public.deal_locations dl
          join public.locations l on l.id = dl.location_id
          where dl.deal_id = d.id
        )
      ) as region,
      case
        when a.award_value is null or a.award_value < 0 then 'Undisclosed'
        when a.award_value < 25000 then 'Under £25k'
        when a.award_value < 50000 then '£25k–£50k'
        when a.award_value < 100000 then '£50k–£100k'
        when a.award_value < 250000 then '£100k–£250k'
        when a.award_value < 500000 then '£250k–£500k'
        when a.award_value < 1000000 then '£500k–£1m'
        when a.award_value < 5000000 then '£1m–£5m'
        when a.award_value < 10000000 then '£5m–£10m'
        else '£10m+'
      end as value_band,
      a.award_value,
      a.award_date
    from public.awards a
    join public.deals d on d.id = a.deal_id
    where a.award_date >= (current_date - 56)
      and a.award_date <= current_date
  ),
  stats as (
    select
      count(*)::integer as raw_count,
      sum(award_value) as raw_total
    from windowed
  ),
  aggregate as (
    select
      case
        when stats.raw_count < 10 or private.format_award_total(stats.raw_total) is null then null
        else private.format_award_total(stats.raw_total)
      end as value_label,
      case
        when stats.raw_count < 10 or private.format_award_total(stats.raw_total) is null then null
        else private.round_award_count(stats.raw_count)
      end as contract_count,
      case
        when stats.raw_count < 10 or private.format_award_total(stats.raw_total) is null then null
        else 8
      end as window_weeks
    from stats
  ),
  buckets as (
    select
      sector,
      region,
      value_band,
      count(*)::integer as award_count,
      case
        when count(*) filter (where award_date >= (current_date - 14)) >= 3 then 2
        when count(*) filter (where award_date >= (current_date - 28)) >= 3 then 4
        else 8
      end as recency_weeks
    from windowed
    where region is not null
    group by sector, region, value_band
    having count(*) >= 3
  ),
  distinct_pairs as (
    select distinct on (sector, region)
      sector,
      region,
      value_band,
      recency_weeks
    from buckets
    order by sector, region, award_count desc, value_band desc
  ),
  picked as (
    select
      sector,
      region,
      value_band,
      recency_weeks
    from distinct_pairs
    where (select count(*) from distinct_pairs) >= 3
    order by md5(sector || '|' || region || '|' || to_char(date_trunc('week', current_date)::date, 'YYYYMMDD'))
    limit 6
  )
  select
    picked.sector,
    picked.region,
    picked.value_band,
    picked.recency_weeks,
    aggregate.value_label,
    aggregate.contract_count,
    aggregate.window_weeks
  from picked
  cross join aggregate
  order by md5(picked.sector || '|' || picked.region || '|' || to_char(date_trunc('week', current_date)::date, 'YYYYMMDD'));
$$;

revoke all on function public.list_recent_award_bands() from public, anon, authenticated;
grant execute on function public.list_recent_award_bands() to anon, authenticated, service_role;

comment on function public.list_recent_award_bands() is
  'Anonymous recently-awarded strip. Sector, region, value band and a 2/4/8-week bucket only, plus a rounded 8-week aggregate. Buckets under 3 awards are omitted. No ids, names, titles, dates or exact values.';

create index if not exists awards_award_date_idx
  on public.awards (award_date);
