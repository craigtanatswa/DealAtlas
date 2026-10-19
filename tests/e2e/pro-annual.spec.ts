import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

import {
  BILLING_FIXTURE_LEGACY_PRODUCT_ID,
  BILLING_FIXTURE_PRODUCTS,
} from "../../lib/billing/fixtures";
import { requireSupabaseEnv, type SupabaseTestEnv } from "./helpers/env";
import { restRequest } from "./helpers/rest";
import {
  legacyAnnualActiveWebhookPayload,
  proActiveWebhookPayload,
  signedWebhookHeaders,
} from "./helpers/webhook";

const E2E_PASSWORD = "DealAtlas-e2e-Pass123!";

type TestUser = { id: string; email: string; password: string };
type Row = Record<string, unknown>;

let env: SupabaseTestEnv;
const users: TestUser[] = [];

test.describe("Pro annual £350 migration", () => {
  test.beforeAll(() => {
    env = requireSupabaseEnv();
  });

  test.afterAll(async () => {
    if (!env) {
      return;
    }
    for (const user of users) {
      await restRequest(env, env.secretKey, `/auth/v1/admin/users/${user.id}`, {
        method: "DELETE",
      });
    }
  });

  async function createUser(label: string): Promise<TestUser> {
    const email = `e2e-annual-${label}-${randomUUID().slice(0, 8)}@example.com`;
    const created = await restRequest(
      env,
      env.secretKey,
      "/auth/v1/admin/users",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          password: E2E_PASSWORD,
          email_confirm: true,
          user_metadata: { name: label },
        }),
      },
    );
    expect(created.status, created.text).toBeLessThan(300);
    const id =
      created.body && typeof created.body === "object"
        ? (created.body as Row).id
        : null;
    expect(typeof id).toBe("string");
    const user = { id: id as string, email, password: E2E_PASSWORD };
    users.push(user);
    return user;
  }

  function payloadFor(
    user: TestUser,
    input: {
      productId: string;
      planKey?: "PRO_MONTHLY" | "PRO_ANNUAL";
      subscriptionId?: string;
      eventType?: "subscription.active" | "subscription.renewed";
    },
  ) {
    return proActiveWebhookPayload({
      userId: user.id,
      email: user.email,
      subscriptionId: input.subscriptionId ?? `sub_e2e_${randomUUID()}`,
      customerId: `cus_e2e_${randomUUID()}`,
      productId: input.productId,
      planKey: input.planKey,
      eventType: input.eventType,
    });
  }

  async function deliver(
    request: APIRequestContext,
    payload: unknown,
    webhookId: string,
  ): Promise<APIResponse> {
    const body = JSON.stringify(payload);
    return request.post("/api/webhooks/dodo", {
      headers: signedWebhookHeaders(body, webhookId),
      data: body,
    });
  }

  async function currentSubscriptions(userId: string): Promise<Row[]> {
    const result = await restRequest(
      env,
      env.secretKey,
      `/rest/v1/subscriptions?select=*&user_id=eq.${userId}&is_current=eq.true`,
    );
    expect(result.status, result.text).toBe(200);
    return Array.isArray(result.body) ? (result.body as Row[]) : [];
  }

  async function billingEvents(providerEventId: string): Promise<Row[]> {
    const result = await restRequest(
      env,
      env.secretKey,
      `/rest/v1/billing_events?select=*&provider_event_id=eq.${encodeURIComponent(providerEventId)}`,
    );
    expect(result.status, result.text).toBe(200);
    return Array.isArray(result.body) ? (result.body as Row[]) : [];
  }

  async function foundingMember(userId: string): Promise<boolean> {
    const result = await restRequest(
      env,
      env.secretKey,
      `/rest/v1/profiles?select=founding_member&id=eq.${userId}`,
    );
    expect(result.status, result.text).toBe(200);
    const row = Array.isArray(result.body)
      ? (result.body[0] as Row | undefined)
      : undefined;
    return row?.founding_member === true;
  }

  test("a free user gets annual Pro from the new annual product without founding", async ({
    request,
  }) => {
    const user = await createUser("new-annual");
    const payload = payloadFor(user, {
      productId: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      planKey: "PRO_ANNUAL",
    });
    const response = await deliver(request, payload, `evt_${randomUUID()}`);
    expect(response.ok()).toBeTruthy();

    const subscriptions = await currentSubscriptions(user.id);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      plan_key: "PRO_ANNUAL",
      billing_interval: "ANNUAL",
      status: "ACTIVE",
      dodo_product_id: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
    });
    expect(await foundingMember(user.id)).toBe(false);
  });

  test("a free user gets annual Pro from the legacy annual product without founding", async ({
    request,
  }) => {
    const user = await createUser("legacy-annual");
    const payload = legacyAnnualActiveWebhookPayload({
      userId: user.id,
      email: user.email,
      subscriptionId: `sub_e2e_${randomUUID()}`,
      customerId: `cus_e2e_${randomUUID()}`,
    });
    const response = await deliver(request, payload, `evt_${randomUUID()}`);
    expect(response.ok()).toBeTruthy();

    const subscriptions = await currentSubscriptions(user.id);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      plan_key: "PRO_ANNUAL",
      billing_interval: "ANNUAL",
      status: "ACTIVE",
      dodo_product_id: BILLING_FIXTURE_LEGACY_PRODUCT_ID,
    });
    expect(await foundingMember(user.id)).toBe(false);
  });

  test("a monthly Pro user moves to annual on renewed and legacy subscriptions", async ({
    request,
  }) => {
    const user = await createUser("monthly-to-annual");

    const monthly = payloadFor(user, {
      productId: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
      planKey: "PRO_MONTHLY",
    });
    expect(
      (await deliver(request, monthly, `evt_${randomUUID()}`)).ok(),
    ).toBeTruthy();
    expect((await currentSubscriptions(user.id))[0]).toMatchObject({
      plan_key: "PRO_MONTHLY",
      billing_interval: "MONTHLY",
      status: "ACTIVE",
    });

    const renewed = payloadFor(user, {
      productId: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      planKey: "PRO_ANNUAL",
      eventType: "subscription.renewed",
    });
    expect(
      (await deliver(request, renewed, `evt_${randomUUID()}`)).ok(),
    ).toBeTruthy();
    expect((await currentSubscriptions(user.id))[0]).toMatchObject({
      plan_key: "PRO_ANNUAL",
      billing_interval: "ANNUAL",
      status: "ACTIVE",
      dodo_product_id: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
    });

    const legacy = legacyAnnualActiveWebhookPayload({
      userId: user.id,
      email: user.email,
      subscriptionId: `sub_e2e_${randomUUID()}`,
      customerId: `cus_e2e_${randomUUID()}`,
    });
    expect(
      (await deliver(request, legacy, `evt_${randomUUID()}`)).ok(),
    ).toBeTruthy();

    const subscriptions = await currentSubscriptions(user.id);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      plan_key: "PRO_ANNUAL",
      billing_interval: "ANNUAL",
      status: "ACTIVE",
      dodo_product_id: BILLING_FIXTURE_LEGACY_PRODUCT_ID,
    });
    expect(await foundingMember(user.id)).toBe(false);
  });

  test("redelivering the same webhook is idempotent for new and legacy annual products", async ({
    request,
  }) => {
    for (const scenario of [
      {
        label: "new",
        productId: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      },
      {
        label: "legacy",
        productId: BILLING_FIXTURE_LEGACY_PRODUCT_ID,
      },
    ]) {
      const user = await createUser(`idempotent-${scenario.label}`);
      const webhookId = `evt_${randomUUID()}`;
      const payload = payloadFor(user, {
        productId: scenario.productId,
        planKey: "PRO_ANNUAL",
      });

      expect((await deliver(request, payload, webhookId)).ok()).toBeTruthy();
      expect((await deliver(request, payload, webhookId)).ok()).toBeTruthy();

      expect(await billingEvents(webhookId)).toHaveLength(1);
      expect(await currentSubscriptions(user.id)).toHaveLength(1);
    }
  });

  test("an unknown product id does not grant an active Pro subscription", async ({
    request,
  }) => {
    const user = await createUser("unknown-product");
    const payload = payloadFor(user, {
      productId: "pdt_unknown_other",
      planKey: "PRO_ANNUAL",
    });
    const response = await deliver(request, payload, `evt_${randomUUID()}`);
    expect(response.ok()).toBeTruthy();

    const activePro = await restRequest(
      env,
      env.secretKey,
      `/rest/v1/subscriptions?select=*&user_id=eq.${user.id}&status=eq.ACTIVE&plan_key=eq.PRO_ANNUAL`,
    );
    expect(activePro.status, activePro.text).toBe(200);
    expect(activePro.body).toEqual([]);

    const subscriptions = await currentSubscriptions(user.id);
    expect(
      subscriptions.filter(
        (row) => row.status === "ACTIVE" || row.plan_key === "PRO_ANNUAL",
      ),
    ).toEqual([]);
    expect(await foundingMember(user.id)).toBe(false);
  });
});
