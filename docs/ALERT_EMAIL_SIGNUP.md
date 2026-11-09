# Free email alert signup

Backend for the deal-page **Get alerts** email-only signup. UI and PostHog events are owned by UI/UX; this document covers the server contract and abuse limits.

## Endpoints

### `POST /api/alerts/signup`

JSON body:

```json
{
  "email": "person@example.com",
  "dealSlug": "optional-public-preview-slug",
  "consent": true,
  "source": "deal_page",
  "website": ""
}
```

- `website` is a honeypot and must be empty. A filled honeypot still returns `202`.
- Valid-format requests **always** return `202 { "status": "pending" }` whether the email is new, existing, already confirmed, or soft-capped. The response must not reveal account existence.
- `400 { "error": "INVALID_EMAIL" | "CONSENT_REQUIRED" }` for bad input.
- `429 { "error": "RATE_LIMITED" }` with `Retry-After` for abusive IPs.

Server behaviour:

- Resolves `dealSlug` to the published, LOW-risk preview’s public `main_category` and `broad_region` only. Unknown or unpublished slugs fall back to a general alert (no existence leak).
- Creates a pending `alert_email_subscriptions` row and sends a double-opt-in confirmation email via Resend. The confirmation email may name the public category only.
- Confirmation tokens are single-use hashes, 48h expiry. Requires `ALERT_TOKEN_SECRET` (≥32 chars). If the secret is missing, signup returns `202` without creating a subscription (fail closed on side effects).

### `GET /api/alerts/confirm?token=…`

Activates the subscription and `303` redirects to `/alerts/confirmed`, or `/alerts/confirmed?status=invalid` for a bad/expired token. Idempotent: a second click on a still-valid token is harmless.

### `GET|POST /api/alerts/unsubscribe?token=…`

One-click unsubscribe. `303` to `/alerts/unsubscribed`. Digest emails include `List-Unsubscribe` and `List-Unsubscribe-Post` headers.

## Abuse controls

| Limit | Window | Behaviour |
| --- | --- | --- |
| 5 signups / IP | 10 minutes | `429` |
| 20 signups / IP | 24 hours | `429` |
| 3 confirmation emails / email | 24 hours | still `202`, skip send |
| 10 subscriptions / email | lifetime | still `202`, no new row |

Counters live in `private.alert_signup_rate_limits` via `public.hit_alert_signup_rate_limit` (service_role only). In-memory limits are not used on Vercel.

Emails are normalised (trim + lowercase). Logs use fingerprints only — never raw emails.

## Anti-bypass

Alert digests to free or unconfirmed users use the same sanitised preview fields as the public preview path. No buyer, portal, source URLs (except DealAtlas preview links), notice IDs, references, contacts, documents, or match scores.

## Env

| Name | Required | Notes |
| --- | --- | --- |
| `ALERT_TOKEN_SECRET` | Yes for create/confirm/unsub | ≥32 characters. Set on Preview and Production. |
| Resend / app URL | Existing | Reuses current email sender and `NEXT_PUBLIC_APP_URL`. |
