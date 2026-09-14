-- DealAtlas migration 0005
-- Trigger functions, safety gates, search RPC and performance indexes.

-- -----------------------------------------------------------------------------
-- Updated-at helper
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.touch_updated_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Auth profile creation
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Backfill profiles safely if auth users existed before this migration.
insert into public.profiles (id, email, display_name)
select
  u.id,
  coalesce(u.email, ''),
  nullif(coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
on conflict (id) do nothing;

insert into public.notification_preferences (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- Entitlement helper for database-side quota triggers.
-- It is in a non-exposed schema and is not callable by ordinary client roles.
-- -----------------------------------------------------------------------------
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
      and (
        s.status = 'ACTIVE'
        or (
          s.status = 'CANCELLED'
          and s.cancel_at_period_end = true
          and s.current_period_end is not null
          and s.current_period_end > now()
        )
      )
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

revoke execute on function private.is_user_pro(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- User quota enforcement
-- -----------------------------------------------------------------------------
create or replace function private.enforce_saved_deal_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  max_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  max_count := case when private.is_user_pro(new.user_id) then 10000 else 5 end;
  select count(*) into current_count from public.saved_deals where user_id = new.user_id;
  if current_count >= max_count then
    raise exception 'saved deal limit reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_saved_deal_limit() from public, anon, authenticated;

drop trigger if exists enforce_saved_deal_limit on public.saved_deals;
create trigger enforce_saved_deal_limit
before insert on public.saved_deals
for each row execute function private.enforce_saved_deal_limit();

create or replace function private.enforce_saved_search_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  max_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 1));
  max_count := case when private.is_user_pro(new.user_id) then 50 else 1 end;
  select count(*) into current_count from public.saved_searches where user_id = new.user_id;
  if current_count >= max_count then
    raise exception 'saved search limit reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_saved_search_limit() from public, anon, authenticated;

drop trigger if exists enforce_saved_search_limit on public.saved_searches;
create trigger enforce_saved_search_limit
before insert on public.saved_searches
for each row execute function private.enforce_saved_search_limit();

create or replace function private.enforce_watch_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if not private.is_user_pro(new.user_id) then
    raise exception 'DealAtlas Pro subscription required to watch organizations';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.watch_type, 2));
  select count(*) into current_count
  from public.watched_organizations
  where user_id = new.user_id and watch_type = new.watch_type;

  if current_count >= 50 then
    raise exception 'organization watch limit reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_watch_limit() from public, anon, authenticated;

drop trigger if exists enforce_watch_limit on public.watched_organizations;
create trigger enforce_watch_limit
before insert on public.watched_organizations
for each row execute function private.enforce_watch_limit();

-- -----------------------------------------------------------------------------
-- Source compliance gates
-- -----------------------------------------------------------------------------
create or replace function private.enforce_source_enablement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.enabled then
    if new.reuse_status not in ('OPEN_LICENSE', 'PERMISSION_GRANTED', 'LICENSED', 'TERMS_REVIEWED') then
      raise exception 'source cannot be enabled with reuse status %', new.reuse_status;
    end if;

    if new.access_method in ('HTML', 'PDF_LINK_DISCOVERY') and new.scraping_permitted is not true then
      raise exception 'HTML/PDF discovery source cannot be enabled until scraping_permitted=true';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_source_enablement() from public, anon, authenticated;

drop trigger if exists enforce_source_enablement on public.data_sources;
create trigger enforce_source_enablement
before insert or update of enabled, reuse_status, access_method, scraping_permitted
on public.data_sources
for each row execute function private.enforce_source_enablement();

create or replace function private.enforce_ingestion_run_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.data_sources%rowtype;
begin
  if new.status not in ('QUEUED', 'RUNNING') then
    return new;
  end if;

  select * into s from public.data_sources where id = new.source_id;
  if not found then
    raise exception 'source not found';
  end if;
  if not s.enabled then
    raise exception 'source is disabled';
  end if;
  if s.reuse_status not in ('OPEN_LICENSE', 'PERMISSION_GRANTED', 'LICENSED', 'TERMS_REVIEWED') then
    raise exception 'source reuse status does not permit production ingestion';
  end if;
  if s.access_method in ('HTML', 'PDF_LINK_DISCOVERY') and s.scraping_permitted is not true then
    raise exception 'source scraping is not approved';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_ingestion_run_source() from public, anon, authenticated;

drop trigger if exists enforce_ingestion_run_source on public.ingestion_runs;
create trigger enforce_ingestion_run_source
before insert or update of status, source_id
on public.ingestion_runs
for each row execute function private.enforce_ingestion_run_source();

-- -----------------------------------------------------------------------------
-- Preview leakage failsafe.
-- The application-level scanner should be stricter. This database trigger catches
-- obvious identifiers before publication and never lowers a pre-existing risk.
-- -----------------------------------------------------------------------------
create or replace function private.detect_preview_leakage(
  p_deal_id uuid,
  p_preview_title text,
  p_preview_summary text,
  p_requirements jsonb
)
returns public.leakage_risk
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.deals%rowtype;
  o public.organizations%rowtype;
  combined text;
  a record;
begin
  select * into d from public.deals where id = p_deal_id;
  if not found then
    return 'HIGH';
  end if;

  combined := lower(
    coalesce(p_preview_title, '') || ' ' ||
    coalesce(p_preview_summary, '') || ' ' ||
    coalesce(p_requirements::text, '')
  );

  if combined ~* '(https?://|www\.|[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})' then
    return 'HIGH';
  end if;

  if d.ocid is not null and length(d.ocid) >= 6 and position(lower(d.ocid) in combined) > 0 then
    return 'HIGH';
  end if;

  if d.reference is not null and length(d.reference) >= 6 and position(lower(d.reference) in combined) > 0 then
    return 'HIGH';
  end if;

  if d.buyer_organization_id is not null then
    select * into o from public.organizations where id = d.buyer_organization_id;
    if found then
      if length(coalesce(o.canonical_name, '')) >= 4 and position(lower(o.canonical_name) in combined) > 0 then
        return 'HIGH';
      end if;
      if length(coalesce(o.domain, '')) >= 4 and position(lower(o.domain) in combined) > 0 then
        return 'HIGH';
      end if;

      for a in
        select alias
        from public.organization_aliases
        where organization_id = d.buyer_organization_id
      loop
        if length(coalesce(a.alias, '')) >= 5 and position(lower(a.alias) in combined) > 0 then
          return 'HIGH';
        end if;
      end loop;
    end if;
  end if;

  if length(coalesce(d.source_title, '')) >= 20
     and similarity(lower(d.source_title), lower(coalesce(p_preview_title, ''))) >= 0.80 then
    return 'REVIEW';
  end if;

  return 'LOW';
end;
$$;

revoke execute on function private.detect_preview_leakage(uuid, text, text, jsonb) from public, anon, authenticated;

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

  return new;
end;
$$;

revoke execute on function private.enforce_preview_safety() from public, anon, authenticated;

drop trigger if exists enforce_preview_safety on public.deal_previews;
create trigger enforce_preview_safety
before insert or update of preview_title, preview_summary, requirements_preview, leakage_risk, is_published
on public.deal_previews
for each row execute function private.enforce_preview_safety();

-- -----------------------------------------------------------------------------
-- Safe public search RPC. It only touches deal_previews.
-- -----------------------------------------------------------------------------
create or replace function public.search_deal_previews(
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  deal_id uuid,
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    dp.deal_id,
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.stage,
    dp.status,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.duration_band,
    dp.sme_suitability,
    dp.bid_complexity,
    dp.competition_level,
    dp.requirements_preview,
    dp.relevance_tags,
    dp.freshness_label,
    count(*) over() as total_count
  from public.deal_previews dp
  where dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and (p_category is null or dp.main_category = p_category)
    and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
    and (p_deal_type is null or dp.deal_type = p_deal_type)
    and (p_region is null or dp.broad_region = p_region)
    and (p_status is null or dp.status = p_status)
    and (
      p_query is null
      or btrim(p_query) = ''
      or to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
           @@ websearch_to_tsquery('english', p_query)
      or dp.preview_title % p_query
    )
  order by
    case when p_query is null or btrim(p_query) = '' then 0
      else ts_rank(
        to_tsvector('english', coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')),
        websearch_to_tsquery('english', p_query)
      )
    end desc,
    dp.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_deal_previews(text, text, public.buyer_sector, public.deal_type, text, public.deal_status, integer, integer)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Updated-at triggers
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'data_sources','organizations','organization_contacts','deals','deal_previews','lots','documents',
    'awards','contracts','commercial_tools','private_opportunity_details','deal_insights',
    'profiles','company_profiles','subscriptions','saved_deals','saved_searches','notification_preferences'
  ]
  loop
    execute format('drop trigger if exists touch_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger touch_%I_updated_at before update on public.%I for each row execute function private.touch_updated_at()',
      t, t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Indexes: sources/ingestion
-- -----------------------------------------------------------------------------
create index data_sources_enabled_idx on public.data_sources(enabled);
create index ingestion_runs_source_created_idx on public.ingestion_runs(source_id, created_at desc);
create index raw_records_source_external_idx on public.raw_records(source_id, external_record_id);
create index raw_records_fetched_idx on public.raw_records(fetched_at desc);
create index ingestion_errors_run_idx on public.ingestion_errors(ingestion_run_id);

-- Organizations
create index organizations_normalized_name_idx on public.organizations(normalized_name);
create index organizations_normalized_name_trgm_idx on public.organizations using gin (normalized_name gin_trgm_ops);
create index organizations_domain_idx on public.organizations(domain);
create index organization_aliases_normalized_idx on public.organization_aliases(normalized_alias);
create index organization_aliases_org_idx on public.organization_aliases(organization_id);
create index organization_contacts_org_idx on public.organization_contacts(organization_id);

-- Deals/previews
create index deals_primary_source_idx on public.deals(primary_source_id);
create index deals_buyer_idx on public.deals(buyer_organization_id);
create index deals_status_idx on public.deals(status);
create index deals_stage_idx on public.deals(stage);
create index deals_type_idx on public.deals(deal_type);
create index deals_submission_deadline_idx on public.deals(submission_deadline);
create index deals_estimated_renewal_idx on public.deals(estimated_renewal_date);
create index deals_updated_idx on public.deals(updated_at desc);
create index deals_ocid_idx on public.deals(ocid) where ocid is not null;

create index deal_previews_publish_idx on public.deal_previews(is_published, leakage_risk, updated_at desc);
create index deal_previews_status_idx on public.deal_previews(status);
create index deal_previews_type_idx on public.deal_previews(deal_type);
create index deal_previews_sector_idx on public.deal_previews(buyer_sector);
create index deal_previews_category_idx on public.deal_previews(main_category);
create index deal_previews_region_idx on public.deal_previews(broad_region);
create index deal_previews_title_trgm_idx on public.deal_previews using gin (preview_title gin_trgm_ops);
create index deal_previews_fts_idx on public.deal_previews using gin (
  to_tsvector('english', coalesce(preview_title, '') || ' ' || coalesce(preview_summary, '') || ' ' || coalesce(main_category, ''))
);

-- Related procurement entities
create index notices_deal_idx on public.notices(deal_id);
create index notices_source_idx on public.notices(source_id);
create index lots_deal_idx on public.lots(deal_id);
create index deal_locations_deal_idx on public.deal_locations(deal_id);
create unique index deal_locations_no_lot_unique_idx on public.deal_locations(deal_id, location_id) where lot_id is null;
create unique index deal_locations_with_lot_unique_idx on public.deal_locations(deal_id, location_id, lot_id) where lot_id is not null;
create index deal_classifications_deal_idx on public.deal_classifications(deal_id);
create index deal_classifications_cpv_idx on public.deal_classifications(cpv_code);
create index deal_organizations_org_idx on public.deal_organizations(organization_id);
create unique index deal_organizations_no_lot_unique_idx on public.deal_organizations(deal_id, organization_id, role) where lot_id is null;
create unique index deal_organizations_with_lot_unique_idx on public.deal_organizations(deal_id, organization_id, role, lot_id) where lot_id is not null;
create unique index commercial_tool_members_no_lot_unique_idx on public.commercial_tool_members(commercial_tool_id, organization_id, role) where lot_id is null;
create unique index commercial_tool_members_with_lot_unique_idx on public.commercial_tool_members(commercial_tool_id, organization_id, role, lot_id) where lot_id is not null;
create index requirements_deal_idx on public.requirements(deal_id);
create index award_criteria_deal_idx on public.award_criteria(deal_id);
create index documents_deal_idx on public.documents(deal_id);
create index awards_deal_idx on public.awards(deal_id);
create index award_suppliers_org_idx on public.award_suppliers(organization_id);
create index contracts_deal_idx on public.contracts(deal_id);
create index contracts_end_date_idx on public.contracts(end_date);
create index contract_payments_contract_idx on public.contract_payments(contract_id);
create index contract_performance_contract_idx on public.contract_performance(contract_id);
create index data_changes_deal_time_idx on public.data_changes(deal_id, occurred_at desc);

-- User/RLS-performance indexes
create index company_profiles_user_idx on public.company_profiles(user_id);
create index subscriptions_user_idx on public.subscriptions(user_id);
create index subscriptions_user_status_idx on public.subscriptions(user_id, is_current, status, current_period_end);
create index deal_matches_profile_idx on public.deal_matches(company_profile_id);
create index deal_matches_deal_idx on public.deal_matches(deal_id);
create index saved_deals_user_idx on public.saved_deals(user_id);
create index saved_searches_user_idx on public.saved_searches(user_id);
create index watched_organizations_user_idx on public.watched_organizations(user_id);
create index alerts_user_created_idx on public.alerts(user_id, created_at desc);
create index export_usage_user_month_idx on public.export_usage(user_id, billing_month);
