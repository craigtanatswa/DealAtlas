import type { BroadRegion } from "@/lib/preview/region";
import { buyerTypeFromFunding, sectorFromText } from "@/lib/deals/buyer-taxonomy";
import { asRecord, asString } from "@/ingestion/normalizers/text";
import { collectObjectArrays } from "@/ingestion/sources/private/json";
import {
  mapPrivateDealStage,
  mapPrivateDealStatus,
} from "@/ingestion/sources/private/mapping";
import { buildPrivateCandidate } from "@/ingestion/sources/private/parse";
import type { PrivateMappingContext } from "@/ingestion/sources/private/types";
import {
  NISTA_PARSER_VERSION,
  UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
  nistaProjectUrl,
} from "@/ingestion/sources/uk-infrastructure-pipeline/constants";

const NISTA_REGION_BY_NAME: Record<string, BroadRegion> = {
  "south east": "South East England",
  "south west": "South West England",
  "north west": "North West England",
  "north east": "North East England",
  east: "East of England",
  "east of england": "East of England",
  "west midlands": "West Midlands",
  "east midlands": "East Midlands",
  london: "London",
  "yorkshire and the humber": "Yorkshire and the Humber",
  wales: "Wales",
  scotland: "Scotland",
  "northern ireland": "Northern Ireland",
  england: "Nationwide",
  uk: "Nationwide",
  gb: "Nationwide",
  "england and wales": "Nationwide",
  offshore: "Nationwide",
};

const COUNTRY_TOKENS = new Set(["england", "uk", "gb"]);

function normaliseRegionName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Maps the NISTA "ONS Region" column to one BROAD_REGIONS value. */
export function normaliseNistaRegion(value: unknown): BroadRegion | null {
  const text = asString(value);
  if (!text || text === "-") {
    return null;
  }
  const parts = text
    .split(",")
    .map(normaliseRegionName)
    .filter(Boolean);
  if (parts.length <= 1) {
    return NISTA_REGION_BY_NAME[normaliseRegionName(text)] ?? null;
  }

  const regions = new Set<BroadRegion>();
  let sawCountryToken = false;
  for (const part of parts) {
    if (COUNTRY_TOKENS.has(part)) {
      sawCountryToken = true;
      continue;
    }
    const region = NISTA_REGION_BY_NAME[part];
    if (region) {
      regions.add(region);
    }
  }
  if (regions.size > 1) {
    return "Nationwide";
  }
  if (regions.size === 1) {
    return [...regions][0]!;
  }
  return sawCountryToken ? "Nationwide" : null;
}

/**
 * NISTA publishes projected works dates, not submission deadlines. A project
 * without a deadline must stay upcoming rather than looking open to bid.
 */
export function mapNistaProjectState(input: {
  procurementStage?: string | null;
  schemeStatus?: string | null;
}) {
  const defaultStage = mapPrivateDealStage(input);
  const defaultStatus = mapPrivateDealStatus(input);
  if (
    defaultStatus === "CANCELLED" ||
    defaultStatus === "WITHDRAWN" ||
    defaultStatus === "CLOSED"
  ) {
    return { stage: defaultStage, status: defaultStatus };
  }

  const procurementStage = (input.procurementStage ?? "").trim().toLowerCase();
  const schemeStatus = (input.schemeStatus ?? "").trim().toLowerCase();
  const procured =
    procurementStage === "procured" ||
    schemeStatus.includes("construction") ||
    schemeStatus.includes("operation");
  return procured
    ? { stage: "CONTRACT" as const, status: "ACTIVE" as const }
    : { stage: "PLANNING" as const, status: "UPCOMING" as const };
}

export function extractNistaProjects(payload: unknown): unknown[] {
  const record = asRecord(payload);
  if (record?.project) {
    return [record.project];
  }
  if (Array.isArray(record?.projects)) {
    return record.projects;
  }

  const collected = collectObjectArrays(payload);
  const seen = new Set<string>();
  const projects: unknown[] = [];
  for (const item of collected) {
    const project = asRecord(item);
    const id = asString(project?.project_id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    projects.push(item);
  }
  return projects;
}

export function nistaRecordId(record: unknown): string | null {
  return asString(asRecord(record)?.project_id);
}

export function mapNistaRecord(record: unknown, context: PrivateMappingContext) {
  const id = nistaRecordId(record) ?? "unknown";
  const project = unwrapProject(record);
  const row = asRecord(project);
  const region = normaliseNistaRegion(row?.["ONS Region"]);
  const mappedProject = row ? { ...row, "ONS Region": region } : project;
  const candidate = buildPrivateCandidate(
    mappedProject,
    {
      ...context,
      sourceKey: UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
      parserVersion: NISTA_PARSER_VERSION,
      sourceUrl: context.sourceUrl || nistaProjectUrl(id),
    },
    {
      regionKeys: ["ONS Region"],
      startKeys: ["start_of_works_construction_projected"],
    },
  );
  const funding =
    asString(row?.funding) ??
    asString(row?.["is_this_project_programme_drawing_on_public_or_private_funds"]) ??
    asString(row?.funding_source);
  const sectorText =
    asString(row?.sector) ?? asString(row?.client) ?? candidate.mainCategory ?? null;
  const state = mapNistaProjectState({
    procurementStage: asString(row?.procurement_stage),
    schemeStatus: asString(row?.scheme_status),
  });
  return {
    ...candidate,
    buyerType: buyerTypeFromFunding(funding) ?? "PUBLIC",
    sector: sectorFromText(sectorText),
    stage: state.stage,
    status: state.status,
  };
}

export function unwrapProject(payload: unknown): unknown {
  const record = asRecord(payload);
  if (record?.project) {
    return record.project;
  }
  if (record?.record) {
    return record.record;
  }
  return payload;
}
