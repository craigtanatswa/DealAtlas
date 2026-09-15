-- DealAtlas migration 0015
-- Transactional Pro CSV export quota on export_usage.
-- Ordinary client roles still have no grants; trusted server code inserts
-- after entitlement checks. The trigger serializes usage per user/month.

create or replace function private.enforce_export_usage_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_rows integer;
  max_rows integer := 1000;
begin
  if not private.is_user_pro(new.user_id) then
    raise exception 'DealAtlas Pro subscription required to export';
  end if;

  new.billing_month := (date_trunc('month', timezone('utc', now())))::date;
  new.export_type := coalesce(nullif(btrim(new.export_type), ''), 'DEALS_CSV');

  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || ':export:' || new.billing_month::text, 4)
  );

  select coalesce(sum(row_count), 0)
    into current_rows
  from public.export_usage
  where user_id = new.user_id
    and billing_month = new.billing_month;

  if current_rows + new.row_count > max_rows then
    raise exception 'export row limit reached';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_export_usage_limit() from public, anon, authenticated;

drop trigger if exists enforce_export_usage_limit on public.export_usage;
create trigger enforce_export_usage_limit
before insert on public.export_usage
for each row execute function private.enforce_export_usage_limit();

comment on function private.enforce_export_usage_limit() is
  'Serializes Pro CSV export_usage inserts and rejects rows that would exceed 1000/month.';
