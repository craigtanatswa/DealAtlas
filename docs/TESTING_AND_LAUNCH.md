# DealAtlas — Testing & Launch Requirements

## Required automated test layers
1. Unit tests — redaction, bands, entitlement mapping, filters, CSV safety.
2. Database/RLS tests — grants/policies/quotas.
3. Integration tests — protected DTO, webhook state, ingestion adapters.
4. End-to-end tests — anonymous, Free, Pro and Admin journeys.

## Source-leak canary fixtures
Seed test-only protected values such as:
- buyer: `CANARY BUYER NEVER FREE`
- domain: `canary-protected.example`
- reference: `CANARY-REF-987654`
- source title phrase: `CANARY SOURCE TITLE NEVER FREE`

Tests must request:
- public Deal page HTML
- public search JSON
- RSC/navigation payloads as practical
- metadata/OG output
- saved free views

Fail if canary values occur.

## Billing tests
- monthly checkout allowlist
- annual checkout allowlist
- arbitrary product rejected
- success URL not entitlement
- signed active webhook grants entitlement
- duplicate event ignored safely
- on_hold removes source access per policy
- renewal restores/continues access
- cancellation paid-through behavior correct
- user cannot request another user's customer portal

## Ingestion tests
Each adapter fixture tests:
- valid record
- partial record
- update/version
- closure/withdrawal
- multi-lot if relevant
- malformed input isolation

## Private-source compliance test
Attempt to run ingestion for:
- enabled OPEN_LICENSE API source → allowed
- enabled TERMS_REVIEWED HTML + scraping_permitted=true → allowed
- UNKNOWN source → blocked
- PROHIBITED source → blocked
- HTML source scraping_permitted=false → blocked

## Security launch tests
- direct REST/client select on `deals` fails for anon/authenticated
- direct select on `organizations` fails
- `deal_previews` shows LOW + published only
- user cannot update `profiles.role`
- user cannot write subscriptions/billing_events/export_usage
- free saved/search limits enforced even via direct Supabase client
- free organization watch rejected

## Production smoke test
After deployment:
1. open homepage anonymous
2. search a real anonymised opportunity
3. confirm no source identity in page/network response
4. create account and verify email
5. create company profile
6. save Deal
7. test Dodo test/live checkout as appropriate
8. verify webhook creates entitlement
9. refresh protected Deal and see source identity
10. open customer portal
11. run one controlled ingestion
12. view admin ingestion result
13. verify alert generation
14. verify CSV export

## Data launch minimum
Do not launch paid acquisition with an empty/thin database.

Before traffic, ensure:
- enough active UK opportunities across several categories to make search useful
- public Find a Tender ingestion is current
- at least the clearly permitted private/supply-chain sources are live
- stale/duplicate rate is acceptable
- preview leakage queue is under control
- subscribers can consistently reach original opportunity/action path

## Manual launch checklist template
- [ ] Supabase production project linked
- [ ] migrations applied
- [ ] RLS tests pass
- [ ] Vercel production env configured
- [ ] production domain configured
- [ ] Supabase production auth URLs configured
- [ ] production email delivery configured
- [ ] Dodo merchant live approval complete
- [ ] Dodo live products created
- [ ] Dodo live webhook created
- [ ] controlled live billing smoke test complete
- [ ] permitted sources active
- [ ] scheduled ingestion active
- [ ] monitoring active
- [ ] backups/recovery documented
- [ ] privacy/terms/cookie wording reviewed for actual business
- [ ] support/contact inbox working
- [ ] no demo data
- [ ] no critical/high security finding
- [ ] technical SEO smoke test complete
