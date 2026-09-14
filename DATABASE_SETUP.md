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
- preview leakage failsafe
- safe public search RPC
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
