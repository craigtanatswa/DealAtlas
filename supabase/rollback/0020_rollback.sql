-- Rollback for migration 0020 (template slug helpers and GIN fastupdate).
--
-- Drops only the three functions 0020 created and restores fastupdate on
-- public.deals_leak_source_tsv_idx to on, the value it had when 0018 created
-- the index (GIN default; 0020 set it off).
--
-- private.retired_preview_slugs is intentionally kept. Those hashes cannot
-- be rebuilt from git or from the migration once the plaintext slugs are gone.

begin;

set local search_path = '';

drop function if exists public.preview_slug_is_retired(text);
drop function if exists public.retire_preview_slug(text);
drop function if exists public.maintain_deals_leak_index();

alter index public.deals_leak_source_tsv_idx set (fastupdate = on);

commit;
