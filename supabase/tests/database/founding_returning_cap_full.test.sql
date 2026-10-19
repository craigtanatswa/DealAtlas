-- Returning ex-founder while the founding cap is full. Synthetic users only.
-- 25 other founders hold active slots. The ex-founder activated earlier and
-- then cancelled (close_founding_membership), so founding_member stays true
-- and the slot stays active.
begin;
select no_plan();

insert into auth.users (id, email)
select ('f3000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'returning-cap-' || i::text || '@example.test'
from generate_series(1, 25) as i;

insert into private.founding_slots (user_id, status, expires_at, activated_at)
select ('f3000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'active',
       null,
       pg_catalog.now()
from generate_series(1, 25) as i
on conflict (user_id) do update
  set status = 'active', expires_at = null, activated_at = pg_catalog.now();

update public.profiles
set founding_member = true
where id in (
  select ('f3000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
  from generate_series(1, 25) as i
);

insert into auth.users (id, email) values
  ('f3000000-0000-4000-8000-000000000099', 'returning-ex-founder@example.test'),
  ('f3000000-0000-4000-8000-000000000098', 'returning-new-user@example.test');

-- The ex-founder founded before the cap filled, then cancelled.
insert into private.founding_slots (user_id, status, expires_at, activated_at)
values ('f3000000-0000-4000-8000-000000000099', 'active', null, pg_catalog.now() - interval '30 days')
on conflict (user_id) do update
  set status = 'active', expires_at = null, activated_at = excluded.activated_at;
update public.profiles
set founding_member = true,
    founding_since = pg_catalog.now() - interval '30 days'
where id = 'f3000000-0000-4000-8000-000000000099';
select public.close_founding_membership('f3000000-0000-4000-8000-000000000099');

select is(public.founding_availability(), 0, 'the founding cap is full');

create temp table returning_slots_before as
select count(*)::int as n from private.founding_slots;
create temp table returning_active_before as
select count(*)::int as n from private.founding_slots where status = 'active';

select is(
  public.reserve_founding_slot('f3000000-0000-4000-8000-000000000099'),
  'active',
  'a returning ex-founder passes FOUNDING checkout while the cap is full'
);
select is(
  (select count(*)::int from private.founding_slots),
  (select n from returning_slots_before),
  'a returning ex-founder creates no new founding_slots row'
);
select is(
  public.founding_availability(),
  0,
  'a returning ex-founder does not change remaining places'
);

select is(
  public.reserve_founding_slot('f3000000-0000-4000-8000-000000000098'),
  'sold_out',
  'a brand-new user fails closed while the cap is full'
);
select is(
  (select count(*)::int from private.founding_slots where user_id = 'f3000000-0000-4000-8000-000000000098'),
  0,
  'a brand-new user gets no slot row when the cap is full'
);

select is(
  public.claim_founding_activation(
    'evt_returning_cap_full',
    'sub_returning_cap_full',
    'f3000000-0000-4000-8000-000000000099'
  ),
  true,
  'a returning founder webhook during a full cap keeps founding'
);
select is(
  (select count(*)::int from private.founding_cap_fallbacks where user_id = 'f3000000-0000-4000-8000-000000000099'),
  0,
  'a returning founder webhook writes no founding_cap_fallbacks row'
);
select is(
  (select founding_member from public.profiles where id = 'f3000000-0000-4000-8000-000000000099'),
  true,
  'a returning founder keeps the lifetime price lock'
);
select is(
  (select count(*)::int from private.founding_slots where status = 'active'),
  (select n from returning_active_before),
  'a returning founder webhook does not change the founder count'
);
select is(
  (select count(*)::int from private.founding_slots),
  (select n from returning_slots_before),
  'a returning founder webhook creates no new founding_slots row'
);

select * from finish();
rollback;
