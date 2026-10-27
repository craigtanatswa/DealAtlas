export {
  TED_ELIGIBILITY_FIELDS,
  TED_FETCH_POLICY,
  TED_LICENCE_NAME,
  TED_LICENCE_URL,
  TED_PARSER_VERSION,
  TED_REQUEST_LIMIT,
  TED_REQUEST_WINDOW_MS,
  TED_SEARCH_API,
  TED_SOURCE_KEY,
  TED_WINDOW_FIELD,
} from "@/ingestion/sources/ted/constants";
export { createTedAdapter } from "@/ingestion/sources/ted/adapter";
export { parseTedNotice, parseTedRaw } from "@/ingestion/sources/ted/parse";
export { buildTedExpertQuery } from "@/ingestion/sources/ted/query";
export { tedSourceRecord } from "@/ingestion/sources/ted/seed";
