import type { DealStatus } from "@/lib/search/filters";

const LONDON = "Europe/London";

const BAND_WITHIN = /^Within (\d+) days$/;

export type DeadlineCopy = {
  text: string | null;
  /** Set only when a real deadline is shown. Public previews leave this null. */
  datetime: string | null;
  tone: "muted" | "soon";
  keyFact: { label: string; value: string } | null;
};

function londonParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function londonDayIndex(date: Date) {
  const parts = londonParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
}

function shortMonth(date: Date, now: Date) {
  const when = londonParts(date);
  const today = londonParts(now);
  const month = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    month: "short",
  }).format(date);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    day: "numeric",
  }).format(date);
  return when.year === today.year ? `${day} ${month}` : `${day} ${month} ${when.year}`;
}

function longDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function monthYear(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    month: "long",
    year: "numeric",
  }).format(date);
}

function bandPhrase(status: DealStatus, band: string | null | undefined): DeadlineCopy {
  const value = band?.trim() || null;
  if (status === "UPCOMING") {
    const announced = !value || value === "Upcoming / date not yet fixed";
    const text = announced
      ? "Opening date not yet announced"
      : `Expected to open ${value.charAt(0).toLowerCase()}${value.slice(1)}`;
    return {
      text,
      datetime: null,
      tone: "muted",
      keyFact: {
        label: "Expected to open",
        value: announced ? "Not yet announced" : value!,
      },
    };
  }
  if (status !== "OPEN" && status !== "CLOSING_SOON") {
    return { text: null, datetime: null, tone: "muted", keyFact: null };
  }
  if (!value || value === "Upcoming / date not yet fixed") {
    return { text: null, datetime: null, tone: status === "CLOSING_SOON" ? "soon" : "muted", keyFact: null };
  }
  const text =
    value === "Closing today"
      ? "Closes today"
      : value === "Closed"
        ? "Closed"
        : BAND_WITHIN.test(value)
          ? `Closes within ${BAND_WITHIN.exec(value)?.[1]} days`
          : value === "More than 30 days"
            ? "Closes in more than 30 days"
            : `Closes ${value.charAt(0).toLowerCase()}${value.slice(1)}`;
  return {
    text,
    datetime: null,
    tone: status === "CLOSING_SOON" ? "soon" : "muted",
    keyFact: { label: "Closing window", value },
  };
}

/**
 * Wording for a known deadline. Callers on free pages must not pass a source
 * timestamp; pass the preview band instead. Dates use Europe/London.
 */
export function deadlineCopy(input: {
  status: DealStatus;
  deadlineBand?: string | null;
  deadline?: string | null;
  expectedStart?: string | null;
  expectedEnd?: string | null;
  now?: Date;
}): DeadlineCopy {
  const now = input.now ?? new Date();
  if (input.status === "UPCOMING" && (input.expectedStart || input.expectedEnd)) {
    const start = input.expectedStart ? new Date(input.expectedStart) : null;
    const end = input.expectedEnd ? new Date(input.expectedEnd) : null;
    const startOk = start && !Number.isNaN(start.getTime()) ? start : null;
    const endOk = end && !Number.isNaN(end.getTime()) ? end : null;
    if (startOk && endOk) {
      const sameMonth =
        londonParts(startOk).year === londonParts(endOk).year &&
        londonParts(startOk).month === londonParts(endOk).month;
      const text = sameMonth
        ? `Expected to open ${monthYear(startOk)}`
        : `Expected ${new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, month: "short" }).format(startOk)}–${new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, month: "short", year: "numeric" }).format(endOk)}`;
      return {
        text,
        datetime: null,
        tone: "muted",
        keyFact: {
          label: "Expected to open",
          value: sameMonth ? monthYear(startOk) : text.replace(/^Expected /, ""),
        },
      };
    }
    if (startOk) {
      const label = monthYear(startOk);
      return {
        text: `Expected to open ${label}`,
        datetime: null,
        tone: "muted",
        keyFact: { label: "Expected to open", value: label },
      };
    }
  }

  if (!input.deadline) {
    return bandPhrase(input.status, input.deadlineBand);
  }
  const due = new Date(input.deadline);
  if (Number.isNaN(due.getTime())) {
    return bandPhrase(input.status, input.deadlineBand);
  }

  if (input.status === "UPCOMING") {
    const label = monthYear(due);
    return {
      text: `Expected to open ${label}`,
      datetime: null,
      tone: "muted",
      keyFact: { label: "Expected to open", value: label },
    };
  }

  if (input.status !== "OPEN" && input.status !== "CLOSING_SOON") {
    return { text: null, datetime: null, tone: "muted", keyFact: null };
  }

  const days = londonDayIndex(due) - londonDayIndex(now);
  const short = shortMonth(due, now);
  const datetime = due.toISOString();
  let text = `Closes ${short}`;
  if (input.status === "CLOSING_SOON") {
    if (days <= 0) text = "Closes today";
    else if (days === 1) text = "Closes tomorrow";
    else text = `Closes in ${days} days · ${short}`;
  }
  return {
    text,
    datetime,
    tone: input.status === "CLOSING_SOON" ? "soon" : "muted",
    keyFact: { label: "Closing date", value: longDate(due) },
  };
}
