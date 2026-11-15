-- Cookieless UTM landing counts are aggregate-only and service-role only.
begin;
select no_plan();

delete from private.utm_landing_counts;

select is(
  (select array_agg(attname::text order by attnum)
     from pg_attribute
    where attrelid = 'private.utm_landing_counts'::regclass
      and attnum > 0
      and not attisdropped),
  array['day', 'utm_source', 'utm_medium', 'utm_campaign', 'path', 'count'],
  'the table holds exactly the six aggregate columns'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.utm_landing_counts'::regclass),
  'RLS is enabled on private.utm_landing_counts'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'private.utm_landing_counts'::regclass),
  'RLS is forced on private.utm_landing_counts'
);
select is(
  (select count(*)::int
     from pg_policies
    where schemaname = 'private'
      and tablename = 'utm_landing_counts'),
  0,
  'no RLS policy exposes the aggregate table'
);

select ok(
  not has_table_privilege('anon', 'private.utm_landing_counts', 'select')
  and not has_table_privilege('anon', 'private.utm_landing_counts', 'insert')
  and not has_table_privilege('anon', 'private.utm_landing_counts', 'update')
  and not has_table_privilege('anon', 'private.utm_landing_counts', 'delete')
  and not has_table_privilege('authenticated', 'private.utm_landing_counts', 'select')
  and not has_table_privilege('authenticated', 'private.utm_landing_counts', 'insert')
  and not has_table_privilege('authenticated', 'private.utm_landing_counts', 'update')
  and not has_table_privilege('authenticated', 'private.utm_landing_counts', 'delete'),
  'clients cannot read or write the aggregate table'
);
select ok(
  not has_function_privilege('anon', 'public.record_utm_landing(text, text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_utm_landing(text, text, text, text)', 'execute'),
  'clients cannot execute the landing count function'
);
select ok(
  has_function_privilege('service_role', 'public.record_utm_landing(text, text, text, text)', 'execute'),
  'service_role can record landing counts'
);

-- pgTAP lives in `extensions`; grant client roles usage inside this rolled-back
-- transaction so the denial assertions themselves can run.
grant usage on schema extensions to anon, authenticated;

set local role anon;

select throws_ok(
  'select * from private.utm_landing_counts',
  '42501',
  NULL,
  'anon select on utm_landing_counts is denied'
);
select throws_ok(
  $$ insert into private.utm_landing_counts (day, utm_source, utm_medium, utm_campaign, path, count)
     values ((now() at time zone 'utc')::date, 'src', 'med', 'camp', '/pricing', 1) $$,
  '42501',
  NULL,
  'anon insert on utm_landing_counts is denied'
);
select throws_ok(
  $$ select public.record_utm_landing('src', 'med', 'camp', '/pricing') $$,
  '42501',
  NULL,
  'anon cannot execute record_utm_landing'
);

reset role;

set local role authenticated;

select throws_ok(
  'select * from private.utm_landing_counts',
  '42501',
  NULL,
  'authenticated select on utm_landing_counts is denied'
);
select throws_ok(
  $$ insert into private.utm_landing_counts (day, utm_source, utm_medium, utm_campaign, path, count)
     values ((now() at time zone 'utc')::date, 'src', 'med', 'camp', '/pricing', 1) $$,
  '42501',
  NULL,
  'authenticated insert on utm_landing_counts is denied'
);
select throws_ok(
  $$ select public.record_utm_landing('src', 'med', 'camp', '/pricing') $$,
  '42501',
  NULL,
  'authenticated cannot execute record_utm_landing'
);

-- Later assertions run as the original role again.
reset role;

select public.record_utm_landing('Outreach', 'Email', 'Spring_2026', '/pricing');
select public.record_utm_landing('Outreach', 'Email', 'Spring_2026', '/pricing');
select is(
  (select count
     from private.utm_landing_counts
    where day = (now() at time zone 'utc')::date
      and utm_source = 'outreach'
      and utm_medium = 'email'
      and utm_campaign = 'spring_2026'
      and path = '/pricing'),
  2::bigint,
  'calling twice increments the aggregate count to 2'
);
select is(
  (select utm_source || '/' || utm_medium || '/' || utm_campaign
     from private.utm_landing_counts
    where path = '/pricing'
      and utm_campaign = 'spring_2026'),
  'outreach/email/spring_2026',
  'mixed-case utm values are lowercased'
);
select is(
  (select day
     from private.utm_landing_counts
    where path = '/pricing'
      and utm_campaign = 'spring_2026'),
  (now() at time zone 'utc')::date,
  'the function computes the UTC day itself'
);

select public.record_utm_landing('Bad Source!', 'Email', 'bad campaign', '/deals');
select is(
  (select count
     from private.utm_landing_counts
    where day = (now() at time zone 'utc')::date
      and utm_source = 'other'
      and utm_medium = 'email'
      and utm_campaign = 'other'
      and path = '/deals'),
  1::bigint,
  'invalid utm values are bucketed as other'
);

select public.record_utm_landing('outreach', 'email', repeat('a', 65), '/guides');
select is(
  (select count
     from private.utm_landing_counts
    where day = (now() at time zone 'utc')::date
      and utm_source = 'outreach'
      and utm_medium = 'email'
      and utm_campaign = 'other'
      and path = '/guides'),
  1::bigint,
  'a 65-character utm value is bucketed as other'
);

select public.record_utm_landing('outreach', 'email', 'slug_path', '/deals/some-slug-123');
select public.record_utm_landing('outreach', 'email', 'admin_path', '/admin');
select is(
  (select count(*)::int
     from private.utm_landing_counts
    where utm_campaign in ('slug_path', 'admin_path')),
  0,
  'slug and admin paths write nothing'
);

select public.record_utm_landing('outreach', 'email', null, '/pricing');
select public.record_utm_landing('outreach', 'email', '   ', '/pricing');
select is(
  (select count(*)::int
     from private.utm_landing_counts
    where utm_source = 'outreach'
      and utm_medium = 'email'
      and utm_campaign = 'other'
      and path = '/pricing'),
  0,
  'a missing or empty campaign writes nothing'
);

-- 2000 distinct keys cap the day; new keys collapse and existing keys still count.
delete from private.utm_landing_counts
 where day = (now() at time zone 'utc')::date;

insert into private.utm_landing_counts (
  day, utm_source, utm_medium, utm_campaign, path, count
)
select
  (now() at time zone 'utc')::date,
  'cap',
  'cap',
  'c' || g,
  '/pricing',
  1
from generate_series(1, 2000) as g;

select is(
  (select count(*)::int
     from private.utm_landing_counts
    where day = (now() at time zone 'utc')::date),
  2000,
  'the cap fixture has exactly 2000 distinct keys for today'
);

select public.record_utm_landing('newsrc', 'newmed', 'brand-new-campaign', '/deals');
select is(
  (select count(*)::int
     from private.utm_landing_counts
    where utm_campaign = 'brand-new-campaign'),
  0,
  'a new key writes no row once the day is capped'
);
select is(
  (select count
     from private.utm_landing_counts
    where day = (now() at time zone 'utc')::date
      and utm_source = 'other'
      and utm_medium = 'other'
      and utm_campaign = 'other'
      and path = '/deals'),
  1::bigint,
  'a new key collapses into the other bucket once the day is capped'
);

select public.record_utm_landing('cap', 'cap', 'c1', '/pricing');
select is(
  (select count
     from private.utm_landing_counts
    where day = (now() at time zone 'utc')::date
      and utm_source = 'cap'
      and utm_medium = 'cap'
      and utm_campaign = 'c1'
      and path = '/pricing'),
  2::bigint,
  'an existing key still increments once the day is capped'
);

delete from private.utm_landing_counts
 where day = (now() at time zone 'utc')::date;

select * from finish();
rollback;
