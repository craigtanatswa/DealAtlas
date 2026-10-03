import fs from "node:fs";
import path from "node:path";

import { assertSafeDbTestTargets } from "../db-target-guard.mjs";

export const ROOT = path.resolve(__dirname, "../..");
export const WORLD_PATH = path.join(ROOT, "tests/leak-regression/world.json");
export const PROBES_PATH = path.join(ROOT, "tests/leak-regression/probes.json");
export const STATE_PATH = path.join(ROOT, ".leak-regression/state.json");

export type PreviewState = "published" | "held" | "non_low";

export type WorldPreview = {
  state: PreviewState;
  slug: string;
  title: string;
  summary: string;
  requirements: string[];
  category_slug: string;
  broad_region: string;
  value_band: string;
  deadline_band: string;
  duration_band: string;
  hiddenMarkers?: string[];
};

export type WorldOrg = {
  key: string;
  name: string;
  aliases?: string[];
  buyer_sector?: string;
  domain?: string;
  email?: string;
  phone?: string;
  address_line_1?: string;
  city?: string;
  county?: string;
  postcode?: string;
  extraTokens?: string[];
};

export type WorldDeal = {
  key: string;
  buyer: string;
  deal_type: string;
  status: string;
  stage: string;
  main_category: string;
  source_title: string;
  source_description: string;
  reference: string;
  ocid: string;
  notice_identifier: string;
  source_url: string;
  application_url: string;
  exact_location_text: string;
  exact_value_text: string;
  value_min_ex_vat: number;
  value_max_ex_vat: number;
  submission_deadline: string;
  site_names: string[];
  dates: string[];
  contact?: { name: string; role_title: string; email: string; phone: string };
  document?: { name: string; source_url: string };
  lot?: { lot_number: string; source_title: string; exact_location_text: string };
  award?: { award_identifier: string; supplier: string; award_value: number };
  location: { city: string; county: string; postcode: string };
  preview: WorldPreview;
  extraTokens?: string[];
};

export type WorldUser = {
  company_name: string;
  company_description: string;
  keywords: string[];
  saved: string[];
  alerts: string[];
};

export type World = {
  tokenFields: Record<"buyers" | "suppliers" | "deals", string[]>;
  buyers: WorldOrg[];
  suppliers: WorldOrg[];
  deals: WorldDeal[];
  users: Record<"free" | "pro", WorldUser>;
  searchTerms: string[];
};

export type SeedState = {
  sourceId: string;
  orgIds: Record<string, string>;
  dealIds: Record<string, string>;
  users: Record<"free" | "pro", { id: string; email: string; password: string }>;
};

export type ProtectedToken = {
  token: string;
  category: string;
  owner: string;
  variants: string[];
};

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function loadWorld(): World {
  return readJson<World>(WORLD_PATH);
}

function getPath(value: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

function asStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

const SLUG_CATEGORIES = new Set([
  "name",
  "aliases",
  "site_names",
  "contact.name",
  "document.name",
  "address_line_1",
  "extraTokens",
  "lot.source_title",
  "hidden_preview",
]);

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function variantsFor(token: string, category: string): string[] {
  const variants = new Set([token]);
  if (SLUG_CATEGORIES.has(category) && /\s/.test(token)) {
    variants.add(slugify(token));
  }
  if (/^\+?[0-9 ]{9,}$/.test(token)) {
    const digits = token.replace(/\D/g, "");
    variants.add(digits);
    if (digits.startsWith("44")) variants.add(`0${digits.slice(2)}`);
  }
  if (category === "postcode") {
    variants.add(token.replace(/\s+/g, ""));
  }
  if (/^[0-9]+$/.test(token.replace(/[£,.]/g, "")) && token.startsWith("£")) {
    variants.add(token.replace(/[£,]/g, ""));
  }
  return [...variants];
}

/** Every string an anonymous or free response must never contain. */
export function protectedTokens(world: World): ProtectedToken[] {
  const tokens = new Map<string, ProtectedToken>();
  const add = (token: string, category: string, owner: string) => {
    const trimmed = token.trim();
    if (trimmed.length < 3) {
      throw new Error(`protected token "${trimmed}" (${owner}) is shorter than 3 characters`);
    }
    const key = trimmed.toLowerCase();
    if (!tokens.has(key)) {
      tokens.set(key, { token: trimmed, category, owner, variants: variantsFor(trimmed, category) });
    }
  };

  for (const [group, entries] of [
    ["buyers", world.buyers],
    ["suppliers", world.suppliers],
    ["deals", world.deals],
  ] as const) {
    for (const entry of entries) {
      for (const field of world.tokenFields[group]) {
        for (const value of asStrings(getPath(entry, field))) add(value, field, `${group}:${entry.key}`);
      }
      for (const value of entry.extraTokens ?? []) add(value, "extraTokens", `${group}:${entry.key}`);
    }
  }

  for (const deal of world.deals) {
    if (deal.preview.state === "published") continue;
    const owner = `preview:${deal.key}`;
    add(deal.preview.slug, "hidden_preview", owner);
    add(deal.preview.title, "hidden_preview", owner);
    for (const marker of deal.preview.hiddenMarkers ?? []) add(marker, "hidden_preview", owner);
  }

  return [...tokens.values()];
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  pound: "£",
};

/** Undo the encodings a token can hide behind in HTML, JSON, RSC and URLs. */
export function decodeForScan(text: string): string {
  let decoded = text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
  decoded = decoded.replace(/(?:%[0-9a-fA-F]{2})+/g, (match) => {
    try {
      return decodeURIComponent(match);
    } catch {
      return match;
    }
  });
  return decoded.replace(/\+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type TokenMatch = { token: string; category: string; variant: string };

export function findTokens(text: string, tokens: ProtectedToken[]): TokenMatch[] {
  const haystacks = [text, decodeForScan(text)];
  const matches: TokenMatch[] = [];
  for (const token of tokens) {
    for (const variant of token.variants) {
      const pattern = new RegExp(
        `(?<![A-Za-z0-9])${escapeRegExp(variant).replace(/ /g, "\\s+")}(?![A-Za-z0-9])`,
        "i",
      );
      if (haystacks.some((haystack) => pattern.test(haystack))) {
        matches.push({ token: token.token, category: token.category, variant });
        break;
      }
    }
  }
  return matches;
}

/** Context values substituted into a template, i.e. what the probe itself sends. */
export function usedValues(template: string | undefined, context: Record<string, string>): string[] {
  if (!template) return [];
  return [...template.matchAll(/\{([a-zA-Z]+)\}/g)]
    .map((match) => context[match[1]])
    .filter((value): value is string => Boolean(value));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Replaces the probe's own request input (a search term or URL slug) where the
 * response echoes it back, e.g. in a search box, `filters.query` or the RSC
 * route tree. Only the exact input is masked; the "items" view is never masked.
 */
export function maskEcho(text: string, inputs: string[]): string {
  let masked = text;
  for (const input of inputs) {
    const forms = new Set([
      input,
      encodeURIComponent(input),
      encodeURIComponent(input).replace(/%20/g, "+"),
      escapeHtml(input),
      JSON.stringify(input).slice(1, -1),
      JSON.stringify(input).slice(1, -1).replace(/\//g, "\\/"),
    ]);
    for (const form of [...forms].sort((a, b) => b.length - a.length)) {
      masked = masked.split(form).join("[[request-echo]]");
    }
  }
  return masked;
}

export function fill(template: string, context: Record<string, string>, encode: boolean): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) => {
    if (!(key in context)) throw new Error(`placeholder ${match} has no value`);
    return encode ? encodeURIComponent(context[key]) : context[key];
  });
}

export function fillArgs(args: Record<string, unknown>, context: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, typeof value === "string" ? fill(value, context, false) : value]),
  );
}

export function extractViews(body: string, views: string[]): Record<string, string> {
  const result: Record<string, string> = { body };
  if (views.includes("meta")) {
    const tags = [
      ...body.matchAll(/<title[^>]*>[\s\S]*?<\/title>/gi),
      ...body.matchAll(/<meta\b[^>]*>/gi),
      ...body.matchAll(/<link\b[^>]*rel="(?:canonical|alternate)"[^>]*>/gi),
    ].map((match) => match[0]);
    result.meta = tags.join("\n");
  }
  if (views.includes("items")) {
    try {
      const parsed = JSON.parse(body) as { items?: unknown };
      result.items = JSON.stringify(parsed.items ?? null);
    } catch {
      result.items = "";
    }
  }
  if (views.includes("jsonld")) {
    result.jsonld = [...body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1])
      .join("\n");
  }
  return result;
}

export function isEmptyResult(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "null") return true;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed === null) return true;
    if (Array.isArray(parsed)) return parsed.length === 0;
    if (typeof parsed === "object") return Object.keys(parsed as object).length === 0;
  } catch {
    return false;
  }
  return false;
}

export function contexts(world: World, state: SeedState, lists: Record<string, string[]>, name?: string): Record<string, string>[] {
  if (!name) return [{}];
  const previewContext = (deal: World["deals"][number]): Record<string, string> => ({
    key: deal.key,
    slug: deal.preview.slug,
    dealId: state.dealIds[deal.key],
    previewTitle: deal.preview.title,
    sourceTitle: deal.source_title,
    reference: deal.reference,
    categorySlug: deal.preview.category_slug,
    categoryName: deal.main_category,
  });
  switch (name) {
    case "searchTerms":
      return world.searchTerms.map((term) => ({ key: term, term }));
    case "publishedPreviews":
      return world.deals.filter((deal) => deal.preview.state === "published").map(previewContext);
    case "hiddenPreviews":
      return world.deals.filter((deal) => deal.preview.state !== "published").map(previewContext);
    case "allDeals":
      return world.deals.map(previewContext);
    case "categories": {
      const seen = new Map<string, Record<string, string>>();
      for (const deal of world.deals) {
        seen.set(deal.preview.category_slug, {
          key: deal.preview.category_slug,
          categorySlug: deal.preview.category_slug,
          categoryName: deal.main_category,
        });
      }
      return [...seen.values()];
    }
    default: {
      const list = lists[name];
      if (!list) throw new Error(`unknown forEach list "${name}"`);
      const field = name === "staticPages" ? "page" : name === "canonicalTables" ? "table" : "item";
      return list.map((item) => ({ key: item, [field]: item }));
    }
  }
}

export function namedList(world: World, name: string): string[] {
  const published = world.deals.filter((deal) => deal.preview.state === "published");
  if (name === "publishedPreviewTitles") return published.map((deal) => deal.preview.title);
  if (name === "publishedSlugs") return published.map((deal) => deal.preview.slug);
  throw new Error(`unknown mustContainAll list "${name}"`);
}

export type LocalEnv = {
  supabaseUrl: string;
  anonKey: string;
  secretKey: string;
  appUrl: string;
};

export function readLocalEnv(): LocalEnv {
  const supabaseUrl = process.env.DEALATLAS_DB_TEST_URL;
  const anonKey = process.env.DEALATLAS_DB_TEST_ANON_KEY;
  const secretKey = process.env.DEALATLAS_DB_TEST_SECRET_KEY;
  const appUrl = process.env.LEAK_REGRESSION_APP_URL ?? "http://127.0.0.1:3000";
  if (!supabaseUrl || !anonKey || !secretKey) {
    throw new Error(
      "Set DEALATLAS_DB_TEST_URL, DEALATLAS_DB_TEST_ANON_KEY and DEALATLAS_DB_TEST_SECRET_KEY for the local Supabase stack.",
    );
  }
  assertSafeDbTestTargets([
    ["DEALATLAS_DB_TEST_URL", supabaseUrl],
    ["LEAK_REGRESSION_APP_URL", appUrl],
  ]);
  return { supabaseUrl, anonKey, secretKey, appUrl: appUrl.replace(/\/$/, "") };
}

export type RestResult = { status: number; body: unknown; text: string; headers: Headers };

export async function rest(
  env: LocalEnv,
  apiKey: string,
  pathname: string,
  init: RequestInit & { bearer?: string } = {},
): Promise<RestResult> {
  const headers = new Headers(init.headers);
  headers.set("apikey", apiKey);
  headers.set("Authorization", `Bearer ${init.bearer ?? apiKey}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${env.supabaseUrl}${pathname}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body, text, headers: response.headers };
}

export async function restOk(
  env: LocalEnv,
  pathname: string,
  init: RequestInit = {},
): Promise<unknown> {
  const result = await rest(env, env.secretKey, pathname, init);
  if (result.status >= 300) {
    throw new Error(`${init.method ?? "GET"} ${pathname} failed (${result.status}): ${result.text}`);
  }
  return result.body;
}
