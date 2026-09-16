# DealAtlas — Launch checklist

This list is only the **external, manual work** still required before real UK customers should be invited. Application code, migrations, RLS, billing adapters, ingestion adapters, leak scanning, quotas, alerts, admin, technical SEO, and the production fail-safes are implemented in this repository. None of the boxes below is claimed complete from the codebase.

Do not tick an item unless you have done it in the live account (Vercel, Supabase, Dodo, GitHub, email, counsel). Do not run local E2E seed scripts or canary fixtures against production.

The automated evidence pack is `docs/SECURITY_TEST_REPORT.md`. Production smoke steps after deploy are in `docs/TESTING_AND_LAUNCH.md`.

---

## 1. Domain, DNS, and Vercel

- [ ] Choose and register the production hostname.
- [ ] Create or confirm the Vercel project from this GitHub repository.
- [ ] Attach the production domain in Vercel and complete DNS (A/ALIAS/CNAME plus any Vercel-required records).
- [ ] Confirm Vercel uses Node.js 22 (`.nvmrc` is `22`; verify in project settings if the dashboard overrides it).
- [ ] Set `NEXT_PUBLIC_APP_URL` to the live `https://` origin (loopback / `http://` values fail production validation).
- [ ] Deploy production and confirm the deployment is Ready.
- [ ] Confirm `/api/health` returns `{ "ok": true }` on the live origin.

## 2. Production environment variables

Set these on the Vercel **Production** environment (Preview may use test billing). Never prefix secrets with `NEXT_PUBLIC_`.

Required for the app to boot and serve public pages:

- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] `SUPABASE_SECRET_KEY` (hosted secret/service credential; server-only)

Required before paid checkout, webhooks, or the customer portal will succeed (missing values fail closed with HTTP 503 in `test_mode`; `live_mode` refuses to start without them). Checkout is also refused until the webhook signing key is present, so a live card cannot succeed without a way to grant Pro.

- [ ] `DODO_PAYMENTS_API_KEY` (live key when going live)
- [ ] `DODO_PAYMENTS_WEBHOOK_KEY` (live webhook signing secret)
- [ ] `DODO_PAYMENTS_ENVIRONMENT=live_mode` when taking real payments (`test_mode` is the code default and is for test keys only)
- [ ] `DODO_PAYMENTS_RETURN_URL` (`https://<production-host>/checkout/success`)
- [ ] `DODO_PRO_MONTHLY_PRODUCT_ID`
- [ ] `DODO_PRO_ANNUAL_PRODUCT_ID`

Required before DealAtlas can send alert/transactional email (a Resend key with a localhost/`example.com` from-address is treated as unconfigured and will not send):

- [ ] `RESEND_API_KEY`
- [ ] `DEALATLAS_EMAIL_FROM` (verified domain, for example `DealAtlas <alerts@your-domain>`)
- [ ] Optional: `DEALATLAS_EMAIL_TEST_TO` only for job `--mode test` (do not use as a production user mailbox)

Optional:

- [ ] `SENTRY_DSN` (without it, errors stay in structured logs)
- [ ] `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
- [ ] `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `NEXT_PUBLIC_GTM_ID` (only after privacy/cookie review)
- [ ] LLM / embedding keys if you want model paraphrase or semantic matching

After changing Production env vars, redeploy.

## 3. Supabase hosted project

- [ ] Create or select the production Supabase project (do not reuse the local Docker stack).
- [ ] Link the CLI (`npx supabase link`) and apply migrations with `npx supabase db push`. Do **not** run `db reset` against production.
- [ ] Confirm Table Editor shows the migrated schema, including `deal_previews`, `subscriptions`, `billing_events`, `data_sources`, and `admin_audit_events`.
- [ ] Data API: exposed schemas must be `public` only. Disable `graphql_public` / GraphQL if the hosted project still lists it. Canonical tables must have no `anon` / `authenticated` grants.
- [ ] Auth URL configuration:
  - Site URL = production origin
  - Redirect allowlist must include every URL from `productionAuthRedirectUrls(origin)`:
    - `https://<host>/auth/callback`
    - `https://<host>/auth/callback?next=/app`
    - `https://<host>/auth/callback?next=/reset-password`
    - `https://<host>/auth/confirm`
- [ ] Enable email/password sign-up.
- [ ] **Require email confirmation** for production (local Supabase auto-confirms; hosted must not).
- [ ] Configure production SMTP if Supabase built-in email limits are insufficient. Send one sign-up and one password-reset mail to a real inbox.
- [ ] Create your operator account through `/signup`, then promote it only with SQL (no public admin endpoint):

```sql
update public.profiles
set role = 'ADMIN'
where email = 'YOUR_OPERATOR_EMAIL';
```

- [ ] Confirm a non-admin signed-in user cannot open `/admin/sources`.
- [ ] Enable backups / PITR on the hosted plan you actually pay for, and store how to restore (see `docs/DATABASE.md` § Backups and recovery). Do not treat this document as proof that PITR is on.

## 4. Dodo Payments live

Code reads product IDs and keys only from the environment. Checkout, `/api/webhooks/dodo`, and `/api/billing/portal` are ready for live keys. A checkout redirect is still not entitlement.

- [ ] Complete Dodo merchant / KYC / live-mode approval.
- [ ] Create live GBP products: DealAtlas Pro Monthly and DealAtlas Pro Annual (display copy is £39 / £390; live catalogue prices are what customers pay).
- [ ] Put both products in the same Product Collection if portal plan-switching is required.
- [ ] Copy **live** product IDs into Vercel (not `pdt_dealatlas_pro_*` fixtures).
- [ ] Copy the **live** API key and webhook signing secret.
- [ ] Point the live webhook at `https://<host>/api/webhooks/dodo` and subscribe to subscription lifecycle events used by DealAtlas (`subscription.active`, `renewed`, `updated`, `plan_changed`, `on_hold`, `cancelled`, `failed`, `expired`, plus payment succeeded/failed if offered).
- [ ] Set `DODO_PAYMENTS_ENVIRONMENT=live_mode` and redeploy. The app refuses live_mode with test/placeholder keys.
- [ ] One controlled live purchase: checkout → signed webhook → local `subscriptions` row → Pro source reveal on a real Deal.
- [ ] Confirm a forged/unsigned webhook is rejected.
- [ ] Open **Manage billing** and confirm the Dodo customer portal (payment method / cancel) for that customer.
- [ ] Confirm cancellation UX shows access-until the paid-through date and that protected reveal stops when entitlement ends.

## 5. Email, alerts, and scheduled jobs

- [ ] Verify the sending domain in Resend (or the chosen provider) and set `DEALATLAS_EMAIL_FROM`.
- [ ] Store GitHub Actions secrets used by `.github/workflows/scheduled-jobs.yml` (`NEXT_PUBLIC_APP_URL`, Supabase URL/publishable key, `SUPABASE_SECRET_KEY`, email, optional Sentry/LLM).
- [ ] Enable the workflow in the production repository (Actions permissions + schedule). First run with `workflow_dispatch` and `--mode test` / `dry-run` before `live`.
- [ ] Run live Find a Tender and UK Infrastructure Pipeline ingestion against production. Live jobs default to 500 records per source and resume from the last stored cursor until the window is drained (hard cap 2,000 if you pass `--limit`). Confirm later runs report a useful new/updated count, not a permanent 20-record ceiling.
- [ ] Confirm admin **Operations overview** shows enabled sources, recent runs, and that the unpublished leak queue is reviewed.
- [ ] Run `npm run send-alerts` / the alerts job in test mode to a safe inbox, then enable live alerts only after email confirmation is on.
- [ ] Confirm Free users do not receive source identity in alert email; Pro digests use `safeHttpUrl` for source/apply links.

## 6. Data launch (not an empty catalogue)

Do not start paid acquisition against an empty or thin database.

- [ ] Public Find a Tender ingestion is current on production.
- [ ] The permitted private/infrastructure channel (`uk-infrastructure-pipeline`) has a successful live run. Additional private sources stay disabled until `docs/SOURCE_COMPLIANCE_REPORT.md` records OPEN_LICENSE / PERMISSION_GRANTED / LICENSED / TERMS_REVIEWED evidence.
- [ ] Search on `/deals` shows a useful set of **published LOW-risk** UK previews across several categories.
- [ ] Admin leak queue (REVIEW/HIGH unpublished previews) is empty or explicitly held; do not publish HIGH-risk rows.
- [ ] A Pro user can open source/apply URLs for sampled live Deals.
- [ ] No demo, design-system, or E2E canary records (`CANARY BUYER NEVER FREE`, dummy stories, `tests/e2e` seed) exist in production. `/design-system` is hidden on Vercel production.

## 7. Monitoring and backups

- [ ] Set `SENTRY_DSN` or confirm you will operate from Vercel/Supabase logs plus `/admin` job_runs only.
- [ ] Trigger a harmless error (or use Sentry’s test event) and confirm it arrives.
- [ ] Confirm backup schedule / PITR in the Supabase dashboard and write the restore owner + RPO you are willing to accept (procedure in `docs/DATABASE.md`).
- [ ] Confirm you can restore into a new project and re-point env vars without running `db reset` on the live database.

## 8. Legal and trust copy

Public `/privacy`, `/terms`, `/cookies`, and `/contact` are **drafts**. They show “Requires final business/legal review” and `data-legal-review="required"`. They are not a finished customer contract.

- [ ] Counsel replaces draft privacy/terms/cookie wording with the live legal entity, lawful bases, retention, transfers, and processors (Supabase, Vercel, Dodo, Resend, optional Sentry/analytics).
- [ ] Replace `support@dealatlas.example` and any remaining placeholder company/office identity on `/contact`.
- [ ] Confirm a working support inbox (and DPO contact if required).
- [ ] Decide whether a cookie consent banner is required once analytics IDs are attached. Do not enable GA/GTM until that decision is made.
- [ ] Link Dodo’s customer terms / merchant-of-record notices where counsel requires it.
- [ ] Remove or keep the on-page review callouts only after sign-off (removing them is a deliberate copy change, not done here).

## 9. Production smoke (human)

After the accounts above exist, walk `docs/TESTING_AND_LAUNCH.md` **Production smoke test** on the live origin: anonymous search with no source identity in HTML/network, verified signup, company profile, Dodo live checkout, webhook entitlement, Pro reveal, portal, one ingestion, admin result, alerts, CSV export.

- [ ] Production smoke test complete
- [ ] No critical/high source-leak finding on the hosted API (repeat the REST grant checks against production if the hosted API settings were changed)

## 10. Stop

When every box you intend to launch with is actually ticked in the live systems, DealAtlas is ready for customers.

Do **not** start Google Ads or the UK SEO acquisition funnel until that work is a separate, explicit instruction.
