import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { requireSupabaseEnv, type SupabaseTestEnv } from "./helpers/env";
import { restRequest } from "./helpers/rest";

// A real throwaway user posts checkout plan keys to the built app.
// Founding places are counted with the service-role availability RPC.
const PASSWORD = "DealAtlas-e2e-Pass123!";

async function foundingRemaining(env: SupabaseTestEnv): Promise<number> {
  const result = await restRequest(env, env.secretKey, "/rest/v1/rpc/founding_availability", {
    method: "POST",
    body: "{}",
  });
  expect(result.status, result.text).toBe(200);
  expect(typeof result.body).toBe("number");
  return result.body as number;
}

test.describe("Checkout plan keys", () => {
  let env: SupabaseTestEnv;
  let user: { id: string; email: string; password: string } | null = null;

  test.beforeAll(async () => {
    env = requireSupabaseEnv();
    const email = `e2e-plan-keys-${randomUUID().slice(0, 8)}@example.com`;
    const created = await restRequest(env, env.secretKey, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: "plan-keys" },
      }),
    });
    expect(created.status, created.text).toBeLessThan(300);
    user = { id: (created.body as { id: string }).id, email, password: PASSWORD };
  });

  test.afterAll(async () => {
    if (user) {
      await restRequest(env, env.secretKey, `/auth/v1/admin/users/${user.id}`, {
        method: "DELETE",
      });
    }
  });

  test("tampered keys get 400, PRO_ANNUAL takes no founding place, FOUNDING fails closed", async ({
    page,
  }) => {
    await loginAs(page, user!);
    const before = await foundingRemaining(env);
    const headers = { Accept: "application/json", "content-type": "application/json" };

    for (const planKey of ["FOUNDING_ANNUAL", "PRO_ANNUAL_LEGACY", "founding", 123]) {
      const tampered = await page.request.post("/api/billing/checkout", {
        headers,
        data: { planKey },
      });
      expect(tampered.status()).toBe(400);
    }

    // The e2e server has no founding product configured, so PRO_ANNUAL must stay
    // a standard checkout and FOUNDING must fail closed with no session.
    const annual = await page.request.post("/api/billing/checkout", {
      headers,
      data: { planKey: "PRO_ANNUAL" },
    });
    expect([400, 409]).not.toContain(annual.status());

    const founding = await page.request.post("/api/billing/checkout", {
      headers,
      data: { planKey: "FOUNDING" },
    });
    expect(founding.status()).toBe(409);
    const body = (await founding.json()) as { error?: string; checkout_url?: string };
    expect(body.checkout_url).toBeUndefined();
    expect(body.error).toContain("Founding places are all taken");
    expect(body.error).toContain("£350/year");

    expect(await foundingRemaining(env)).toBe(before);
  });
});
