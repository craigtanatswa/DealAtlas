# DealAtlas — Security, anti-leak and end-to-end test report

Checked: **16 September 2026**.

This report is the evidence pack for an adversarial launch pass against source leakage, entitlement bypass, billing tampering, and the four critical product journeys. Product changes were limited to closing defects found in that pass. Security was not weakened to make tests pass.

**Verdict:** no known critical or high source-leak path remains in the current tree. Anonymous, Free, Pro and Admin journeys pass on a production `next start` build. Required automated gates pass.

---

## 1. Method

- Local Supabase (`http://127.0.0.1:54321`) was the only database used for RLS, integration REST and Playwright. `.env.local` hosted project URLs were not used to seed or query production.
- Playwright ran against `npx next start -H 127.0.0.1 -p 3100` so the suite exercised the production build, not `next dev`.
- Canary markers (`CANARY BUYER NEVER FREE`, `CANARY SOURCE TITLE NEVER FREE`, `CANARY-REF-987654`, `canary-protected.example`, `https://canary-source.example/notice`, and related OCID/email markers) were seeded on canonical Deal rows. Public and Free surfaces fail if those strings appear in HTML, JSON, RSC, or SEO payloads.
- Billing entitlement used the signed webhook fixture (`BILLING_FIXTURE_WEBHOOK_SECRET` / allowlisted `pdt_dealatlas_pro_*`). Checkout redirect and `?success=true` were treated as untrusted.

---

## 2. Required gates

| Gate | Command | Result |
| --- | --- | --- |
| Unit + integration | `npm test` (Vitest) | **74 files passed**, 1 skipped. **323 tests passed**, 2 skipped. |
| Database / pgTAP | `npm run test:db` | **PASS.** `rls.test.sql` + `schema.test.sql`, **69 tests**. Vitest integration re-run: **14 passed**, 2 skipped. |
| Playwright E2E | `npm run test:e2e` | **8 passed** (Chromium, 1 worker, ~1.6 min). |
| Lint | `npm run lint` | **0 errors.** 2 pre-existing unused-variable warnings in `lib/billing/memory-store.ts` and `scripts/run-job.ts`. |
| Typecheck | `npm run typecheck` | **PASS** (`tsc --noEmit`). |
| Production build | `npm run build` | **PASS.** Next.js 16.3.5 Turbopack, TypeScript, 37 static pages. |

Skipped Vitest cases (not launch-blocking for this pass):

- `Find a Tender live smoke` — requires `INGEST_LIVE_SMOKE=1` and the live OCDS API. Admin Playwright still triggered a controlled ingestion run.
- `public discovery HTTP responses` — skipped when `NEXT_PUBLIC_APP_URL` is unset during Vitest. The same HTML/JSON/RSC leak checks ran in Playwright against `http://127.0.0.1:3100`.

---

## 3. Critical journeys

| Journey | Spec | Evidence |
| --- | --- | --- |
| Anonymous: Homepage → Search → Preview → reveal attempts → Pricing/Signup | `tests/e2e/anonymous.spec.ts` | Pass. Search JSON and preview HTML had no canary markers. `GET /api/deals/:id` returned **401**. Signup heading is a real `<h1>`. |
| Free: Login → company profile → relevance → save preview → saved search → locked Deal → Checkout | `tests/e2e/free.spec.ts` | Pass. Locked Deal copy and no canaries. Paid Deal API **403**. Checkout POST from the signed-in Free session did not grant entitlement. Alerts stay locked. |
| Pro: webhook fixture → exact Deal → source/apply → buyer intelligence → save/search/alert → export → billing portal | `tests/e2e/pro.spec.ts` | Pass. Forged webhook **≥400**. Signed then duplicate webhook accepted. Exact source title, buyer, source URL and apply URL visible only after entitlement. XSS Deal HTML contained no live `<script>` / `onerror=` payloads. CSV export contained the canary source title for the entitled user. Portal ignored a tampered `customer_id` query param. |
| Admin: Login → source registry → ingestion run → canonical Deal → preview leak review | `tests/e2e/admin.spec.ts` | Pass. Source registry, ingestion run, canonical Deal canaries, data-quality unpublished-preview review. Non-admin sees Access denied and no Source registry. |

---

## 4. Attack results

| Attack | Result | Evidence |
| --- | --- | --- |
| Query canonical tables via Supabase client | **Blocked.** Anon REST `select` on `deals`, `organizations`, `notices`, `documents`, `data_sources`, `lots`, `contracts`, `alerts`, `subscriptions` returned **≥400** with no canaries. | Playwright `attacks.spec.ts`; Vitest `tests/integration/rls.rest.test.ts`; pgTAP grant + `throws_ok` 42501. |
| GraphQL / Data API | **No canary leak.** Local Data API schemas are `["public"]` only (`supabase/config.toml`). `/graphql/v1` response contained no protected markers. | Playwright GraphQL POST; config change removing `graphql_public`. |
| Paid API as anonymous / Free | **Denied.** Anon Deal **401**, Free Deal **403**, anon buyers/export **401+**. Guessed UUID as Free still **403** (enumeration is not a reveal). | `attacks.spec.ts`, Free journey. |
| Tamper plan / product / user IDs | **Rejected.** Extra `product_id` / `user_id` / metadata on checkout → **400**. Server maps allowlisted plan keys only. | `attacks.spec.ts`; `lib/billing/plans.ts`; unit `billing-boundary.test.ts`. |
| Forge success URL | **No entitlement.** `/checkout/success?success=true&plan=PRO&…` left Free Deal API at **403**. | `attacks.spec.ts`; success page voids `params.success`. |
| Forge / duplicate webhook | **Forge rejected, duplicate safe.** Unsigned webhook ≥400. Signed `subscription.active` grants Pro; replay of the same `webhook-id` remains ok without double-grant side effects visible to the journey. | `pro.spec.ts`; unit webhook verify/apply tests. |
| Guess Deal IDs | **No source.** Free **403** on a random UUID; anon **401** on the real seeded id. | `attacks.spec.ts`. |
| HTML / JSON / RSC leak scan | **Clean** on anonymous, Free, public SEO, and non-admin `/admin`. Pro HTML is allowed to contain canaries after entitlement. | `expectNoProtectedLeaks` + canary scanner. |
| SEO metadata | **Preview fields only.** Homepage and public Deal JSON-LD / title contained the sanitised preview title, not canaries. | `attacks.spec.ts`; `tests/unit/seo-metadata.test.ts`. |
| XSS from scraped source | **Neutralised.** Pro XSS Deal page had no executable `<script>alert` or `<img onerror=`. `javascript:` source/apply URLs are dropped by `safeHttpUrl` in paid DTOs, alerts, and email. | `pro.spec.ts`; `deal-paid-detail.test.tsx`; `alert-dto.test.ts`; `alert-digest.test.ts`. |
| Arbitrary URL fetch / SSRF | **No public fetch proxy.** Ingestion HTTP allowlist refuses `file:`, loopback metadata, credentialed URLs, foreign hosts, and off-allowlist redirects. | `tests/unit/ingestion-http.test.ts`. |
| CSV formula injection | **Escaped.** Leading `=+-@`, tabs, CR, and whitespace/NBSP-prefixed formulas are apostrophe-prefixed and quoted. | `lib/exports/csv.ts`; `tests/unit/csv-formula-injection.test.ts`. |
| Privilege escalation to ADMIN | **Blocked.** Authenticated PATCH `profiles.role=ADMIN` **≥400**; subsequent read still `USER`. `profiles.role` is not updatable by `authenticated`. Admin UI uses `forbidden()` / Access denied, not client role labels. User metadata `role: ADMIN` on signup does not grant operations. | `attacks.spec.ts`; pgTAP `has_column_privilege`; E2E seed writes metadata then server-patches only the intended admin via secret key. |

---

## 5. Defects found and fixed

These were launch-blocking or high enough to close in this pass. None of the fixes broaden RLS, skip entitlement, or trust browser plan/role values.

| Defect | Severity | Fix |
| --- | --- | --- |
| Dodo `CustomerPortal` adapter catches provider 401 and returns **HTTP 500**, which Next treated as an unhandled billing failure. Attacker `customer_id` query params were already ignored (server loads the signed-in user's stored id). | High (availability / messy failure on a critical Pro path; not a source leak) | `lib/billing/portal.ts` remaps thrown errors and adapter **≥500** responses to JSON **502** `"Billing portal is temporarily unavailable."` |
| Alert DTOs and digest email rendered scraped `javascript:` / non-http source and apply URLs. | High (XSS in Pro alert/email, not a Free leak) | `safeHttpUrl` in `lib/alerts/dto.ts`, `lib/alerts/evaluate.ts`, and `lib/email/render.ts`. |
| CSV formula prefix missed leading whitespace / NBSP / line separators before `=`. | High for entitled export clients | `needsFormulaEscape` in `lib/exports/csv.ts`. |
| Local Data API exposed `graphql_public` by default. | High (extra query surface on canonical schema) | `supabase/config.toml` `schemas = ["public"]`. Restart local API for this to apply; **hosted projects must be set the same way**. |
| pgTAP assumed a globally empty `deal_previews` table (`count(*) = 1`). After E2E/ingestion the count is larger, so a correct policy looked like a failure. | Test reliability (would block CI, not a product leak) | Anon assertions now check: published LOW fixture visible; unpublished/HIGH fixtures hidden; **no** non-LOW / unpublished rows; **no** canary text in visible preview columns. |
| Signup used `CardTitle` rather than `<h1>`, breaking the Anonymous heading contract. | Low product, blocking for the journey spec | `components/auth/auth-card.tsx`. |

---

## 6. Remaining non-blocking risks

None of the following is a known Free/anonymous source-identity leak. They should be tracked before or just after traffic, not used to reopen the anti-bypass rule.

1. **In-memory rate limits.** `lib/security/rate-limit.ts` is per-process. On multiple serverless instances, limits are weaker than a shared store. Abuse volume is the risk, not entitlement bypass.
2. **`forbidden()` HTTP status.** Next.js `authInterrupts` renders `app/forbidden.tsx` (“Access denied”) while `page.goto` / some `GET`s still report **200**. Authorization is the missing Source registry / canonical data, not the status code. Operators should not treat HTTP 200 on `/admin` as “admin allowed”.
3. **Live Dodo checkout/portal.** Local E2E uses the webhook fixture and a test/placeholder API key. Dodo Checkout Session and Customer Portal APIs returned `401 Unauthorized` against fixture customer ids. Checkout is mapped to a client error by the official adapter; portal 5xx is mapped to **502**. Production still needs a real Dodo customer, live/test API key, and webhook-sourced `dodo_customer_id` for a 303 portal redirect. Redirect/`?success=true` remains non-authoritative.
4. **Hosted GraphQL / Data API config.** Local `schemas = ["public"]` is not automatically applied to the hosted Supabase project. Confirm the production API does not expose `graphql_public` or canonical tables before launch.
5. **Kong `/graphql/v1` route.** The CLI may still advertise the URL even when the schema is not in `schemas`. The attack POST returned no canaries; keep it disabled in hosted API settings.
6. **Find a Tender live ingest volume.** Admin E2E “Run ingestion” can write additional published LOW previews into the shared local DB. That is expected and is why pgTAP no longer asserts a global row count of 1.
7. **Build warnings.** `instrumentation.ts` `process.on` is flagged as unsupported in the Edge runtime. Node 20 is deprecated by `@supabase/supabase-js`. Neither is a leak path.
8. **Lint warnings.** Unused `processingError` / `finishJobRun` bindings. Clean up later; they are not security defects.
9. **Private-source coverage.** `docs/SOURCE_COMPLIANCE_REPORT.md` still records only one automated private/supply-chain source at the OPEN_LICENSE bar. That is a data-launch gap, not an anti-leak gap.

---

## 7. Production follow-up (outside this pass)

From `docs/TESTING_AND_LAUNCH.md`, still required on the deployed environment (not claimed here):

- hosted API schema matches local (`public` only, canonical grants revoked)
- live Dodo products, webhook, and one controlled checkout → webhook → Pro reveal
- scheduled ingestion + `npm run send-alerts` on production data
- privacy/terms/support inboxes and monitoring

---

## 8. Definition of done

| Requirement | Status |
| --- | --- |
| No known critical/high source-leak path | **Met** — canonical tables closed to the client; Free/anon paid APIs 401/403; canaries absent from public HTML/JSON/RSC/SEO; XSS/SSRF/CSV/admin escalation covered. |
| All critical journeys pass | **Met** — 8/8 Playwright. |
| All required checks pass | **Met** — unit, integration (configured cases), pgTAP, Playwright, lint (errors), typecheck, production build. |
| This report | **Met** — `docs/SECURITY_TEST_REPORT.md`. |
