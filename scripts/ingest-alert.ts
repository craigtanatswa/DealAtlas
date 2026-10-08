import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { ingestAlertShouldSkip, sendIngestAlert } = await import("@/lib/jobs/ingest-alert");
  const to = process.env.INGEST_ALERT_EMAIL_TO;
  if (ingestAlertShouldSkip(to)) {
    console.log(JSON.stringify({ alert: "skipped" }));
    return;
  }
  const outcome = await sendIngestAlert({
    to: to ?? "",
    from: process.env.DEALATLAS_EMAIL_FROM,
    apiKey: process.env.RESEND_API_KEY,
    countsJson: process.env.INGEST_COUNTS,
  });
  console.log(JSON.stringify({ alert: outcome }));
}

main().catch(() => {
  console.log(JSON.stringify({ alert: "failed" }));
  process.exitCode = 1;
});
