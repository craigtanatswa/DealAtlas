export { createPrivateSourceAdapter } from "@/ingestion/sources/private/adapter";
export { parseCsvRecords } from "@/ingestion/sources/private/csv";
export { extractHtmlTableRecords } from "@/ingestion/sources/private/html";
export { recordsFromJsonPayload, recordsWithProjectId } from "@/ingestion/sources/private/json";
export {
  mapPrivateBuyerSector,
  mapPrivateDealStage,
  mapPrivateDealStatus,
  mapPrivateDealType,
} from "@/ingestion/sources/private/mapping";
export { buildPrivateCandidate } from "@/ingestion/sources/private/parse";
export type { PrivateSourceDefinition } from "@/ingestion/sources/private/types";
