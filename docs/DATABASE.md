# DealAtlas — Database Design

## 1. Database philosophy
DealAtlas uses PostgreSQL/Supabase. The database is intentionally split between:
1. source-bearing canonical data;
2. sanitised public preview data;
3. user-owned data;
4. billing/entitlement data;
5. operational ingestion/audit data.

The browser must never have direct access to source-bearing canonical procurement tables.

## 2. Security boundary
### Directly readable by anonymous/authenticated clients
- `deal_previews` (published sanitised rows only)
- user-owned tables only through RLS policies appropriate to the user

`subscriptions`, `billing_events` and `export_usage` have no anon/authenticated grants. Ordinary clients must not read billing state directly; trusted server code reads the subscription mirror after authentication.

### Never directly readable by ordinary client roles
- `deals`
- `notices`
- `organizations`
- `organization_aliases`
- `requirements`
- `award_criteria`
- `documents`
- `awards`
- `contracts`
- `contract_payments`
- `contract_performance`
- `data_sources`
- `raw_records`
- `ingestion_runs`
- `ingestion_errors`
- `billing_events`

Trusted server code/admin/worker code retrieves these using server-only credentials after its own authorization checks.

## 3. Core entities

### profiles
One row per Supabase Auth user.
- id UUID PK/FK auth.users
- email
- display_name
- role USER/ADMIN
- created_at
- updated_at

### subscriptions
Local mirror of Dodo subscription entitlement state.
- id
- user_id
- provider
- dodo_customer_id
- dodo_subscription_id
- dodo_product_id
- plan_key
- status
- billing_interval
- current_period_start
- current_period_end
- cancel_at_period_end
- cancelled_at
- last_provider_event_at
- created_at
- updated_at

Only webhook/admin server code writes billing state.

### billing_events
Idempotency/audit store for incoming Dodo events.
- provider_event_id unique
- event_type
- payload
- payload_hash
- received_at
- processed_at
- processing_status
- processing_error

### company_profiles
User-specific matching preferences.
- user_id
- company_name
- company_description
- services/products
- preferred categories/CPV
- keywords/negative keywords
- preferred regions
- value range
- certifications
- framework memberships
- buyer sectors

### data_sources
Registry of procurement/opportunity sources and legal/technical access state.
Enabled production sources must pass `private.enforce_source_enablement`. Private/supply-chain onboarding evidence is in `docs/SOURCE_COMPLIANCE_REPORT.md`.
- source_type
- access_method
- reuse_status
- scraping_permitted
- licence metadata
- robots/terms checked dates
- schedule
- enabled

### ingestion_runs
A source execution with counters/status.

### raw_records
Immutable source payload/snapshot identified by source + external record ID + content hash/version.

### organizations
Canonical buyers/suppliers/prime contractors.

### organization_aliases
Maps variant source names/domains/identifiers to canonical organization.

### deals
Canonical source-bearing opportunity record.
Contains exact/source information and Deal lifecycle fields.

### deal_previews
Separate publishable sanitised record.
Must never contain protected source identity.

### notices
Source notice/release/event belonging to a Deal.

### notice_versions
Optional version snapshots where a source updates in place.

### lots
First-class lot records.

### locations / deal_locations
Multi-location support.

### cpv_codes / deal_classifications
Official CPV plus DealAtlas taxonomy/classification mapping.

### deal_organizations
Links organizations to Deals with roles such as buyer, supplier, incumbent or prime contractor.

### requirements
Structured financial/technical/compliance/bid requirements.

### award_criteria
Scored/weighted evaluation criteria.

### documents
Source documents and extracted text metadata.

### document_insights
Derived structured insights from documents.

### awards / award_suppliers
Award results and winning suppliers.

### contracts
Contract created from award/deal, including expiry/extension.

### contract_changes
Material changes/extensions/value updates.

### contract_payments
Payment transparency where lawfully available.

### contract_performance
KPI/poor-performance/breach signals where available.

### commercial_tools
Framework/open framework/dynamic market records.

### commercial_tool_members
Participating suppliers/buyers where appropriate.

### deal_insights
DealAtlas-derived intelligence such as summary, ideal supplier, risk flags, incumbent inference and renewal signals. Each inferred field should retain provenance, confidence and model/version in `field_provenance`. Never present these as official source facts.

### deal_matches
Per-company-profile relevance score and sanitised match/mismatch reasons.

`preview_reasons` is readable by the owning authenticated user and must contain only canned, non-source-identifying labels. `detail_reasons` is a server-only column: table-level SELECT is revoked from `anon`/`authenticated`, then preview-safe columns are granted to `authenticated`. Entitled Pro mismatch notes may refer to protected requirement *types* without copying source identity.

Score columns: `relevance_score` (0–100), plus optional `category_score`, `keyword_score`, `location_score`, `value_score`, `sector_score`, `certification_score`, `semantic_score`.

### match_jobs
Server-only queue for recalculating `deal_matches` after a company profile is saved or a sanitised preview is published. Ordinary client roles have no grants.

### saved_deals
User saves a Deal preview/Deal.

### saved_searches
Stored filter JSON plus alert cadence.

### watched_organizations
Buyer/supplier watch list.

### alerts
Generated notification items. Ordinary client roles have no grants. The application loads rows with a trusted server client and returns an entitlement-safe DTO. `title` and `message` are free-safe. Paid details live in `protected_payload` and are copied into the DTO only after `getCurrentEntitlement` confirms Pro at render/delivery time. `dedupe_key` is unique per user so duplicate generation is rejected by the database.

### export_usage
Rows exported by user/month for limit enforcement. Ordinary client roles have no grants. Trusted server code inserts a usage row after a Pro entitlement check. `private.enforce_export_usage_limit` serializes inserts per user and UTC calendar month with an advisory lock, rejects non-Pro users, forces `billing_month` to the current UTC month, and raises `export row limit reached` before a write that would exceed 1,000 rows.

### data_changes
Material canonical changes used for alerts/history.

## 4. Canonical Deal fields
At minimum:
- id
- primary_source_id
- external_primary_id
- ocid
- reference
- source_title
- source_description
- buyer_organization_id
- deal_type
- buyer_sector
- stage
- status
- main_category
- procurement_method
- special_regime
- currency
- value_min_ex_vat
- value_max_ex_vat
- exact_value_text
- enquiry_deadline
- submission_deadline
- award_decision_date
- contract_start_date
- contract_end_date
- extension_end_date
- next_procurement_date
- estimated_renewal_date
- sme_suitable
- vcse_suitable
- source_url
- application_url
- first_published_at
- latest_source_at
- first_discovered_at
- last_verified_at
- data_quality_score
- source_count
- created_at
- updated_at

## 5. Preview fields
`deal_previews` must use only safe fields:
- deal_id
- slug
- preview_title
- preview_summary
- deal_type
- buyer_sector
- stage
- status
- main_category
- broad_region
- value_band
- deadline_band
- duration_band
- sme_suitability
- bid_complexity
- competition_level
- requirements_preview
- relevance_tags
- first_published_bucket if safe
- freshness_label
- leakage_risk
- is_published
- created_at
- updated_at

Never include source ID, organization ID exposed as discoverable identifier, exact source text, URL, exact reference, exact buyer, domain or contact in this table.

## 6. Preview leakage tests
Before `is_published=true`, reject or flag preview if it contains:
- canonical buyer name
- known buyer aliases
- buyer domain
- source platform name if identifying
- source title substring beyond configured similarity threshold
- tender/reference IDs
- emails
- URLs/domains
- OCID pattern
- phone numbers where source-identifying
- exact rare amount + exact deadline combination where fingerprint risk is high

Store a leakage risk state:
- LOW
- REVIEW
- HIGH

Only LOW may auto-publish. REVIEW/HIGH requires regeneration or admin review.

The application leak scanner in `lib/redaction` is the primary control. `private.detect_preview_leakage` / `enforce_preview_safety` are a database failsafe and must not lower an application REVIEW/HIGH result. Generation attempts and findings are stored on server-only `preview_generation_runs` for admin review.

Paid `deal_insights` rows store per-field provenance (`field_provenance`), `generation_method` and `competition_level`. These are inference, not official source facts.

## 7. Plan limits
Keep commercial limits in application configuration, optionally mirrored in a `plan_features` table later. Do not use Dodo as the sole authorization database.

Suggested V1:
```text
FREE
saved_deals=5
saved_searches=1
exports=0
watched_organizations=0
protected_source_access=false

PRO
saved_deals=10000
saved_searches=50
exports_rows_per_month=1000
watched_buyers=50
watched_suppliers=50
protected_source_access=true
```

## 8. Search strategy
Free search is against `deal_previews` only.

Indexes:
- GIN full-text expression index on preview title + summary
- GIN pg_trgm on preview title
- btree status
- btree deal_type
- btree buyer_sector
- btree main_category
- btree broad_region
- btree value_band
- btree deadline_band
- btree updated_at
- btree is_published

`search_deal_previews` is the public/free RPC. It only reads `deal_previews` and accepts keyword, category, buyer sector, deal type, broad region, status, value band, closing window, limit, and offset.

Signed-in relevance sort/filter uses `search_deal_previews_for_profile`, which still reads published `deal_previews` and RLS-constrained `deal_matches` only. It is granted to `authenticated` and `service_role`, not `anon`. Protected Pro filters that need canonical tables still run through trusted server code after entitlement check.

## 9. Migrations
Included in the build pack:
- `0001_extensions_and_types.sql`
- `0002_core_schema.sql`
- `0003_user_billing_schema.sql`
- `0004_security_and_rls.sql`
- `0005_functions_and_indexes.sql`
- `0006_seed_reference_data.sql`
- `0007_search_preview_filters.sql`
- `0008_find_a_tender_ocds.sql`
- `0009_private_source_onboarding.sql`
- `0010_intelligence_preview_pipeline.sql`
- `0011_matching_pipeline.sql`
- `0012_deal_match_column_privileges.sql`
- `0013_alert_dedupe_and_digest.sql`
- `0014_intelligence_query_indexes.sql

Apply in numeric order with the Supabase CLI (`npx supabase db reset` locally, or `npx supabase db push` to a linked project). Never reset or drop a linked production database.

`supabase/dealatlas_full_schema.sql` is a generated concatenation of those files for SQL Editor use on a fresh project. Regenerate it with `npm run db:bundle` after changing a migration. Do not run the combined file after individual migrations have already been applied.

### TypeScript types
Generate application types from the applied local schema:

```bash
npx supabase start
npm run db:types
```

This writes `lib/db/database.types.ts`. Do not edit that file by hand.

### Query modules
- Public/free: `lib/db/previews.ts` and `lib/search/public.ts` — `deal_previews` and `search_deal_previews` only, with an explicit column list (never `select('*')`). Public search JSON is `/api/search`. Public HTML is `/deals` and `/deals/[slug]`.
- Signed-in relevance: `lib/matching/search.ts` may join `deal_matches` for the caller’s company profile. `lib/matching/persist.ts` writes matches with the admin client. `detail_reasons` is never selected on the user client.
- Browser and cookie-based SSR clients are typed with the granted public surface only (`lib/db/public-schema.ts`).
- Protected canonical tables: `lib/db/canonical.ts` is `server-only` and uses the privileged admin client after an explicit Pro/admin access argument.
- Paid buyer/supplier/contract intelligence: `lib/intelligence/load.ts` reads organisations, deals, awards, contracts, related processes, payments and performance after `getCurrentEntitlement` confirms Pro. Aggregation is query-time. There is no materialized history table; indexes in `0014_intelligence_query_indexes.sql` keep those lookups refreshable as source data changes.
- Billing writes: `lib/billing/store.ts` is `server-only` and uses the admin client for `subscriptions` and `billing_events`. Ordinary client roles still have no grants on those tables.

### Database tests
```bash
npm run db:test      # pgTAP via supabase test db
npm run test:db      # pgTAP plus PostgREST RLS smoke tests against local Supabase
```

## 10. Destructive change rule
Never edit an already-applied production migration. Add a new migration.

Before destructive migrations:
- take a backup
- document rollback
- test against a staging/local clone
- verify row counts and foreign-key impact

## 11. Query patterns
### Public/free
Only query `deal_previews`.

### Subscriber source reveal
Server code:
1. identify user from Supabase SSR session;
2. call central entitlement service;
3. if PRO, use trusted server DB client to query canonical Deal + related entities;
4. return DTO with allowed paid fields;
5. log security-relevant denial but do not log secrets/source payloads.

### Admin
Check `profiles.role=ADMIN` server-side before trusted queries/mutations.

## 12. Database testing requirements
Use Supabase database tests/pgTAP where practical.

Must test:
- RLS enabled on client-facing tables
- anon can only select published previews
- anon cannot insert/update/delete previews
- authenticated normal user cannot read canonical tables
- user can manage only own saved deals/searches/company profile
- subscription, billing event and export usage rows are not directly readable or writable by ordinary client roles; entitlement is read by trusted server code
- user cannot write subscription state
- user cannot promote own role
- user cannot exceed direct table permissions to reveal source
- service/admin paths are covered in application integration tests
