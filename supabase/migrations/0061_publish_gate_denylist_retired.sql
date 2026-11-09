-- Enforce the publish denylist and retired preview slugs in the database gate.
-- This mirrors the checks the publish paths already run before they flip a
-- preview live, so a direct UPDATE cannot bypass them.

create or replace function private.enforce_preview_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  detected public.leakage_risk;
begin
  if exists (select 1 from private.preview_holds h where h.deal_id = new.deal_id) then
    new.unpublished_by_admin := true;
  elsif new.unpublished_by_admin then
    insert into private.preview_holds (deal_id) values (new.deal_id)
    on conflict (deal_id) do nothing;
  end if;

  begin
    detected := private.detect_preview_leakage(
      new.deal_id,
      new.slug,
      new.preview_title,
      new.preview_summary,
      new.requirements_preview,
      new.relevance_tags,
      new.broad_region
    );
  exception when others then
    raise warning 'preview leak gate failed for deal %: %', new.deal_id, sqlerrm;
    detected := 'REVIEW';
  end;

  if detected > new.leakage_risk then
    new.leakage_risk := detected;
  end if;

  if new.leakage_risk <> 'LOW' then
    new.is_published := false;
  end if;

  if new.unpublished_by_admin then
    new.is_published := false;
  end if;

  if new.is_published and (
    exists (
      select 1 from private.publish_denylist x where x.deal_id = new.deal_id
    )
    or exists (
      select 1
      from private.retired_preview_slugs r
      where r.slug_sha256 = encode(
        extensions.digest(convert_to(lower(btrim(new.slug)), 'UTF8'), 'sha256'),
        'hex'
      )
    )
  ) then
    new.is_published := false;
  end if;

  return new;
end;
$$;
