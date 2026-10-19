-- Craig's ruling (19 Oct 2026): a Founding member who cancels loses founding
-- status and the founding price, can never rejoin Founding, and the place is
-- NOT freed. The slot row moves to 'ended' and still counts as used.
-- Replaces the #27 behaviour where cancel kept founding_member and a returning
-- founder could buy the founding product again.

alter table private.founding_slots
  add column if not exists ended_at timestamptz;

alter table private.founding_slots
  drop constraint if exists founding_slots_status_check;
alter table private.founding_slots
  add constraint founding_slots_status_check
  check (status in ('reserved', 'active', 'released', 'ended'));

-- Ended places stay counted as used.
create or replace function private.founding_slot_held(p_now timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from private.founding_slots s
  where s.status in ('active', 'ended')
     or (s.status = 'reserved' and s.expires_at is not null and s.expires_at > p_now);
$$;

revoke all on function private.founding_slot_held(timestamptz) from public, anon, authenticated, service_role;

-- 'ineligible': the user holds or has held a founding place (current founder,
-- active slot, or ended slot). Never 'active' any more.
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

  select s.status, s.expires_at
    into v_status, v_expires
  from private.founding_slots s
  where s.user_id = p_user_id;

  if v_member is true or v_status in ('active', 'ended') then
    return 'ineligible';
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
  where private.founding_slots.status not in ('active', 'ended');

  return 'reserved';
end;
$$;

-- An ended place is never re-activated (late or replayed ACTIVE webhooks,
-- or a stale founding checkout). The user is billed as standard.
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

  if v_status = 'ended' then
    return 'closed';
  end if;

  if v_member is true then
    insert into private.founding_slots (user_id, status, expires_at, activated_at)
    values (p_user_id, 'active', null, pg_catalog.now())
    on conflict (user_id) do update
      set status = 'active',
          expires_at = null,
          activated_at = coalesce(private.founding_slots.activated_at, pg_catalog.now()),
          released_at = null
    where private.founding_slots.status <> 'ended';
    return 'founder';
  end if;

  if v_status = 'active' then
    return 'closed';
  end if;

  v_live := v_status = 'reserved'
    and v_expires is not null
    and v_expires > pg_catalog.now();

  select count(*)::int into v_others
  from private.founding_slots s
  where s.user_id is distinct from p_user_id
    and (
      s.status in ('active', 'ended')
      or (s.status = 'reserved' and s.expires_at is not null and s.expires_at > pg_catalog.now())
    );

  if v_live or v_others < 25 then
    insert into private.founding_slots (user_id, status, expires_at, activated_at)
    values (p_user_id, 'active', null, pg_catalog.now())
    on conflict (user_id) do update
      set status = 'active',
          expires_at = null,
          activated_at = coalesce(private.founding_slots.activated_at, pg_catalog.now()),
          released_at = null
    where private.founding_slots.status <> 'ended';

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

-- Cancel or expiry: founding status and price end; the place stays used.
-- Idempotent: a replayed cancel changes nothing (ended_at keeps its first value).
create or replace function public.close_founding_membership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dealatlas-founding-slots'));

  update private.founding_slots
  set status = 'ended',
      expires_at = null,
      ended_at = coalesce(ended_at, pg_catalog.now())
  where user_id = p_user_id
    and status in ('active', 'ended');

  update public.profiles
  set founding_member = false
  where id = p_user_id
    and founding_member is true;
end;
$$;

revoke all on function public.reserve_founding_slot(uuid) from public, anon, authenticated;
revoke all on function public.activate_founding_slot(uuid) from public, anon, authenticated;
revoke all on function public.close_founding_membership(uuid) from public, anon, authenticated;

grant execute on function public.reserve_founding_slot(uuid) to service_role;
grant execute on function public.activate_founding_slot(uuid) to service_role;
grant execute on function public.close_founding_membership(uuid) to service_role;
