import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { requireSupabaseEnv, type SupabaseTestEnv } from "./env";
import { requireOk, restRequest } from "./rest";
import type { E2EAccount, E2ESeed } from "./types";

export const SEED_PATH = path.resolve(process.cwd(), "tests/e2e/.seed.json");
export const E2E_PASSWORD = "DealAtlas-e2e-Pass123!";

type Json = Record<string, unknown>;

async function createUser(
  env: SupabaseTestEnv,
  email: string,
  password: string,
  role: "USER" | "ADMIN" = "USER",
): Promise<E2EAccount> {
  const created = await restRequest(env, env.secretKey, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: email.split("@")[0], role: "ADMIN" },
    }),
  });
  if (
    created.status >= 300 ||
    !created.body ||
    typeof created.body !== "object" ||
    Array.isArray(created.body) ||
    typeof (created.body as Json).id !== "string"
  ) {
    throw new Error(`create user failed: ${created.text}`);
  }
  const id = (created.body as Json).id as string;
  if (role === "ADMIN") {
    const patched = await restRequest(
      env,
      env.secretKey,
      `/rest/v1/profiles?id=eq.${id}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ role: "ADMIN" }),
      },
    );
    if (patched.status >= 300) {
      throw new Error(`promote admin failed: ${patched.text}`);
    }
  }
  return { id, email, password };
}

async function insertDeal(
  env: SupabaseTestEnv,
  input: {
    id: string;
    sourceId: string;
    organizationId: string;
    sourceTitle: string;
    sourceDescription: string;
    externalId: string;
  },
) {
  await requireOk(env, env.secretKey, "/rest/v1/deals", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: input.id,
      primary_source_id: input.sourceId,
      external_primary_id: input.externalId,
      ocid: `ocds-canary-${input.externalId}`,
      reference: "CANARY-REF-987654",
      source_title: input.sourceTitle,
      source_description: input.sourceDescription,
      buyer_organization_id: input.organizationId,
      source_url: "https://canary-source.example/notice",
      application_url: "https://canary-source.example/apply",
      latest_source_at: new Date().toISOString(),
      first_published_at: new Date().toISOString(),
      deal_type: "PUBLIC_TENDER",
      buyer_sector: "PUBLIC",
      stage: "LIVE",
      status: "OPEN",
      main_category: "Technology",
    }),
  });
}

async function insertPreview(
  env: SupabaseTestEnv,
  input: {
    dealId: string;
    slug: string;
    title: string;
    summary: string;
    published: boolean;
  },
) {
  await requireOk(env, env.secretKey, "/rest/v1/deal_previews", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      deal_id: input.dealId,
      slug: input.slug,
      preview_title: input.title,
      preview_summary: input.summary,
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
      is_published: input.published,
    }),
  });
}

async function insertAlert(
  env: SupabaseTestEnv,
  userId: string,
  dealId: string,
  previewTitle: string,
) {
  await requireOk(env, env.secretKey, "/rest/v1/alerts", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      deal_id: dealId,
      alert_type: "NEW_MATCH",
      status: "UNREAD",
      title: "New matching opportunity",
      message: "A new opportunity matches your profile or a saved search.",
      protected_payload: {
        previewTitle,
        sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
        buyerName: "CANARY BUYER NEVER FREE",
        sourceUrl: "https://canary-source.example/notice",
        applicationUrl: "https://canary-source.example/apply",
        reference: "CANARY-REF-987654",
      },
      dedupe_key: `e2e:${userId}:NEW_MATCH`,
    }),
  });
}

export async function createE2ESeed(): Promise<E2ESeed> {
  const env = requireSupabaseEnv();
  const suffix = randomUUID().slice(0, 8);
  const searchToken = `e2ecanary${suffix}`;
  const previewTitle = `Sanitised ${searchToken} managed support`;
  const publishedDealId = randomUUID();
  const xssDealId = randomUUID();
  const unpublishedDealId = randomUUID();
  const organizationId = randomUUID();
  const publishedSlug = `e2e-published-${suffix}`;
  const xssSlug = `e2e-xss-${suffix}`;

  const source = await restRequest(
    env,
    env.secretKey,
    "/rest/v1/data_sources?select=id&source_key=eq.find-a-tender",
  );
  if (
    source.status !== 200 ||
    !Array.isArray(source.body) ||
    !source.body[0] ||
    typeof (source.body[0] as Json).id !== "string"
  ) {
    throw new Error("find-a-tender source is not seeded");
  }
  const sourceId = (source.body[0] as Json).id as string;

  await requireOk(env, env.secretKey, "/rest/v1/organizations", {
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

  await insertDeal(env, {
    id: publishedDealId,
    sourceId,
    organizationId,
    sourceTitle: "CANARY SOURCE TITLE NEVER FREE for specialised software implementation",
    sourceDescription: "CANARY-OCID-LOOKUP exact notice text must never leak",
    externalId: `e2e-pub-${suffix}`,
  });
  await insertDeal(env, {
    id: xssDealId,
    sourceId,
    organizationId,
    sourceTitle: "<img src=x onerror=alert(1)> XSS source title",
    sourceDescription: "<script>alert(1)</script>",
    externalId: `e2e-xss-${suffix}`,
  });
  await insertDeal(env, {
    id: unpublishedDealId,
    sourceId,
    organizationId,
    sourceTitle: "CANARY SOURCE TITLE NEVER FREE leak-review fixture",
    sourceDescription: "Protected unpublished canonical description",
    externalId: `e2e-unpub-${suffix}`,
  });

  await insertPreview(env, {
    dealId: publishedDealId,
    slug: publishedSlug,
    title: previewTitle,
    summary:
      "A public organisation needs ongoing technology support without exposing source identity.",
    published: true,
  });
  await insertPreview(env, {
    dealId: xssDealId,
    slug: xssSlug,
    title: `Sanitised xss preview ${suffix}`,
    summary: "Sanitised preview of an opportunity whose source text contains markup.",
    published: true,
  });
  await insertPreview(env, {
    dealId: unpublishedDealId,
    slug: `e2e-unpub-${suffix}`,
    title: "Opportunity with a leak",
    summary: "Contains https://canary-protected.example which must not publish.",
    published: false,
  });

  const free = await createUser(
    env,
    `e2e-free-${suffix}@example.com`,
    E2E_PASSWORD,
  );
  const pro = await createUser(
    env,
    `e2e-pro-${suffix}@example.com`,
    E2E_PASSWORD,
  );
  const admin = await createUser(
    env,
    `e2e-admin-${suffix}@example.com`,
    E2E_PASSWORD,
    "ADMIN",
  );

  const company = (await requireOk(env, env.secretKey, "/rest/v1/company_profiles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: free.id,
      company_name: "E2E Free Supplier",
      company_description: "Managed IT support supplier for public organisations.",
      keywords: [searchToken, "managed", "support"],
      preferred_buyer_sectors: ["PUBLIC"],
    }),
  })) as Json[];
  const companyProfileId = company[0]?.id;
  if (typeof companyProfileId === "string") {
    await requireOk(env, env.secretKey, "/rest/v1/deal_matches", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        company_profile_id: companyProfileId,
        deal_id: publishedDealId,
        relevance_score: 84,
        preview_reasons: [
          {
            code: "KEYWORD_OVERLAP",
            kind: "match",
            surface: "preview",
            label: "Keyword overlap with your profile",
          },
        ],
      }),
    });
  }

  await insertAlert(env, free.id, publishedDealId, previewTitle);
  await insertAlert(env, pro.id, publishedDealId, previewTitle);

  const seed: E2ESeed = {
    suffix,
    searchToken,
    previewTitle,
    publishedDealId,
    publishedSlug,
    xssDealId,
    xssSlug,
    unpublishedDealId,
    organizationId,
    sourceId,
    free,
    pro,
    admin,
  };
  fs.writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
  return seed;
}

export function readSeed(): E2ESeed {
  return JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as E2ESeed;
}

export async function deleteE2ESeed(seed: E2ESeed): Promise<void> {
  const env = requireSupabaseEnv();
  await restRequest(
    env,
    env.secretKey,
    `/rest/v1/deals?id=in.(${seed.publishedDealId},${seed.xssDealId},${seed.unpublishedDealId})`,
    { method: "DELETE" },
  );
  await restRequest(
    env,
    env.secretKey,
    `/rest/v1/organizations?id=eq.${seed.organizationId}`,
    { method: "DELETE" },
  );
  for (const account of [seed.free, seed.pro, seed.admin]) {
    await restRequest(
      env,
      env.secretKey,
      `/auth/v1/admin/users/${account.id}`,
      { method: "DELETE" },
    );
  }
}
