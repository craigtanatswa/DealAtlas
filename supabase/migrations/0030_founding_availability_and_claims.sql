-- Counts-only founding availability, and one founder per processed event
-- and per Dodo subscription. Replays and later events for the same
-- subscription do not take another slot.

create table if not exists private.founding_event_claims (
  provider_event_id text primary key,
  dodo_subscription_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default pg_catalog.now(),
  unique (dodo_subscription_id)
);

revoke all on table private.founding_event_claims from public, anon, authenticated, service_role;

create or replace function public.founding_availability()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, 25 - private.founding_slot_held(pg_catalog.now()));
$$;

create or replace function public.claim_founding_activation(
  p_event_id text,
  p_subscription_id text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_id is null or length(btrim(p_event_id)) = 0
     or p_subscription_id is null or length(btrim(p_subscription_id)) = 0
     or p_user_id is null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dealatlas-founding-slots'));

  insert into private.founding_event_claims (provider_event_id, dodo_subscription_id, user_id)
  values (p_event_id, p_subscription_id, p_user_id);

  if public.activate_founding_slot(p_user_id) = 'founder' then
    return true;
  end if;

  update private.founding_cap_fallbacks
  set provider_event_id = p_event_id,
      dodo_subscription_id = p_subscription_id
  where id = (
    select f.id
    from private.founding_cap_fallbacks f
    where f.user_id = p_user_id
      and f.provider_event_id is null
    order by f.id desc
    limit 1
  );

  return false;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.founding_availability() from public, anon, authenticated;
revoke all on function public.claim_founding_activation(text, text, uuid) from public, anon, authenticated;

grant execute on function public.founding_availability() to service_role;
grant execute on function public.claim_founding_activation(text, text, uuid) to service_role;
