import { describe, expect, it } from "vitest";

import { CSV_FORMULA_INJECTION_FIXTURES } from "../helpers/csv-injection";
import {
  CSV_UTF8_BOM,
  buildUtf8Csv,
  escapeCsvCell,
  isValidUtf8,
} from "@/lib/exports/csv";
import { dealExportFilename, isDealExportFilename } from "@/lib/exports/filename";

describe("CSV spreadsheet injection protection", () => {
  it("prefixes formula-leading fixtures with an apostrophe and quotes them", () => {
    for (const fixture of CSV_FORMULA_INJECTION_FIXTURES) {
      const escaped = escapeCsvCell(fixture.raw);
      expect(escaped, fixture.label).toMatch(/^"'/);
      expect(escaped, fixture.label).not.toMatch(/^[=+\-@\t\r]/);
      expect(escaped, fixture.label).toContain(`'${fixture.raw.replaceAll('"', '""')}`);
    }
  });

  it("keeps ordinary text, commas, quotes, and UTF-8 characters safe", () => {
    expect(escapeCsvCell("Managed IT support")).toBe("Managed IT support");
    expect(escapeCsvCell("London, UK")).toBe('"London, UK"');
    expect(escapeCsvCell('Say "hello"')).toBe('"Say ""hello"""');
    expect(escapeCsvCell("Line\nbreak")).toBe('"Line\nbreak"');
    expect(escapeCsvCell("£375,000")).toBe('"£375,000"');
    expect(escapeCsvCell("Opportunité")).toBe("Opportunité");
  });

  it("emits a UTF-8 CSV document with BOM and CRLF rows", () => {
    const document = buildUtf8Csv(
      ["source_title", "exact_value_text"],
      [["=1+1", "£10,000"]],
    );

    expect(document.startsWith(CSV_UTF8_BOM)).toBe(true);
    expect(document).toContain("\r\n");
    expect(document).toContain("\"'=1+1\"");
    expect(document).toContain('"£10,000"');
    expect(document).not.toMatch(/(?:^|,)=1\+1/m);

    const bytes = new TextEncoder().encode(document);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    expect(isValidUtf8(bytes)).toBe(true);
  });

  it("uses a dated DealAtlas filename", () => {
    const name = dealExportFilename(new Date("2026-09-15T17:00:00.000Z"));
    expect(name).toBe("dealatlas-deals-2026-09-15.csv");
    expect(isDealExportFilename(name)).toBe(true);
    expect(isDealExportFilename("export.csv")).toBe(false);
  });
});
