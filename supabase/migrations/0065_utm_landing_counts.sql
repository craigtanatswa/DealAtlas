-- Outreach clicks from visitors who never accept analytics cookies must still
-- be counted. Rows are aggregate-only: a UTC day, coarse UTM buckets, an
-- allowlisted route pattern and a count, so the table cannot carry identifiers.

create table if not exists private.utm_landing_counts (
  day date not null,
  utm_source text not null
    check (utm_source ~ '^[a-z0-9_-]{1,64}$'),
  utm_medium text not null
    check (utm_medium ~ '^[a-z0-9_-]{1,64}$'),
  utm_campaign text not null
    check (utm_campaign ~ '^[a-z0-9_-]{1,64}$'),
  path text not null
    check (path in (
      '/', '/deals', '/pricing', '/how-it-works', '/categories', '/guides',
      '/contact', '/cookies', '/privacy', '/terms', '/checkout', '/login',
      '/signup', '/alerts/confirmed', '/alerts/unsubscribed', '/app'
    )),
  count bigint not null default 0 check (count >= 0),
  primary key (day, utm_source, utm_medium, utm_campaign, path)
);

alter table private.utm_landing_counts enable row level security;
alter table private.utm_landing_counts force row level security;

revoke all on table private.utm_landing_counts from public, anon, authenticated;
grant select, insert, update on table private.utm_landing_counts to service_role;

create or replace function public.record_utm_landing(
  p_source text,
  p_medium text,
  p_campaign text,
  p_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
  v_medium text;
  v_campaign text;
  v_path text;
  v_day date;
  v_rows bigint;
begin
  v_source := pg_catalog.lower(pg_catalog.btrim(p_source));
  v_medium := pg_catalog.lower(pg_catalog.btrim(p_medium));
  v_campaign := pg_catalog.lower(pg_catalog.btrim(p_campaign));
  v_path := pg_catalog.btrim(p_path);

  -- No campaign means this is not a tracked landing.
  if v_campaign is null or v_campaign = '' then
    return;
  end if;

  if v_source is null or v_source = '' then
    v_source := 'none';
  elsif v_source !~ '^[a-z0-9_-]{1,64}$' then
    v_source := 'other';
  end if;

  if v_medium is null or v_medium = '' then
    v_medium := 'none';
  elsif v_medium !~ '^[a-z0-9_-]{1,64}$' then
    v_medium := 'other';
  end if;

  if v_campaign !~ '^[a-z0-9_-]{1,64}$' then
    v_campaign := 'other';
  end if;

  -- Anything outside the route-pattern allowlist is silently ignored.
  if v_path is null or v_path not in (
    '/', '/deals', '/pricing', '/how-it-works', '/categories', '/guides',
    '/contact', '/cookies', '/privacy', '/terms', '/checkout', '/login',
    '/signup', '/alerts/confirmed', '/alerts/unsubscribed', '/app'
  ) then
    return;
  end if;

  -- The caller cannot choose the day.
  v_day := (pg_catalog.now() at time zone 'utc')::date;

  -- Serialise the cap check per UTC day so concurrent writers cannot exceed it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('utm_landing_counts:' || v_day::text));

  -- Bound cardinality: after 2000 rows for a day, new keys collapse into the
  -- "other" bucket instead of growing the day's distinct combinations.
  if not exists (
    select 1
    from private.utm_landing_counts c
    where c.day = v_day
      and c.utm_source = v_source
      and c.utm_medium = v_medium
      and c.utm_campaign = v_campaign
      and c.path = v_path
  ) then
    select pg_catalog.count(*) into v_rows
    from private.utm_landing_counts c
    where c.day = v_day;

    if v_rows >= 2000 then
      v_source := 'other';
      v_medium := 'other';
      v_campaign := 'other';
    end if;
  end if;

  insert into private.utm_landing_counts (
    day,
    utm_source,
    utm_medium,
    utm_campaign,
    path,
    count
  )
  values (v_day, v_source, v_medium, v_campaign, v_path, 1)
  on conflict (day, utm_source, utm_medium, utm_campaign, path)
  do update set count = utm_landing_counts.count + 1;
end;
$$;

revoke all on function public.record_utm_landing(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_utm_landing(text, text, text, text)
  to service_role;

comment on function public.record_utm_landing(text, text, text, text) is
  'Service-role only. Cookieless aggregate UTM landing counts; stores no identifiers or raw paths.';
