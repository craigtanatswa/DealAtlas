-- A fully refunded or lost-chargeback Pro subscription must stop granting Pro
-- immediately, not at current_period_end, and must be terminal for that
-- provider subscription id. Keep the existing status enum and add an explicit
-- durable marker so the row is recognisably revoked.

alter table public.subscriptions
  add column if not exists revoked_at timestamptz,
  add column if not exists revoke_reason text;

-- Resolve refund/dispute webhooks (which may not carry a subscription id) back
-- to the original payment.succeeded event by the provider payment id.
create index if not exists billing_events_payment_succeeded_payment_id_idx
  on public.billing_events ((payload->'data'->>'payment_id'))
  where event_type = 'payment.succeeded';

create or replace function private.protect_revoked_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Revoked is terminal for the same subscription row. Later provider events
  -- may update unrelated mirror fields, but cannot clear the marker or
  -- re-grant Pro by moving the status back to ACTIVE.
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;
    new.revoke_reason := old.revoke_reason;
    new.status := 'EXPIRED'::public.subscription_status;
    new.cancel_at_period_end := false;
  end if;
  return new;
end;
$$;

revoke execute on function private.protect_revoked_subscription()
  from public, anon, authenticated;

drop trigger if exists protect_revoked_subscription on public.subscriptions;
create trigger protect_revoked_subscription
before update
on public.subscriptions
for each row execute function private.protect_revoked_subscription();

drop function if exists public.revoke_subscription_access(text, text, text, text);

create or replace function public.revoke_subscription_access(
  p_event_id text,
  p_subscription_id text,
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
  if p_event_id is null or btrim(p_event_id) = ''
     or p_subscription_id is null or btrim(p_subscription_id) = '' then
    return 'invalid';
  end if;

  update public.subscriptions s
  set status = 'EXPIRED',
      revoked_at = coalesce(s.revoked_at, pg_catalog.now()),
      revoke_reason = coalesce(s.revoke_reason, p_reason),
      cancel_at_period_end = false,
      updated_at = pg_catalog.now()
  where s.revoked_at is null
    and s.dodo_subscription_id = p_subscription_id
  returning s.user_id into v_user_id;

  if v_user_id is not null then
    return 'revoked';
  end if;

  if exists (
    select 1
    from public.subscriptions s
    where s.dodo_subscription_id = p_subscription_id
  ) then
    return 'already_revoked';
  end if;

  return 'not_found';
end;
$$;

revoke all on function public.revoke_subscription_access(text, text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_subscription_access(text, text, text)
  to service_role;

comment on function public.revoke_subscription_access(text, text, text) is
  'Service-role only. Terminal local revocation after a full refund or lost chargeback.';

-- Pro is either a paid-through non-revoked subscription or an active lifetime
-- grant. Keep the existing subscription and lifetime rules, adding only the
-- revoked marker to the subscription branch.
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
      and s.revoked_at is null
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
