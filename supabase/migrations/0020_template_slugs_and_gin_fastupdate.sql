-- PR3: retire old preview slugs by hash, and stop the leak-source GIN pending list
-- from stalling preview writes. fastupdate=off is the durable fix. Ingest and
-- rebuild also call public.maintain_deals_leak_index() (pending-list clean +
-- ANALYZE) after each batch. After the first bulk rebuild, run
-- VACUUM (ANALYZE) public.deals once from an operator session; VACUUM cannot
-- run inside this function.

create table if not exists private.retired_preview_slugs (
  slug_sha256 text primary key,
  retired_at timestamptz not null default now()
);

revoke all on table private.retired_preview_slugs from public, anon, authenticated;

-- Snapshot slugs that already exist. The hash is computed in the database;
-- plaintext is not written into this migration.
insert into private.retired_preview_slugs (slug_sha256)
select encode(extensions.digest(convert_to(lower(btrim(slug)), 'UTF8'), 'sha256'), 'hex')
from public.deal_previews
where slug is not null and btrim(slug) <> ''
on conflict do nothing;

create or replace function public.retire_preview_slug(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_slug is null or btrim(p_slug) = '' then
    return;
  end if;
  insert into private.retired_preview_slugs (slug_sha256)
  values (encode(extensions.digest(convert_to(lower(btrim(p_slug)), 'UTF8'), 'sha256'), 'hex'))
  on conflict do nothing;
end;
$$;

create or replace function public.preview_slug_is_retired(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_slug is not null
    and btrim(p_slug) <> ''
    and exists (
      select 1
      from private.retired_preview_slugs r
      where r.slug_sha256 = encode(extensions.digest(convert_to(lower(btrim(p_slug)), 'UTF8'), 'sha256'), 'hex')
    )
    and not exists (
      select 1
      from public.deal_previews dp
      where lower(dp.slug) = lower(btrim(p_slug))
    );
$$;

revoke all on function public.retire_preview_slug(text) from public, anon, authenticated;
grant execute on function public.retire_preview_slug(text) to service_role;

revoke all on function public.preview_slug_is_retired(text) from public, anon, authenticated;
grant execute on function public.preview_slug_is_retired(text) to service_role;

alter index public.deals_leak_source_tsv_idx set (fastupdate = off);

create or replace function public.maintain_deals_leak_index()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.gin_clean_pending_list('public.deals_leak_source_tsv_idx'::regclass);
  execute 'analyze public.deals';
end;
$$;

revoke all on function public.maintain_deals_leak_index() from public, anon, authenticated;
grant execute on function public.maintain_deals_leak_index() to service_role;
