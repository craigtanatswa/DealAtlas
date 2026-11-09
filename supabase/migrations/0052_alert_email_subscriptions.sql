-- Free email-only alert signup (double opt-in).
-- Subscriptions are keyed by normalised email and store only public preview
-- attributes (main_category, broad_region). Service role only: no anon or
-- authenticated grants. Rate-limit counters live in private.*.

create table public.alert_email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  status text not null check (status in ('pending', 'active', 'unsubscribed')),
  main_category text,
  broad_region text,
  source text not null default 'deal_page',
  user_id uuid references public.profiles(id) on delete set null,
  confirm_token_hash text,
  confirm_expires_at timestamptz,
  unsubscribe_token_hash text not null,
  confirmation_email_count integer not null default 0
    check (confirmation_email_count >= 0),
  last_confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  constraint alert_email_subscriptions_email_len
    check (char_length(email_normalized) between 3 and 320)
);

create index alert_email_subscriptions_email_idx
  on public.alert_email_subscriptions (email_normalized);

create index alert_email_subscriptions_email_status_idx
  on public.alert_email_subscriptions (email_normalized, status);

create unique index alert_email_subscriptions_confirm_hash_uidx
  on public.alert_email_subscriptions (confirm_token_hash)
  where confirm_token_hash is not null;

create unique index alert_email_subscriptions_unsub_hash_uidx
  on public.alert_email_subscriptions (unsubscribe_token_hash);

create index alert_email_subscriptions_user_idx
  on public.alert_email_subscriptions (user_id)
  where user_id is not null;

alter table public.alert_email_subscriptions enable row level security;

revoke all on table public.alert_email_subscriptions from public;
revoke all on table public.alert_email_subscriptions from anon;
revoke all on table public.alert_email_subscriptions from authenticated;
-- service_role uses the admin client and bypasses RLS; keep grants minimal.
grant select, insert, update on table public.alert_email_subscriptions to service_role;

create table private.alert_signup_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null default 0 check (hit_count >= 0)
);

revoke all on table private.alert_signup_rate_limits
  from public, anon, authenticated, service_role;

create or replace function private.hit_alert_signup_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_started timestamptz;
  v_count integer;
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 then
    allowed := false;
    remaining := 0;
    reset_at := v_now + v_window;
    return next;
    return;
  end if;

  insert into private.alert_signup_rate_limits as r (bucket_key, window_started_at, hit_count)
  values (p_bucket_key, v_now, 1)
  on conflict (bucket_key) do update
    set
      window_started_at = case
        when r.window_started_at + v_window <= v_now then v_now
        else r.window_started_at
      end,
      hit_count = case
        when r.window_started_at + v_window <= v_now then 1
        else r.hit_count + 1
      end
  returning r.window_started_at, r.hit_count
  into v_started, v_count;

  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at := v_started + v_window;
  return next;
end;
$$;

revoke all on function private.hit_alert_signup_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function private.hit_alert_signup_rate_limit(text, integer, integer)
  to service_role;

create or replace function public.hit_alert_signup_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select * from private.hit_alert_signup_rate_limit(p_bucket_key, p_limit, p_window_seconds);
$$;

revoke all on function public.hit_alert_signup_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.hit_alert_signup_rate_limit(text, integer, integer)
  to service_role;
