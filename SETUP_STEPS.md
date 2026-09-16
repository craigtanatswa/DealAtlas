# DealAtlas — Full Setup Steps

Follow these steps in order. The later `CURSOR_GOALS.md` assumes this foundation exists.

## Phase A — Accounts/services
Create or confirm access to:
1. GitHub
2. Cursor Pro
3. Supabase
4. Vercel
5. Dodo Payments
6. an email provider for DealAtlas alerts/transactional email (Resend-compatible recommended)
7. optional error monitoring (Sentry recommended)

Do not start Google Ads/SEO acquisition campaign work yet. Technical SEO readiness is included, but the UK funnel comes later.

## Phase B — Create the application
On your Windows computer in a parent development folder:

```bash
npx create-next-app@16 dealatlas --typescript --tailwind --eslint --app --import-alias="@/*"
cd dealatlas
```

If `create-next-app` asks interactive questions, keep App Router and TypeScript enabled.

Create a GitHub repository and push the clean baseline:
```bash
git init
git add .
git commit -m "chore: initialize DealAtlas"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

## Phase C — Install baseline dependencies
Open the repository in Cursor, then run:

```bash
npm install @supabase/ssr @supabase/supabase-js zod date-fns lucide-react clsx tailwind-merge
npm install @dodopayments/nextjs
npm install cheerio p-limit
npm install resend
npm install -D supabase tsx vitest @testing-library/react @testing-library/jest-dom playwright
```

Initialize shadcn/ui:
```bash
npx shadcn@latest init
```

Add only the components needed by the implementation as Cursor progresses. Do not install a huge component set blindly.

## Phase D — Copy this implementation pack into the repository
Copy:
- `/docs/*` into your project `/docs`
- `/supabase/migrations/*` into `/supabase/migrations`
- `/.cursor/rules/dealatlas.mdc` into `/.cursor/rules/dealatlas.mdc`
- `CURSOR_GOALS.md` into the repository root
- `.env.example` into the repository root

Commit the specification baseline before Agent makes feature changes:
```bash
git add .
git commit -m "docs: add DealAtlas product and architecture specifications"
git push
```

## Phase E — Create Supabase project
1. Create a new production-capable Supabase project.
2. Save the project URL and publishable/anon key.
3. Keep the secret/service-role key private.
4. Copy the database connection information somewhere secure; do not commit it.

Initialize/link Supabase CLI:
```bash
npx supabase init
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
```

If `supabase init` creates files that conflict with the included migrations, preserve the included migration files.

## Phase F — Create the database
### Recommended: migrations via CLI
Review the SQL files, then run:
```bash
npx supabase db push
```

Migrations execute in this order:
1. `0001_extensions_and_types.sql`
2. `0002_core_schema.sql`
3. `0003_user_billing_schema.sql`
4. `0004_security_and_rls.sql`
5. `0005_functions_and_indexes.sql`
6. `0006_seed_reference_data.sql`
7. `0007_search_preview_filters.sql`
8. `0008_find_a_tender_ocds.sql`
9. `0009_private_source_onboarding.sql`
10. `0010_intelligence_preview_pipeline.sql`
11. `0011_matching_pipeline.sql`
12. `0012_deal_match_column_privileges.sql`
13. `0013_alert_dedupe_and_digest.sql`
14. `0014_intelligence_query_indexes.sql`
15. `0015_export_usage_quota.sql`
16. `0016_admin_operations.sql`
17. `0017_job_runs.sql`

The CLI applies every numbered file. Do not skip files when pasting in the SQL Editor.`

### Alternative: Supabase SQL Editor
Open each migration file and paste/run it in numeric order. Do not skip ahead.

After applying, verify in Table Editor that the tables exist. Do not manually loosen RLS to make development easier.

## Phase G — Configure Supabase Auth
In Supabase:
1. Configure Site URL for local development: `http://localhost:3000`.
2. Add redirect URLs for local auth flows:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/callback?next=/app`
   - `http://localhost:3000/auth/callback?next=/reset-password`
   - `http://localhost:3000/auth/confirm`
3. Later add the Vercel production domain.
4. Enable email/password sign-up.
5. Require email verification for production.
6. Configure production SMTP/email delivery before launch if Supabase default email limits are insufficient.

Create your own account after auth is implemented. Promote your account to ADMIN manually in Supabase SQL Editor only after signup:
```sql
update public.profiles
set role = 'ADMIN'
where email = 'YOUR_EMAIL_ADDRESS';
```

Never build a public "make me admin" endpoint.

## Phase H — Environment file
Create `.env.local` from `.env.example`.

Required initially:
```text
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

DODO_PAYMENTS_API_KEY=
DODO_PAYMENTS_WEBHOOK_KEY=
DODO_PAYMENTS_ENVIRONMENT=test_mode
DODO_PAYMENTS_RETURN_URL=http://localhost:3000/checkout/success
DODO_PRO_MONTHLY_PRODUCT_ID=
DODO_PRO_ANNUAL_PRODUCT_ID=

RESEND_API_KEY=
DEALATLAS_EMAIL_FROM=
```

Use the current Supabase secret/service server credential name available to your project. If your project only exposes the legacy service-role key, map it to the server-only variable and never prefix it with `NEXT_PUBLIC_`.

## Phase I — Dodo Payments test setup
In Dodo test mode:
1. Create `DealAtlas Pro Monthly` subscription product in GBP at £39/month.
2. Create `DealAtlas Pro Annual` subscription product in GBP at £390/year.
3. Put them in the same Product Collection if you want portal-based monthly/annual switching.
4. Copy the test product IDs to `.env.local`.
5. Copy test API key to `.env.local`.
6. After the app is deployed to a public preview/test URL, configure a webhook pointing to:
   `/api/webhooks/dodo`
7. Configure relevant subscription lifecycle events.
8. Copy the webhook secret/key to the app environment.

Do not grant Pro based on the checkout redirect. Pro is granted only after verified billing state reaches an entitled state.

## Phase J — Start Cursor implementation
Open a NEW Agent chat for each major `/goal` or a fresh chat when context becomes noisy.

Cursor currently supports `/goal` as a long-lived objective. Use the goals in `CURSOR_GOALS.md` in order.

For architectural goals, optionally run the accompanying `/plan` prompt first, review the plan, then run `/goal`.

Do not run multiple schema-changing Agents in parallel.

## Phase K — Local verification cadence
After every major goal:
```bash
npm run lint
npm run build
```

Once tests exist:
```bash
npm test
npx playwright test
```

For database tests once configured:
```bash
npx supabase test db
```

Commit only after the goal passes its acceptance criteria.

Suggested commit sequence:
- foundation
- database/auth
- public search
- billing/paywall
- ingestion
- matching/alerts
- admin
- launch hardening

## Phase L — Public/private source onboarding
### Public source
Enable the seeded Find a Tender source after the official API adapter passes fixtures and live smoke tests.

### Private sources
Do not simply add a URL and scrape it.
For each private source:
1. identify the official procurement/supply-chain page/feed;
2. review its terms/licence/robots/access rules;
3. record evidence/date in `data_sources`;
4. mark reuse status;
5. only set `scraping_permitted=true` when automation is permitted;
6. implement source adapter;
7. add fixtures/tests;
8. run low-rate smoke ingestion;
9. inspect canonical output and preview leakage;
10. enable schedule.

The Cursor source-onboarding goal produces `docs/SOURCE_COMPLIANCE_REPORT.md` and must skip uncertain sources rather than bypassing restrictions.

## Phase M — Vercel setup
1. Import GitHub repository into Vercel.
2. Configure all production environment variables.
3. Use a production domain, e.g. `dealatlas...` once chosen.
4. Add the production URL to Supabase Auth redirect allowlist.
5. Set `NEXT_PUBLIC_APP_URL` and Dodo return URL to production.
6. Deploy.

## Phase N — GitHub Actions ingestion
Create repository/environment secrets for the trusted ingestion worker. Do not commit them.

Required:
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

Optional:
- `RESEND_API_KEY`
- `DEALATLAS_EMAIL_FROM`
- `DEALATLAS_EMAIL_TEST_TO` (test-mode alert email)
- `SENTRY_DSN`
- LLM/embedding keys used by preview regeneration

Do not expose these as `NEXT_PUBLIC_*` except the public App/Supabase values.

The workflow `.github/workflows/scheduled-jobs.yml` supports:
- manual dispatch with `--mode test` (default), `dry-run`, or `live`
- scheduled ingestion every six hours, daily preview/alert/quality jobs, weekly renewals
- source-by-source failure isolation
- structured logs without secrets

Safe local/manual runs:
```bash
npm run job -- --job ingest --due --mode dry-run
npm run job -- --job ingest --due --mode test
npm run job -- --job alerts --mode test
npm run job -- --job alerts --mode test --test-email you@example.com
```

## Phase O — Dodo live mode
Only after test mode passes:
1. complete Dodo live/KYC/merchant approval requirements;
2. create or confirm live monthly and annual products;
3. use live product IDs;
4. use live API key;
5. create production webhook;
6. use production webhook key;
7. set `DODO_PAYMENTS_ENVIRONMENT=live_mode` in Vercel;
8. redeploy;
9. run a controlled live purchase test;
10. verify subscription row and protected Deal reveal;
11. verify Customer Portal/cancellation flow.

## Phase P — Production readiness
Manual account, DNS, legal, and live-credential work is tracked in `docs/LAUNCH_CHECKLIST.md`. Do not mark those items complete from the repository alone.

Before marketing traffic:
- production DB migrations complete
- auth email delivery tested
- payment lifecycle tested
- free-source leakage tests pass
- source ingestion healthy
- enough live UK opportunities exist to demonstrate value
- private-source adapters enabled only where permitted
- admin can inspect source/data quality
- monitoring is live
- backup/recovery procedure documented (`docs/DATABASE.md` and the checklist)
- privacy/terms/cookie pages reviewed
- technical SEO checks pass
- no placeholder/demo records visible

## Phase Q — Stop point
At this stage DealAtlas is technically ready for the market.

Do not start the UK Google Ads/SEO acquisition funnel until specifically instructed. That will be a separate phase covering targeting, keywords, landing pages, campaign structure, budget and SEO distribution strategy.
