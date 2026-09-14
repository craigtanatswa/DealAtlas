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
      /buyers/[id]
      /suppliers/[id]
      /contracts
      /renewals
  /(admin)
    /admin
  /api
    /deals/[id]
    /search
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
  /monitoring
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
  /send-alerts.ts
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
- optional Google OAuth only after core auth is stable

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
Browser → `/deals/[slug]` → `deal_previews` only.

### Pro detail
Browser → authenticated server route/server action → entitlement check → protected canonical tables → response.

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

## 10. Preview generation/redaction
Every canonical deal gets a separate `deal_previews` row.

Preview generation rules:
- create a non-verbatim DealAtlas title;
- paraphrase descriptions;
- generalise value into a band when exact value risks fingerprinting;
- generalise deadline to a window where exact date/time risks fingerprinting;
- generalise exact location to a broad region where required;
- strip buyer names, source platform names, domains, email addresses, IDs and quoted phrases;
- run deterministic leak checks before publishing;
- optionally run AI-assisted redaction, but deterministic rules remain mandatory;
- store a `leakage_risk` score/status;
- do not publish previews marked HIGH risk until reviewed or regenerated.

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
MVP scheduled jobs:
- frequent active-source ingestion, frequency configurable per source
- daily stale-source checks
- daily preview regeneration for changed deals
- daily alert matching/delivery
- nightly data-quality rollup
- weekly contract-renewal recalculation

Avoid recurrence faster than source terms/rate limits permit.

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

Never log secrets, full card/payment details or unnecessary personal data.

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

## 19. Deployment
Vercel deploys web application.

Production environment variables are configured in Vercel.

Supabase migrations are source-controlled and applied deliberately.

GitHub Actions ingestion uses repository/environment secrets with least privilege. It may use a Supabase secret/service credential because it is a trusted server worker; never expose that key to the client.

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
