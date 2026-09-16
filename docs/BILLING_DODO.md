# DealAtlas — Dodo Payments Billing Specification

## 1. Billing model
Dodo Payments is the Merchant of Record for DealAtlas digital subscriptions.

Launch products:
- DealAtlas Pro Monthly — recommended test price £39/month
- DealAtlas Pro Annual — recommended test price £390/year

Do not offer a free trial that reveals protected source identity. Free DealAtlas accounts exist independently of Dodo.

## 2. Dodo dashboard setup
1. Complete Dodo merchant/KYC setup and confirm live-mode eligibility.
2. Create a subscription product for Pro Monthly in GBP.
3. Create a subscription product for Pro Annual in GBP.
4. Put the two products in the same Product Collection if using Dodo portal plan switching.
5. Record both product IDs in Vercel environment variables.
6. Configure DealAtlas branding/customer portal.
7. Configure webhook endpoint after deployment.
8. Test all lifecycle events in test mode before live mode.

## 3. Environment variables
```text
DODO_PAYMENTS_API_KEY=
DODO_PAYMENTS_WEBHOOK_KEY=
DODO_PAYMENTS_ENVIRONMENT=test_mode
DODO_PAYMENTS_RETURN_URL=http://localhost:3000/checkout/success
DODO_PRO_MONTHLY_PRODUCT_ID=
DODO_PRO_ANNUAL_PRODUCT_ID=
```

Production uses `live_mode` and production return URL.

## 4. Integration
Prefer the official `@dodopayments/nextjs` adapter for Next.js App Router.

Implement:
- checkout endpoint/session
- webhook endpoint
- customer portal endpoint/session

## 5. Checkout flow
1. User is signed in.
2. User selects monthly or annual Pro.
3. Server validates allowed plan key; never accept arbitrary product ID from browser.
4. Server maps plan key to environment-configured Dodo product ID.
5. Create checkout/session with authenticated user's email/metadata as supported.
6. Redirect to Dodo checkout.
7. Return user to DealAtlas after checkout.
8. Return page displays "Confirming subscription" until local webhook-synchronised state is active.
9. Do not reveal protected data until entitlement state is active.

## 6. Metadata
Where supported, attach stable DealAtlas identifiers to checkout/subscription metadata:
- user_id
- plan_key

Never trust metadata supplied by the browser. Generate it server-side from authenticated context.

## 7. Webhook events
Handle at least:
- subscription.active
- subscription.renewed
- subscription.updated
- subscription.plan_changed
- subscription.on_hold
- subscription.cancelled
- subscription.failed
- subscription.expired if emitted/configured
- payment.succeeded where useful for reconciliation/reactivation
- payment.failed where useful for UX

## 8. Local status mapping
Store provider status plus an application entitlement state.

Suggested rule:
- ACTIVE/RENEWED and current_period_end > now → PRO
- CANCELLED_AT_PERIOD_END but still paid-through → PRO until period_end
- ON_HOLD → no protected access unless provider documentation/current state explicitly warrants a grace policy; launch default is remove Pro source reveal
- FAILED/EXPIRED/IMMEDIATE_CANCEL → FREE

Centralize this logic.

## 9. Idempotency
Before applying an event:
- verify signature;
- determine stable provider event identity;
- insert `billing_events` unique event ID/hash;
- if already processed, return success without applying state twice;
- update subscription in a transaction where practical;
- mark event processed.

If the current Dodo payload exposes a stable webhook/event ID, use it. If not, use a deterministic signed-payload hash plus provider timestamps/identifiers according to the current SDK payload type.

## 10. Out-of-order events
Do not blindly overwrite newer subscription state with an older event.

Compare provider event/subscription timestamps. When ambiguous, reconcile against Dodo API before granting/revoking high-value entitlement.

## 11. Customer portal
Provide `/app/billing` with:
- current plan
- billing interval
- subscription status
- renewal/period end
- "Manage billing" button

Generate a Dodo Customer Portal session server-side using stored `dodo_customer_id`.

The hosted portal handles billing history, invoices, payment method and cancellation/plan management according to Dodo settings.

## 12. Cancellation UX
Do not use dark patterns.
- allow user to open Dodo portal
- clearly show access-until date for end-of-period cancellation
- revoke protected source access when entitlement actually ends

## 13. Product ID mapping
Application config:
```ts
const DODO_PRODUCTS = {
  PRO_MONTHLY: process.env.DODO_PRO_MONTHLY_PRODUCT_ID,
  PRO_ANNUAL: process.env.DODO_PRO_ANNUAL_PRODUCT_ID,
}
```

Incoming webhook `product_id` is mapped back to known plan/interval. Unknown product IDs do not grant Pro automatically.

## 14. Taxes/invoices
Dodo operates as Merchant of Record for customer-side transaction taxes/compliance. DealAtlas should link customers to Dodo invoices/portal and should not attempt to calculate its own VAT for the same checkout flow.

DealAtlas owner remains responsible for business/income tax and local obligations on payouts.

## 15. Test matrix
Test mode must cover:
- monthly successful checkout
- annual successful checkout
- duplicate webhook
- invalid webhook signature
- cancellation at period end
- immediate cancellation if enabled
- failed renewal/on-hold
- renewal
- plan change monthly ↔ annual if enabled
- customer portal session
- free user forging checkout success URL
- user A cannot open user B's portal
- product ID tampering rejected

## 16. Go-live checklist
Follow `docs/LAUNCH_CHECKLIST.md` for merchant activation, live keys, and the controlled live purchase. Code-side:

- switch Dodo environment to live_mode
- add live API/webhook keys to Vercel
- use live monthly/annual product IDs
- update webhook URL to production
- configure production return URL
- send real low-risk test purchase if appropriate
- verify webhook + local subscription + source reveal
- verify cancellation/customer portal
