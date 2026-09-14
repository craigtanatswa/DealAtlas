# DealAtlas — Ordered Cursor `/goal` Build Sequence

Use these in order. Run one major goal at a time. Prefer a fresh Agent chat for each major goal. Do not run database/billing/security goals in parallel.

Cursor `/goal` is intended for a long-lived objective. For a difficult goal, you may first paste the optional `/plan` line, review the plan, then paste the `/goal` command.

The global rules in `.cursor/rules/dealatlas.mdc` apply to every goal.

---

## GOAL 1 — Inspect and establish the production foundation

Optional plan:
```text
/plan Inspect the current repository and the DealAtlas specification files. Plan the smallest production-ready foundation that satisfies the documented architecture without implementing business features yet.
```

```text
/goal Establish the production-ready DealAtlas application foundation.

Before making changes, inspect the current implementation and adapt to what already exists. Do not assume the repository is in the state described by the specification. Read all relevant /docs files and .cursor/rules/dealatlas.mdc first.

Target stack:
- Next.js 16 App Router
- TypeScript strict mode
- Tailwind
- shadcn/ui
- Supabase SSR/Auth/Postgres
- Dodo integration dependencies installed but billing features can wait
- Vercel-compatible runtime

Implement/verify:
- clean route and folder structure matching docs/ARCHITECTURE.md
- environment validation with clear server/public separation
- Supabase browser client and SSR/server client helpers
- server-only privileged Supabase client isolated in server-only module
- shared Zod validation conventions
- error/not-found/loading boundaries
- application constants/feature-limit configuration
- no secrets hardcoded
- useful npm scripts for lint, build, test and type checking
- .env.example remains accurate

Do not implement deals, billing, scraping or admin features yet unless required to prove the foundation.

Safeguards:
- do not expose server secrets through NEXT_PUBLIC variables or client imports
- do not introduce a second backend framework
- do not weaken database security
- do not make unrelated visual redesigns

Definition of done:
- npm install succeeds
- lint succeeds
- type checking succeeds
- production build succeeds
- server-only modules cannot be imported by client components without build failure
- document any architecture deviation in docs/ARCHITECTURE.md
```

---

## GOAL 2 — Verify and integrate the Supabase database

```text
/goal Integrate and verify the DealAtlas Supabase database using the committed migrations as the schema source of truth.

Before making changes, inspect the current implementation and adapt to what already exists. Read docs/DATABASE.md, docs/SECURITY.md and all supabase/migrations files first.

Requirements:
- treat migrations as authoritative
- verify migrations are ordered and reproducible
- add generated database TypeScript types/workflow
- create typed data-access modules
- separate public preview queries from protected canonical queries
- public/free query code may access deal_previews only
- protected canonical query modules must be server-only
- add database smoke tests and RLS tests where supported

Never:
- disable RLS
- grant anon/authenticated access to canonical source-bearing tables
- use select('*') in public deal paths
- reset/drop a linked remote production database
- expose the Supabase secret/service credential

If a migration defect is found before production deployment, fix it coherently. If the migration has already been applied to a production database, create a forward migration instead of editing history.

Definition of done:
- local/linked schema can be applied without unresolved SQL errors
- generated types compile
- anon can read published LOW-risk deal_previews
- anon cannot read deals, organizations, notices, documents or data_sources
- authenticated normal user cannot directly read canonical protected tables
- database tests/typecheck/build pass
```

---

## GOAL 3 — Implement authentication, user profile and admin role foundation

```text
/goal Implement secure DealAtlas authentication and account foundations with Supabase Auth.

Before making changes, inspect the current implementation and adapt to what already exists. Read docs/PRODUCT.md, docs/ARCHITECTURE.md and docs/SECURITY.md.

Implement:
- email/password signup
- email verification flow
- login/logout
- forgot/reset password
- SSR session handling
- protected /app routes
- account/profile screen
- company profile shell
- admin route guard based on server-controlled profiles.role
- useful auth loading/error states

The database trigger owns profile creation. Do not create duplicate profile rows from the browser unless needed as a recovery path with proper safeguards.

Security:
- do not trust role from client metadata
- never expose an endpoint that lets a user promote themselves
- protect admin routes server-side
- prevent open redirects in auth callbacks

Definition of done:
- signup/login/logout/reset work locally
- unauthenticated user is redirected from /app
- normal user receives 403/not-found behavior for /admin
- auth integration tests pass
- lint/typecheck/build pass
```

---

## GOAL 4 — Implement the DealAtlas design system and application shell

```text
/goal Build the DealAtlas visual system and responsive application shells according to docs/DESIGN.md without inventing product data.

Before making changes, inspect current components and reuse what already exists.

Implement:
- semantic design tokens
- typography/layout primitives
- public navigation/footer
- authenticated app navigation
- admin navigation shell
- accessible buttons/forms/dialogs/tables/cards/badges
- mobile navigation
- empty/loading/error component patterns

Create reusable Deal card, status, value-band, deadline-band, match-score and locked-field components using dummy component stories/test fixtures only, not fake production statistics.

Do not blur real protected content. Locked components must render placeholders/benefits without receiving protected values.

Definition of done:
- consistent desktop/mobile layout
- keyboard/focus behavior is usable
- no obvious contrast failures
- lint/typecheck/build pass
```

---

## GOAL 5 — Build public/free deal search and anonymised Deal pages

```text
/goal Implement the complete public/free DealAtlas discovery experience using only the sanitised deal_previews data surface.

Before making changes, inspect current implementation and read docs/PRODUCT.md, docs/DATABASE.md, docs/SECURITY.md and docs/DESIGN.md.

Implement:
- /deals search page
- keyword search
- basic filters: category, buyer sector, broad region, value band, closing window, deal type/status as available
- pagination
- results count
- /deals/[slug] preview page
- free Deal card/detail UI
- locked source/buyer panel
- responsive filter drawer
- empty/loading/error states

Critical anti-bypass requirements:
- no canonical Deal/source query is allowed in public/free route code
- all payloads come from deal_previews/search_deal_previews
- metadata also comes only from preview data
- no buyer IDs/names, source URLs, source titles, OCIDs, procurement references, documents or contacts are returned
- do not send protected fields and hide them in React/CSS

Add automated tests that inspect JSON/HTML/RSC responses for seeded protected markers and fail if they leak.

Definition of done:
- free visitor can discover useful opportunities
- free visitor cannot recover source identity from normal responses
- direct attempts to call protected data paths fail
- lint/typecheck/build/tests pass
```

---

## GOAL 6 — Implement central entitlement service and protected Deal API boundary

```text
/goal Build the DealAtlas entitlement and protected-data boundary before connecting live billing.

Before making changes, inspect current code and read docs/SECURITY.md and docs/BILLING_DODO.md.

Implement a single server-side entitlement service that resolves FREE or PRO from the local subscriptions mirror and paid-through period.

Implement protected Deal data access as server-only modules/routes/actions that:
1. authenticate the user;
2. require PRO;
3. validate Deal ID;
4. query canonical tables using server-only elevated database access;
5. map results into an explicit paid DTO;
6. never expose secrets/internal raw payloads unnecessarily.

Implement a safe mocked/test fixture path for entitlement tests without granting production Pro manually from query parameters.

Add tests proving:
- anonymous rejected
- authenticated FREE rejected
- client-side plan tampering rejected
- active PRO fixture accepted
- expired/on-hold fixture rejected according to documented policy

Do not implement a UI bypass or temporary source reveal.

Definition of done:
- protected API boundary exists and is tested independently of checkout
- canonical tables remain inaccessible directly to client roles
- lint/typecheck/build/tests pass
```

---

## GOAL 7 — Integrate Dodo Payments subscriptions end-to-end

Optional plan:
```text
/plan Inspect the current Dodo Payments Next.js adaptor documentation and the existing DealAtlas billing schema, then plan checkout, webhook, local entitlement sync and customer portal integration without granting access from redirect state.
```

```text
/goal Implement production-grade Dodo Payments subscription billing for DealAtlas Pro using the current official Next.js integration patterns.

Before making changes, inspect the current implementation and adapt to it. Read docs/BILLING_DODO.md and docs/SECURITY.md. Check current official Dodo documentation/SDK types instead of assuming an old webhook shape.

Implement:
- monthly and annual plan mapping using DODO_PRO_MONTHLY_PRODUCT_ID and DODO_PRO_ANNUAL_PRODUCT_ID
- authenticated checkout creation
- strict allowlist of plan keys/product IDs
- server-generated user_id/plan metadata where supported
- return/success page that waits for verified entitlement
- signed webhook handler using official adapter
- idempotent billing_events processing
- subscription.active/renewed/updated/plan_changed/on_hold/cancelled/failed/expired handling as supported
- payment success/failure reconciliation where useful
- local subscriptions mirror
- out-of-order event protection/reconciliation
- /app/billing
- Dodo Customer Portal session generated server-side from the current user only

Never:
- trust ?success=true
- grant Pro before verified provider state
- allow browser to choose arbitrary product ID or user ID
- expose Dodo API/webhook secrets
- process unsigned webhook payloads

Add automated tests with fixture payloads for lifecycle and idempotency.

Definition of done:
- Dodo test-mode monthly checkout works
- annual checkout works
- webhook updates local entitlement
- duplicate webhook is harmless
- failed/on-hold/cancelled/renewed transitions behave correctly
- Customer Portal works
- free user cannot forge Pro
- lint/typecheck/build/tests pass
```

---

## GOAL 8 — Complete Pro Deal reveal and conversion/paywall experience

```text
/goal Complete the DealAtlas Free-to-Pro conversion path and full paid Deal detail experience.

Before making changes, inspect existing search, entitlement and billing implementations. Follow docs/PRODUCT.md and docs/DESIGN.md.

Free page:
- shows useful anonymised commercial information
- shows clearly labelled locked fields/benefits
- upgrade CTA initiates authenticated Dodo checkout flow

Pro page:
- exact buyer/company identity
- exact source title/reference
- source/application URL
- exact value/deadlines/location
- procurement contact when lawful/published for supplier use
- requirements
- lots
- award criteria
- documents/links where permitted
- lifecycle timeline
- source provenance in a clear paid-only area

Do not expose fields that source licence/terms forbid redistributing. Link to original source/document where linking is the permitted approach.

Definition of done:
- anonymous/free users cannot get paid DTO
- active Pro can open exact source data
- source URLs open safely with external-link UX
- checkout-to-webhook-to-reveal flow works in test mode
- tests/lint/typecheck/build pass
```

---

## GOAL 9 — Build the ingestion framework and official UK public-data adapter

```text
/goal Build the DealAtlas production ingestion pipeline and make Find a Tender official data the first working source.

Before making changes, inspect repository and read docs/DATA_INGESTION.md, docs/DATABASE.md and docs/SECURITY.md. Confirm the current official Find a Tender/OCDS interface rather than scraping HTML if an official data endpoint exists.

Implement:
- SourceAdapter interface
- compliance gate
- source-specific discovery/fetch/parse stages
- raw immutable snapshots
- Zod validation
- normalisation
- organization resolution
- lifecycle linking/deduplication
- lots
- notices/versioning
- requirements/criteria where present
- awards/contracts where present
- per-record error isolation
- ingestion run counters
- retry/backoff
- command: npm script to ingest one source
- saved test fixtures; routine tests do not require the live site

Implement the Find a Tender adapter using official/open mechanisms and recorded licence metadata.

Do not bypass access controls or weaken source compliance gates.

Definition of done:
- a fixture ingestion creates canonical Deals/notices/lots correctly
- a controlled live smoke run imports real records
- re-running unchanged data does not create duplicates
- changed source record creates version/change state
- failures are logged without stopping other records
- lint/typecheck/build/tests pass
```

---

## GOAL 10 — Build private-company/supply-chain source onboarding and adapters

```text
/goal Make private-sector procurement a real, safely onboarded DealAtlas data channel.

Before making changes, inspect docs/DATA_INGESTION.md and current adapters. Use web research only to assess official/public source pages and their current access/reuse terms. Do not assume that public visibility equals permission to scrape/repackage.

Create docs/SOURCE_COMPLIANCE_REPORT.md containing candidate UK private-company, infrastructure, prime-contractor and supply-chain opportunity sources with:
- official source URL
- opportunity type
- access method
- terms/licence evidence
- robots/access notes
- reuse status
- whether automated scraping is permitted
- date checked
- implementation decision

Onboard and automate only sources with clear evidence sufficient to mark OPEN_LICENSE, PERMISSION_GRANTED, LICENSED or TERMS_REVIEWED plus scraping_permitted when HTML automation is used.

Target at least 3 useful private/supply-chain sources if clear permission/terms allow it. If fewer than 3 can be safely approved, implement only the clearly permitted sources and leave the rest UNKNOWN/disabled. Do not lower the compliance standard to hit the number.

For each enabled private source:
- dedicated adapter
- fixtures
- extraction tests
- canonical mapping to RFP/RFQ/private tender/supply-chain/subcontract/pipeline types
- source provenance
- preview pipeline compatibility

Never bypass logins, CAPTCHAs, subscription barriers or technical restrictions.

Definition of done:
- private source adapter framework is reusable
- at least all clearly permitted researched sources are represented in data_sources
- enabled ones ingest successfully
- UNKNOWN/PROHIBITED are blocked by database/application gate
- compliance report exists
- tests/lint/typecheck/build pass
```

---

## GOAL 11 — Build intelligence extraction, redaction and preview leak prevention

```text
/goal Build DealAtlas intelligence extraction and the anti-bypass preview generation system.

Before making changes, inspect current canonical ingestion and read docs/DATA_INGESTION.md and docs/SECURITY.md.

Implement pipeline stages for:
- DealAtlas-generated non-verbatim preview title
- paraphrased preview summary
- value band
- deadline band
- duration band
- broad region
- high-level requirements preview
- SME suitability
- bid complexity
- competition level
- full paid intelligence fields with provenance/confidence

Implement deterministic leak scanning for:
- buyer canonical name/aliases
- buyer domains
- URLs
- email addresses
- phone numbers when identifying
- OCIDs/reference IDs
- source-platform identifiers
- excessive source-title/description similarity
- exact rare amount/deadline/location fingerprint combinations

The database trigger is a failsafe, not the whole scanner.

Only LOW-risk previews may publish. REVIEW/HIGH must regenerate or enter admin review.

If using an LLM for summaries/extraction:
- isolate provider behind interface
- store model/version/confidence
- never allow model output to override deterministic leak checks
- source facts and inference remain visibly separate

Definition of done:
- real canonical records produce useful previews
- seeded leak attempts are blocked
- preview does not contain source identity
- paid intelligence retains provenance
- tests/lint/typecheck/build pass
```

---

## GOAL 12 — Implement company profile and opportunity matching

```text
/goal Implement DealAtlas supplier company profiles and useful opportunity relevance matching.

Before making changes, inspect existing profile, preview and canonical data models.

Implement company profile fields from docs/PRODUCT.md and a matching service combining:
- categories/CPV
- keywords/negative keywords
- region
- value range
- buyer sector
- certifications/framework memberships where safe/available
- semantic similarity only if a reliable embedding/model provider is configured

Create per-user Deal match rows with a 0-100 score and sanitised preview reasons.

Free users:
- one company profile
- can see limited/safe score and reasons without source identity

Pro users:
- richer reasons/mismatches may be returned server-side where they rely on protected requirements

Never place exact protected requirement/source content into directly readable deal_matches preview fields.

Definition of done:
- editing company profile recalculates/queues relevant matches
- search can sort/filter by relevance for signed-in users
- negative keywords reduce bad matches
- source identity is not leaked through reasons
- tests/lint/typecheck/build pass
```

---

## GOAL 13 — Implement saved deals, saved searches and recurring alerts

```text
/goal Build DealAtlas retention workflows: saves, saved searches, material-change alerts and digests.

Before making changes, inspect quotas/RLS and docs/PRODUCT.md.

Implement:
- save/unsave Deal
- free quota 5 saved deals
- saved searches
- free quota 1 saved search
- Pro quota 50 saved searches
- alert preferences
- alert evaluation job
- new match alerts
- Deal changed alerts
- deadline alerts
- renewal alerts
- in-app alert centre through a server endpoint that returns an entitlement-safe DTO
- email digest abstraction

Free alert content must say an opportunity/match exists but must not reveal protected source identity.
Pro alert content may include paid details after server entitlement verification at delivery/render time.

Do not expose alerts.protected_payload directly to browser clients.

Definition of done:
- quota triggers and app UX agree
- duplicate alert generation is prevented where appropriate
- free digest cannot bypass paywall
- Pro alerts are actionable
- tests/lint/typecheck/build pass
```

---

## GOAL 14 — Build buyer, supplier, award, contract and renewal intelligence

```text
/goal Turn DealAtlas historical procurement data into paid buyer/supplier/contract intelligence and renewal discovery.

Before making changes, inspect populated canonical data and do not invent history that is not supported by evidence.

Implement paid-only views/services/pages for:
- buyer procurement history
- category/value activity
- related awards
- winning suppliers
- known incumbents
- contract start/end/extension
- expiring contracts
- related previous/next procurements
- renewal signals with confidence
- payment/performance data where available
- supplier/competitor history

Create materialised/aggregated metrics only when needed for performance and keep them refreshable.

All buyer/supplier identities remain paid-only unless a later product rule explicitly changes this.

Clearly label inferred renewal/incumbent signals as DealAtlas analysis.

Definition of done:
- Pro user can research buyer/supplier/contract context
- free user cannot enumerate organization identity endpoints
- renewal page surfaces evidence-based upcoming opportunities
- tests/lint/typecheck/build pass
```

---

## GOAL 15 — Implement protected CSV exports and quotas

```text
/goal Implement secure DealAtlas Pro CSV export with server-side quotas and spreadsheet-injection protection.

Before making changes, inspect entitlement and filtering code.

Requirements:
- Pro only
- export currently filtered result set/selected Deals
- exact paid fields only after entitlement check
- maximum 1,000 exported rows per billing month for Pro launch plan
- record export_usage transactionally
- reject over-limit before generating excessive output
- escape cells beginning with =, +, -, @ to prevent spreadsheet formula injection
- UTF-8 valid CSV
- sensible file naming
- no internal raw payloads/secrets

Definition of done:
- free export rejected
- paid export succeeds
- quota enforced across repeated requests
- formula-injection fixtures safe
- tests/lint/typecheck/build pass
```

---

## GOAL 16 — Build the admin/data-quality operations console

```text
/goal Build the secure DealAtlas admin console required to operate the database in production.

Before making changes, inspect role guards and canonical schema.

Admin capabilities:
- dashboard ingestion health
- source registry and compliance status
- source enable/disable workflow respecting DB gates
- ingestion runs/errors
- raw record/source link inspection
- canonical Deal inspection/edit where appropriate
- compare canonical vs preview
- preview leakage status/review/regenerate
- organization merge/dedup candidates
- notice/version history
- stale records
- failed documents/intelligence jobs
- manual re-ingestion/reprocessing actions
- billing event diagnostics read-only where useful

Security:
- ADMIN server check on every admin page/action
- no browser service key
- no public admin mutation API
- audit meaningful admin changes

Definition of done:
- normal user/Pro subscriber cannot access admin data/actions
- admin can diagnose a broken source-to-preview pipeline
- admin can keep a risky preview unpublished
- tests/lint/typecheck/build pass
```

---

## GOAL 17 — Technical SEO, marketing pages and legal/product trust pages

```text
/goal Make DealAtlas technically ready for organic discovery and customer trust without beginning the later UK SEO acquisition campaign.

Before making changes, read docs/TECHNICAL_SEO.md and docs/SECURITY.md.

Implement:
- homepage
- pricing
- how it works
- contact page
- privacy/terms/cookie pages with clearly marked areas requiring final business/legal review
- metadata
- canonicals
- sitemap
- robots
- noindex logic for thin/unsafe previews and internal search URLs
- OpenGraph metadata
- helpful category landing-page architecture without mass-generating thin pages
- Search Console/analytics integration hooks/config placeholders

CRITICAL:
All public Deal SEO metadata uses deal_previews only. Never leak buyer/source identity into metadata, JSON-LD, page source or sitemap.

Do not create the UK keyword strategy, ad campaigns or sales funnel yet.

Definition of done:
- representative public pages have correct metadata
- unsafe/unpublished Deal previews are not indexable
- internal app/admin routes are not indexed
- no protected markers in metadata tests
- lint/typecheck/build pass
```

---

## GOAL 18 — Scheduled jobs, email delivery and production observability

```text
/goal Make DealAtlas operationally reliable with scheduled ingestion, alert delivery and monitoring.

Before making changes, inspect existing jobs and deployment model.

Implement:
- GitHub Actions scheduled ingestion workflow with manual dispatch
- source batching/failure isolation
- preview regeneration for changed deals
- alert evaluation/delivery job
- weekly renewal signal job
- stale-source/data-quality checks
- email provider integration using server-only key
- monitoring/error reporting integration or a clean provider abstraction if credentials are not yet configured
- structured logs without secrets
- health/admin indicators

Repository secrets are never committed.

Respect each source schedule/rate limits/terms.

Definition of done:
- jobs can run manually in a safe test mode
- one failed source does not stop others
- alert email test works when provider key is configured
- errors are diagnosable
- lint/typecheck/build/tests pass
```

---

## GOAL 19 — Full security and end-to-end test hardening

```text
/goal Perform an adversarial DealAtlas security, anti-leak and end-to-end test pass and fix every launch-blocking defect found.

Do not add unrelated features or redesign the app.

Test these journeys:

Anonymous:
Homepage → Search → Preview → attempts to reveal source → Pricing/Signup

Free account:
Login → Company profile → Relevance → Save preview → Saved search → locked Deal → Checkout

Pro:
Checkout/webhook fixture → exact Deal → source/apply link → buyer intelligence → save/search/alert → export → billing portal

Admin:
Login → source registry → ingestion run → canonical Deal → preview leak review

Attack tests:
- query canonical tables through Supabase client
- manually call paid API as anonymous/free
- tamper plan/product/user IDs
- forge success URL
- forge/duplicate webhook
- guess Deal IDs
- inspect HTML/JSON/RSC for protected source markers
- inspect SEO metadata
- attempt XSS from scraped source content
- attempt arbitrary URL fetch/SSRF path
- CSV formula injection
- privilege escalation to ADMIN

Run:
- unit tests
- integration tests
- database/RLS tests
- Playwright E2E
- lint
- typecheck
- production build

Fix launch-blocking issues. Do not weaken security to make tests pass.

Definition of done:
- no known critical/high source-leak path
- all critical journeys pass
- all required checks pass
- create docs/SECURITY_TEST_REPORT.md with evidence and remaining non-blocking risks
```

---

## GOAL 20 — Production release and market-ready audit

```text
/goal Perform the final DealAtlas production-readiness audit and prepare the application for real UK customers.

Before making changes, inspect the whole repository and all docs. Do not add major new product scope.

Verify:
- production environment validation
- Supabase migrations/RLS/grants
- auth redirect URLs/email verification
- no demo/placeholder records visible
- Dodo live configuration is environment-driven
- webhook route and customer portal ready for live keys
- public/private permitted ingestion sources healthy
- data freshness indicators
- preview leak scanner health
- Pro source reveal
- quotas
- alerts/email
- admin controls
- backups/recovery notes
- error monitoring
- accessibility/mobile
- technical SEO
- legal/trust page placeholders clearly identified for final review
- production build

Create/update docs/LAUNCH_CHECKLIST.md with only manual actions still required, such as inserting live credentials, Dodo merchant activation, domain/DNS and final legal review.

Do not fabricate completion of external steps that require account credentials or approvals.

Definition of done:
- npm build/lint/typecheck/test suites pass
- security report has no unresolved launch blocker
- application can deploy successfully to Vercel
- production configuration fails safely when required secrets are missing
- DealAtlas is technically market-ready once the documented external manual items are completed
```

---

# After Goal 20
Stop. Do not start Google Ads or the UK SEO acquisition funnel until explicitly instructed.
