import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toPublicDealPreview } from "@/lib/search/dto";
import { publicDealPreviewMetadata } from "@/lib/search/metadata";
import {
  findForbiddenPublicKeys,
  findProtectedMarkerLeaks,
  SEEDED_PROTECTED_MARKERS,
} from "../helpers/protected-leak";

const url = process.env.DEALATLAS_DB_TEST_URL;
const anonKey = process.env.DEALATLAS_DB_TEST_ANON_KEY;
const secretKey = process.env.DEALATLAS_DB_TEST_SECRET_KEY;
const configured = Boolean(url && anonKey && secretKey);
const appUrl = process.env.DEALATLAS_APP_URL;

type Json = Record<string, unknown> | Record<string, unknown>[] | string | null;

async function restRequest(
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Json; text: string }> {
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
    try {
      body = JSON.parse(text) as Json;
    } catch {
      body = text;
    }
  }
  return { status: response.status, body, text };
}

describe.skipIf(!configured)("public discovery leak integration", () => {
  const organizationId = randomUUID();
  const dealId = randomUUID();
  const slug = `public-discovery-${dealId.slice(0, 8)}`;
  let sourceId: string | undefined;

  beforeAll(async () => {
    const source = await restRequest(
      secretKey!,
      "/rest/v1/data_sources?select=id&source_key=eq.find-a-tender",
    );
    if (source.status !== 200 || !Array.isArray(source.body) || !source.body[0]) {
      throw new Error("find-a-tender source is not seeded");
    }
    sourceId = String((source.body[0] as { id: string }).id);

    const org = await restRequest(secretKey!, "/rest/v1/organizations", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: organizationId,
        canonical_name: "CANARY BUYER NEVER FREE",
        normalized_name: "canary buyer never free",
        domain: "canary-protected.example",
        website: "https://canary-protected.example",
        email: "procurement@canary-protected.example",
        phone: "+441111111111",
      }),
    });
    if (org.status >= 300) {
      throw new Error(`organization insert failed: ${org.text}`);
    }

    const deal = await restRequest(secretKey!, "/rest/v1/deals", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: dealId,
        primary_source_id: sourceId,
        external_primary_id: `ext-${dealId.slice(0, 8)}`,
        ocid: "ocds-canary-123456",
        reference: "CANARY-REF-987654",
        source_title: "CANARY SOURCE TITLE NEVER FREE for specialised software implementation",
        source_description: "CANARY-OCID-LOOKUP exact notice text must never leak",
        buyer_organization_id: organizationId,
        source_url: "https://canary-source.example/notice",
        application_url: "https://canary-source.example/apply",
        deal_type: "PUBLIC_TENDER",
        buyer_sector: "PUBLIC",
        stage: "LIVE",
        status: "OPEN",
        main_category: "Technology",
      }),
    });
    if (deal.status >= 300) {
      throw new Error(`deal insert failed: ${deal.text}`);
    }

    const preview = await restRequest(secretKey!, "/rest/v1/deal_previews", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        deal_id: dealId,
        slug,
        preview_title: "Managed IT support for a public organisation",
        preview_summary:
          "A public organisation needs ongoing technology support without exposing source identity.",
        deal_type: "PUBLIC_TENDER",
        buyer_sector: "PUBLIC",
        stage: "LIVE",
        status: "OPEN",
        main_category: "Technology",
        broad_region: "South East England",
        value_band: "£250k–£500k",
        deadline_band: "Within 3 weeks",
        duration_band: "3–5 years",
        sme_suitability: "HIGH",
        bid_complexity: "MEDIUM",
        requirements_preview: [
          "relevant implementation experience",
          "security/data-protection capability",
        ],
        leakage_risk: "LOW",
        is_published: true,
      }),
    });
    if (preview.status >= 300) {
      throw new Error(`preview insert failed: ${preview.text}`);
    }
  });

  afterAll(async () => {
    await restRequest(secretKey!, `/rest/v1/deals?id=eq.${dealId}`, {
      method: "DELETE",
    });
    await restRequest(secretKey!, `/rest/v1/organizations?id=eq.${organizationId}`, {
      method: "DELETE",
    });
  });

  it("returns sanitised search JSON and HTML without protected markers", async () => {
    const search = await restRequest(anonKey!, "/rest/v1/rpc/search_deal_previews", {
      method: "POST",
      body: JSON.stringify({
        p_query: "managed support",
        p_category: "Technology",
        p_region: "South East England",
        p_value_band: "£250k–£500k",
        p_deadline_band: "Within 3 weeks",
      }),
    });
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body)).toBe(true);
    const rows = (search.body as Record<string, unknown>[]).filter(
      (row) => row.slug === slug,
    );
    expect(rows.length).toBe(1);
    expect(findProtectedMarkerLeaks(search.text)).toEqual([]);
    expect(findForbiddenPublicKeys(rows[0])).toEqual([]);

    const dto = toPublicDealPreview(
      rows[0] as unknown as Parameters<typeof toPublicDealPreview>[0],
    );
    const rscPayload = JSON.stringify({
      preview: dto,
      metadata: publicDealPreviewMetadata(dto, `http://localhost:3000/deals/${slug}`),
    });
    expect(findProtectedMarkerLeaks(rscPayload)).toEqual([]);
    expect(findForbiddenPublicKeys(JSON.parse(rscPayload))).toEqual([]);
    expect(dto.previewTitle).toBe("Managed IT support for a public organisation");
  });

  it("lets anon read the published preview row without canary markers", async () => {
    const preview = await restRequest(
      anonKey!,
      `/rest/v1/deal_previews?slug=eq.${slug}&select=slug,preview_title,preview_summary,main_category,value_band,deadline_band`,
    );
    expect(preview.status).toBe(200);
    expect(findProtectedMarkerLeaks(preview.text)).toEqual([]);
    expect(JSON.stringify(preview.body)).toContain("Managed IT support");
  });

  it("blocks direct canonical table access for the seeded protected deal", async () => {
    for (const table of ["deals", "organizations", "notices", "documents", "data_sources"]) {
      const { status, body, text } = await restRequest(
        anonKey!,
        `/rest/v1/${table}?select=*&limit=1`,
      );
      expect(status, table).toBeGreaterThanOrEqual(400);
      expect(Array.isArray(body), table).toBe(false);
      expect(findProtectedMarkerLeaks(text), table).toEqual([]);
    }
  });
});

describe.skipIf(!appUrl)("public discovery HTTP responses", () => {
  it("does not leak seeded markers through Next.js JSON, HTML, or RSC payloads", async () => {
    const [search, dealsPage, protectedDeal] = await Promise.all([
      fetch(`${appUrl}/api/search?q=managed`),
      fetch(`${appUrl}/deals`),
      fetch(`${appUrl}/api/deals/${randomUUID()}`),
    ]);

    const searchJson = await search.text();
    const dealsHtml = await dealsPage.text();
    const rsc = await fetch(`${appUrl}/deals`, {
      headers: { RSC: "1", "Next-Router-State-Tree": "%5B%22%22%2C%7B%7D%2Cnull%2Cnull%5D" },
    });
    const rscText = await rsc.text();
    const protectedText = await protectedDeal.text();

    for (const payload of [searchJson, dealsHtml, rscText, protectedText]) {
      expect(findProtectedMarkerLeaks(payload)).toEqual([]);
    }
    expect(protectedDeal.status).toBe(401);
    expect(SEEDED_PROTECTED_MARKERS.length).toBeGreaterThan(0);
  });
});
