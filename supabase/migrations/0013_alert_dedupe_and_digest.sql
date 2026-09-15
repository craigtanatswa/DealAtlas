-- DealAtlas migration 0013
-- Alert deduplication and digest cursor. Alerts remain server-only.

alter table public.alerts
  add column if not exists dedupe_key text;

update public.alerts
set dedupe_key = concat_ws(
  ':',
  alert_type::text,
  coalesce(deal_id::text, 'none'),
  id::text
)
where dedupe_key is null;

alter table public.alerts
  alter column dedupe_key set not null;

create unique index if not exists alerts_user_dedupe_key_uidx
  on public.alerts (user_id, dedupe_key);

create index if not exists alerts_user_status_created_idx
  on public.alerts (user_id, status, created_at desc);

alter table public.notification_preferences
  add column if not exists last_digest_sent_at timestamptz;

-- No anon/authenticated grants on alerts. Digest timestamps are worker-written.
