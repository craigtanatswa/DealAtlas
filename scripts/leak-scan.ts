import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { structuredLog } from "@/lib/observability/log";

import { alertDepsFromEnv, deliverCrash, deliverFindings, deliverIncomplete } from "@/lib/leak-scan/alert";
import { runDbPass } from "@/lib/leak-scan/db-pass";
import { runHttpPass } from "@/lib/leak-scan/http-pass";
import { createReadonlyClient } from "@/lib/leak-scan/readonly-client";
import { alertSeverity, codeCounts } from "@/lib/leak-scan/report";
import { emptyState, readState, writeState, type ScanState } from "@/lib/leak-scan/state";

const MISSING_RECIPIENT_ANNOTATION =
  "::error::LEAK_ALERT_EMAIL_TO is not configured; leak-scan alerts were not sent";

function hasAlertRecipient(): boolean {
  return Boolean(process.env.LEAK_ALERT_EMAIL_TO?.trim());
}

function reportMissingAlertRecipient(): void {
  structuredLog({ msg: "leak_scan_config", missing: "LEAK_ALERT_EMAIL_TO" });
  console.error(MISSING_RECIPIENT_ANNOTATION);
}

function logScanResult(state: ScanState): void {
  structuredLog({
    msg: state.findings.length === 0 ? "leak_scan_quiet" : "leak_scan_findings",
    severity: alertSeverity(state.failed, state.scanned),
    scanned: state.scanned,
    failed: state.failed,
    findings: state.findings.length,
    db_codes: codeCounts(state.findings, "db") || "0",
    http_codes: codeCounts(state.findings, "http") || "0",
  });
}

function logIncomplete(state: ScanState): void {
  structuredLog({
    msg: "leak_scan_incomplete",
    severity: "error",
    scanned: state.scanned,
    failed: state.failed,
    db_codes: codeCounts(state.findings, "db") || "0",
    http_codes: "0",
    incomplete: 1,
  });
}

function passName(): string {
  const index = process.argv.indexOf("--pass");
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

async function main(): Promise<void> {
  const pass = passName();
  if (pass === "db") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error("leak scan database credentials are missing");
    }
    const raw = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await runDbPass(createReadonlyClient(raw as never), {
      includeHeld: process.env.LEAK_SCAN_INCLUDE_HELD === "true",
      cursorSeed: Math.floor(Date.now() / 3_600_000),
    });
    const saved = {
      scanned: result.scanned,
      failed: result.failed,
      findings: result.findings,
      legacySlugs: result.legacySlugs,
      dealTokens: result.dealTokens,
      incompleteAlerted: false,
    };
    writeState(saved);
    if (result.incomplete) {
      if (hasAlertRecipient()) {
        await deliverIncomplete(
          { scanned: result.scanned, failed: result.failed, findings: result.findings },
          alertDepsFromEnv(process.env),
        );
        writeState({ ...saved, incompleteAlerted: true });
      } else {
        logIncomplete(saved);
        reportMissingAlertRecipient();
      }
      process.exitCode = 1;
    }
    return;
  }
  if (pass === "http") {
    const state = readState();
    const result = await runHttpPass({
      dealTokens: state?.dealTokens ?? [],
      legacySlugs: state ? state.legacySlugs : null,
    });
    const base = state ?? emptyState();
    writeState({
      scanned: base.scanned,
      failed: base.failed,
      findings: [...base.findings, ...result.findings],
      legacySlugs: [],
      dealTokens: [],
      incompleteAlerted: base.incompleteAlerted === true,
    });
    return;
  }
  if (pass === "notify") {
    const state = readState() ?? emptyState();
    const hasFindings = state.findings.length > 0 || state.failed > 0;
    if (!hasAlertRecipient()) {
      logScanResult(state);
      reportMissingAlertRecipient();
      process.exitCode = 1;
      return;
    }
    await deliverFindings(
      { scanned: state.scanned, failed: state.failed, findings: state.findings },
      alertDepsFromEnv(process.env),
    );
    if (hasFindings) {
      process.exitCode = 1;
    }
    return;
  }
  if (pass === "crash") {
    if (readState()?.incompleteAlerted) return;
    if (!hasAlertRecipient()) {
      reportMissingAlertRecipient();
      process.exitCode = 1;
      return;
    }
    await deliverCrash(alertDepsFromEnv(process.env));
    return;
  }
  throw new Error("pass must be db, http, notify or crash");
}

main().catch(() => {
  structuredLog({ msg: "leak_scan_failed", code: "SCAN_FAILED" });
  process.exitCode = 1;
});
