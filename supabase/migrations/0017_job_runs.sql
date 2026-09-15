-- DealAtlas migration 0017
-- Server-only operational job run history for scheduled ingestion, alerts, and checks.

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  trigger_type text not null default 'SCHEDULED',
  status public.ingestion_status not null default 'RUNNING',
  mode text not null default 'live'
    check (mode in ('live', 'test', 'dry-run')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists job_runs_job_started_idx
  on public.job_runs (job_name, started_at desc);

create index if not exists job_runs_status_started_idx
  on public.job_runs (status, started_at desc);

alter table public.job_runs enable row level security;
revoke all on table public.job_runs from public, anon, authenticated;
grant all on table public.job_runs to service_role;

comment on table public.job_runs is
  'Server-only history of scheduled ingestion, preview, alert, renewal, and data-quality jobs. Not readable by anon or authenticated clients.';
