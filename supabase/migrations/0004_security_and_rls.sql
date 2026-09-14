-- DealAtlas migration 0004
-- RLS, table grants and client security boundary.

-- Future tables created by this migration role must not inherit client grants.
-- service_role keeps full access for trusted server/admin/worker paths and bypasses RLS.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- Enable RLS on every public table created so far.
do $$
declare
  t text;
begin
  foreach t in array array[
    'data_sources','ingestion_runs','raw_records','ingestion_errors','organizations',
    'organization_identifiers','organization_aliases','organization_contacts','deals','deal_previews',
    'notices','notice_versions','lots','locations','deal_locations','cpv_codes','categories',
    'deal_classifications','deal_organizations','requirements','award_criteria','documents','document_insights',
    'awards','award_suppliers','contracts','contract_changes','contract_payments','contract_performance',
    'commercial_tools','commercial_tool_members','private_opportunity_details','deal_insights','related_deals',
    'data_changes','profiles','company_profiles','subscriptions','billing_events','deal_matches','saved_deals',
    'saved_searches','watched_organizations','notification_preferences','alerts','export_usage'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- PUBLIC PREVIEW: only published LOW-risk rows are client readable.
grant select on table public.deal_previews to anon, authenticated;
create policy "published low-risk previews are readable"
  on public.deal_previews
  for select
  to anon, authenticated
  using (is_published = true and leakage_risk = 'LOW');

-- PROFILES: authenticated user can read own profile and update display name only.
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

create policy "users read own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "users update own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- COMPANY PROFILE: one user-owned matching profile.
grant select, insert, delete on table public.company_profiles to authenticated;
grant update (
  company_name, company_description, products_services, preferred_category_slugs,
  preferred_cpv_codes, keywords, negative_keywords, preferred_regions,
  minimum_deal_value, maximum_deal_value, certifications, framework_memberships,
  preferred_buyer_sectors, company_size
) on table public.company_profiles to authenticated;

create policy "users read own company profile"
  on public.company_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own company profile"
  on public.company_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own company profile"
  on public.company_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users delete own company profile"
  on public.company_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

-- DEAL MATCHES: safe preview relevance only. Worker/server writes.
grant select on table public.deal_matches to authenticated;
create policy "users read own deal matches"
  on public.deal_matches for select to authenticated
  using (
    exists (
      select 1
      from public.company_profiles cp
      where cp.id = deal_matches.company_profile_id
        and cp.user_id = (select auth.uid())
    )
  );

-- SAVED DEALS
grant select, insert, delete on table public.saved_deals to authenticated;
grant update (notes) on table public.saved_deals to authenticated;

create policy "users read own saved deals"
  on public.saved_deals for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own saved deals"
  on public.saved_deals for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own saved deals"
  on public.saved_deals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users delete own saved deals"
  on public.saved_deals for delete to authenticated
  using ((select auth.uid()) = user_id);

-- SAVED SEARCHES
grant select, insert, delete on table public.saved_searches to authenticated;
grant update (name, filters, alert_cadence, enabled) on table public.saved_searches to authenticated;

create policy "users read own saved searches"
  on public.saved_searches for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own saved searches"
  on public.saved_searches for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own saved searches"
  on public.saved_searches for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users delete own saved searches"
  on public.saved_searches for delete to authenticated
  using ((select auth.uid()) = user_id);

-- WATCHED ORGANIZATIONS: Pro-only enforcement is added by trigger in migration 0005.
grant select, insert, delete on table public.watched_organizations to authenticated;

create policy "users read own watched organizations"
  on public.watched_organizations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own watched organizations"
  on public.watched_organizations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users delete own watched organizations"
  on public.watched_organizations for delete to authenticated
  using ((select auth.uid()) = user_id);

-- NOTIFICATION PREFERENCES
grant select, insert on table public.notification_preferences to authenticated;
grant update (
  email_enabled, new_match_enabled, deal_change_enabled, deadline_enabled,
  renewal_enabled, digest_cadence
) on table public.notification_preferences to authenticated;

create policy "users read own notification preferences"
  on public.notification_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own notification preferences"
  on public.notification_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own notification preferences"
  on public.notification_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ALERTS: server-only because an alert may contain protected deal/source context.
-- The application exposes an explicit safe DTO after entitlement checks.

-- IMPORTANT: subscriptions, billing_events, export_usage and all canonical/source-bearing tables
-- intentionally have no anon/authenticated grants or policies. They are server-only.
