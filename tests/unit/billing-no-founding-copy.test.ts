import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALREADY_SUBSCRIBED_MESSAGE,
  FOUNDING_NOT_ELIGIBLE_MESSAGE,
  FOUNDING_UNAVAILABLE_MESSAGE,
} from "@/lib/billing/founding";
import {
  FOUNDING_COPY,
  FOUNDING_FULL_MESSAGE,
  foundingSoldOutNote,
} from "@/lib/billing/founding-ui";
import {
  PLAN_KEY_LABELS,
  STATUS_LABELS,
  planLabel,
} from "@/lib/billing/display";
import { buildCheckoutSessionBody } from "@/lib/billing/checkout-session";

const ROOT = path.resolve(__dirname, "../..");

const SCANNED_FILES = [
  "lib/billing/founding.ts",
  "lib/billing/display.ts",
  "lib/billing/checkout.ts",
  "lib/billing/checkout-session.ts",
  "app/api/billing/checkout/route.ts",
  "app/api/billing/entitlement/route.ts",
  "app/api/billing/portal/route.ts",
] as const;

const COPY_COMPONENTS = [
  "components/billing/founding-checkout-summary.tsx",
  "components/billing/founding-price.tsx",
  "components/marketing/home-founding-cta.tsx",
] as const;

const ALLOWED_LITERAL_PATTERNS = [
  /^founding_lifetime$/,
  /^FOUNDING_CAP_FULL$/,
  /^FOUNDING_NOT_ELIGIBLE$/,
  /^founding_not_eligible$/,
  /^DODO_FOUNDING_[A-Z_]+$/,
  /^(?:@\/|\.{1,2}\/|node:)/,
];

function stringLiterals(source: string): string[] {
  const withoutTemplates = source.replace(/\$\{[^}]*\}/g, "");
  return [...withoutTemplates.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(
    (match) => match[2] ?? "",
  );
}

function isAllowedLiteral(value: string): boolean {
  return ALLOWED_LITERAL_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Identifiers, imports, HTML ids (e.g. "home-founding-heading"), data-*
 * attributes and snake/kebab analytics event names are not customer copy.
 */
function isIgnoredComponentToken(value: string): boolean {
  if (/^(?:@\/|\.{1,2}\/|node:)/.test(value)) {
    return true;
  }
  if (/^(?:data|aria)-/.test(value)) {
    return true;
  }
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(value) && /founding/i.test(value);
}

function componentVisibleText(source: string): string[] {
  const withoutImports = source.replace(/^import[\s\S]*?;$/gm, "");
  const jsxText = [...withoutImports.matchAll(/>([^<>{}]+)</g)].map(
    (match) => match[1] ?? "",
  );
  return [...stringLiterals(withoutImports), ...jsxText].filter(
    (value) => !isIgnoredComponentToken(value),
  );
}

describe("customer-visible billing copy never says Founding", () => {
  it("keeps message constants and display labels lifetime-deal only", () => {
    const allCopy = [
      ALREADY_SUBSCRIBED_MESSAGE,
      FOUNDING_NOT_ELIGIBLE_MESSAGE,
      FOUNDING_UNAVAILABLE_MESSAGE,
      FOUNDING_FULL_MESSAGE,
      foundingSoldOutNote(),
      ...Object.values(FOUNDING_COPY),
      ...Object.values(PLAN_KEY_LABELS),
      ...Object.values(STATUS_LABELS),
      planLabel("founding_lifetime", null, true, "lifetime"),
      planLabel("PRO_ANNUAL", "ANNUAL", true),
      planLabel("PRO_MONTHLY", "MONTHLY", false),
      planLabel(null, null, false),
    ].join("\n");
    expect(allCopy).not.toMatch(/founding/i);
    expect(PLAN_KEY_LABELS.founding_lifetime).toBe("Lifetime deal");
  });

  it("names the plan Lifetime deal wherever the copy names it", () => {
    const planNamingCopy = [
      PLAN_KEY_LABELS.founding_lifetime,
      FOUNDING_COPY.badge,
      FOUNDING_COPY.title,
      FOUNDING_COPY.cta,
      FOUNDING_COPY.paywallCta,
      FOUNDING_COPY.raceLead,
      FOUNDING_UNAVAILABLE_MESSAGE,
      FOUNDING_NOT_ELIGIBLE_MESSAGE,
      FOUNDING_FULL_MESSAGE,
      foundingSoldOutNote(),
    ];
    for (const value of planNamingCopy) {
      expect(value).toContain("Lifetime deal");
    }
  });

  it("keeps the checkout body product and metadata identifiers only", () => {
    const body = buildCheckoutSessionBody({
      planKey: "founding_lifetime",
      productId: "pdt_lifetime_fixture",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "buyer@example.com",
      returnUrl: "https://www.dealatlas.example/checkout/success",
    });
    const serialised = JSON.stringify(body);
    expect(serialised.match(/founding/gi)).toEqual(["founding"]);
    expect(serialised).toContain('"plan_key":"founding_lifetime"');
  });

  it("flags any new user-facing string literal containing Founding", () => {
    const offenders: string[] = [];
    for (const file of SCANNED_FILES) {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const literal of stringLiterals(source)) {
        if (/founding/i.test(literal) && !isAllowedLiteral(literal)) {
          offenders.push(`${file}: ${literal}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never says Founding in lifetime copy component JSX or string literals", () => {
    const offenders: string[] = [];
    for (const file of COPY_COMPONENTS) {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const value of componentVisibleText(source)) {
        if (/founding/i.test(value)) {
          offenders.push(`${file}: ${value.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
