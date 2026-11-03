-- Service-role boolean checks used by the explicit republish-open-deals job.
-- The private tables stay unreadable to every API role; these functions expose
-- only a yes/no answer for one deal and are executable by service_role alone.

create or replace function public.deal_is_publish_denylisted(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.publish_denylist x
    where x.deal_id = p_deal_id
  );
$$;

revoke all on function public.deal_is_publish_denylisted(uuid)
  from public, anon, authenticated;
grant execute on function public.deal_is_publish_denylisted(uuid) to service_role;

-- Unlike public.preview_slug_is_retired, this deliberately reports the current
-- preview row's slug. A republish must not publish a slug that was retired
-- while the preview row still carries it.
create or replace function public.deal_preview_slug_is_retired(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deal_previews dp
    join private.retired_preview_slugs r
      on r.slug_sha256 = encode(
        extensions.digest(convert_to(lower(btrim(dp.slug)), 'UTF8'), 'sha256'),
        'hex'
      )
    where dp.deal_id = p_deal_id
  );
$$;

revoke all on function public.deal_preview_slug_is_retired(uuid)
  from public, anon, authenticated;
grant execute on function public.deal_preview_slug_is_retired(uuid) to service_role;
