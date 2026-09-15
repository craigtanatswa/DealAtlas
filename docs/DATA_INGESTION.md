# DealAtlas — Data Ingestion & Scraping Specification

## 1. Purpose
Build a reliable, auditable pipeline that discovers UK public and private procurement opportunities without depending on a single source.

The ingestion system must prioritise official APIs/open data, then permitted public web sources, then licensed/partner feeds. It must not bypass authentication, CAPTCHAs or access restrictions.

## 2. Source classes
- GOVERNMENT_OPEN_DATA
- GOVERNMENT_WEB
- PRIVATE_COMPANY_WEB
- PROCUREMENT_PLATFORM
- SUPPLY_CHAIN_PLATFORM
- LICENSED_FEED
- PARTNER_FEED
- MANUAL_REVIEW

## 3. Access methods
- OCDS_API
- JSON_API
- XML_API
- RSS
- CSV
- HTML
- PDF_LINK_DISCOVERY
- LICENSED_FEED
- MANUAL

## 4. Source compliance gate
Each source must include:
- reuse_status: OPEN_LICENSE | PERMISSION_GRANTED | LICENSED | TERMS_REVIEWED | UNKNOWN | PROHIBITED
- scraping_permitted boolean
- licence_name
- licence_url
- terms_url
- robots_checked_at
- terms_checked_at
- notes

Production ingestion rule:
```text
if access is automated scraping:
  require reuse_status in [OPEN_LICENSE, PERMISSION_GRANTED, LICENSED, TERMS_REVIEWED]
  AND scraping_permitted = true

if access is an official API/feed:
  require enabled=true and applicable licence/terms recorded

UNKNOWN or PROHIBITED => block automatic production ingestion
```

## 5. Initial public-sector adapters
Build adapters in this order, subject to current official access terms:
1. Find a Tender official OCDS API (`GET https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages`, plus `ocdsRecordPackages/{ocid}` and notice/OCID lookups). Notice data is published under the Open Government Licence. Do not scrape Find a Tender HTML when this API is available.
2. Contracts Finder historical/legacy data if useful and permitted.
3. Public Contracts Scotland official data/API/feed if available.
4. Sell2Wales official OCDS/API/bulk data if available.
5. eTendersNI official/public mechanisms where permitted.
6. Buyer-specific public procurement pages where lawful and worthwhile.

## 6. Initial private-sector discovery strategy
Create a reusable private-source adapter framework rather than hard-coding one private company.

Prioritise:
- public corporate procurement/opportunities pages
- major infrastructure supply-chain pages
- public RFP/RFQ pages
- prime contractor subcontract opportunity pages
- publicly advertised supplier searches
- public supplier engagement/procurement pipeline pages
- licensed feeds/partnerships

The system must support adding sources through configuration plus an adapter.

Current onboarding (14 September 2026) is recorded in `docs/SOURCE_COMPLIANCE_REPORT.md`. The reusable framework lives at `ingestion/sources/private` (`createPrivateSourceAdapter` plus JSON/CSV/HTML extractors). Production automation is enabled only for sources with clear OPEN_LICENSE / PERMISSION_GRANTED / LICENSED / TERMS_REVIEWED evidence. The first enabled private/infrastructure channel is the official UK Infrastructure Pipeline (NISTA/GOV.UK) via its public JSON layout payload. UNKNOWN and PROHIBITED rows are stored on `data_sources` but blocked by the database trigger and `canIngestSource`.

## 7. Adapter interface
Every adapter should implement a source-neutral contract conceptually similar to:
```ts
interface SourceAdapter {
  sourceKey: string
  discover(cursor?: string): Promise<DiscoveredItem[]>
  fetch(item: DiscoveredItem): Promise<RawSourceRecord>
  parse(raw: RawSourceRecord): Promise<CanonicalCandidate[]>
}
```

A `CanonicalCandidate` should contain only parsed source facts. DealAtlas analysis happens later.

## 8. Raw record preservation
For every fetched item store:
- source_id
- external_record_id
- source_url
- fetched_at
- published_at if known
- content_hash
- content_type
- HTTP metadata that is useful and safe
- raw_json or raw_text
- parser_version

Do not overwrite an earlier materially different source snapshot. Store a new version/snapshot.

## 9. Parsing and validation
Use schema validation (e.g. Zod) for all adapter output.

Invalid records:
- are not silently discarded;
- create `ingestion_errors`;
- retain enough safe diagnostic data to reproduce;
- do not stop unrelated source records from processing.

## 10. Normalisation
Normalise:
- currency
- dates/times to timestamptz
- region/country
- CPV/classification
- organisation names
- URLs
- emails
- value fields
- deal stage/status
- lot structure

Keep source facts separate from inferred DealAtlas fields.

## 11. Organisation resolution
Build canonical organisation resolution using:
1. official identifiers (Companies House/company number/PPON/other IDs)
2. exact verified domain
3. normalized exact name + location
4. alias table
5. fuzzy matching candidate queue

Do not automatically merge ambiguous organisations based solely on fuzzy names. Create dedup/review candidates.

## 12. Deal linking/deduplication
Preferred matching priority:
1. same OCID/process identifier
2. explicit related-process relationship
3. same source procurement reference
4. strong composite match: buyer + title similarity + date/value/category
5. manual review for ambiguous cases

Never lose source provenance during merges.

## 13. Lots
Lots are first-class records. Do not flatten all lot data into the parent Deal.

## 14. Documents
Store document metadata and links when reuse/linking is permitted.

Do not download or redistribute documents where terms do not permit it. Store link-only references when appropriate.

Document extraction pipeline:
- identify file type
- fetch only if permitted
- virus/content safety scan if downloading
- extract text
- chunk if needed
- classify document type
- extract requirements/criteria/dates
- store provenance and extraction confidence

## 15. Intelligence extraction
Derived intelligence may include:
- plain-English summary
- buyer need
- ideal supplier
- SME suitability
- bid complexity
- competition level
- risk flags
- renewal likelihood/date
- incumbent inference
- key requirements

Every inferred field stores:
- source evidence references
- confidence
- generation method/model version
- generated_at

Never present inference as an official source fact.

## 16. Preview/redaction pipeline
The preview is generated after canonical ingestion.

Steps:
1. Generate generic non-verbatim title.
2. Generate paraphrased summary.
3. Remove buyer/source names and aliases.
4. Replace exact value with a band when fingerprint risk exists.
5. Replace exact deadline with relative/bucketed deadline when fingerprint risk exists.
6. Replace exact location with broad UK region where appropriate.
7. Generalise rare requirements that directly identify the source.
8. Scan for URLs/domains/emails/reference IDs/OCIDs/phone numbers.
9. Compare preview text against source title/description for excessive similarity.
10. Assign leakage risk.
11. Publish only when LOW risk.

The application scanner is the primary control. The database trigger is a failsafe and must not be the only check. REVIEW/HIGH drafts are regenerated once; if still not LOW they remain unpublished for admin review. Administrators can set `unpublished_by_admin` to keep a preview unpublished even after a later LOW scan. `persistIntelligenceAndPreview` copies that hold onto the regenerated row so scheduled ingestion cannot republish a held preview. Optional LLM rewrites are isolated behind `LanguageModelProvider` and cannot override leak findings.

After a preview is published, ingestion enqueues `match_jobs` so each company profile can be scored against the sanitised preview (plus server-only classification/requirement signals). `preview_reasons` stay canned. Semantic similarity is optional and runs only when `DEALATLAS_EMBEDDING_MODEL` and an API key are configured. Rebuild with `npm run rebuild-matches`.

## 17. Suggested bands
Value bands, configurable:
- Under £25k
- £25k–£50k
- £50k–£100k
- £100k–£250k
- £250k–£500k
- £500k–£1m
- £1m–£5m
- £5m–£10m
- £10m+
- Undisclosed

Deadline bands:
- Closing today
- Within 3 days
- Within 7 days
- Within 14 days
- Within 30 days
- More than 30 days
- Upcoming / date not yet fixed
- Closed

Duration bands:
- Under 3 months
- 3–6 months
- 6–12 months
- 1–2 years
- 2–3 years
- 3–5 years
- 5+ years
- Not disclosed

## 18. Change detection
Compare canonical facts and source snapshots.

Material changes include:
- deadline extension
- value change
- requirement change
- lot added/removed
- document added/changed
- status changed
- award published
- contract published
- supplier changed
- contract extension
- termination

Record material changes in `data_changes` and feed the alert engine.

## 19. Scheduling
Each data source owns:
- schedule expression or interval
- batch size
- rate limit
- retry policy
- enabled flag
- last successful run

MVP recommendation:
- high-value official feeds: multiple times daily if terms permit
- corporate/private pages: daily or less frequently according to rate/terms
- static pipeline pages: daily/weekly depending on expected change
- renewal recalculation: weekly

GitHub Actions runs `npm run job -- --job ingest --due`, which selects enabled, compliant, registered sources whose cron is due, then ingests them sequentially with per-source isolation and `rate_limit_per_minute` spacing.

## 20. Retry and resilience
- exponential backoff for transient failures
- cap retry count
- do not retry 4xx access restrictions indefinitely
- pause source automatically after repeated access/terms-related failures
- a source failure never fails the entire multi-source job
- support manual replay by ingestion run/record

## 21. Test fixtures
Every adapter requires saved fixtures for:
- normal record
- malformed/partial record
- multi-lot record if applicable
- update/version change
- withdrawn/closed record

Normal automated tests must not rely on live websites.

## 22. Metrics
Track per source:
- discovered
- fetched
- new
- updated
- unchanged
- parse failures
- duplicates linked
- previews published
- previews blocked for leak risk
- duration
- last success

## 23. Production safety
The ingestion process may use server credentials but must never expose them to the web client.

Robots/terms/compliance metadata must be reviewable in the admin UI.
