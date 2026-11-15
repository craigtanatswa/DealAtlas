import fs from "node:fs";
import path from "node:path";

import { LEAK_DIR } from "./env";

export type DateSetId = "primary" | "alternate";

const DAY_MS = 86_400_000;
const CACHE_TTL_MS = 48 * 60 * 60 * 1000;
const DATE_SET_FILE = path.join(LEAK_DIR, "date-set.json");
const TOKENS_PATH = path.join(__dirname, "..", "tokens.json");

export function isoDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function runDates(now = new Date()): string[] {
  const out = new Set<string>();
  for (const tz of ["UTC", "Europe/London"]) {
    for (let delta = -2; delta <= 2; delta += 1) out.add(isoDay(new Date(now.getTime() + delta * DAY_MS), tz));
  }
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  out.add(monday.toISOString().slice(0, 10));
  return [...out].sort();
}

type Replacement = readonly [from: string, to: string];

const DATE_REPLACEMENTS: readonly Replacement[] = [
  ["the seventeenth of November", "the seventeenth of June"],
  ["seventeenth of November", "seventeenth of June"],
  ["17 November 2031", "17 June 2031"],
  ["3 November 2031", "3 June 2031"],
  ["17 November 2032", "17 June 2032"],
  ["4 January 2032", "4 August 2032"],
  ["17 November", "17 June"],
  ["17th Nov", "17th Jun"],
  ["17-Nov-2031", "17-Jun-2031"],
  ["2031-11-17", "2031-06-17"],
  ["2031-11-03", "2031-06-03"],
  ["2032-11-17", "2032-06-17"],
  ["2032-01-04", "2032-08-04"],
  ["17/11/2031", "17/06/2031"],
  ["17/11", "17/06"],
  ["17.11", "17.06"],
  ["11-17", "06-17"],
  ["17-nov-2031", "17-jun-2031"],
  ["17(?:st|nd|rd|th)?\\s+nov(?:ember)?", "17(?:st|nd|rd|th)?\\s+jun(?:e)?"],
  ["nov(?:ember)?\\s+17(?:th)?", "jun(?:e)?\\s+17(?:th)?"],
  ["0?3(?:rd)?\\s+nov(?:ember)?", "0?3(?:rd)?\\s+jun(?:e)?"],
  ["nov(?:ember)?\\s+0?3(?:rd)?", "jun(?:e)?\\s+0?3(?:rd)?"],
  ["0?4(?:th)?\\s+jan(?:uary)?", "0?4(?:th)?\\s+aug(?:ust)?"],
  ["jan(?:uary)?\\s+0?4(?:th)?", "aug(?:ust)?\\s+0?4(?:th)?"],
  ["17[/.\\-]11[/.\\-]", "17[/.\\-]0?6[/.\\-]"],
  ["0?3[/.\\-]11[/.\\-]", "0?3[/.\\-]0?6[/.\\-]"],
  ["0?4[/.\\-]0?1[/.\\-]", "0?4[/.\\-]0?8[/.\\-]"],
  ["17\\s?[/.\\-]\\s?11(?![\\d.])", "17\\s?[/.\\-]\\s?06(?![\\d.])"],
  ["nov(?:ember)?", "jun(?:e)?"],
  ["jan(?:uary)?", "aug(?:ust)?"],
  ["November", "June"],
  ["January", "August"],
  ["Nov", "Jun"],
  ["Jan", "Aug"],
];

export function transformString(value: string, set: DateSetId): string {
  if (set === "primary") return value;
  let out = value;
  for (const [from, to] of DATE_REPLACEMENTS) out = out.split(from).join(to);
  return out;
}

function deepMap(value: unknown, set: DateSetId): unknown {
  if (typeof value === "string") return transformString(value, set);
  if (Array.isArray(value)) return value.map((item) => deepMap(item, set));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepMap(item, set)]));
  }
  return value;
}

export function transformManifest<T>(manifest: T, set: DateSetId): T {
  return deepMap(manifest, set) as T;
}

type DateTokens = { date_tokens_iso: string[]; yearless_date_tokens: string[] };

let rawDateTokens: DateTokens | null = null;
const tokenDayCache = new Map<DateSetId, string[]>();

function tokenMonthDays(set: DateSetId): string[] {
  const cached = tokenDayCache.get(set);
  if (cached) return cached;
  rawDateTokens ??= JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8")) as DateTokens;
  const manifest = transformManifest(rawDateTokens, set);
  const days = [...new Set([...manifest.date_tokens_iso.map((date) => date.slice(5)), ...manifest.yearless_date_tokens])];
  tokenDayCache.set(set, days);
  return days;
}

function dayOfYear(monthDay: string): number {
  const [month, day] = monthDay.split("-").map(Number);
  return Math.round((Date.UTC(2000, month - 1, day) - Date.UTC(2000, 0, 1)) / DAY_MS) + 1;
}

function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 366 - diff);
}

function minimumDistance(runMonthDays: string[], set: DateSetId): number {
  const tokens = tokenMonthDays(set);
  let minimum = Number.POSITIVE_INFINITY;
  for (const run of runMonthDays) {
    for (const token of tokens) minimum = Math.min(minimum, circularDistance(dayOfYear(run), dayOfYear(token)));
  }
  return minimum;
}

export function selectDateSet(now: Date): DateSetId {
  const runMonthDays = [...new Set(runDates(now).map((date) => date.slice(5)))];
  const primary = minimumDistance(runMonthDays, "primary");
  const alternate = minimumDistance(runMonthDays, "alternate");
  return alternate > primary ? "alternate" : "primary";
}

type CachedSet = { set?: unknown; chosen_at?: unknown };

function cachedDateSet(): DateSetId | null {
  if (!fs.existsSync(DATE_SET_FILE)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(DATE_SET_FILE, "utf8")) as CachedSet;
    const chosenAt = typeof cached.chosen_at === "string" ? Date.parse(cached.chosen_at) : Number.NaN;
    if ((cached.set === "primary" || cached.set === "alternate") && Math.abs(Date.now() - chosenAt) < CACHE_TTL_MS) {
      return cached.set;
    }
  } catch {
    return null;
  }
  return null;
}

export function activeDateSet(now = new Date()): DateSetId {
  const override = process.env.LEAK_DATE_SET;
  if (override === "primary" || override === "alternate") return override;

  const cached = cachedDateSet();
  if (cached) return cached;

  const set = selectDateSet(now);
  fs.mkdirSync(path.dirname(DATE_SET_FILE), { recursive: true });
  fs.writeFileSync(DATE_SET_FILE, `${JSON.stringify({ set, chosen_at: now.toISOString() }, null, 2)}\n`);
  return set;
}
