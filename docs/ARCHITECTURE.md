# DealAtlas — Technical Architecture

## 1. Stack
- Next.js 16 App Router
- React + TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage only for DealAtlas-owned files where appropriate
- PostgreSQL full-text search + pg_trgm for MVP search
- Dodo Payments as Merchant of Record
- Vercel for web application
- Node/TypeScript ingestion scripts
- GitHub Actions for scheduled ingestion initially; architecture must allow migration to a dedicated worker later
- Resend-compatible email abstraction for DealAtlas alerts/transactional app emails; billing emails remain Dodo-owned
- Sentry-compatible error monitoring abstraction

## 2. Architectural principle: two data surfaces
DealAtlas deliberately separates safe preview data from protected source data.

### Public/free surface
`deal_previews` contains only sanitised, non-source-identifying fields.

The browser may read this dataset through explicitly granted/RLS-protected access or through safe server endpoints.

### Protected surface
Canonical source-bearing tables such as `deals`, `notices`, `documents`, `organizations`, `requirements`, `awards`, `contracts`, and source metadata are never directly readable by `anon` or ordinary `authenticated` clients.

Protected deal detail must be retrieved by a trusted server path that:
1. establishes the authenticated Supabase user;
2. checks subscription entitlement server-side;
3. checks that the requested operation is permitted;
4. uses server-only elevated credentials to retrieve protected rows;
5. returns only fields required for the paid feature.

Never use CSS blur or client-side conditional rendering as the protection mechanism.

## 3. Suggested repository layout
```text
/app
  /(marketing)
  /deals
  /pricing
  /how-it-works
  /(auth)
  /login
  /signup
  /(app)
    /app
      /search
      /deals/[id]
      /saved
      /searches
      /alerts
      /profile
      /settings
      /billing
      /buyers
      /buyers/[id]
      /suppliers
      /suppliers/[id]
      /contracts
      /renewals
  /(admin)
    /admin
      /deals
      /sources
      /ingestion
      /organisations
      /deduplication
      /data-quality
      /billing-events
  /api
    /deals/[id]
    /search
    /buyers
    /suppliers
    /contracts
    /renewals
    /exports
    /billing/checkout
    /billing/portal
    /webhooks/dodo
/components
/lib
  /auth
  /billing
  /db
  /entitlements
  /search
  /redaction
  /email
  /matching
  /intelligence
  /admin
  /monitoring
  /observability
  /jobs
  /validation
/ingestion
  /core
  /sources
  /normalizers
  /extractors
  /dedupe
  /preview
  /intelligence
/scripts
  /ingest.ts
  /rebuild-previews.ts
  /rebuild-matches.ts
  /send-alerts.ts
  /run-job.ts
/supabase
  /migrations
  /tests
/docs
/tests
  /unit
  /integration
  /e2e
```

## 4. Authentication
Use Supabase Auth with SSR-safe server/client helpers.

Launch authentication:
- email/password
- verified email before using saved searches/alerts
- password reset
- optional Google OAuth (`Sign up / Sign in with Google`) using an ID token returned to `dealatlas.uk`, so Google’s account picker does not show `*.supabase.co`

`profiles.id` equals `auth.users.id`.

Do not place authorisation-critical role or plan state in user-editable metadata.

## 5. Authorization
Three concepts must stay separate:
- authentication: who is the user?
- application role: USER or ADMIN
- billing entitlement: FREE or PRO, with subscription lifecycle status

Admin access is checked server-side. Paid access is checked server-side from the subscriptions table/webhook-synchronised state.

A paid UI badge is never proof of entitlement.

## 6. Subscription entitlement
Recommended entitlement rule:
- `active` and `renewed` subscription states grant Pro.
- cancellation scheduled for period end remains Pro until paid-through period ends.
- `on_hold`, `failed`, `expired`, immediate cancellation, or lapsed period removes protected source access according to Dodo lifecycle semantics and the locally recorded entitlement period.

Implement one central function/service such as:
`getCurrentEntitlement(userId): FREE | PRO`

Every protected route calls it.

## 7. Billing
Dodo integration uses the official Next.js adapter where practical:
- checkout route
- webhook route
- customer portal route/session

Environment variables:
```text
DODO_PAYMENTS_API_KEY=
DODO_PAYMENTS_WEBHOOK_KEY=
DODO_PAYMENTS_ENVIRONMENT=test_mode
DODO_PAYMENTS_RETURN_URL=
DODO_PRO_MONTHLY_PRODUCT_ID=
DODO_PRO_ANNUAL_PRODUCT_ID=
```

No product ID or secret key should be hard-coded.

Webhook processing must be idempotent and recorded in `billing_events` before/while applying state transitions.

## 8. Request paths
### Public search
Browser → public search endpoint/query → `deal_previews` only.

### Free detail
Browser → `/deals/[slug]` → `deal_previews` only. Authenticated upgrade CTAs start Dodo checkout with a server-mapped plan key. Checkout redirects are not entitlement.

### Pro detail
Browser → `/app/deals/[id]` or `/api/deals/[id]` → authenticate → server entitlement check → protected canonical tables → explicit paid DTO.

The paid DTO includes buyer identity, source title/reference, source/application URLs, exact value/dates/location, published procurement contacts, requirements, lots, award criteria, document links, lifecycle timeline, and source provenance.

Verbatim notice text and document files are omitted when source licence/terms do not permit redistribution. In that case the Pro view links to the original source instead. `extracted_text` is never sent to the browser.

### Admin detail
Browser → authenticated admin route → role check → protected canonical tables.

## 9. Search
MVP search:
- PostgreSQL full-text search on sanitised preview title + preview summary
- pg_trgm for typo tolerance and fuzzy title matching
- indexed filters
- cursor or stable page-number pagination

Do not expose source-bearing fields through search snippets.

Paid advanced search may query protected dimensions server-side but must return protected results only after entitlement verification.

Signed-in relevance sort/filter uses stored `deal_matches` rows (0–100) plus sanitised `preview_reasons`. Semantic similarity is included only when an embedding model and API key are configured. Free clients receive limited canned reasons. Pro mismatch notes that depend on protected requirement types are loaded server-side from `detail_reasons` after entitlement checks and still must not copy source identity. Authenticated clients are granted SELECT on preview-safe `deal_matches` columns only; `detail_reasons` is not included.

## 10. Preview generation/redaction
Every canonical deal gets a separate `deal_previews` row.

Preview generation lives in `ingestion/preview` and leak scanning in `lib/redaction`. The database trigger on `deal_previews` is a failsafe only; it must not be treated as the scanner.

Preview generation rules:
- create a non-verbatim DealAtlas title;
- paraphrase descriptions;
- generalise value into a documented value band;
- generalise deadline to a documented window;
- generalise duration to a documented band;
- generalise exact location to a broad UK region;
- emit high-level requirements, SME suitability, bid complexity and competition level;
- strip buyer names, source platform names, domains, email addresses, IDs and quoted phrases;
- run deterministic leak checks before publishing;
- optionally rewrite title/summary through an isolated language-model interface, then leak-scan the result;
- model output cannot override leak findings;
- store a `leakage_risk` score/status;
- publish only LOW-risk previews; REVIEW/HIGH regenerate once then stay unpublished for admin review.

Paid intelligence is stored on `deal_insights` with per-field provenance, confidence and model/version. Source facts and inference stay separate in the paid DTO.

Rebuild stale deadline bands with `npm run rebuild-previews`.

## 11. Source compliance gate
Automated ingestion calls `canIngestSource(source)` before fetching.

Production automation is permitted only if `reuse_status` is one of:
- OPEN_LICENSE
- PERMISSION_GRANTED
- LICENSED
- TERMS_REVIEWED

and `scraping_permitted = true` for scrape-based sources.

API/open-data sources still retain licence/attribution metadata.

UNKNOWN and PROHIBITED sources are blocked from production automation.

## 12. Ingestion pipeline
```text
source registry
  ↓ compliance gate
fetch
  ↓
raw record immutable snapshot
  ↓
parse/validate
  ↓
normalise
  ↓
organisation/entity resolution
  ↓
deduplicate/link lifecycle
  ↓
canonical deal + lots + notices + docs
  ↓
intelligence extraction
  ↓
preview generation + leak scan
  ↓
searchable preview publish
  ↓
match scoring / match_jobs queue
  ↓
alert matching
```

Each source adapter must fail independently.

## 13. Private opportunity adapters
Private sources do not need OCDS structure. Each adapter maps into the canonical Deal model.

Adapter contract should return a source-neutral DTO with:
- source record identity
- source title/description
- buyer identity where available
- type/stage/status
- goods/services/works required
- value/budget if known
- dates
- location
- requirements
- contacts
- source links
- documents
- confidence

## 14. Scheduled jobs
MVP scheduled jobs (GitHub Actions, `npm run job`):
- frequent active-source ingestion, frequency configurable per source (`--job ingest --due`)
- daily stale-source / data-quality checks (`--job data-quality`)
- daily preview regeneration for changed deals (`--job previews`)
- match recalculation for new/changed previews and edited company profiles (`npm run rebuild-matches`)
- daily alert matching/delivery (`--job alerts` / `npm run send-alerts`)
- weekly contract-renewal recalculation (`--job renewals`)

Jobs support `--mode test` (smoke limits, no user emails) and `--mode dry-run`. One failed source does not stop the others. Avoid recurrence faster than source terms/rate limits permit.

## 15. Data retention
- raw source snapshots retained for provenance unless source licence/terms require deletion
- notice versions retained
- deleted/withdrawn opportunities marked rather than hard-deleted when historical retention is lawful
- billing webhook events retained for reconciliation/audit
- user deletion workflow removes or anonymises user-owned data consistent with legal obligations

## 16. Observability
Capture:
- ingestion run status/duration/counts
- adapter failures
- parser failures
- preview leak failures
- webhook processing failures
- checkout failures
- authorisation failures
- alert delivery failures
- export volume
- scheduled job_runs summaries

Structured JSON logs omit secrets, full card/payment details and unnecessary personal data. When `SENTRY_DSN` is unset, `createErrorReporter` logs only. When set, it posts a Sentry-compatible envelope.

## 17. Performance
Indexes are mandatory for:
- RLS user_id columns
- deal status/stage/type
- deadline
- buyer organisation
- source ID/source record ID
- subscription user/status
- saved object owner
- alert owner/status
- search text

Public list pages must paginate and select only preview columns.

## 18. Environments
Use separate Supabase/Dodo configuration for development/test and production.

At minimum:
- local/development
- production

Never reuse production secret keys in local fixtures or committed files.

Production fail-safes:
- `getPublicEnv()` requires `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. On `VERCEL_ENV=production` the app origin must be HTTPS and not loopback.
- `getServerEnv()` requires `SUPABASE_SECRET_KEY`. Dodo keys are optional in `test_mode` (checkout/webhook/portal then return HTTP 503). Checkout also requires the webhook signing key so a card cannot succeed without a way to grant Pro. `live_mode` requires live API/webhook keys, HTTPS return URL, and live product IDs, and rejects test/placeholder credentials and local fixture product IDs.
- Node instrumentation (`instrumentation.node.ts`) validates public and server env when a Node server starts, and `onRequestError` reports request failures.
- Transactional email will not send from localhost or `@example.com` from-addresses even if a Resend key is present.
- Live scheduled ingest defaults to 500 records per source and resumes the last stored cursor until the discovery window is drained.

## 19. Deployment
Vercel deploys the web application. `.nvmrc` selects Node 22.

Production environment variables are configured in Vercel. The remaining human steps are `docs/LAUNCH_CHECKLIST.md`.

Supabase migrations are source-controlled and applied deliberately.

GitHub Actions ingestion uses repository/environment secrets with least privilege. It may use a Supabase secret/service credential because it is a trusted server worker; never expose that key to the client. The workflow is `.github/workflows/scheduled-jobs.yml` with `workflow_dispatch` and `--mode test|dry-run|live`.

## 20. Architectural acceptance tests
- anonymous user cannot select canonical/source tables
- free authenticated user cannot select canonical/source tables
- anonymous user can read only publishable preview rows
- Pro endpoint rejects free account even if request is manually forged
- Pro endpoint returns protected data to active subscriber
- cancelled/expired/on-hold entitlement behaviour matches billing rules
- admin route rejects normal Pro subscriber
- preview payload contains no buyer/source identifiers
- source marked UNKNOWN cannot run automatically
- duplicate webhook does not create duplicate subscription transition

## 21. Foundation implementation notes
The application foundation was added to this repository on top of the specification pack. The following are intentional current-state notes, not changes to the two-surface security model.

### Aligned with this document
- Next.js 16 App Router, TypeScript strict mode, Tailwind, shadcn/ui, Supabase SSR helpers, Zod, Vercel-compatible Next.js runtime.
- Route groups: `(marketing)`, `(auth)`, `(app)`, `(admin)`, plus `/api`.
- Public marketing routes include `/`, `/deals`, `/deals/[slug]`, `/pricing`, `/how-it-works`.
- Authenticated search at `/app/search` sorts and filters by company-profile relevance when a profile exists. Public `/deals` can show scores for signed-in users without revealing source identity.
- Saving `/app/profile` queues `match_jobs` and recalculates `deal_matches` for published previews.
- `lib/` contains `auth`, `billing`, `db`, `entitlements`, `search`, `matching`, `intelligence`, `admin`, `redaction`, `email`, `monitoring`, and `validation`.
- Privileged Supabase access is isolated in `lib/supabase/admin.ts` with `import "server-only"`. Browser and cookie-based SSR clients use the publishable key only.
- Environment validation splits `NEXT_PUBLIC_*` (`lib/env/public.ts`) from server secrets (`lib/env/server.ts`).
- Feature limits live in `lib/constants.ts` and must be enforced server-side when those features are implemented.

### Additive alignments with PRODUCT.md
These public/admin routes are specified in `docs/PRODUCT.md` and were added even though they are not listed in the layout snippet above:
- `/privacy`, `/terms`, `/cookies`, `/contact`
- `/admin/deals`, `/admin/sources`, `/admin/ingestion`, `/admin/organisations`, `/admin/deduplication`, `/admin/data-quality`, `/admin/billing-events`

### Paid intelligence
Pro routes `/app/buyers`, `/app/buyers/[id]`, `/app/suppliers`, `/app/suppliers/[id]`, `/app/contracts`, and `/app/renewals` load canonical organisations, awards, contracts, related processes, payments, and performance only after `getCurrentEntitlement` confirms Pro. Free signed-in users receive an upgrade panel and no organisation names. Matching JSON lives at `/api/buyers`, `/api/suppliers`, `/api/contracts`, and `/api/renewals` with the same gate. Inferred incumbent and renewal fields are labelled DealAtlas analysis. Category/value activity is aggregated at query time; `0014_intelligence_query_indexes.sql` adds refreshable lookup indexes rather than materialized history.

### Database integration
Committed migrations in `supabase/migrations` remain the schema source of truth. Local `supabase/config.toml` is configured so new public tables are not auto-exposed to `anon`/`authenticated`. Database TypeScript types are generated with `npm run db:types` into `lib/db/database.types.ts`.

Public/free query helpers in `lib/db/previews.ts` may touch `deal_previews` only. Canonical source-bearing query helpers in `lib/db/canonical.ts` are `server-only` and use `lib/supabase/admin.ts`. Browser and SSR clients are typed with the granted public table surface, not the canonical tables.

pgTAP tests live in `supabase/tests/database`. PostgREST RLS smoke tests live in `tests/integration/rls.rest.test.ts` and require a running local stack (`npm run test:db`). Auth integration tests live in `tests/integration/auth.rest.test.ts`. Public/free discovery leak tests live in `tests/integration/public-discovery.rest.test.ts` and `tests/unit/deal-preview-leak.test.tsx`.

### Technical SEO and public trust pages
Public marketing routes now include `/`, `/deals`, `/deals/[slug]`, `/categories`, `/categories/[slug]`, `/pricing`, `/how-it-works`, `/contact`, `/privacy`, `/terms`, and `/cookies`. Category landings are a fixed catalogue from `lib/seo/category-landings.ts` (`dynamicParams = false`); search/filter combinations stay noindex and are not mass-generated as pages.

`app/robots.ts` and `app/sitemap.ts` expose crawl policy and static/category URLs. Published Deal preview URLs are listed from `deal_previews` only via `app/(marketing)/deals/sitemap.ts`. Metadata, OpenGraph, JSON-LD, and sitemap loc values use sanitised preview fields or static product copy — never buyer/source identity.

Internal `/app`, `/admin`, `/auth`, `/api`, and checkout confirmation routes are noindex (and disallowed in robots.txt where appropriate). Google Search Console verification and GA/GTM scripts are optional `NEXT_PUBLIC_*` placeholders and must not receive source URLs on free pages.

Privacy, terms, and cookies pages are draft trust copy with explicit “Requires final business/legal review” markers.

### Public/free discovery
The public homepage (`/`) is a discovery surface: it shows sanitised `deal_previews` under a real search form that submits to `/deals`. Latest opportunities prefer `OPEN` and `UPCOMING` rows, then fill remaining slots with `AWARDED` when fewer live listings are published. Closing soon still uses `searchDealPreviewsForUser`. Anonymous and free visitors also search and view `/deals` and `/deals/[slug]` through `lib/search/public.ts`. Those helpers only call `deal_previews` / `search_deal_previews`. Metadata, JSON (`/api/search`), and HTML/RSC payloads use the explicit public preview DTO. Signed-in HTML search may attach `deal_matches` scores and canned reasons without adding source identity.

Protected Deal JSON lives at `/api/deals/[id]`. The route authenticates with `getAuthUser()`, resolves FREE/PRO via `getCurrentEntitlement()` from the local `subscriptions` mirror, then loads canonical rows with the server-only admin client and maps an explicit paid DTO. Query parameters and client plan labels cannot grant Pro. `/app/deals/[id]` shows the paid UI for entitled users and the sanitised preview plus limited match reasons for free users.

### Authentication
Launch authentication is email/password plus optional Google OAuth with Supabase SSR helpers. When `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set, Google sign-in uses an OpenID ID token returned to `/auth/google` on the DealAtlas origin, then `signInWithIdToken`. That keeps Google’s “continue to” hostname on `dealatlas.uk`. The older `signInWithOAuth` redirect through `*.supabase.co` remains a fallback when the public client ID is unset. Google client secrets stay in the Supabase provider config, not in Next.js env.

- `proxy.ts` refreshes the Auth session on each matched request and redirects unauthenticated users away from `/app` and `/admin`.
- `lib/auth/session.ts` loads the user with `getUser()` and authorizes from `profiles.role` only. Client metadata is not trusted.
- Admin routes call `requireAdmin()` in `app/(admin)/admin/layout.tsx` and again in `lib/admin/page.ts` before loaders run, then return 403 via `forbidden()` for signed-in non-admins.
- Admin mutations live in `lib/admin/actions.ts` (`"use server"`). Each action calls `requireAdminAction()` again. There is no `/api/admin` mutation route.
- Meaningful admin writes record `admin_audit_events`. Ordinary client roles have no grants on that table.
- Source enablement uses the same database gates as `private.enforce_source_enablement`. Previews can be held unpublished with `unpublished_by_admin`. Regeneration and scheduled preview writes copy that hold so a later LOW scan cannot republish the row. The database trigger is a failsafe.
- Profile rows are created by `private.handle_new_user()`. If a row is missing, `lib/auth/profile.ts` inserts a USER row with the admin client and never copies a role from metadata.
- Auth callbacks at `/auth/callback` and `/auth/confirm` exchange a code or `token_hash` and sanitize `next` to same-origin relative paths.

### Entitlement and protected Deal API
- `lib/entitlements/policy.ts` is the single FREE/PRO rule and mirrors `private.is_user_pro` plus documented on-hold/expired behaviour.
- `getCurrentEntitlement(userId)` in `lib/entitlements/service.ts` reads the current subscriptions row with the server-only admin client.
- Tests inject in-memory subscription fixtures through `resolveUserEntitlement`; there is no query-parameter Pro grant.
- `fulfillProtectedDealRequest` rejects anonymous (401), FREE/expired/on-hold (403), and invalid IDs (400) before canonical reads.
- `lib/deals/protected.ts` queries canonical tables and `lib/deals/paid-dto.ts` maps an explicit paid DTO without internal/raw/secret fields.

### CSV export
- `POST /api/exports` is authenticated. The server checks `getCurrentEntitlement`, then exports the current filtered search, saved deals, or selected Deal IDs.
- Paid fields are loaded only after Pro is verified. CSV cells that begin with `=`, `+`, `-`, or `@` are apostrophe-prefixed. The file is UTF-8 with a BOM.
- Pro launch quota is 1,000 rows per UTC billing month. Remaining quota is checked before canonical reads; `export_usage` is recorded through a transactional trigger so concurrent requests cannot exceed the cap.
- `GET /api/exports` returns `{ used, limit, remaining, billingMonth }` for Pro users.

### Dodo billing
- `/api/billing/checkout` is an authenticated POST. The browser may send only `planKey` (`PRO_MONTHLY` | `PRO_ANNUAL`). The server maps that to `DODO_PRO_*_PRODUCT_ID` and creates a Checkout Session through `@dodopayments/nextjs`.
- Checkout metadata `user_id` and `plan_key` are generated from the authenticated session, never from the request body.
- `/api/webhooks/dodo` uses the official `Webhooks` adapter for Standard Webhooks verification, then writes `billing_events` and the `subscriptions` mirror idempotently.
- `/checkout/success` polls `/api/billing/entitlement` and does not treat `?success=true` as Pro.
- `/api/billing/portal` creates a Dodo Customer Portal session from the signed-in user's stored `dodo_customer_id` only.
- `/app/billing` shows plan, interval, status, period end, and Manage billing.

### Ingestion
Production ingestion lives under `/ingestion` with a source-neutral `SourceAdapter` (`discover` / `fetch` / `parse`), a compliance gate, immutable `raw_records`, and canonical persist for deals, notices, lots, organisations, requirements, awards and contracts. Find a Tender uses the official OCDS API (`/api/1.0/ocdsReleasePackages`), not HTML. Private/supply-chain sources use a reusable config-driven adapter (`ingestion/sources/private`). The first enabled mixed public/private infrastructure channel is the UK Infrastructure Pipeline (NISTA) via `GET /_dash-layout`. Run a source with `npm run ingest -- --source <source-key>`, or due sources with `npm run job -- --job ingest --due`. Evidence and blocked sources are in `docs/SOURCE_COMPLIANCE_REPORT.md`. Routine tests use saved fixtures and do not call the live site.

Retention workflows: saved deals (free quota 5), saved searches (free 1 / Pro 50), notification preferences, `GET/POST /api/alerts` entitlement-safe DTOs, and `npm run send-alerts` for new-match, deal-changed, deadline, and renewal evaluation plus Resend-compatible digests. Alerts remain server-only; `protected_payload` is never returned to the browser. `--mode test` sends a sanitised provider test when `DEALATLAS_EMAIL_TEST_TO` or `--test-email` is set and `RESEND_API_KEY` is configured; it does not email users.

`/api/health` is a public liveness endpoint. Admin `/admin` shows source staleness, email/monitoring configuration, and `job_runs`.

### Stack details
- Tailwind CSS v4 ships with the Next.js 16 scaffold (no `tailwind.config.ts`).
- shadcn/ui uses the current radix-nova preset, including the `cn` and `radix-ui` packages.
- The npm package name is `dealatlas` because npm does not allow capital letters. The product name remains DealAtlas.
- Current `@supabase/supabase-js` declares `engines.node >= 22`. Local Node 20 can install with an engine warning; production should use Vercel Node 22.
- Dodo Payments is wired through `@dodopayments/nextjs` plus the official `dodopayments` SDK for subscription reconciliation. Display pricing copy in `lib/constants.ts` is not entitlement.
- Display pricing copy in `lib/constants.ts` is not a billing entitlement. Dodo product IDs remain environment-only.
- Inter is the application sans-serif (`next/font/google`), with Geist Mono for code. Semantic colour tokens in `app/globals.css` follow `docs/DESIGN.md`.
- Visual primitives live in `components/ui`, layout in `components/layout`, shells in `components/navigation`, deal display in `components/deals`, and empty/loading/error patterns in `components/feedback`.
- Dummy Deal card stories live in `components/deals/fixtures.ts` and `/design-system` (noindex, not in public nav, and `notFound()` when `VERCEL_ENV=production`). They are not live product statistics. Locked-field components accept labels/benefits only and must not receive protected values.
