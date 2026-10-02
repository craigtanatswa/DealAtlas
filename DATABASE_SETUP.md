# DealAtlas — Database Creation Queries

You have two equivalent ways to create the DealAtlas database in Supabase.

## Option 1 — Recommended: Supabase migrations
After linking the Supabase project:
```bash
npx supabase db push
```

The migrations run in this order:
1. `supabase/migrations/0001_extensions_and_types.sql`
2. `supabase/migrations/0002_core_schema.sql`
3. `supabase/migrations/0003_user_billing_schema.sql`
4. `supabase/migrations/0004_security_and_rls.sql`
5. `supabase/migrations/0005_functions_and_indexes.sql`
6. `supabase/migrations/0006_seed_reference_data.sql`
7. … through `supabase/migrations/0019_revoke_client_preview_table_access.sql` (see `docs/DATABASE.md` for the full list)

On an existing production project, `0018` and `0019` must be rolled out as separate steps: apply `0018`, deploy the app release that reads previews through the DTO RPCs, verify it, then apply `0019`. `db push` applies every pending migration at once, so push from a checkout that does not yet contain `0019` (or apply the files manually) for the first step. A fresh project with no deployed app can apply everything in one pass.

## Option 2 — One-pass Supabase SQL Editor
Open:
`supabase/dealatlas_full_schema.sql`

Copy the entire file into Supabase SQL Editor and run it on a fresh DealAtlas project.

Do not run the combined file after individual migrations have already been applied.

After a successful local apply:

```bash
npx supabase start
npm run db:types
npm run test:db
```

## What the SQL creates
- 46 application tables
- source/ingestion registry
- canonical Deals/notices/lots/organizations
- private opportunity details
- awards/contracts/payments/performance
- sanitised `deal_previews`
- user profiles/company profiles
- saved Deals/searches
- matching/alerts
- Dodo subscription mirror and billing event audit
- RLS/grants
- free-plan/Pro quota triggers
- source compliance enforcement
- preview publish gate (re-scans every `deal_previews` write)
- sanitised preview DTO RPCs (the only client path to previews)
- indexes
- initial DealAtlas categories
- Find a Tender source registry seed

## Critical post-run verification queries
Run these in the Supabase SQL Editor as an administrator:

```sql
-- 1. Confirm application tables
select count(*) as public_table_count
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE';
```

```sql
-- 2. Confirm RLS is enabled on DealAtlas tables
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

```sql
-- 3. Confirm source seed
select source_key, source_type, access_method, reuse_status, scraping_permitted, enabled
from public.data_sources
order by source_key;
```

```sql
-- 4. Confirm DealAtlas categories
select slug, name
from public.categories
order by name;
```

```sql
-- 5. Confirm client roles cannot read deal_previews or non-public schemas
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'deal_previews'
  and grantee in ('anon', 'authenticated');      -- expect no rows

select n.nspname, r.rolname
from pg_namespace n
cross join (values ('anon'), ('authenticated')) as r(rolname)
where has_schema_privilege(r.rolname, n.oid, 'USAGE')
  and n.nspname not in ('public', 'auth', 'pg_catalog', 'information_schema')
  and n.nspname not like 'pg\_%';                -- expect no rows
```

## Promote your account to ADMIN after signing up
Replace the email with your own:

```sql
update public.profiles
set role = 'ADMIN'
where email = 'YOUR_EMAIL_ADDRESS';
```

Then verify:
```sql
select id, email, role
from public.profiles
where email = 'YOUR_EMAIL_ADDRESS';
```

## Important
Do not insert Pro subscription rows manually in production to simulate Dodo payments. Development/test fixtures may do so only inside isolated automated tests. Real Pro entitlement must be synchronised from verified Dodo webhook/provider state.
