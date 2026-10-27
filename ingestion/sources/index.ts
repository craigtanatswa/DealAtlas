export {
  createContractsFinderAdapter,
  CONTRACTS_FINDER_SOURCE_KEY,
} from "@/ingestion/sources/contracts-finder";
export {
  createPublicContractsScotlandAdapter,
  PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
} from "@/ingestion/sources/public-contracts-scotland";
export { createSell2WalesAdapter, SELL2WALES_SOURCE_KEY } from "@/ingestion/sources/sell2wales";
export { createTedAdapter, TED_SOURCE_KEY } from "@/ingestion/sources/ted";
export { createFindATenderAdapter, FIND_A_TENDER_SOURCE_KEY } from "@/ingestion/sources/find-a-tender";
export {
  createUkInfrastructurePipelineAdapter,
  UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
} from "@/ingestion/sources/uk-infrastructure-pipeline";
export {
  createFindAGrantAdapter,
  FIND_A_GRANT_SOURCE_KEY,
} from "@/ingestion/sources/find-a-grant";
export {
  createGcaAgreementsAdapter,
  createGcaPipelineAdapter,
  GCA_AGREEMENTS_SOURCE_KEY,
  GCA_PIPELINE_SOURCE_KEY,
} from "@/ingestion/sources/gca";
export {
  createInnovateUkAdapter,
  INNOVATE_UK_SOURCE_KEY,
} from "@/ingestion/sources/innovate-uk";
export { createPrivateSourceAdapter } from "@/ingestion/sources/private";
export { getSourceAdapter, listRegisteredSourceKeys } from "@/ingestion/sources/registry";
