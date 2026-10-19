import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { Webhook } from "standardwebhooks";
import { verifyWebhookPayload } from "@dodopayments/core/webhook";

import {
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_USER_ID,
  BILLING_FIXTURE_WEBHOOK_SECRET,
  applyBillingEvent,
  billingWebhookFixtures,
  createMemoryBillingStore,
  extractBillingEvent,
  mapProductId,
  parseCheckoutRequest,
  selectCheckoutProduct,
} from "@/lib/billing";
import {
  foundingAvailabilityPayload,
  foundingOfferCopy,
  foundingSideEffect,
  reservationForCheckout,
} from "@/lib/billing/founding";
import {
  FOUNDING_COPY,
  foundingBilledLine,
  foundingDueToday,
  foundingMonthlyEquivalent,
  foundingPaywallPlaces,
  foundingPlacesLabel,
  foundingUiState,
  proMonthlyWasLabel,
} from "@/lib/billing/founding-ui";
import { liveDodoConfigErrors } from "@/lib/env/production";
import type { IncomingBillingEvent, PlanProductMap } from "@/lib/billing/types";
import { WebhookPayloadSchema } from "@dodopayments/core/schemas";

const products: PlanProductMap = {
  ...BILLING_FIXTURE_PRODUCTS,
  FOUNDING_ANNUAL: "pdt_founding_annual",
};

function foundingEvent(status: string, type = "subscription.active"): IncomingBillingEvent {
  const payload = billingWebhookFixtures.annualActive();
  payload.type = type;
  payload.data.product_id = products.FOUNDING_ANNUAL;
  payload.data.status = status;
  return extractBillingEvent(
    WebhookPayloadSchema.parse(payload),
    JSON.stringify(payload),
    "evt_founding",
    products,
  );
}

describe("founding member checkout", () => {
  it("falls back to the standard annual product when the cap is sold out", () => {
    expect(
      selectCheckoutProduct({
        planKey: "PRO_ANNUAL",
        products,
        reservation: "sold_out",
        testMode: true,
      }),
    ).toEqual({ productId: products.PRO_ANNUAL, founding: false });
    expect(
      selectCheckoutProduct({
        planKey: "PRO_ANNUAL",
        products,
        reservation: "reserved",
        testMode: true,
      }).productId,
    ).toBe(products.FOUNDING_ANNUAL);
    expect(
      selectCheckoutProduct({
        planKey: "PRO_ANNUAL",
        products,
        reservation: "active",
        testMode: true,
      }).founding,
    ).toBe(true);
    expect(
      selectCheckoutProduct({
        planKey: "PRO_ANNUAL",
        products,
        reservation: "closed",
        testMode: true,
      }).productId,
    ).toBe(products.PRO_ANNUAL);
    expect(mapProductId(products.FOUNDING_ANNUAL, products)?.planKey).toBe("PRO_ANNUAL");
    expect(
      selectCheckoutProduct({
        planKey: "PRO_ANNUAL",
        products,
        reservation: reservationForCheckout(true, "sold_out"),
        testMode: true,
      }).productId,
    ).toBe(products.FOUNDING_ANNUAL);
    expect(
      selectCheckoutProduct({
        planKey: "PRO_ANNUAL",
        products,
        reservation: reservationForCheckout(false, "sold_out"),
        testMode: true,
      }).productId,
    ).toBe(products.PRO_ANNUAL);
  });

  it("ignores a client product id and still reserves founding in live mode", () => {
    expect(parseCheckoutRequest({ planKey: "PRO_ANNUAL", product_id: products.FOUNDING_ANNUAL }).ok).toBe(false);
    expect(parseCheckoutRequest({ planKey: "FOUNDING" }).ok).toBe(false);
    expect(
      selectCheckoutProduct({
        planKey: "PRO_ANNUAL",
        products,
        reservation: "reserved",
        testMode: false,
      }).productId,
    ).toBe(products.FOUNDING_ANNUAL);
    expect(
      selectCheckoutProduct({
        planKey: "PRO_ANNUAL",
        products: { PRO_MONTHLY: products.PRO_MONTHLY, PRO_ANNUAL: products.PRO_ANNUAL },
        reservation: "reserved",
        testMode: false,
      }).productId,
    ).toBe(products.PRO_ANNUAL);
    expect(
      selectCheckoutProduct({
        planKey: "PRO_MONTHLY",
        products,
        reservation: "reserved",
        testMode: true,
      }).founding,
    ).toBe(false);
  });

  it("shows a counts-only place label when founding is offered in the UI", () => {
    expect(foundingUiState({ offered: false, remaining: 25 })).toBe("hidden");
    expect(foundingUiState({ offered: true, remaining: 17 })).toBe("available");
    expect(foundingUiState({ offered: true, remaining: 1 })).toBe("last");
    expect(foundingUiState({ offered: true, remaining: 0 })).toBe("sold_out");
    expect(foundingPlacesLabel(17)).toBe("17 places left");
    expect(foundingPlacesLabel(1)).toBe("Last founding place · 1 place left");
    expect(foundingPaywallPlaces(17)).toBe("17 places left");
    expect(foundingPaywallPlaces(1)).toBe("Last founding place · 1 place left");
    expect(FOUNDING_COPY.cancelTerms).toBe(
      "If you cancel, you lose founding status and the £290/yr price.",
    );
    expect(FOUNDING_COPY.paywallCta).toContain("£290/yr");
    expect(FOUNDING_COPY.lessThanAnnual).toBe("£60 less than standard annual");
    expect(FOUNDING_COPY.priceLocked).toBe("£290/yr for as long as you stay subscribed");
    expect(FOUNDING_COPY.firstMembers).toBe("Founding places are limited");
  });

  it("derives the founding price display from the annual amount", () => {
    expect(foundingMonthlyEquivalent()).toBe("£24.17");
    expect(foundingBilledLine()).toBe("billed £290/yr, VAT included");
    expect(foundingDueToday()).toBe("£290.00");
    expect(FOUNDING_COPY.annualSaving).toBe("Save 25% vs monthly.");
    expect(proMonthlyWasLabel()).toBe("was £39 a month");
  });

  it("rounds the public offer down to a band", () => {
    expect(foundingOfferCopy("open")).toEqual({ foundingAvailable: true, note: null });
    expect(foundingOfferCopy("fewer_than_10").note).toBe("fewer than 10 left");
    expect(foundingOfferCopy("sold_out").foundingAvailable).toBe(false);
  });

  it("activates once, and cancel closes without a second side effect", async () => {
    const store = createMemoryBillingStore({ profileIds: [BILLING_FIXTURE_USER_ID] });
    const event = foundingEvent("active");
    const calls: string[] = [];
    const apply = async () => {
      const result = await applyBillingEvent(event, store);
      if (result.outcome === "applied") {
        const effect = foundingSideEffect(event, products);
        if (effect) calls.push(effect.action);
      }
      return result;
    };
    expect(await apply()).toEqual({ outcome: "applied" });
    expect(await apply()).toEqual({ outcome: "duplicate" });
    expect(calls).toEqual(["activate"]);

    const cancelled = foundingEvent("cancelled", "subscription.cancelled");
    cancelled.providerEventId = "evt_founding_cancel";
    expect(await applyBillingEvent(cancelled, store)).toEqual({ outcome: "applied" });
    expect(foundingSideEffect(cancelled, products)?.action).toBe("close");

    const failed = extractBillingEvent(
      WebhookPayloadSchema.parse(billingWebhookFixtures.paymentFailed()),
      JSON.stringify(billingWebhookFixtures.paymentFailed()),
      "evt_founding_pay_fail",
      products,
    );
    expect(foundingSideEffect(failed, products)?.action).toBe("release");
  });

  it("returns a counts-only availability payload and one claim per subscription", () => {
    expect(foundingAvailabilityPayload(12)).toEqual({ remaining: 12, sold_out: false });
    expect(foundingAvailabilityPayload(0)).toEqual({ remaining: 0, sold_out: true });
    expect(Object.keys(foundingAvailabilityPayload(3)).sort()).toEqual(["remaining", "sold_out"]);

    const first = foundingEvent("active");
    const renewal = foundingEvent("active", "subscription.renewed");
    renewal.providerEventId = "evt_founding_renew";
    const claimed = foundingSideEffect(first, products);
    const again = foundingSideEffect(renewal, products);
    expect(claimed?.subscriptionId).toBeTruthy();
    expect(again?.subscriptionId).toBe(claimed?.subscriptionId);
    expect(again?.providerEventId).not.toBe(claimed?.providerEventId);

    const route = fs.readFileSync(path.join(process.cwd(), "app/api/founding/route.ts"), "utf8");
    expect(route).toContain("s-maxage=30");
    expect(route).not.toMatch(/user_id|email|founding_slots|reservation/);
  });

  it("rejects a forged founding webhook signature", async () => {
    const body = JSON.stringify({
      ...billingWebhookFixtures.annualActive(),
      data: { ...billingWebhookFixtures.annualActive().data, product_id: products.FOUNDING_ANNUAL },
    });
    await expect(
      verifyWebhookPayload({
        webhookKey: BILLING_FIXTURE_WEBHOOK_SECRET,
        headers: {
          "webhook-id": "evt_forged_founding",
          "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
          "webhook-signature": "v1,forged",
        },
        body,
      }),
    ).rejects.toThrow();
    const webhook = new Webhook(BILLING_FIXTURE_WEBHOOK_SECRET);
    expect(webhook.sign("evt_ok", new Date(), body)).toContain("v1,");
  });

  it("requires a live-format founding product id in live mode", () => {
    const live = {
      DODO_PAYMENTS_ENVIRONMENT: "live_mode" as const,
      DODO_PAYMENTS_API_KEY: "dodo_live_prod_key",
      DODO_PAYMENTS_WEBHOOK_KEY: "whsec_live_example_secret",
      DODO_PAYMENTS_RETURN_URL: "https://www.dealatlas.example/checkout/success",
      DODO_PRO_MONTHLY_PRODUCT_ID: "pdt_live_monthly",
      DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_live_annual",
    };
    expect(liveDodoConfigErrors(live).join("\n")).toMatch(/DODO_FOUNDING_PRODUCT_ID/);
    expect(
      liveDodoConfigErrors({ ...live, DODO_FOUNDING_PRODUCT_ID: "pdt_live_founding" }).join("\n"),
    ).toMatch(/pdt_/);
    expect(
      liveDodoConfigErrors({
        ...live,
        DODO_FOUNDING_PRODUCT_ID: "pdt_0Npk9UeAQUpFBQDttq6lS",
      }),
    ).toEqual([]);
  });
});
