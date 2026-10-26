import type { SourceAdapter } from "@/ingestion/core/types";
import {
  createAllowlistedBinaryClient,
  type BinaryHttpClient,
} from "@/ingestion/core/http";
import { IngestionError } from "@/ingestion/core/errors";
import { defaultSleep } from "@/ingestion/core/retry";
import { createRequestPacer } from "@/ingestion/sources/find-a-tender/pace";

import {
  GCA_MAX_REQUESTS_PER_MINUTE,
  GCA_PIPELINE_FETCH_POLICY,
  GCA_PIPELINE_FILE,
  GCA_PIPELINE_PARSER_VERSION,
  GCA_PIPELINE_SOURCE_KEY,
  assertRobotsCleanFeedUrl,
  gcaAgreementUrl,
} from "@/ingestion/sources/gca/constants";
import { gcaCandidate, includingVatText, parseContact, pipelineStatus } from "@/ingestion/sources/gca/map";
import { odsRows, readZipText } from "@/ingestion/sources/gca/ods";
import { blank, isRmNumber, normaliseRm, parseUkDate } from "@/ingestion/sources/gca/text";

export type GcaPipelineAdapterOptions = {
  http?: BinaryHttpClient;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

type PipelineRow = {
  rm: string;
  cells: string[];
};

export function createGcaPipelineAdapter(options: GcaPipelineAdapterOptions = {}): SourceAdapter {
  const now = options.now ?? (() => new Date());
  const pace = createRequestPacer({
    maxRequests: GCA_MAX_REQUESTS_PER_MINUTE,
    windowMs: 60_000,
    now: () => now().getTime(),
    sleep: options.sleep ?? defaultSleep,
  });
  const http = options.http ?? createAllowlistedBinaryClient(GCA_PIPELINE_FETCH_POLICY);
  let cached: PipelineRow[] | null = null;

  return {
    sourceKey: GCA_PIPELINE_SOURCE_KEY,
    async discover(cursor, discoverOptions) {
      if (!cached) {
        assertRobotsCleanFeedUrl(GCA_PIPELINE_FILE);
        await pace();
        const response = await http.getBytes(GCA_PIPELINE_FILE);
        cached = pipelineRows(readZipText(response.body, "content.xml"));
      }
      const offset = Number.parseInt(cursor ?? "0", 10) || 0;
      const limit = Math.min(100, Math.max(1, discoverOptions?.limit ?? 20));
      const page = cached.slice(offset, offset + limit);
      const next = offset + page.length;
      return {
        items: page.map((row) => ({
          externalRecordId: row.rm,
          sourceUrl: gcaAgreementUrl(row.rm),
          payload: { cells: row.cells },
        })),
        nextCursor: next < cached.length && page.length > 0 ? String(next) : undefined,
      };
    },
    async fetch(item) {
      if (item.payload == null) {
        throw new IngestionError({
          message: "GCA pipeline row was not in the spreadsheet payload.",
          stage: "fetch",
          code: "GCA_FETCH_REQUIRES_PAYLOAD",
          retryable: false,
        });
      }
      return {
        externalRecordId: item.externalRecordId,
        sourceUrl: item.sourceUrl ?? gcaAgreementUrl(item.externalRecordId),
        publishedAt: null,
        fetchedAt: now().toISOString(),
        contentType: "application/vnd.oasis.opendocument.spreadsheet",
        parserVersion: GCA_PIPELINE_PARSER_VERSION,
        payload: item.payload,
        http: {
          status: 200,
          url: GCA_PIPELINE_FILE,
          contentType: "application/vnd.oasis.opendocument.spreadsheet",
        },
      };
    },
    async parse(raw) {
      const cells = asCells(raw.payload);
      return [mapPipelineRow(cells, now())];
    },
  };
}

export function pipelineRows(xml: string): PipelineRow[] {
  const rows = odsRows(xml);
  const header = rows.findIndex(
    (row) => row.includes("Reference number") && row.includes("Commercial agreement title"),
  );
  if (header < 0) {
    throw new IngestionError({
      message: "GCA pipeline spreadsheet has no header row.",
      stage: "parse",
      code: "GCA_PIPELINE_HEADER",
      retryable: false,
    });
  }
  const columns = indexColumns(rows[header] ?? []);
  const seen = new Set<string>();
  const records: PipelineRow[] = [];
  for (const row of rows.slice(header + 1)) {
    const rmRaw = cell(row, columns.reference);
    if (!rmRaw || !isRmNumber(rmRaw)) {
      continue;
    }
    const rm = normaliseRm(rmRaw);
    if (seen.has(rm)) {
      continue;
    }
    seen.add(rm);
    records.push({ rm, cells: align(row, columns) });
  }
  return records;
}

export function mapPipelineRow(cells: string[], now: Date) {
  const rm = blank(cells[0]);
  const title = blank(cells[1]);
  if (!rm || !isRmNumber(rm) || !title) {
    throw new IngestionError({
      message: "GCA pipeline row is missing an RM number or title.",
      stage: "parse",
      code: "GCA_RECORD_INCOMPLETE",
      retryable: false,
    });
  }
  const procurementStart = parseUkDate(cells[6]);
  const contact = parseContact(cells[10] ?? null);
  const cpv = blank(cells[8]);
  return gcaCandidate({
    sourceKey: GCA_PIPELINE_SOURCE_KEY,
    rm,
    title,
    description: blank(cells[2]),
    category: blank(cells[3]),
    mapped: pipelineStatus(procurementStart, now, blank(cells[4])),
    now,
    contactEmail: contact.email,
    contactPhone: contact.phone,
    cpvCode: cpv && /^\d{8}$/.test(cpv) ? cpv : null,
    cpvDescription: blank(cells[9]),
    procurementMethod: blank(cells[7]),
    specialRegime: /^y$/i.test(cells[11] ?? "") ? "Procurement Act 2023" : null,
    exactValueText: includingVatText(blank(cells[5])),
    contractStartDate: parseUkDate(cells[12]),
    nextProcurementDate: procurementStart,
  });
}

function indexColumns(header: string[]) {
  const at = (name: string) => header.findIndex((cell) => cell.trim() === name);
  return {
    reference: at("Reference number"),
    title: at("Commercial agreement title"),
    description: at("Short description"),
    category: at("Category"),
    agreementType: at("Agreement type (Framework, Open Framework or Dynamic Market)"),
    value: at("Estimated agreement value (Inc VAT)"),
    procurementStart: at("Estimated procurement start date"),
    route: at("Planned procurement sourcing route (anticipated)"),
    cpv: at("Anticipated main cat CPV code"),
    cpvDescription: at("Anticipated main spend CPV code"),
    contact: at("Main contact"),
    act: at("Procurement Act 2023 Y/N"),
    commencement: at("Estimated contract commencement date"),
  };
}

function align(row: string[], columns: ReturnType<typeof indexColumns>): string[] {
  return [
    cell(row, columns.reference),
    cell(row, columns.title),
    cell(row, columns.description),
    cell(row, columns.category),
    cell(row, columns.agreementType),
    cell(row, columns.value),
    cell(row, columns.procurementStart),
    cell(row, columns.route),
    cell(row, columns.cpv),
    cell(row, columns.cpvDescription),
    cell(row, columns.contact),
    cell(row, columns.act),
    cell(row, columns.commencement),
  ];
}

function cell(row: string[], index: number): string {
  if (index < 0) {
    return "";
  }
  return row[index] ?? "";
}

function asCells(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || !("cells" in payload)) {
    return [];
  }
  const cells = (payload as { cells?: unknown }).cells;
  return Array.isArray(cells) ? cells.map((item) => (typeof item === "string" ? item : "")) : [];
}
