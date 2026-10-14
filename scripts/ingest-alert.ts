import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { ingestAlertShouldSkip, sendIngestAlert } = await import("@/lib/jobs/ingest-alert");
  const to = process.env.LEAK_ALERT_EMAIL_TO;
  if (ingestAlertShouldSkip(to)) {
    console.log(JSON.stringify({ alert: "skipped" }));
    return;
  }
  const outcome = await sendIngestAlert({
    to: to ?? "",
    from: process.env.DEALATLAS_EMAIL_FROM,
    apiKey: process.env.RESEND_API_KEY,
    ingestCountsJson: process.env.INGEST_COUNTS,
    buildCountsJson: process.env.BUILD_COUNTS,
    ingestOk: process.env.INGEST_OK,
    contractsFinderOk: process.env.CONTRACTS_FINDER_OK,
    findAGrantOk: process.env.FIND_A_GRANT_OK,
    innovateUkOk: process.env.INNOVATE_UK_OK,
    buildOk: process.env.BUILD_OK,
    unpublishOk: process.env.UNPUBLISH_OK,
    publishOk: process.env.PUBLISH_OK,
  });
  console.log(JSON.stringify({ alert: outcome }));
}

main().catch(() => {
  console.log(JSON.stringify({ alert: "failed" }));
  process.exitCode = 1;
});
