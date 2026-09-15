-- DealAtlas migration 0010
-- Intelligence provenance plus server-only preview generation audit.
-- Application leak scanning is the primary control; the deal_previews trigger remains a failsafe.

alter table public.deal_insights
  add column if not exists generation_method text
    check (generation_method is null or generation_method in ('RULES', 'LLM', 'HYBRID')),
  add column if not exists field_provenance jsonb not null default '{}'::jsonb,
  add column if not exists competition_level text
    check (competition_level is null or competition_level in ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'));

comment on column public.deal_insights.generation_method is
  'Overall DealAtlas generation method. Inference, not an official source fact.';
comment on column public.deal_insights.field_provenance is
  'Per-field provenance: method, model/version, confidence, evidence references, generated_at.';
comment on column public.deal_insights.competition_level is
  'DealAtlas inferred competition level. Inference, not an official source fact.';

create table if not exists public.preview_generation_runs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  leakage_risk public.leakage_risk not null,
  is_published boolean not null default false,
  findings jsonb not null default '[]'::jsonb,
  generation_method text,
  model_version text,
  preview_title text,
  preview_summary text,
  created_at timestamptz not null default now()
);

create index if not exists preview_generation_runs_deal_idx
  on public.preview_generation_runs (deal_id, created_at desc);

alter table public.preview_generation_runs enable row level security;
revoke all on table public.preview_generation_runs from public, anon, authenticated;
grant all on table public.preview_generation_runs to service_role;

comment on table public.preview_generation_runs is
  'Server-only leak-scan and publish audit for admin review. Not readable by anon or authenticated clients.';
