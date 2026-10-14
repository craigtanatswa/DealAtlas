-- Founding Member slots. The first 25 successful annual checkouts stay on the
-- founding product. A cancelled founder does not free the slot. Reservations
-- that are not paid within 30 minutes stop counting. Test and Preview only;
-- the app ignores this path when Dodo is in live_mode.

alter table public.profiles
  add column if not exists founding_member boolean not null default false,
  add column if not exists founding_since timestamptz;

create table if not exists private.founding_slots (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null check (status in ('reserved', 'active', 'released')),
  expires_at timestamptz,
  reserved_at timestamptz not null default pg_catalog.now(),
  activated_at timestamptz,
  released_at timestamptz
);

revoke all on table private.founding_slots from public, anon, authenticated, service_role;

create table if not exists private.founding_cap_fallbacks (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  provider_event_id text,
  dodo_subscription_id text,
  held_count integer not null,
  created_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.founding_cap_fallbacks from public, anon, authenticated, service_role;

create or replace function private.founding_slot_held(p_now timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from private.founding_slots s
  where s.status = 'active'
     or (s.status = 'reserved' and s.expires_at is not null and s.expires_at > p_now);
$$;

revoke all on function private.founding_slot_held(timestamptz) from public, anon, authenticated, service_role;

create or replace function public.reserve_founding_slot(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_expires timestamptz;
  v_member boolean;
  v_held integer;
begin
  if p_user_id is null then
    return 'sold_out';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dealatlas-founding-slots'));

  select p.founding_member into v_member
  from public.profiles p
  where p.id = p_user_id;

  -- Lifetime founders skip the cap and do not take another slot.
  if v_member is true then
    return 'active';
  end if;

  select s.status, s.expires_at
    into v_status, v_expires
  from private.founding_slots s
  where s.user_id = p_user_id;

  if v_status = 'active' then
    return 'closed';
  end if;

  if v_status = 'reserved' and v_expires is not null and v_expires > pg_catalog.now() then
    return 'reserved';
  end if;

  select private.founding_slot_held(pg_catalog.now()) into v_held;
  if v_held >= 25 then
    return 'sold_out';
  end if;

  insert into private.founding_slots (user_id, status, expires_at, reserved_at, released_at)
  values (p_user_id, 'reserved', pg_catalog.now() + interval '30 minutes', pg_catalog.now(), null)
  on conflict (user_id) do update
    set status = 'reserved',
        expires_at = pg_catalog.now() + interval '30 minutes',
        reserved_at = pg_catalog.now(),
        released_at = null
  where private.founding_slots.status is distinct from 'active';

  return 'reserved';
end;
$$;

create or replace function public.activate_founding_slot(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_expires timestamptz;
  v_member boolean;
  v_live boolean;
  v_others integer;
begin
  if p_user_id is null then
    return 'standard';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dealatlas-founding-slots'));

  select s.status, s.expires_at
    into v_status, v_expires
  from private.founding_slots s
  where s.user_id = p_user_id;

  select p.founding_member into v_member
  from public.profiles p
  where p.id = p_user_id;

  if v_member is true then
    insert into private.founding_slots (user_id, status, expires_at, activated_at)
    values (p_user_id, 'active', null, pg_catalog.now())
    on conflict (user_id) do update
      set status = 'active',
          expires_at = null,
          activated_at = coalesce(private.founding_slots.activated_at, pg_catalog.now()),
          released_at = null;
    return 'founder';
  end if;

  if v_status = 'active' and v_member is not true then
    return 'closed';
  end if;

  v_live := v_status = 'reserved'
    and v_expires is not null
    and v_expires > pg_catalog.now();

  select count(*)::int into v_others
  from private.founding_slots s
  where s.user_id is distinct from p_user_id
    and (
      s.status = 'active'
      or (s.status = 'reserved' and s.expires_at is not null and s.expires_at > pg_catalog.now())
    );

  if v_live or v_others < 25 then
    insert into private.founding_slots (user_id, status, expires_at, activated_at)
    values (p_user_id, 'active', null, pg_catalog.now())
    on conflict (user_id) do update
      set status = 'active',
          expires_at = null,
          activated_at = coalesce(private.founding_slots.activated_at, pg_catalog.now()),
          released_at = null;

    update public.profiles
    set founding_member = true,
        founding_since = coalesce(founding_since, pg_catalog.now())
    where id = p_user_id;

    return 'founder';
  end if;

  update private.founding_slots
  set status = 'released',
      released_at = pg_catalog.now(),
      expires_at = pg_catalog.now()
  where user_id = p_user_id
    and status = 'reserved';

  insert into private.founding_cap_fallbacks (user_id, held_count)
  values (p_user_id, v_others);

  return 'standard';
end;
$$;

create or replace function public.release_founding_reservation(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  update private.founding_slots
  set status = 'released',
      released_at = pg_catalog.now(),
      expires_at = pg_catalog.now()
  where user_id = p_user_id
    and status = 'reserved';
end;
$$;

create or replace function public.close_founding_membership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The £290 price stays with the customer after cancel or expiry.
  -- The slot stays occupied. A later checkout uses the founding product
  -- and does not take a new place in the 25.
  if p_user_id is null then
    return;
  end if;
end;
$$;

create or replace function public.founding_offer()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_remaining integer;
begin
  v_remaining := 25 - private.founding_slot_held(pg_catalog.now());
  if v_remaining <= 0 then
    return 'sold_out';
  end if;
  if v_remaining < 10 then
    return 'fewer_than_10';
  end if;
  return 'open';
end;
$$;

revoke all on function public.reserve_founding_slot(uuid) from public, anon, authenticated;
revoke all on function public.activate_founding_slot(uuid) from public, anon, authenticated;
revoke all on function public.release_founding_reservation(uuid) from public, anon, authenticated;
revoke all on function public.close_founding_membership(uuid) from public, anon, authenticated;
revoke all on function public.founding_offer() from public, anon, authenticated;

grant execute on function public.reserve_founding_slot(uuid) to service_role;
grant execute on function public.activate_founding_slot(uuid) to service_role;
grant execute on function public.release_founding_reservation(uuid) to service_role;
grant execute on function public.close_founding_membership(uuid) to service_role;
grant execute on function public.founding_offer() to service_role;
