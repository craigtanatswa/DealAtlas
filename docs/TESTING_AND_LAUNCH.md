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

## CI checks (`.github/workflows/ci.yml`)
Every job runs on a throwaway local Supabase stack or with placeholders, never with secrets or production values, and runs `scripts/ci-guard-env.mjs` first.

| Job name | What it runs | Required |
| --- | --- | --- |
| Lint / Typecheck / Unit tests / Build | `npm run lint`, `npm run typecheck`, `npx vitest run tests/unit`, `npm run build` | yes |
| Database tests (pgTAP + REST) | `npm run test:db`: all pgTAP files, `scripts/check-rollbacks.mjs` (needs `psql`) and `tests/integration` | yes |
| E2E (Playwright) | `npm run test:e2e` against `next start` | yes |
| Gate parity (TS/SQL) | the generated pgTAP parity file is current, then both scanners over `tests/fixtures/leak-gate/cases.json` | yes |
| Leak regression (local) | the protected-token probes below, before and after `0019` | yes |
| Preview write timing (informational) | `scripts/preview-write-timing.mjs`: preview INSERT/UPDATE p50/p95 after a 20,000-deal bulk insert, with and without maintenance | no |

### Leak regression (local)
The job starts the local stack with migrations `0001`–`0018`, builds the app and crawls it before seeding (PF-02), then seeds `tests/leak/seed/` and runs `tests/leak/preflight.ts` and `tests/leak/run.ts --phase A`. It applies `0019`, restarts the same build and runs phase B. Forbidden tokens are judged by control-request count parity (`tests/leak/lib/scan.ts`); nothing is masked. The artifact `leak-probes-<sha7>-<run_id>-<attempt>` holds `run.json`, `summary.json` and `summary.md`.

- **Running locally:** `tests/leak/run-local.sh` (loopback stack only).

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
- direct select on `deal_previews` fails for anon/authenticated; the DTO RPCs return LOW + published + non-held rows only, with no `deal_id` for anon
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
13. verify alert generation (`npm run send-alerts`)
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

## Manual launch checklist

Remaining account, DNS, legal, and live-credential work lives in [`docs/LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md). Do not tick those items from the codebase. Keep the production smoke test above for the human pass after deploy.
