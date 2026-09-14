import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DEALATLAS_DB_TEST_URL;
const anonKey = process.env.DEALATLAS_DB_TEST_ANON_KEY;
const secretKey = process.env.DEALATLAS_DB_TEST_SECRET_KEY;
const configured = Boolean(url && anonKey && secretKey);

const CANONICAL_TABLES = [
  "deals",
  "organizations",
  "notices",
  "documents",
  "data_sources",
] as const;

type Json = Record<string, unknown> | Record<string, unknown>[] | null;

async function restRequest(
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Json }> {
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${url}${path}`, { ...init, headers });
  const text = await response.text();
  let body: Json = null;
  if (text) {
    body = JSON.parse(text) as Json;
  }
  return { status: response.status, body };
}

async function restSelect(
  key: string,
  table: string,
  query: string,
): Promise<{ status: number; body: Json }> {
  return restRequest(key, `/rest/v1/${table}?${query}`);
}

function errorCode(body: Json): string | undefined {
  if (body && !Array.isArray(body) && typeof body.code === "string") {
    return body.code;
  }
  return undefined;
}

describe.skipIf(!configured)("PostgREST RLS smoke tests", () => {
  const organizationId = randomUUID();
  const publishedDealId = randomUUID();
  const unpublishedDealId = randomUUID();
  const publishedSlug = `rls-published-${publishedDealId.slice(0, 8)}`;
  const unpublishedSlug = `rls-unpublished-${unpublishedDealId.slice(0, 8)}`;
  const testEmail = `rls-${publishedDealId.slice(0, 8)}@example.com`;
  const testPassword = "DealAtlas-rls-test-123";
  let userId: string | undefined;
  let userAccessToken: string | undefined;
  let sourceId: string | undefined;

  beforeAll(async () => {
    const source = await restSelect(
      secretKey!,
      "data_sources",
      "select=id&source_key=eq.find-a-tender",
    );
    if (source.status !== 200 || !Array.isArray(source.body) || !source.body[0]) {
      throw new Error(
        `find-a-tender source is not seeded (status ${source.status}, ${Array.isArray(source.body) ? "array" : typeof source.body})`,
      );
    }
    sourceId = String(source.body[0].id);

    const org = await restRequest(secretKey!, "/rest/v1/organizations", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: organizationId,
        canonical_name: "CANARY BUYER NEVER FREE",
        normalized_name: "canary buyer never free",
        domain: "canary-protected.example",
      }),
    });
    if (org.status >= 300) {
      throw new Error(`organization insert failed: ${JSON.stringify(org.body)}`);
    }

    const deals = await restRequest(secretKey!, "/rest/v1/deals", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          id: publishedDealId,
          primary_source_id: sourceId,
          external_primary_id: `ext-${publishedDealId.slice(0, 8)}`,
          ocid: "ocds-canary-123456",
          reference: "CANARY-REF-987654",
          source_title:
            "CANARY SOURCE TITLE NEVER FREE for specialised software implementation",
          buyer_organization_id: organizationId,
          deal_type: "PUBLIC_TENDER",
          buyer_sector: "PUBLIC",
          stage: "LIVE",
          status: "OPEN",
        },
        {
          id: unpublishedDealId,
          primary_source_id: sourceId,
          external_primary_id: `ext-${unpublishedDealId.slice(0, 8)}`,
          ocid: null,
          reference: null,
          source_title: "Another protected canonical source title",
          buyer_organization_id: null,
          deal_type: "PUBLIC_TENDER",
          buyer_sector: "PUBLIC",
          stage: "LIVE",
          status: "OPEN",
        },
      ]),
    });
    if (deals.status >= 300) {
      throw new Error(`deal insert failed: ${JSON.stringify(deals.body)}`);
    }

    const previews = await restRequest(secretKey!, "/rest/v1/deal_previews", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          deal_id: publishedDealId,
          slug: publishedSlug,
          preview_title: "Managed IT support for a public organisation",
          preview_summary:
            "A public organisation needs ongoing technology support without exposing source identity.",
          deal_type: "PUBLIC_TENDER",
          buyer_sector: "PUBLIC",
          stage: "LIVE",
          status: "OPEN",
          main_category: "technology",
          leakage_risk: "LOW",
          is_published: true,
        },
        {
          deal_id: unpublishedDealId,
          slug: unpublishedSlug,
          preview_title: "Facilities maintenance framework opportunity",
          preview_summary:
            "A summarised facilities opportunity kept unpublished for review.",
          deal_type: "PUBLIC_TENDER",
          buyer_sector: "PUBLIC",
          stage: "LIVE",
          status: "OPEN",
          main_category: "technology",
          leakage_risk: "LOW",
          is_published: false,
        },
      ]),
    });
    if (previews.status >= 300) {
      throw new Error(`preview insert failed: ${JSON.stringify(previews.body)}`);
    }

    const created = await restRequest(secretKey!, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
      }),
    });
    if (
      created.status >= 300 ||
      !created.body ||
      Array.isArray(created.body) ||
      typeof created.body.id !== "string"
    ) {
      throw new Error(`create user failed: ${JSON.stringify(created.body)}`);
    }
    userId = created.body.id;

    const session = await restRequest(anonKey!, "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    if (
      session.status >= 300 ||
      !session.body ||
      Array.isArray(session.body) ||
      typeof session.body.access_token !== "string"
    ) {
      throw new Error(`sign-in failed: ${JSON.stringify(session.body)}`);
    }
    userAccessToken = session.body.access_token;
  });

  afterAll(async () => {
    await restRequest(
      secretKey!,
      `/rest/v1/deals?id=in.(${publishedDealId},${unpublishedDealId})`,
      { method: "DELETE" },
    );
    await restRequest(secretKey!, `/rest/v1/organizations?id=eq.${organizationId}`, {
      method: "DELETE",
    });
    if (userId) {
      await restRequest(secretKey!, `/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
      });
    }
  });

  it("lets anon read published LOW-risk deal_previews only", async () => {
    const { status, body } = await restSelect(
      anonKey!,
      "deal_previews",
      `select=deal_id,slug,preview_title&slug=in.("${publishedSlug}","${unpublishedSlug}")`,
    );

    expect(status).toBe(200);
    expect(body).toEqual([
      {
        deal_id: publishedDealId,
        slug: publishedSlug,
        preview_title: "Managed IT support for a public organisation",
      },
    ]);
  });

  it("blocks anon from canonical source-bearing tables", async () => {
    for (const table of CANONICAL_TABLES) {
      const { status, body } = await restSelect(anonKey!, table, "select=id&limit=1");
      expect(status, table).toBeGreaterThanOrEqual(400);
      expect(Array.isArray(body), table).toBe(false);
      expect(errorCode(body), table).toMatch(/42501|PGRST301|PGRST105/);
    }
  });

  it("blocks an authenticated normal user from canonical tables", async () => {
    expect(userAccessToken).toBeTruthy();
    for (const table of CANONICAL_TABLES) {
      const { status, body } = await restRequest(
        anonKey!,
        `/rest/v1/${table}?select=id&limit=1`,
        {
          headers: { Authorization: `Bearer ${userAccessToken}` },
        },
      );
      expect(status, table).toBeGreaterThanOrEqual(400);
      expect(Array.isArray(body), table).toBe(false);
      expect(errorCode(body), table).toMatch(/42501|PGRST301|PGRST105/);
    }
  });
});
