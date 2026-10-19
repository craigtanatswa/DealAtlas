import { isFreeTextRisky } from "@/lib/preview/risk";

/**
 * Templated free-preview scope. Built ONLY from structured, bounded fields
 * (CPV division titles, standard labels, quantity units, NUTS1 region,
 * duration and value bands, SME flag). Raw notice text never reaches it.
 * Every clause and the final text pass the fail-closed risk check; a risky
 * clause is dropped, a risky result returns null.
 */
export type ScopeInput = {
  /** CPV division titles from cpvGoodsLabel. */
  goods: readonly string[];
  /** Labels from standardLabels. */
  standards: readonly string[];
  /** Units only, e.g. "devices". Never amounts. */
  quantityUnits: readonly string[];
  /** NUTS1 region from broadRegionFromLocation, "Nationwide" or "Remote". */
  region: string | null;
  /** DURATION_BANDS value. */
  durationBand: string | null;
  /** VALUE_BANDS value. */
  valueBand: string | null;
  sectorNoun: string;
  smeSuitable: boolean | null | undefined;
};

const NOT_DISCLOSED = new Set(["Not disclosed", "Undisclosed", ""]);

function lowerFirst(text: string): string {
  // Keep acronyms such as "IT services" intact.
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function listPhrase(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

function regionPhrase(region: string | null): string | null {
  if (!region) return null;
  if (region === "Nationwide") return "delivered UK-wide";
  if (region === "Remote") return "delivered remotely";
  return `delivered within ${region}`;
}

/** "3–5 years" → "a 3–5 year term"; "Under 3 months" → "a term under 3 months". */
export function termPhrase(band: string | null): string | null {
  if (!band || NOT_DISCLOSED.has(band)) return null;
  if (/^under /i.test(band)) return `a term ${band.toLowerCase()}`;
  const match = /^(.+?) (year|month)s$/.exec(band);
  return match ? `a ${match[1]} ${match[2]} term` : null;
}

function valuePhrase(band: string | null): string | null {
  if (!band || NOT_DISCLOSED.has(band)) return null;
  return `an estimated value of ${band.replace(/^Under /, "under ")}`;
}

function safe(clause: string | null): string | null {
  return clause && !isFreeTextRisky(clause) ? clause : null;
}

export function templatedScope(input: ScopeInput): string | null {
  const goods = input.goods.filter((item) => !isFreeTextRisky(item)).slice(0, 3);
  if (goods.length === 0) {
    return null;
  }
  const where = safe(regionPhrase(input.region));
  const first = `Covers ${lowerFirst(listPhrase(goods.map(lowerFirst)))} for ${article(input.sectorNoun)} ${input.sectorNoun}${where ? `, ${where}` : ""}.`;

  const clauses = [
    safe(termPhrase(input.durationBand)),
    safe(valuePhrase(input.valueBand)),
    safe(input.standards.length > 0 ? `standards including ${listPhrase(input.standards.slice(0, 3))}` : null),
    safe(
      input.quantityUnits.length > 0
        ? `quantities specified in ${listPhrase(input.quantityUnits.slice(0, 3))}`
        : null,
    ),
  ].filter((item): item is string => Boolean(item));
  const sme = input.smeSuitable === true ? "marked suitable for SMEs" : null;

  let second = "";
  if (clauses.length > 0) {
    second = ` Expect ${listPhrase(clauses)}${sme ? `; ${sme}` : ""}.`;
  } else if (sme) {
    second = " The opportunity is marked suitable for SMEs.";
  }

  const scope = `${first}${second}`;
  return isFreeTextRisky(scope) ? null : scope;
}
