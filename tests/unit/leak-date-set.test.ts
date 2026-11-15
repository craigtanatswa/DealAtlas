import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { activeDateSet, runDates, selectDateSet, transformString, type DateSetId } from "../leak/lib/date-set";
import { compileTokens, loadManifest, scanText, type Manifest } from "../leak/lib/scan";

const ROOT = path.resolve(__dirname, "../..");
const WORLD_SQL = fs.readFileSync(path.join(ROOT, "tests/leak/seed/world.sql"), "utf8");
const primary = loadManifest(undefined, "primary");
const alternate = loadManifest(undefined, "alternate");
const manifests: Record<DateSetId, Manifest> = { primary, alternate };
const tokenDays: Record<DateSetId, string[]> = {
  primary: [...new Set([...primary.date_tokens_iso.map((date) => date.slice(5)), ...primary.yearless_date_tokens])],
  alternate: [...new Set([...alternate.date_tokens_iso.map((date) => date.slice(5)), ...alternate.yearless_date_tokens])],
};

function* timestamps(): Generator<Date> {
  for (let year = 2026; year <= 2033; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      for (let day = 1; day <= last; day += 1) {
        for (const [hour, minute] of [[0, 30], [12, 0], [23, 30]] as const) {
          yield new Date(Date.UTC(year, month, day, hour, minute));
        }
      }
    }
  }
}

function dayOfYear(monthDay: string): number {
  const [month, day] = monthDay.split("-").map(Number);
  return Math.round((Date.UTC(2000, month - 1, day) - Date.UTC(2000, 0, 1)) / 86_400_000) + 1;
}

function circularDistance(a: string, b: string): number {
  const diff = Math.abs(dayOfYear(a) - dayOfYear(b));
  return Math.min(diff, 366 - diff);
}

function minimumDistance(dates: string[], set: DateSetId): number {
  return Math.min(...dates.flatMap((date) => tokenDays[set].map((token) => circularDistance(date.slice(5), token))));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function renderForms(iso: string): string[] {
  const [year, month, day] = iso.split("-").map(Number);
  const monthName = MONTHS[month - 1];
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return [
    `${day} ${monthName} ${year}`,
    `${day} ${monthName.slice(0, 3)}`,
    `${monthName} ${day}`,
    `${dd}/${mm}`,
    `${dd}.${mm}`,
    `${dd}/${mm}/${year}`,
    iso,
  ];
}

function dateLiterals(text: string): string[] {
  return [...text.matchAll(/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|\s+[A-Za-z][A-Za-z/_-]*))?/g)].map((match) => match[0]);
}

function validDate(literal: string): boolean {
  const [year, month, day] = literal.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

afterEach(() => {
  delete process.env.LEAK_DATE_SET;
});

describe("leak date sets", () => {
  it("selects a set whose token dates are at least 30 days from every run date", () => {
    const failures: string[] = [];
    for (const now of timestamps()) {
      const set = selectDateSet(now);
      const manifest = manifests[set];
      const dates = runDates(now);
      const iso = dates.filter((date) => manifest.date_tokens_iso.includes(date));
      const yearless = dates.filter((date) => manifest.yearless_date_tokens.includes(date.slice(5)));
      const distance = minimumDistance(dates, set);
      if (iso.length || yearless.length || distance < 30) {
        failures.push(`${now.toISOString()} ${set}: iso=${iso.join(",")} yearless=${yearless.join(",")} distance=${distance}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("does not match T14/T15 for rendered run dates", () => {
    const compiled: Record<DateSetId, ReturnType<typeof compileTokens>> = {
      primary: compileTokens(primary),
      alternate: compileTokens(alternate),
    };
    const seen = new Set<string>();
    const failures: string[] = [];
    for (const now of timestamps()) {
      const set = selectDateSet(now);
      for (const date of runDates(now)) {
        for (const text of renderForms(date)) {
          const key = `${set}\0${text}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const scan = scanText(text, compiled[set]);
          const hits = [...scan.tokens.keys()].filter((id) => id === "T14" || id === "T15");
          if (hits.length) failures.push(`${now.toISOString()} ${set}: ${text} -> ${hits.join(",")}`);
        }
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("renders the alternate world without November/January date forms and with valid dates", () => {
    const alternateJson = JSON.stringify(alternate);
    const alternateSql = transformString(WORLD_SQL, "alternate");
    for (const text of [alternateJson, alternateSql]) {
      for (const pattern of [/nov/i, /january/i, "11-17", "2031-11", "2032-11", "2032-01", "17/11", "17.11"]) {
        expect(typeof pattern === "string" ? text.includes(pattern) : pattern.test(text), String(pattern)).toBe(false);
      }
    }
    const primaryDates = dateLiterals(WORLD_SQL);
    const alternateDates = dateLiterals(alternateSql);
    expect(alternateDates).toEqual(primaryDates.map((literal) => transformString(literal, "alternate")));
    expect(alternateDates.every(validDate)).toBe(true);
  });

  it("matches alternate date variants with the alternate T14/T15 and not the primary ones", () => {
    const compiled = compileTokens(alternate);
    const hits = (text: string, id: string) => scanText(text, compiled).tokens.has(id);
    for (const text of ["17 June 2031", "2031-06-17", "17/06/2031", "4 August 2032"]) {
      expect(hits(text, "T14"), text).toBe(true);
    }
    for (const text of ["17 November 2031", "2031-11-17", "17/11/2031", "4 January 2032"]) {
      expect(hits(text, "T14"), text).toBe(false);
    }
    expect(hits("17 June", "T15")).toBe(true);
    expect(hits("17/06", "T15")).toBe(true);
    expect(hits("17/11", "T15")).toBe(false);
  });

  it("honours LEAK_DATE_SET", () => {
    process.env.LEAK_DATE_SET = "alternate";
    expect(activeDateSet(new Date("2026-11-17T12:00:00Z"))).toBe("alternate");
    process.env.LEAK_DATE_SET = "primary";
    expect(activeDateSet(new Date("2026-06-17T12:00:00Z"))).toBe("primary");
  });
});
