// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DealCard } from "@/components/deals/deal-card";
import { DEAL_CARD_FIXTURES } from "@/components/deals/fixtures";
import { proAlertCopy } from "@/lib/alerts/content";
import {
  expectedStartBand,
  expectedStartFromKeyDates,
  expectedStartPhrase,
  formatExpectedStart,
  paidExpectedStart,
  showsExpectedStart,
  START_DATE_TBC,
} from "@/lib/deals/expected-start";
import { keyDatesRemainder } from "@/lib/preview/display";

afterEach(cleanup);

const NOW = new Date("2026-10-30T09:00:00Z");
const SOURCE_WORDS = /infrastructure pipeline|nista|uk-infrastructure|find a tender|contracts finder/i;

describe("expected start for pipeline deals", () => {
  it("applies only to pipeline deals with no deadline", () => {
    expect(showsExpectedStart({ dealType: "PROCUREMENT_PIPELINE", submissionDeadline: null })).toBe(true);
    expect(
      showsExpectedStart({ dealType: "PROCUREMENT_PIPELINE", submissionDeadline: "2026-12-01T12:00:00Z" }),
    ).toBe(false);
    expect(showsExpectedStart({ dealType: "PUBLIC_TENDER", submissionDeadline: null })).toBe(false);
  });

  it("bands the start date coarsely for free channels", () => {
    expect(expectedStartBand("2026-12-15", NOW)).toBe("within 3 months");
    expect(expectedStartBand("2027-02-15", NOW)).toBe("in 3–6 months");
    expect(expectedStartBand("2027-06-01", NOW)).toBe("in 6–12 months");
    expect(expectedStartBand("2028-01-01", NOW)).toBe("in 12 months or more");
    expect(expectedStartBand("2026-01-01", NOW)).toBe("date passed");
  });

  it("shows Start date TBC when the start date is missing", () => {
    expect(expectedStartBand(null, NOW)).toBeNull();
    expect(paidExpectedStart({ dealType: "PROCUREMENT_PIPELINE", submissionDeadline: null, contractStartDate: null })).toBe("Start date TBC");
    expect(expectedStartFromKeyDates("Start date TBC. Contract term 3–5 years")).toBe(START_DATE_TBC);
  });

  it("free phrase carries no month, day or year", () => {
    const phrase = expectedStartPhrase(expectedStartBand("2027-03-01", NOW)!);
    expect(phrase).toBe("Expected start in 3–6 months");
    expect(phrase).not.toMatch(/\d{4}|january|february|march|april|may|june|july|august|september|october|november|december/i);
    expect(phrase).not.toMatch(SOURCE_WORDS);
  });

  it("round-trips the phrase through preview keyDates", () => {
    const keyDates = "Expected start in 6–12 months. Contract term 3–5 years";
    expect(expectedStartFromKeyDates(keyDates)).toBe("Expected start in 6–12 months");
    expect(expectedStartFromKeyDates("Closing window Within 7 days")).toBeNull();
    expect(
      keyDatesRemainder(keyDates, { expectedStart: "Expected start in 6–12 months" }),
    ).toBe("Contract term 3–5 years");
  });

  it("paid channels get the exact date", () => {
    expect(formatExpectedStart("2027-03-01")).toBe("1 March 2027");
    expect(
      paidExpectedStart({ dealType: "PROCUREMENT_PIPELINE", submissionDeadline: null, contractStartDate: "2027-03-01" }),
    ).toBe("1 March 2027");
  });

  it("pro alert copy shows the expected start when there is no deadline", () => {
    const copy = proAlertCopy("NEW_MATCH", { previewTitle: "Road works", expectedStart: "1 March 2027" } as never);
    expect(copy.message).toContain("Expected start: 1 March 2027.");
    const withDeadline = proAlertCopy("NEW_MATCH", {
      previewTitle: "Road works",
      exactDeadline: "2027-01-01",
      expectedStart: "1 March 2027",
    } as never);
    expect(withDeadline.message).toContain("Deadline: 2027-01-01.");
    expect(withDeadline.message).not.toContain("Expected start");
  });

  it("card shows the expected start instead of the deadline band", () => {
    const { container } = render(
      <DealCard
        deal={{
          ...DEAL_CARD_FIXTURES.freePreview,
          status: "UPCOMING",
          dealType: "PROCUREMENT_PIPELINE",
          deadlineBand: "Upcoming / date not yet fixed",
          keyDates: "Expected start in 3–6 months",
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Expected start in 3–6 months");
    expect(text).not.toMatch(SOURCE_WORDS);
  });

  it("card shows Start date TBC with no start date", () => {
    const { container } = render(
      <DealCard
        deal={{
          ...DEAL_CARD_FIXTURES.freePreview,
          status: "UPCOMING",
          dealType: "PROCUREMENT_PIPELINE",
          deadlineBand: "Upcoming / date not yet fixed",
          keyDates: "Start date TBC",
        }}
      />,
    );
    expect(container.textContent ?? "").toContain("Start date TBC");
    expect(container.textContent ?? "").not.toContain("Expected start");
  });
});

describe("pipeline ingest workflow", () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), ".github/workflows/ingest-pipeline.yml"),
    "utf8",
  );
  it("is dispatch-only, scoped, time-boxed and has no alert email", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s*schedule:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).toMatch(/permissions:\n\s+contents: read/);
    expect(workflow).toMatch(/timeout-minutes: \d+/);
    expect(workflow).toContain("--source uk-infrastructure-pipeline");
    expect(workflow).toContain("--job publish-eligible");
    expect(workflow).not.toMatch(/RESEND_API_KEY|LEAK_ALERT_EMAIL_TO|EMAIL_TEST_TO|ingest-alert/);
  });
});
