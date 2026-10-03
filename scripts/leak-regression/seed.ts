/**
 * Seeds the synthetic protected-token world from tests/leak-regression/world.json
 * into a LOCAL Supabase stack, through the same publish gate as ingestion.
 *
 *   tsx scripts/leak-regression/seed.ts
 *
 * Fails if any preview does not end up in the state the world declares
 * (published / held / non_low), so fixture mistakes never pass silently.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  type LocalEnv,
  type SeedState,
  type World,
  type WorldDeal,
  type WorldOrg,
  STATE_PATH,
  loadWorld,
  readLocalEnv,
  rest,
  restOk,
} from "./lib";

const PASSWORD = "Lrw-fixture-Pass123!";
const OCID_PREFIX = "ocds-q7lrw1-";
const EMAIL_PREFIX = "lrw-";

type Row = Record<string, unknown>;

async function insert(env: LocalEnv, table: string, row: Row): Promise<Row> {
  const body = (await restOk(env, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  })) as Row[];
  return body[0];
}

async function cleanup(env: LocalEnv, world: World) {
  await restOk(env, `/rest/v1/deals?ocid=like.${encodeURIComponent(`${OCID_PREFIX}*`)}`, {
    method: "DELETE",
  });
  const names = [...world.buyers, ...world.suppliers].map((org) => `"${org.name}"`).join(",");
  await restOk(env, `/rest/v1/organizations?canonical_name=in.(${encodeURIComponent(names)})`, {
    method: "DELETE",
  });
  const users = await rest(env, env.secretKey, "/auth/v1/admin/users?per_page=1000");
  const list = (users.body as { users?: { id: string; email?: string }[] })?.users ?? [];
  for (const user of list) {
    if (user.email?.startsWith(EMAIL_PREFIX)) {
      await rest(env, env.secretKey, `/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
    }
  }
}

async function insertOrg(env: LocalEnv, org: WorldOrg): Promise<string> {
  const row = await insert(env, "organizations", {
    canonical_name: org.name,
    normalized_name: org.name.toLowerCase(),
    buyer_sector: org.buyer_sector ?? null,
    domain: org.domain ?? null,
    website: org.domain ? `https://${org.domain}` : null,
    email: org.email ?? null,
    phone: org.phone ?? null,
    address_line_1: org.address_line_1 ?? null,
    city: org.city ?? null,
    county: org.county ?? null,
    postcode: org.postcode ?? null,
    country_code: "GB",
  });
  const id = String(row.id);
  for (const alias of org.aliases ?? []) {
    await insert(env, "organization_aliases", {
      organization_id: id,
      alias,
      normalized_alias: alias.toLowerCase(),
    });
  }
  return id;
}

async function insertDealWorld(
  env: LocalEnv,
  deal: WorldDeal,
  sourceId: string,
  orgIds: Record<string, string>,
): Promise<string> {
  const buyerId = orgIds[deal.buyer];
  const row = await insert(env, "deals", {
    primary_source_id: sourceId,
    external_primary_id: `lrw-${deal.key}`,
    ocid: deal.ocid,
    reference: deal.reference,
    source_title: deal.source_title,
    source_description: deal.source_description,
    buyer_organization_id: buyerId,
    deal_type: deal.deal_type,
    buyer_sector: "PUBLIC",
    stage: deal.stage,
    status: deal.status,
    main_category: deal.main_category,
    currency: "GBP",
    value_min_ex_vat: deal.value_min_ex_vat,
    value_max_ex_vat: deal.value_max_ex_vat,
    exact_value_text: deal.exact_value_text,
    exact_location_text: deal.exact_location_text,
    submission_deadline: deal.submission_deadline,
    source_url: deal.source_url,
    application_url: deal.application_url,
    first_published_at: new Date().toISOString(),
    latest_source_at: new Date().toISOString(),
  });
  const dealId = String(row.id);

  const location = await insert(env, "locations", {
    country_code: "GB",
    city: deal.location.city,
    county: deal.location.county,
    postcode: deal.location.postcode,
  });
  let lotId: string | null = null;
  if (deal.lot) {
    const lot = await insert(env, "lots", {
      deal_id: dealId,
      lot_number: deal.lot.lot_number,
      source_title: deal.lot.source_title,
      exact_location_text: deal.lot.exact_location_text,
    });
    lotId = String(lot.id);
  }
  await insert(env, "deal_locations", { deal_id: dealId, location_id: location.id, lot_id: lotId });

  const notice = await insert(env, "notices", {
    deal_id: dealId,
    source_id: sourceId,
    notice_identifier: deal.notice_identifier,
    source_url: deal.source_url,
    published_at: new Date().toISOString(),
  });
  if (deal.contact) {
    await insert(env, "organization_contacts", {
      organization_id: buyerId,
      ...deal.contact,
      source_id: sourceId,
      source_url: deal.source_url,
      published_for_procurement: true,
    });
  }
  if (deal.document) {
    await insert(env, "documents", {
      deal_id: dealId,
      notice_id: notice.id,
      source_id: sourceId,
      name: deal.document.name,
      source_url: deal.document.source_url,
    });
  }
  if (deal.award) {
    const award = await insert(env, "awards", {
      deal_id: dealId,
      award_identifier: deal.award.award_identifier,
      award_value: deal.award.award_value,
      currency: "GBP",
    });
    await insert(env, "award_suppliers", {
      award_id: award.id,
      organization_id: orgIds[deal.award.supplier],
      awarded_value: deal.award.award_value,
    });
  }

  const preview = deal.preview;
  await insert(env, "deal_previews", {
    deal_id: dealId,
    slug: preview.slug,
    preview_title: preview.title,
    preview_summary: preview.summary,
    deal_type: deal.deal_type,
    buyer_sector: "PUBLIC",
    stage: deal.stage,
    status: deal.status,
    main_category: deal.main_category,
    broad_region: preview.broad_region,
    value_band: preview.value_band,
    deadline_band: preview.deadline_band,
    duration_band: preview.duration_band,
    sme_suitability: "HIGH",
    bid_complexity: "MEDIUM",
    requirements_preview: preview.requirements,
    // Writers always claim LOW/published; the database gate decides.
    leakage_risk: "LOW",
    is_published: true,
  });
  if (preview.state === "held") {
    await restOk(env, `/rest/v1/deal_previews?deal_id=eq.${dealId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ unpublished_by_admin: true }),
    });
  }
  return dealId;
}

async function verifyPreviewStates(env: LocalEnv, world: World, dealIds: Record<string, string>) {
  const ids = Object.values(dealIds).join(",");
  const rows = (await restOk(
    env,
    `/rest/v1/deal_previews?deal_id=in.(${ids})&select=deal_id,slug,leakage_risk,is_published,unpublished_by_admin`,
  )) as Row[];
  const problems: string[] = [];
  for (const deal of world.deals) {
    const row = rows.find((candidate) => candidate.deal_id === dealIds[deal.key]);
    if (!row) {
      problems.push(`${deal.key}: preview missing`);
      continue;
    }
    const actual = `risk=${row.leakage_risk} published=${row.is_published} held=${row.unpublished_by_admin}`;
    const ok =
      deal.preview.state === "published"
        ? row.leakage_risk === "LOW" && row.is_published === true && row.unpublished_by_admin === false
        : deal.preview.state === "held"
          ? row.is_published === false && row.unpublished_by_admin === true
          : row.leakage_risk !== "LOW" && row.is_published === false;
    if (!ok) problems.push(`${deal.key}: expected ${deal.preview.state}, got ${actual}`);
    else console.log(`seeded ${deal.key}: ${deal.preview.state} (${actual})`);
  }
  if (problems.length > 0) {
    throw new Error(`fixture previews did not reach their declared state:\n  ${problems.join("\n  ")}`);
  }
}

async function createUser(env: LocalEnv, role: "free" | "pro") {
  const email = `${EMAIL_PREFIX}${role}-${randomUUID().slice(0, 8)}@example.com`;
  const created = await rest(env, env.secretKey, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  const id = (created.body as { id?: string })?.id;
  if (created.status >= 300 || !id) throw new Error(`create ${role} user failed: ${created.text}`);
  return { id, email, password: PASSWORD };
}

async function seedUser(
  env: LocalEnv,
  world: World,
  role: "free" | "pro",
  userId: string,
  dealIds: Record<string, string>,
) {
  const spec = world.users[role];
  await insert(env, "company_profiles", {
    user_id: userId,
    company_name: spec.company_name,
    company_description: spec.company_description,
    keywords: spec.keywords,
    preferred_buyer_sectors: ["PUBLIC"],
  });
  for (const key of spec.saved) {
    await insert(env, "saved_deals", { user_id: userId, deal_id: dealIds[key] });
  }
  for (const key of spec.alerts) {
    const deal = world.deals.find((candidate) => candidate.key === key)!;
    const buyer = world.buyers.find((candidate) => candidate.key === deal.buyer)!;
    await insert(env, "alerts", {
      user_id: userId,
      deal_id: dealIds[key],
      alert_type: "NEW_MATCH",
      status: "UNREAD",
      title: "New matching opportunity",
      message: "A new opportunity matches your profile or a saved search.",
      protected_payload: {
        previewTitle: deal.preview.title,
        sourceTitle: deal.source_title,
        buyerName: buyer.name,
        sourceUrl: deal.source_url,
        applicationUrl: deal.application_url,
        reference: deal.reference,
      },
      dedupe_key: `lrw:${userId}:${key}`,
    });
  }
  if (role === "pro") {
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    await insert(env, "subscriptions", {
      user_id: userId,
      provider: "dodo",
      dodo_subscription_id: `sub_lrw_${randomUUID().slice(0, 8)}`,
      plan_key: "PRO_MONTHLY",
      status: "ACTIVE",
      billing_interval: "MONTHLY",
      current_period_start: start.toISOString(),
      current_period_end: end.toISOString(),
      cancel_at_period_end: false,
      is_current: true,
    });
  }
}

async function main() {
  const env = readLocalEnv();
  const world = loadWorld();
  await cleanup(env, world);

  const source = (await restOk(
    env,
    "/rest/v1/data_sources?select=id&source_key=eq.find-a-tender",
  )) as Row[];
  if (!source[0]) throw new Error("find-a-tender source is not seeded");
  const sourceId = String(source[0].id);

  const orgIds: Record<string, string> = {};
  for (const org of [...world.buyers, ...world.suppliers]) {
    orgIds[org.key] = await insertOrg(env, org);
  }
  const dealIds: Record<string, string> = {};
  for (const deal of world.deals) {
    dealIds[deal.key] = await insertDealWorld(env, deal, sourceId, orgIds);
  }
  await verifyPreviewStates(env, world, dealIds);

  const users = { free: await createUser(env, "free"), pro: await createUser(env, "pro") };
  await seedUser(env, world, "free", users.free.id, dealIds);
  await seedUser(env, world, "pro", users.pro.id, dealIds);

  const state: SeedState = { sourceId, orgIds, dealIds, users };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`seeded ${world.deals.length} deals, ${Object.keys(orgIds).length} organisations, free and pro users`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
