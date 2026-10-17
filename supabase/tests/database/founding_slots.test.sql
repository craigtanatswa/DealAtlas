-- Founding slot cap. Synthetic users only.
begin;
select no_plan();

create temp table founding_results (
  n integer primary key,
  user_id uuid not null,
  result text not null
);

do $$
declare
  i integer;
  uid uuid;
  result text;
begin
  for i in 1..30 loop
    uid := ('f1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (id, email) values (uid, 'founding-' || i::text || '@example.test');
    result := public.reserve_founding_slot(uid);
    insert into founding_results (n, user_id, result) values (i, uid, result);
  end loop;
end $$;

select is(
  (select count(*)::int from founding_results where result = 'reserved'),
  25,
  'thirty reservations keep twenty-five slots'
);
select is(
  (select count(*)::int from founding_results where result = 'sold_out'),
  5,
  'the rest are sold out'
);
select is(
  public.reserve_founding_slot((select user_id from founding_results where n = 1)),
  'reserved',
  'a second call for the same user does not take another slot'
);

update private.founding_slots
set expires_at = pg_catalog.now() - interval '1 minute'
where user_id = (select user_id from founding_results where n = 1);

select is(
  public.reserve_founding_slot((select user_id from founding_results where n = 26)),
  'reserved',
  'an expired reservation frees a slot'
);

select public.activate_founding_slot((select user_id from founding_results where n = 2));
select public.close_founding_membership((select user_id from founding_results where n = 2));

select is(
  (select founding_member from public.profiles where id = (select user_id from founding_results where n = 2)),
  true,
  'cancel keeps the lifetime founding price'
);
select is(
  (select status from private.founding_slots where user_id = (select user_id from founding_results where n = 2)),
  'active',
  'cancel does not free the slot'
);
select is(
  public.reserve_founding_slot((select user_id from founding_results where n = 27)),
  'sold_out',
  'a cancelled founder slot is not reissued'
);

create temp table founder_count as
select count(*)::int as n from private.founding_slots where status = 'active';

create temp table offer_before as
select public.founding_availability() as n;

select is(
  public.reserve_founding_slot((select user_id from founding_results where n = 2)),
  'active',
  'a returning founder skips the reservation cap'
);
select is(
  public.claim_founding_activation(
    'evt_resubscribe',
    'sub_resubscribe',
    (select user_id from founding_results where n = 2)
  ),
  true,
  'a returning founder claims the founding product again'
);
select is(
  (select count(*)::int from private.founding_slots where status = 'active'),
  (select n from founder_count),
  'resubscribe does not change the founder count'
);
select is(
  (select founding_member from public.profiles where id = (select user_id from founding_results where n = 2)),
  true,
  'resubscribe keeps the lifetime price lock'
);
select is(
  public.founding_availability(),
  (select n from offer_before),
  'resubscribe does not change remaining slots'
);

select public.release_founding_reservation((select user_id from founding_results where n = 3));
select is(
  (select status from private.founding_slots where user_id = (select user_id from founding_results where n = 3)),
  'released',
  'a failed checkout releases only the reservation'
);
select is(
  public.reserve_founding_slot((select user_id from founding_results where n = 27)),
  'reserved',
  'a released reservation can be taken by someone else'
);

select ok(
  not has_function_privilege('anon', 'public.reserve_founding_slot(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.reserve_founding_slot(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.activate_founding_slot(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.activate_founding_slot(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.release_founding_reservation(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.release_founding_reservation(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.close_founding_membership(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.close_founding_membership(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.founding_offer()', 'execute')
  and not has_function_privilege('authenticated', 'public.founding_offer()', 'execute')
  and not has_table_privilege('anon', 'private.founding_slots', 'select')
  and not has_table_privilege('authenticated', 'private.founding_slots', 'select')
  and not has_table_privilege('service_role', 'private.founding_slots', 'select'),
  'anon, authenticated and service_role cannot read founding slots or call the functions as clients'
);
select ok(
  has_function_privilege('service_role', 'public.reserve_founding_slot(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.founding_offer()', 'execute'),
  'service_role can reserve and read the offer band'
);

select is(
  public.claim_founding_activation(
    'evt_founder_1',
    'sub_founder_1',
    (select user_id from founding_results where n = 4)
  ),
  true,
  'the first event marks one founder'
);
select is(
  public.claim_founding_activation(
    'evt_founder_1',
    'sub_founder_1',
    (select user_id from founding_results where n = 4)
  ),
  false,
  'replaying the same event does not mark another founder'
);
select is(
  public.claim_founding_activation(
    'evt_founder_2',
    'sub_founder_1',
    (select user_id from founding_results where n = 5)
  ),
  false,
  'a second event for the same subscription uses no extra slot'
);
select is(
  (select count(*)::int from private.founding_event_claims where dodo_subscription_id = 'sub_founder_1'),
  1,
  'one claim per subscription'
);
select is(
  (select founding_member from public.profiles where id = (select user_id from founding_results where n = 4)),
  true,
  'the claimed user is a founder'
);
select is(
  (select founding_member from public.profiles where id = (select user_id from founding_results where n = 5)),
  false,
  'the second event does not mark a founder'
);
select is(public.founding_availability() <= 25, true, 'availability is a count, not a user list');
select ok(
  not has_function_privilege('anon', 'public.claim_founding_activation(text, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_founding_activation(text, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.founding_availability()', 'execute')
  and not has_function_privilege('authenticated', 'public.founding_availability()', 'execute')
  and not has_table_privilege('anon', 'private.founding_event_claims', 'select')
  and not has_table_privilege('authenticated', 'private.founding_event_claims', 'select'),
  'clients cannot read founding claims or the raw count function'
);

-- Expired reservation, cap already full: standard Pro, no price lock.
insert into auth.users (id, email)
select ('f2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'cap-fill-' || i::text || '@example.test'
from generate_series(1, 25) as i;

insert into private.founding_slots (user_id, status, expires_at, activated_at)
select ('f2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'active',
       null,
       pg_catalog.now()
from generate_series(1, 25) as i
on conflict (user_id) do update
  set status = 'active', expires_at = null, activated_at = pg_catalog.now();

update public.profiles
set founding_member = true
where id in (
  select ('f2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
  from generate_series(1, 25) as i
);

insert into auth.users (id, email) values
  ('f2000000-0000-4000-8000-000000000099', 'expired-full@example.test'),
  ('f2000000-0000-4000-8000-000000000098', 'expired-spare@example.test');

insert into private.founding_slots (user_id, status, expires_at)
values
  ('f2000000-0000-4000-8000-000000000099', 'reserved', pg_catalog.now() - interval '1 minute'),
  ('f2000000-0000-4000-8000-000000000098', 'reserved', pg_catalog.now() - interval '1 minute');

select is(
  public.activate_founding_slot('f2000000-0000-4000-8000-000000000099'),
  'standard',
  'an expired reservation does not become a founder when the cap is full'
);
select is(
  (select founding_member from public.profiles where id = 'f2000000-0000-4000-8000-000000000099'),
  false,
  'a cap fallback does not price-lock the member'
);
select is(
  (select count(*)::int from private.founding_cap_fallbacks where user_id = 'f2000000-0000-4000-8000-000000000099'),
  1,
  'a cap fallback writes an id-only audit row'
);

update private.founding_slots
set status = 'released', expires_at = pg_catalog.now()
where user_id is distinct from 'f2000000-0000-4000-8000-000000000098';

select is(
  public.activate_founding_slot('f2000000-0000-4000-8000-000000000098'),
  'founder',
  'an expired reservation still founds when a slot is spare'
);
select is(
  (select founding_member from public.profiles where id = 'f2000000-0000-4000-8000-000000000098'),
  true,
  'spare cap sets founding status'
);

select * from finish();
rollback;
