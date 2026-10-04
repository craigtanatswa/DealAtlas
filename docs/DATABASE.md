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
### Reachable by anonymous/authenticated clients
- published sanitised previews **only through the preview DTO RPCs** (`search_preview_dtos`, `get_preview_dto_by_slug`, `list_preview_sitemap_entries`, `count_preview_sitemap_entries` for anon; plus `get_preview_dto_by_deal_id`, `resolve_preview_deal_id`, `list_saved_deal_previews` for signed-in users). After `0019` client roles have no table grant or policy on `deal_previews`.
- user-owned tables only through RLS policies appropriate to the user

The DTO RPCs are `SECURITY DEFINER` with an empty `search_path`. They return no `deal_id` (except the signed-in resolve/saved RPCs), no timestamps and no source, buyer, reference, contact or document fields. Relevance comes from the caller's own company profile via `auth.uid()`. After `0019` client roles have no USAGE on any schema except `public` and `auth`, and no EXECUTE on any other public function.

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
- `job_runs`
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
Server-only table (service role) after `0019`; clients use the DTO RPCs.

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

`preview_reasons` is not readable by clients (0018 revokes the 0012 column grant); the DTO RPCs project canned labels from the reason code only (`private.preview_dto_reasons`), so stored label text never reaches a client. `detail_reasons` is a server-only column: table-level SELECT is revoked from `anon`/`authenticated`, then preview-safe columns are granted to `authenticated`. Entitled Pro mismatch notes may refer to protected requirement *types* without copying source identity.

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

### job_runs
Server-only history of scheduled operational jobs (`ingest`, `previews`, `alerts`, `renewals`, `data-quality`). Ordinary client roles have no grants. Summaries must not contain secrets.

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
- unpublished_by_admin (admin hold; never a public search field)
- created_at
- updated_at

Never include source ID, organization ID exposed as discoverable identifier, exact source text, URL, exact reference, exact buyer, domain or contact in this table.

## 6. Preview leakage tests
The database publish gate (`0018`) decides publication. `private.enforce_preview_safety` runs `private.detect_preview_leakage` on every `deal_previews` insert and update, including `session_replication_role = replica` (`enable always trigger`). Risk can only be raised by the writer; any non-LOW risk or admin hold forces `is_published = false`; a gate error fails closed to `REVIEW`. `private.preview_leak_findings` returns the per-rule findings. The TypeScript scanner in `lib/redaction/scan.ts` mirrors the same rules so ingestion can regenerate before writing; shared synthetic fixtures in `tests/fixtures/leak-gate/cases.json` keep the two in parity (`npm run db:gen-leak-parity` regenerates the pgTAP file). Vocabulary lives in `lib/redaction/gate-vocabulary.ts` and is seeded into `private.leak_gate_terms`; changing it needs a new migration.

The gate flags (HIGH unless noted):
- buyer name, aliases, acronyms/initials, distinctive buyer tokens (4-letter tokens are REVIEW) and buyer web/email domains. Acronym-style aliases (all caps, or mixed case with two or more capitals) match case-insensitively in prose and slug; other 2–3 character aliases are REVIEW
- any organisation name or alias from the full `organizations`/`organization_aliases` tables of 3+ characters, ignoring Ltd/Limited/LLP/plc suffixes (single distinctive token is REVIEW; names under 5 characters also skip generic acronyms and proper words), plus Title-Case runs ending in a legal suffix
- copied source title (also for titles shorter than 20 characters), slug or description similarity, and any copied 6-word phrase
- reference numbers, OCIDs, notice IDs and UUIDs; other reference-like patterns are REVIEW
- source dates in Europe/London time within ±1 day in common written forms, including yearless `DD/MM`, `D/M`, `DD.MM`, `D.M`, `DD-MM`, `D-M` and `DD MM` (digit boundaries, so decimals such as `14.035` are not dates); any other exact date is REVIEW, never LOW (day + month with or without a year, `May 14`, yearless `D/M` other than `24/7`, `D-Mon-YYYY`)
- full postcodes, outward codes of known buyer/linked/location postcodes; other outward-code shapes (in prose, or as slug words) are REVIEW
- exact location fragments and buyer address terms, and single distinctive words of them in any case and in the slug (`LOCATION_TOKEN`, HIGH from 5 characters, otherwise REVIEW; place-type words such as "Depot" or "Yard" are generic); project names; exact source amounts; URLs, emails, phones and source platform markers
- programme acronyms (HIGH when copied from source, otherwise REVIEW) and Title-Case place/site runs in prose (REVIEW unless copied)
- source names in any case, including the slug (`SOURCE_NAME_TOKEN`): standalone source acronyms (HIGH) and capitalised words that follow a lowercase word in the source and never appear lowercase there (HIGH from 5 characters, otherwise REVIEW). All-caps runs and fields, generic vocabulary and capitalised defined terms ("the Contractor") are ignored
- rare source words (`SOURCE_RARE_WORD`, REVIEW, database-only): capitalised source words in any position (Title-Case titles, sentence starts, ALL-CAPS headings) that the source never writes in lowercase, appear anywhere in the preview or slug, and occur in fewer than three other deals (`deals_leak_source_tsv_idx`, up to 20 candidates)
- combination risk: when four distinctive copied source words (title, prose and slug) match fewer than three deals in total, REVIEW (k < 3)
- the slug is scanned with its trailing 8-hex suffix removed

Admin holds (`unpublished_by_admin`) are recorded per deal in `private.preview_holds`, which no API role (including `service_role`) can read or write. While a hold row exists the gate forces `unpublished_by_admin = true`, so ingestion upserts that reset the flag, forged session settings, deleting/re-inserting the preview and deleting/re-creating the deal (the table has no foreign key) all keep the hold. Only `public.admin_release_preview_hold` (service role, called after the app's ADMIN check) deletes the hold row.

Original minimum checklist (all covered by the gate) — before `is_published=true`, reject or flag preview if it contains:
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

Only LOW may auto-publish. REVIEW/HIGH requires regeneration or admin review. An administrator can set `unpublished_by_admin` to keep a preview unpublished even when risk is LOW.

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
Free search is against `deal_previews` only, through `search_preview_dtos`.

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

`search_preview_dtos` is the public/free and signed-in search RPC. It only reads published LOW-risk, non-held `deal_previews` and the caller's own `deal_matches`, and accepts keyword, category, buyer sector, deal type, broad region, status or statuses, value band, closing window, minimum score, sort (`updated`/`relevance`), limit (max 50) and offset (max 10000).

The legacy `search_deal_previews` / `search_deal_previews_for_profile` RPCs return `deal_id`. Until `0019` they are client-callable (`search_deal_previews_for_profile` is security definer, joins only the caller's own matches, and returns empty `preview_reasons` to client roles). After `0019` they are service-role only; Pro CSV export uses the profile search with the admin client after the entitlement check. Protected Pro filters that need canonical tables still run through trusted server code after entitlement check.

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
- `0014_intelligence_query_indexes.sql`
- `0015_export_usage_quota.sql`
- `0016_admin_operations.sql`
- `0017_job_runs.sql`
- `0018_preview_gate_v2_and_dto_rpcs.sql` (additive; apply before the app release that uses the DTO RPCs)
- `0019_revoke_client_preview_table_access.sql` (apply only after that app release is live)

Apply in numeric order with the Supabase CLI (`npx supabase db reset` locally, or `npx supabase db push` to a linked project). Never reset or drop a linked production database. `db push` applies every pending file, so roll out `0018` and `0019` as separate pushes (push from a checkout without `0019`, deploy the app, then push again) or apply them manually in order.

#### 0018/0019 rollout checks
Before applying `0018`, count current subscriptions that would lose Pro under the fail-closed paid-through rule:

```sql
select count(*) from public.subscriptions
where is_current and current_period_end is null
  and (status = 'ACTIVE' or (status = 'CANCELLED' and cancel_at_period_end));
```

`0018` gates new writes only; existing previews keep their old verdict until rewritten. After `0018`, dry-run the new gate over **every** preview (published, unpublished and held), then re-gate all of them, so the stored risk of unpublished and held rows also reflects the v2 rules and the admin review queue starts from the current verdict. Replica mode skips the `updated_at` touch trigger, while the gate trigger is `ALWAYS` and still fires. Holds stay in place because they are recorded in `private.preview_holds`:

```sql
-- dry run: what the new gate says for every preview
select dp.is_published, dp.unpublished_by_admin, dp.leakage_risk as stored_risk,
       private.detect_preview_leakage(
         dp.deal_id, dp.slug, dp.preview_title, dp.preview_summary,
         dp.requirements_preview, dp.relevance_tags, dp.broad_region
       ) as new_risk,
       count(*)
from public.deal_previews dp
group by 1, 2, 3, 4
order by 1, 2, 3, 4;

-- re-gate every preview in place (risk can only rise)
begin;
set local session_replication_role = replica;
update public.deal_previews set leakage_risk = leakage_risk;
commit;
```

Rollback scripts for `0018` and `0019` are in `supabase/rollback/`; see `DATABASE_SETUP.md`.

`supabase/dealatlas_full_schema.sql` is a generated concatenation of those files for SQL Editor use on a fresh project. Regenerate it with `npm run db:bundle` after changing a migration. Do not run the combined file after individual migrations have already been applied.

### TypeScript types
Generate application types from the applied local schema:

```bash
npx supabase start
npm run db:types
```

This writes `lib/db/database.types.ts`. Do not edit that file by hand.

### Query modules
- Public/free: `lib/db/previews.ts` and `lib/search/public.ts` — preview DTO RPCs only, never a table read on `deal_previews`. Public search JSON is `/api/search`. Public HTML is `/deals` and `/deals/[slug]`. Anonymous payloads never carry `deal_id`; signed-in slug pages resolve it with `resolve_preview_deal_id` for save/reveal controls.
- Signed-in relevance: `lib/matching/search.ts` reads the caller's match from `search_preview_dtos` (resolved from `auth.uid()` inside the RPC). `lib/matching/persist.ts` writes matches with the admin client. `detail_reasons` is never selected on the user client.
- Browser and cookie-based SSR clients are typed with the granted public surface only (`lib/db/public-schema.ts`).
- Protected canonical tables: `lib/db/canonical.ts` is `server-only` and uses the privileged admin client after an explicit Pro/admin access argument.
- Paid buyer/supplier/contract intelligence: `lib/intelligence/load.ts` reads organisations, deals, awards, contracts, related processes, payments and performance after `getCurrentEntitlement` confirms Pro. Aggregation is query-time. There is no materialized history table; indexes in `0014_intelligence_query_indexes.sql` keep those lookups refreshable as source data changes.
- Billing writes: `lib/billing/store.ts` is `server-only` and uses the admin client for `subscriptions` and `billing_events`. Ordinary client roles still have no grants on those tables.
- Admin operations: `lib/admin` is `server-only` besides the `"use server"` action module. It uses the privileged admin client after `requireAdmin()`. Mutations write `admin_audit_events`. Ordinary client roles have no grants on that table. `deal_previews.unpublished_by_admin` keeps a preview unpublished even when leakage risk is LOW.

### Database tests
```bash
npm run db:test      # pgTAP via supabase test db --local
npm run test:db      # pgTAP plus PostgREST RLS smoke tests against local Supabase
npm run db:gen-leak-parity  # regenerate leak_gate_parity.test.sql from the shared fixtures
```

Database tests refuse non-loopback targets (`scripts/db-target-guard.mjs`, enforced in vitest `globalSetup`, `scripts/run-db-tests.mjs` and Playwright helpers). A disposable remote project needs `DEALATLAS_DB_TEST_ALLOW_REMOTE=1`, `DEALATLAS_DB_TEST_REMOTE_HOST=<host>` and `DEALATLAS_PROD_SUPABASE_URL` or `DEALATLAS_PROD_SUPABASE_PROJECT_REF`; the production project is always refused.

## 10. Destructive change rule
Never edit an already-applied production migration. Add a new migration.

Before destructive migrations:
- take a backup
- document rollback
- test against a staging/local clone
- verify row counts and foreign-key impact

### Backups and recovery

This is the operator procedure. Enabling backups on the hosted project is a dashboard action; see `docs/LAUNCH_CHECKLIST.md`. Do not treat this section as proof that production PITR is already on.

### What to enable
- Use a Supabase plan that includes daily backups. Turn on **Point in Time Recovery** for production if the plan offers it.
- Record the project ref, the AWS region, and who can restore (Dashboard → Project Settings → Infrastructure).
- Keep Vercel, Dodo, Resend, and GitHub secrets outside Git. A database restore does not restore those.

### What this repository must never do
- Do not run `npx supabase db reset` against a linked production database.
- Do not rewrite applied production migrations. Add a new numbered file.
- Do not restore by copying local E2E/canary seed data into production.

### Restore outline
1. Stop ingestion/alert GitHub Actions (disable the workflow or cancel runs) so workers do not write into a half-restored database.
2. In Supabase, restore the backup or PITR timestamp into the existing project **or** restore into a new project if you need a side-by-side check.
3. If you restored into a new project: update Vercel and GitHub Actions `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SECRET_KEY`, then redeploy.
4. Re-confirm Data API schemas (`public` only) and that canonical table grants were not widened.
5. Run a production smoke: anonymous `/deals` has no source identity; a known Pro user still has webhook-backed entitlement; admin overview loads.
6. Re-enable scheduled jobs only after those checks.

### Application-only recovery
If the database is intact but the web app is bad: redeploy a previous Vercel production deployment. Entitlement still comes from `subscriptions` + verified webhooks, not from the checkout redirect.

### RPO/RTO
Pick values you can actually honour (for example: PITR with hourly granularity, restore measured in hours, ingestion gap until the next scheduled job). Write them next to the backup owner when you enable the hosted feature.

## 11. Query patterns
### Public/free
Only call the preview DTO RPCs over `deal_previews`.

### Subscriber source reveal
Server code:
1. identify user from Supabase SSR session;
2. call central entitlement service;
3. if PRO, use trusted server DB client to query canonical Deal + related entities;
4. return DTO with allowed paid fields;
5. log security-relevant denial but do not log secrets/source payloads.

### Admin
Check `profiles.role=ADMIN` server-side before trusted queries/mutations. Meaningful mutations write `admin_audit_events`. `unpublished_by_admin` on `deal_previews` is the hold that prevents auto-publish after regeneration.

## 12. Database testing requirements
Use Supabase database tests/pgTAP where practical.

Must test:
- RLS enabled on client-facing tables
- anon cannot select `deal_previews` directly and only receives published LOW-risk, non-held DTOs from the RPCs
- anon cannot insert/update/delete previews
- authenticated normal user cannot read canonical tables
- user can manage only own saved deals/searches/company profile; a free caller does not receive saved rows whose deal is unpublished or held
- subscription, billing event and export usage rows are not directly readable or writable by ordinary client roles; entitlement is read by trusted server code
- user cannot write subscription state
- user cannot promote own role
- user cannot exceed direct table permissions to reveal source
- service/admin paths are covered in application integration tests
