-- Hashed preview slug aliases map a retired /deals/<slug> to its deal so the
-- public gate can 301 to the deal's current URL. plaintext slugs are never
-- stored; pre-existing retired slugs cannot be backfilled because only hashes
-- exist; aliases accrue from new retirements.

create table if not exists private.preview_slug_aliases (
  slug_sha256 text primary key,
  deal_id uuid not null references public.deals(id) on delete cascade,
  created_at timestamptz not null default now()
);

revoke all on table private.preview_slug_aliases from public, anon, authenticated;

create or replace function public.record_preview_slug_alias(p_slug text, p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_slug is null or btrim(p_slug) = '' then
    return;
  end if;
  if p_deal_id is null then
    return;
  end if;
  insert into private.preview_slug_aliases (slug_sha256, deal_id)
  values (
    encode(extensions.digest(convert_to(lower(btrim(p_slug)), 'UTF8'), 'sha256'), 'hex'),
    p_deal_id
  )
  on conflict (slug_sha256) do update set deal_id = excluded.deal_id;
end;
$$;

create or replace function public.resolve_preview_slug_alias(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.deal_id
  from private.preview_slug_aliases a
  where a.slug_sha256 = encode(
    extensions.digest(convert_to(lower(btrim(p_slug)), 'UTF8'), 'sha256'),
    'hex'
  )
  limit 1;
$$;

revoke all on function public.record_preview_slug_alias(text, uuid) from public, anon, authenticated;
revoke all on function public.resolve_preview_slug_alias(text) from public, anon, authenticated;
grant execute on function public.record_preview_slug_alias(text, uuid) to service_role;
grant execute on function public.resolve_preview_slug_alias(text) to service_role;
