import { buyerTypeFromFunding, sectorFromText } from "@/lib/deals/buyer-taxonomy";
import { asRecord, asString } from "@/ingestion/normalizers/text";
import { collectObjectArrays } from "@/ingestion/sources/private/json";
import { buildPrivateCandidate } from "@/ingestion/sources/private/parse";
import type { PrivateMappingContext } from "@/ingestion/sources/private/types";
import {
  NISTA_PARSER_VERSION,
  UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
  nistaProjectUrl,
} from "@/ingestion/sources/uk-infrastructure-pipeline/constants";

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
  const candidate = buildPrivateCandidate(project, {
    ...context,
    sourceKey: UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
    parserVersion: NISTA_PARSER_VERSION,
    sourceUrl: context.sourceUrl || nistaProjectUrl(id),
  });
  const funding =
    asString(row?.funding) ??
    asString(row?.["is_this_project_programme_drawing_on_public_or_private_funds"]) ??
    asString(row?.funding_source);
  const sectorText =
    asString(row?.sector) ?? asString(row?.client) ?? candidate.mainCategory ?? null;
  return {
    ...candidate,
    buyerType: buyerTypeFromFunding(funding) ?? "PUBLIC",
    sector: sectorFromText(sectorText),
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
