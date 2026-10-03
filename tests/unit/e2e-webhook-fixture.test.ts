import { describe, expect, it } from "vitest";

import { proActiveWebhookPayload } from "../e2e/helpers/webhook";

const input = { userId: "u", email: "e2e@example.com", subscriptionId: "sub", customerId: "cus" };

describe("e2e Pro webhook fixture", () => {
  it("bills 30 days ahead of the run, never a fixed calendar date", () => {
    const now = new Date("2031-11-17T09:00:00.000Z");
    const data = proActiveWebhookPayload({ ...input, now }).data as Record<string, string>;
    expect(data.next_billing_date).toBe("2031-12-17T09:00:00.000Z");
    expect(data.previous_billing_date).toBe("2031-11-16T09:00:00.000Z");

    const live = proActiveWebhookPayload(input);
    const next = Date.parse((live.data as Record<string, string>).next_billing_date);
    expect(next - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(Date.parse(live.timestamp)).toBeLessThanOrEqual(Date.now());
  });
});
