import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { parseJobArgs } = await import("@/lib/jobs/cli");
  const args = parseJobArgs(process.argv.slice(2));
  const { evaluateAlerts } = await import("@/lib/alerts/evaluate");
  const { sendAlertProviderTest } = await import("@/lib/email/send");
  const { getServerEnv } = await import("@/lib/env/server");
  const { structuredLog } = await import("@/lib/observability/log");
  const { createErrorReporter } = await import("@/lib/monitoring");

  const reporter = createErrorReporter();
  const dryRun = args.mode !== "live" || Boolean(args.testEmail);
  const result = await evaluateAlerts({
    dryRun,
    reporter,
  });

  let testEmail = null;
  const env = getServerEnv();
  const testTo = args.testEmail ?? env.DEALATLAS_EMAIL_TEST_TO;
  if ((args.mode === "test" || args.testEmail) && testTo) {
    testEmail = await sendAlertProviderTest({ to: testTo });
  }

  const payload = { ...result, testEmail };
  structuredLog({ job: "alerts", msg: "alerts_complete", ...payload });
  console.log(JSON.stringify(payload, null, 2));
  if (result.deliveryFailures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
