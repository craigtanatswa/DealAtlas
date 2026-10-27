-- Craig's ruling (19 Oct 2026): cancelling ends founding status and price,
-- the place stays used, and there is no rejoin. Synthetic users only.
begin;
select no_plan();

insert into auth.users (id, email)
select ('f4000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'cancel-norejoin-' || i::text || '@example.test'
from generate_series(1, 3) as i;

-- User 1 becomes a founder.
select is(
  public.reserve_founding_slot('f4000000-0000-4000-8000-000000000001'),
  'reserved',
  'a new user reserves a founding place'
);
select is(
  public.claim_founding_activation('evt_cnr_activate', 'sub_cnr_1', 'f4000000-0000-4000-8000-000000000001'),
  true,
  'the paid reservation becomes a founder'
);

create temp table used_before as
select 25 - public.founding_availability() as n;

select public.close_founding_membership('f4000000-0000-4000-8000-000000000001');

select is(
  (select founding_member from public.profiles where id = 'f4000000-0000-4000-8000-000000000001'),
  false,
  'cancel clears founding_member'
);
select is(
  (select status from private.founding_slots where user_id = 'f4000000-0000-4000-8000-000000000001'),
  'ended',
  'cancel keeps the slot row, marked ended'
);
select is(
  25 - public.founding_availability(),
  (select n from used_before),
  'cancel does not change the places used count'
);

create temp table ended_at_first as
select ended_at from private.founding_slots where user_id = 'f4000000-0000-4000-8000-000000000001';

-- Replay the cancel twice: no-op.
select public.close_founding_membership('f4000000-0000-4000-8000-000000000001');
select public.close_founding_membership('f4000000-0000-4000-8000-000000000001');
select is(
  (select ended_at from private.founding_slots where user_id = 'f4000000-0000-4000-8000-000000000001'),
  (select ended_at from ended_at_first),
  'a replayed cancel keeps the first ended_at'
);
select is(
  25 - public.founding_availability(),
  (select n from used_before),
  'a replayed cancel does not change the places used count'
);
select is(
  (select count(*)::int from private.founding_slots where user_id = 'f4000000-0000-4000-8000-000000000001'),
  1,
  'a replayed cancel keeps exactly one slot row'
);

-- Places remain, but the ex-founder is refused.
select ok(public.founding_availability() > 0, 'places remain');
select is(
  public.reserve_founding_slot('f4000000-0000-4000-8000-000000000001'),
  'ineligible',
  'an ex-founder is refused founding even with places left'
);
select is(
  (select status from private.founding_slots where user_id = 'f4000000-0000-4000-8000-000000000001'),
  'ended',
  'a refused reserve does not reopen the place'
);

-- A late or replayed ACTIVE webhook (new event id) does not restore founding.
select is(
  public.claim_founding_activation('evt_cnr_late_active', 'sub_cnr_1', 'f4000000-0000-4000-8000-000000000001'),
  false,
  'a late activation never restores founding'
);
select is(
  (select founding_member from public.profiles where id = 'f4000000-0000-4000-8000-000000000001'),
  false,
  'founding_member stays false after a late activation'
);
select is(
  public.activate_founding_slot('f4000000-0000-4000-8000-000000000001'),
  'closed',
  'activate refuses an ended place'
);

-- A current founder is not offered another founding place either.
select public.reserve_founding_slot('f4000000-0000-4000-8000-000000000002');
select public.claim_founding_activation('evt_cnr_activate_2', 'sub_cnr_2', 'f4000000-0000-4000-8000-000000000002');
select is(
  public.reserve_founding_slot('f4000000-0000-4000-8000-000000000002'),
  'ineligible',
  'reserve never answers active for a founder'
);

-- Cap full: a new user is still sold out, and the ended place counts.
insert into auth.users (id, email)
select ('f4000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'cancel-norejoin-' || i::text || '@example.test'
from generate_series(10, 40) as i;

do $$
declare
  i integer;
begin
  for i in 10..40 loop
    perform public.reserve_founding_slot(('f4000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid);
  end loop;
end $$;

select is(public.founding_availability(), 0, 'the cap fills with the ended place still counted');
select is(
  public.reserve_founding_slot('f4000000-0000-4000-8000-000000000003'),
  'sold_out',
  'a new user is sold out when the cap is full'
);

select * from finish();
rollback;
