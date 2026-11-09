export {
  GCA_AGREEMENTS_API,
  GCA_AGREEMENTS_SOURCE_KEY,
  GCA_PIPELINE_FILE,
  GCA_PIPELINE_SOURCE_KEY,
  assertRobotsCleanFeedUrl,
} from "@/ingestion/sources/gca/constants";
export { createGcaAgreementsAdapter, mapGcaAgreement } from "@/ingestion/sources/gca/agreements";
export { createGcaPipelineAdapter, mapPipelineRow } from "@/ingestion/sources/gca/pipeline";
export { gcaAgreementsSourceRecord, gcaPipelineSourceRecord } from "@/ingestion/sources/gca/seed";
