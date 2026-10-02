-- Rollback for migration 0018 (preview gate v2, DTO RPCs, fail-closed Pro).
--
-- ORDER: roll back 0019 first (supabase/rollback/0019_rollback.sql), then
-- redeploy the app build from before the DTO-RPC change (it reads
-- deal_previews directly and does not call admin_release_preview_hold), then
-- run this file. See DATABASE_SETUP.md "Rolling back 0018/0019".
--
-- Restores the 0016 publish gate and the 4-argument detect_preview_leakage,
-- and drops everything 0018 added. One deliberate exception: is_user_pro
-- keeps the fail-closed 0018 definition (a NULL current_period_end is not
-- Pro); the pre-0018 version would reopen the paywall. Preview rows
-- keep any leakage_risk / is_published values the v2 gate set; admin holds
-- stay recorded in deal_previews.unpublished_by_admin.

begin;

-- Every object below is schema-qualified; an empty path proves it.
set local search_path = '';

CREATE OR REPLACE FUNCTION private.detect_preview_leakage(p_deal_id uuid, p_preview_title text, p_preview_summary text, p_requirements jsonb)
 RETURNS public.leakage_risk
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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
$function$;

revoke execute on function private.detect_preview_leakage(uuid, text, text, jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_preview_safety()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke execute on function private.enforce_preview_safety() from public, anon, authenticated;

drop trigger if exists enforce_preview_safety on public.deal_previews;
CREATE TRIGGER enforce_preview_safety BEFORE INSERT OR UPDATE OF preview_title, preview_summary, requirements_preview, leakage_risk, is_published, unpublished_by_admin ON public.deal_previews FOR EACH ROW EXECUTE FUNCTION private.enforce_preview_safety();


-- Deliberately NOT reverted: is_user_pro stays fail-closed (a NULL
-- current_period_end is never Pro), so rolling back cannot reopen the
-- paywall. Same definition as 0018.
CREATE OR REPLACE FUNCTION private.is_user_pro(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  );
$function$;

revoke execute on function private.is_user_pro(uuid) from public, anon, authenticated;

drop function if exists public.search_preview_dtos(
  text, text, public.buyer_sector, public.deal_type, text, public.deal_status, public.deal_status[],
  text, text, numeric, text, integer, integer
);
drop function if exists public.get_preview_dto_by_slug(text);
drop function if exists public.get_preview_dto_by_deal_id(uuid);
drop function if exists public.resolve_preview_deal_id(text);
drop function if exists public.list_saved_deal_previews();
drop function if exists public.list_preview_sitemap_entries(integer, integer);
drop function if exists public.count_preview_sitemap_entries();
drop function if exists public.admin_release_preview_hold(uuid);

drop function if exists private.detect_preview_leakage(uuid, text, text, text, jsonb, text[], text);
drop function if exists private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text);
drop function if exists private.preview_dto_requirements(jsonb);
drop function if exists private.preview_freshness_label(timestamptz, timestamptz);

drop index if exists public.deals_leak_source_tsv_idx;
alter table public.organizations drop column if exists leak_match_name;
alter table public.organization_aliases drop column if exists leak_match_name;
drop function if exists private.leak_norm(text);

drop table if exists private.preview_holds;
drop table if exists private.leak_gate_terms;

commit;
