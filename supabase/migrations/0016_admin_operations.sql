-- DealAtlas migration 0016
-- Admin operations: unpublished preview hold, organisation merge, audit log.

alter table public.deal_previews
  add column if not exists unpublished_by_admin boolean not null default false;

comment on column public.deal_previews.unpublished_by_admin is
  'Admin hold. When true the preview stays unpublished even if leakage_risk is LOW.';

create or replace function private.enforce_preview_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  detected public.leakage_risk;
begin
  detected := private.detect_preview_leakage(new.deal_id, new.preview_title, new.preview_summary, new.requirements_preview);

  if detected = 'HIGH' then
    new.leakage_risk := 'HIGH';
    new.is_published := false;
  elsif detected = 'REVIEW' then
    if new.leakage_risk = 'LOW' then
      new.leakage_risk := 'REVIEW';
    end if;
    new.is_published := false;
  elsif new.leakage_risk <> 'LOW' then
    -- A deterministic LOW result does not override an application/manual REVIEW/HIGH status.
    new.is_published := false;
  end if;

  if new.unpublished_by_admin then
    new.is_published := false;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_preview_safety() from public, anon, authenticated;

drop trigger if exists enforce_preview_safety on public.deal_previews;
create trigger enforce_preview_safety
before insert or update of preview_title, preview_summary, requirements_preview, leakage_risk, is_published, unpublished_by_admin
on public.deal_previews
for each row execute function private.enforce_preview_safety();

create or replace function private.merge_organizations(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'merge requires two distinct organization ids';
  end if;

  if not exists (select 1 from public.organizations where id = p_keep) then
    raise exception 'keep organization not found';
  end if;

  if not exists (select 1 from public.organizations where id = p_drop) then
    raise exception 'drop organization not found';
  end if;

  update public.organization_identifiers as dropped
  set organization_id = p_keep
  where organization_id = p_drop
    and not exists (
      select 1
      from public.organization_identifiers as kept
      where kept.scheme = dropped.scheme
        and kept.value = dropped.value
    );
  delete from public.organization_identifiers where organization_id = p_drop;

  update public.organization_aliases as dropped
  set organization_id = p_keep
  where organization_id = p_drop
    and not exists (
      select 1
      from public.organization_aliases as kept
      where kept.organization_id = p_keep
        and kept.normalized_alias = dropped.normalized_alias
    );
  delete from public.organization_aliases where organization_id = p_drop;

  update public.organization_contacts
  set organization_id = p_keep
  where organization_id = p_drop;

  update public.deals
  set buyer_organization_id = p_keep
  where buyer_organization_id = p_drop;

  delete from public.deal_organizations as dropped
  where dropped.organization_id = p_drop
    and exists (
      select 1
      from public.deal_organizations as kept
      where kept.deal_id = dropped.deal_id
        and kept.role = dropped.role
        and kept.organization_id = p_keep
        and kept.lot_id is not distinct from dropped.lot_id
    );
  update public.deal_organizations
  set organization_id = p_keep
  where organization_id = p_drop;

  delete from public.award_suppliers as dropped
  where dropped.organization_id = p_drop
    and exists (
      select 1
      from public.award_suppliers as kept
      where kept.award_id = dropped.award_id
        and kept.organization_id = p_keep
    );
  update public.award_suppliers
  set organization_id = p_keep
  where organization_id = p_drop;

  update public.contract_payments
  set buyer_organization_id = p_keep
  where buyer_organization_id = p_drop;

  update public.contract_payments
  set supplier_organization_id = p_keep
  where supplier_organization_id = p_drop;

  update public.contract_performance
  set supplier_organization_id = p_keep
  where supplier_organization_id = p_drop;

  update public.deal_insights
  set incumbent_organization_id = p_keep
  where incumbent_organization_id = p_drop;

  delete from public.watched_organizations as dropped
  where dropped.organization_id = p_drop
    and exists (
      select 1
      from public.watched_organizations as kept
      where kept.user_id = dropped.user_id
        and kept.organization_id = p_keep
        and kept.watch_type = dropped.watch_type
    );
  update public.watched_organizations
  set organization_id = p_keep
  where organization_id = p_drop;

  update public.alerts
  set organization_id = p_keep
  where organization_id = p_drop;

  update public.commercial_tool_members
  set organization_id = p_keep
  where organization_id = p_drop;

  insert into public.organization_aliases (organization_id, alias, normalized_alias)
  select p_keep, source.canonical_name, source.normalized_name
  from public.organizations as source
  where source.id = p_drop
  on conflict (organization_id, normalized_alias) do nothing;

  delete from public.organizations where id = p_drop;
end;
$$;

revoke execute on function private.merge_organizations(uuid, uuid) from public, anon, authenticated;
grant execute on function private.merge_organizations(uuid, uuid) to service_role;

create or replace function public.admin_merge_organizations(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.merge_organizations(p_keep, p_drop);
end;
$$;

revoke execute on function public.admin_merge_organizations(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_merge_organizations(uuid, uuid) to service_role;

comment on function public.admin_merge_organizations(uuid, uuid) is
  'Service-role organisation merge used by the admin console after an application ADMIN check.';

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_idx
  on public.admin_audit_events (created_at desc);

create index if not exists admin_audit_events_entity_idx
  on public.admin_audit_events (entity_type, entity_id);

alter table public.admin_audit_events enable row level security;
revoke all on table public.admin_audit_events from public, anon, authenticated;
grant all on table public.admin_audit_events to service_role;

comment on table public.admin_audit_events is
  'Server-only audit of meaningful admin mutations. Not readable by anon or authenticated clients.';
