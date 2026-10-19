# Analytics (PostHog)

Spec: SEO's PostHog tracking spec of 19 Oct 2026, with Security's binding conditions. Any change to events or properties needs fresh Security clearance.

## Switches

| Variable | Where | Effect |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | Vercel (Production, and Preview if wanted) | Public project key (`phc_...`). Absent or malformed: no SDK is loaded, `/ingest` returns 404, no server events. Read by the server at request time; redeploy after setting it so prerendered pages pick it up too. |
| `DEALATLAS_ANALYTICS_UPSTREAM` | E2E only (set in `playwright.config.ts`) | `off` stops the server sending anything to PostHog (server events and `/ingest` forwarding). |

## Design

- `lib/analytics/clean-path.ts`: the one path cleaner (allowlist). Deal, workspace-deal, buyer, supplier, saved/alert, API and admin paths collapse to placeholders; unknown paths become `/[other]`; queries and fragments are removed.
- `lib/analytics/sanitize.ts`: fail-closed `before_send` allowlist. It builds a new event from allowlisted fields only and drops unknown events, admin pages and foreign origins. Workspace (`/app/*`) page views carry the cleaned path only. External `$referrer`, `$referring_domain` and `first_referrer_domain` are bucketed to `google`, `bing`, `duckduckgo`, `yahoo`, `ecosia`, `linkedin`, `x` (x.com, twitter.com, t.co), `facebook`, `reddit`, `youtube`, `$direct` or `other`; a raw external hostname or URL is never sent.
- `app/ingest/[...path]/route.ts`: the `/ingest` proxy to PostHog EU. It accepts only event endpoints, re-runs the same sanitizer, and forwards plain JSON with no cookies, auth headers or client IP, with `$geoip_disable: true` on every event. A best-effort, per-instance, in-memory limit of 120 requests per IP per minute returns 429.
- Client: slim, no-external `posthog-js` build, `persistence: 'memory'` (no cookies or storage), manual `$pageview` on each App Router navigation, `pro_checkout_started` on checkout form submit.
- Server: `user_signed_up` (email sign-up, new Google accounts) and `pro_subscribed` (first processing of `subscription.active`, plan + `amount_gbp` from `DISPLAY_PRICING`), with deterministic event UUIDs.
- CI: `tests/e2e/analytics.spec.ts` captures every `/ingest` payload as a free and a Pro user and asserts zero deal data.
