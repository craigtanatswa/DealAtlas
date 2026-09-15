import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { evaluateAlerts } = await import("@/lib/alerts/evaluate");
  const result = await evaluateAlerts();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
