# DealAtlas — Product Specification

## 1. Product definition
DealAtlas is a UK-first B2B opportunity intelligence platform that discovers public-sector tenders and legally/technically permissible private-sector procurement opportunities, normalises them into a single searchable database, and helps suppliers decide which opportunities are worth pursuing.

DealAtlas is not positioned as a copy of Find a Tender. Its value comes from aggregation, normalisation, relevance, requirements extraction, buyer/supplier history, renewal intelligence, alerts, and the ability to reveal the exact source only after a paid subscription is active.

## 2. Core positioning
**Primary promise:** Find contracts your competitors may miss, understand whether they fit your business, and unlock exactly who is buying and how to pursue the deal.

**Core workflow:**
1. Discover opportunity.
2. Understand commercial value without revealing the source.
3. Assess fit.
4. Subscribe.
5. Reveal buyer, exact source, deadlines, contacts and documents.
6. Save, monitor, export and act.
7. Return for alerts, renewals and newly matched deals.

## 3. Target customer
Initial ICP:
- UK SMEs and specialist suppliers selling to government, large enterprises, infrastructure operators, prime contractors, education, health, utilities and non-profits.
- Sales directors, founders, business-development managers, bid managers and commercial managers.
- Companies that do not have a large in-house tender intelligence team.

Initial geographic market: United Kingdom.

## 4. Opportunity universe
DealAtlas supports the following deal types:
- PUBLIC_TENDER
- PRIVATE_TENDER
- RFP
- RFQ
- RFI
- EOI
- SUPPLY_CHAIN_OPPORTUNITY
- SUBCONTRACT_OPPORTUNITY
- FRAMEWORK
- DYNAMIC_MARKET
- PROCUREMENT_PIPELINE
- SUPPLIER_SEARCH
- EARLY_MARKET_ENGAGEMENT
- CONTRACT_RENEWAL
- AWARD

Buyer sectors:
- PUBLIC
- PRIVATE
- NONPROFIT
- UTILITY
- EDUCATION
- HEALTHCARE
- OTHER

## 5. Non-negotiable anti-bypass rule
A free or anonymous user must never receive enough source-identifying data to trivially locate the original opportunity outside DealAtlas.

Do not return any of the following to an unauthorised/free client:
- buyer/company name
- buyer website/domain
- original tender title
- verbatim source description
- procurement portal/platform name when it identifies the source
- source URL
- application/submission URL
- source notice identifier
- OCID where it permits direct lookup
- buyer procurement reference
- exact procurement contact
- contact email/phone
- original documents/document URLs
- exact combinations of value, timestamp, location and wording that make reverse-search trivial

This restriction applies to:
- HTML
- JSON/API responses
- React Server Component payloads
- page source
- metadata
- OpenGraph tags
- structured data
- sitemaps
- analytics payloads
- logs visible to the browser
- client-side state

Hidden data must not merely be hidden with CSS. It must not be sent to the free client at all.

## 6. Free product
Free browsing is intentionally useful. The objective is to prove that relevant opportunities exist while preserving the reveal as the conversion event.

### Anonymous/free capabilities
- Browse a large number of sanitised active opportunities.
- Search by DealAtlas-generated title and sanitised summary.
- Basic filters: category, buyer sector, broad region, value band, closing window, deal type.
- View public/private indicator.
- View broad region rather than source-identifying exact location where necessary.
- View approximate value band rather than exact value where exact value may enable reverse lookup.
- View relative deadline band rather than exact deadline where necessary.
- View approximate contract duration band.
- View high-level requirements.
- View DealAtlas bid-complexity indicator.
- View SME suitability indicator.
- View a limited relevance score when a company profile exists.
- Sign up for a free account.
- Create one company profile.
- Save up to 5 locked opportunity previews.
- Save up to 1 search.
- Receive a limited digest that says new matches exist but does not reveal source identity.

### Free preview example
**Cloud Contact Centre Platform Opportunity**  
Private/Public buyer: Large organisation  
Sector: Technology & Communications  
Region: South East England  
Estimated value: £250k–£500k  
Closing: Within 3 weeks  
Contract term: 3–5 years  
SME suitability: High  
Bid complexity: Medium

General requirements:
- relevant implementation experience
- security/data-protection capability
- ongoing support capability
- evidence of comparable deployments

Locked:
- buyer identity
- exact title
- exact value
- exact submission date/time
- source and submission URL
- buyer contact
- original documents
- detailed qualification requirements
- buyer history
- incumbent/competitor information

## 7. Paid product — DealAtlas Pro
Initial launch should have one paid tier plus annual billing.

Recommended launch pricing to test:
- Pro Monthly: £39/month
- Pro Annual: £390/year

Pricing is a commercial assumption and should be configurable without code changes. Dodo product IDs must live in environment variables, not in source code.

### Pro capabilities
- Everything in Free.
- Reveal buyer/company identity.
- Reveal exact source title and original description where permitted.
- Reveal exact procurement/tender reference.
- Reveal source portal and source URL.
- Reveal exact value and currency.
- Reveal exact deadlines and important dates.
- Reveal exact location.
- Reveal submission/application method.
- Reveal procurement contact details when legitimately published for supplier use.
- Access source documents/links where redistribution/linking is permitted.
- Advanced multi-field filters.
- Full requirement extraction.
- Award criteria and weightings.
- Buyer intelligence.
- Historical related awards/contracts.
- Known incumbent/previous supplier where evidence exists.
- Competitor/supplier intelligence.
- Contract expiry and renewal signals.
- Framework/dynamic-market eligibility context.
- Detailed relevance explanation.
- Risk flags and mismatch reasons.
- Saved deals beyond free allowance.
- Multiple saved searches.
- Immediate/daily/weekly opportunity alerts.
- Watch buyers.
- Watch suppliers/competitors.
- CSV export with limits.
- Recently added opportunities.
- Recently changed opportunities.
- Deal lifecycle/change history.
- Billing/customer portal access.

### Suggested launch limits
- Free saved deals: 5
- Free saved searches: 1
- Pro saved deals: effectively unlimited for normal use
- Pro saved searches: 50
- Pro exports: 1,000 rows/month
- Pro watched buyers: 50
- Pro watched suppliers: 50

Limits are configurable constants and should be enforced server-side.

## 8. Retention mechanics
DealAtlas must create recurring value after the first source reveal.

Retention features:
- saved searches
- new-match alerts
- buyer watchlists
- supplier/competitor watchlists
- contract-expiry/renewal alerts
- material-change alerts
- newly published requirements
- new award/contract activity
- recently added and recently changed feeds

The product should make cancellation costly in terms of lost monitoring and missed future opportunities, not through dark patterns.

## 9. Deal lifecycle model
A Deal is the canonical procurement/commercial opportunity. A Deal can be backed by multiple notices, sources, documents, lots, awards and contracts.

Conceptual lifecycle:
Pipeline → Market Engagement → Planned Procurement → Tender/RFP/RFQ → Award → Contract → Changes/Payments/Performance → Expiry/Termination → Renewal Signal

A new source notice should update the Deal lifecycle without destroying historic notice versions.

## 10. Public-sector data
Design around OCDS-compatible concepts where possible, but store data in a normalised relational model.

Primary UK source categories:
- Find a Tender / central digital platform
- Contracts Finder historical/legacy intelligence
- Public Contracts Scotland
- Sell2Wales
- eTendersNI where legally and technically permitted
- public buyer procurement pages
- public framework/dynamic-market notices

## 11. Private-sector data
Private opportunity ingestion is a first-class requirement.

Potential lawful source categories:
- public corporate procurement pages
- public RFP/RFQ pages
- supply-chain opportunity pages
- infrastructure supplier-opportunity pages
- prime-contractor subcontract opportunities
- supplier-registration/early-market-engagement pages
- permitted public procurement marketplaces
- licensed commercial feeds
- partner feeds

DealAtlas must not bypass authentication, CAPTCHAs, access controls, rate limits designed as access restrictions, or contractual restrictions.

Every source has a compliance status. Sources with UNKNOWN or PROHIBITED reuse status must not be automatically scraped in production.

## 12. Search and filtering
### Free filters
- keywords
- broad category
- buyer sector
- UK region
- value band
- closing window
- deal type
- live/upcoming

### Pro filters
Add:
- exact min/max value
- exact deadline ranges
- city/county/ITL/NUTS location where available
- CPV code
- sub-category
- procurement method
- public/private
- SME suitability
- mandatory certification
- framework/dynamic-market status
- buyer
- incumbent
- previous supplier
- contract expiry window
- recently added
- recently updated
- source type
- requirement/risk tags
- relevance threshold

## 13. Company profile and matching
A user can define:
- company description
- products/services
- preferred categories
- preferred CPV codes
- keywords
- negative keywords
- regions served
- minimum/maximum deal value
- certifications
- company size
- framework memberships
- preferred buyer sectors

DealAtlas calculates a user-specific match score and reasons. Never present generic AI inference as official procurement fact.

## 14. Intelligence labels
Derived fields must clearly indicate that they are DealAtlas analysis/inference.

Examples:
- preview summary
- ideal supplier
- SME suitability
- bid complexity
- competition level
- relevance score
- renewal prediction
- incumbent inference
- risk flags

Store provenance, confidence and model/version for derived intelligence.

## 15. Primary pages
### Public
- `/`
- `/deals`
- `/deals/[slug]` — sanitised preview only
- `/pricing`
- `/how-it-works`
- `/login`
- `/signup`
- `/privacy`
- `/terms`
- `/cookies`
- `/contact`

### Authenticated free/paid
- `/app`
- `/app/search`
- `/app/deals/[id]`
- `/app/saved`
- `/app/searches`
- `/app/alerts`
- `/app/profile`
- `/app/settings`
- `/app/billing`

### Pro intelligence
- `/app/buyers`
- `/app/buyers/[id]`
- `/app/suppliers`
- `/app/suppliers/[id]`
- `/app/contracts`
- `/app/renewals`

### Admin
- `/admin`
- `/admin/deals`
- `/admin/sources`
- `/admin/ingestion`
- `/admin/organisations`
- `/admin/deduplication`
- `/admin/data-quality`
- `/admin/billing-events`

## 16. MVP completion criteria
A market-ready V1 is complete only when:
- public/free users can search useful sanitised opportunities without source leakage
- free account signup/login works
- company profile and matching work
- paid checkout works in Dodo test and live mode
- webhooks update entitlements idempotently
- paid users can reveal protected opportunity details
- Dodo customer portal works
- saved deals/searches work
- alerts work
- CSV export limits work
- public and private permitted sources can be ingested through adapters
- source compliance status gates automated scraping
- admin can inspect ingestion, raw source, normalised deal, sanitised preview and errors
- SEO metadata contains no protected source identity
- RLS/grants and server checks have automated tests
- production build, lint, typecheck and core end-to-end tests pass
- Vercel production deployment succeeds
- monitoring/error logging is configured

## 17. Explicitly out of scope for launch
Do not add before launch unless needed to satisfy the above:
- team workspaces
- CRM
- outbound email sequences
- bid-writing AI
- native mobile apps
- public API
- complex enterprise SSO
- white-label portals
- multi-country localisation beyond UK-first foundations

## 18. Product rule for all future development
When a feature conflicts with the anti-bypass requirement, the anti-bypass requirement wins unless the user is an entitled subscriber and the data may legally be exposed.
