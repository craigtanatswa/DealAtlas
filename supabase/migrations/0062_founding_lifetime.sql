-- Lifetime Pro replaces the retired founding annual subscription. Payments
-- are one-time, so entitlement comes from a grant row rather than a period.
-- A grant still claims/counts a founding place (cap 25) and a reversal ends
-- that place without releasing it, matching the founding cancellation rule.

create table if not exists public.lifetime_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  dodo_payment_id text not null unique,
  dodo_customer_id text,
  dodo_product_id text not null,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  granted_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  revoke_reason text,
  grant_event_id text not null,
  revoke_event_id text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create unique index if not exists lifetime_grants_one_active_per_user
  on public.lifetime_grants (user_id)
  where status = 'active';

alter table public.lifetime_grants enable row level security;

revoke all on table public.lifetime_grants from public, anon, authenticated;
grant select, insert, update on table public.lifetime_grants to service_role;

create or replace function public.grant_lifetime_access(
  p_event_id text,
  p_payment_id text,
  p_user_id uuid,
  p_customer_id text,
  p_product_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot text;
  v_fallback_id bigint;
begin
  if p_event_id is null or p_payment_id is null or p_user_id is null
     or p_product_id is null
     or btrim(p_event_id) = '' or btrim(p_payment_id) = ''
     or btrim(p_product_id) = '' then
    return 'invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dealatlas-founding-slots'));

  if exists (
    select 1 from public.lifetime_grants g
    where g.dodo_payment_id = p_payment_id
  ) then
    return 'duplicate';
  end if;

  if exists (
    select 1 from public.lifetime_grants g
    where g.user_id = p_user_id and g.status = 'active'
  ) then
    return 'duplicate_user';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return 'invalid';
  end if;

  begin
    insert into public.lifetime_grants (
      user_id,
      dodo_payment_id,
      dodo_customer_id,
      dodo_product_id,
      status,
      granted_at,
      grant_event_id
    )
    values (
      p_user_id,
      p_payment_id,
      p_customer_id,
      p_product_id,
      'active',
      pg_catalog.now(),
      p_event_id
    );
  exception when unique_violation then
    if exists (
      select 1 from public.lifetime_grants g
      where g.dodo_payment_id = p_payment_id
    ) then
      return 'duplicate';
    end if;
    return 'duplicate_user';
  end;

  v_slot := public.activate_founding_slot(p_user_id);
  if v_slot in ('standard', 'closed') then
    select f.id into v_fallback_id
    from private.founding_cap_fallbacks f
    where f.user_id = p_user_id
    order by f.id desc
    limit 1;

    if v_fallback_id is not null then
      update private.founding_cap_fallbacks
      set provider_event_id = p_event_id,
          dodo_subscription_id = p_payment_id
      where id = v_fallback_id;
    else
      insert into private.founding_cap_fallbacks (
        user_id,
        provider_event_id,
        dodo_subscription_id,
        held_count
      )
      values (
        p_user_id,
        p_event_id,
        p_payment_id,
        private.founding_slot_held(pg_catalog.now())
      );
    end if;

    update public.profiles
    set founding_member = true,
        founding_since = coalesce(founding_since, pg_catalog.now())
    where id = p_user_id;

    return 'granted_over_cap';
  end if;

  return 'granted';
end;
$$;

create or replace function public.revoke_lifetime_access(
  p_event_id text,
  p_payment_id text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_event_id is null or p_payment_id is null
     or btrim(p_event_id) = '' or btrim(p_payment_id) = '' then
    return 'invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dealatlas-founding-slots'));

  update public.lifetime_grants
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, pg_catalog.now()),
      revoke_reason = coalesce(revoke_reason, p_reason),
      revoke_event_id = p_event_id,
      updated_at = pg_catalog.now()
  where dodo_payment_id = p_payment_id
    and status = 'active'
  returning user_id into v_user_id;

  if v_user_id is not null then
    perform public.close_founding_membership(v_user_id);
    return 'revoked';
  end if;

  if exists (
    select 1 from public.lifetime_grants g
    where g.dodo_payment_id = p_payment_id
  ) then
    return 'already_revoked';
  end if;

  return 'not_found';
end;
$$;

revoke all on function public.grant_lifetime_access(text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.revoke_lifetime_access(text, text, text) from public, anon, authenticated;

grant execute on function public.grant_lifetime_access(text, text, uuid, text, text) to service_role;
grant execute on function public.revoke_lifetime_access(text, text, text) to service_role;

-- Pro is either a paid-through subscription or an active lifetime grant.
-- Keep the existing subscription rule byte-for-byte and OR the grant.
create or replace function private.is_user_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.is_current = true
      and s.current_period_end is not null
      and s.current_period_end > now()
      and (
        s.status = 'ACTIVE'
        or (s.status = 'CANCELLED' and s.cancel_at_period_end = true)
      )
  )
  or exists (
    select 1
    from public.lifetime_grants g
    where g.user_id = p_user_id
      and g.status = 'active'
  );
$$;

revoke execute on function private.is_user_pro(uuid) from public, anon, authenticated;
