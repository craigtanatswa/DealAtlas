import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { alertDepsFromEnv, deliverCrash, deliverFindings, deliverIncomplete } from "@/lib/leak-scan/alert";
import { runDbPass } from "@/lib/leak-scan/db-pass";
import { runHttpPass } from "@/lib/leak-scan/http-pass";
import { createReadonlyClient } from "@/lib/leak-scan/readonly-client";
import { emptyState, readState, writeState } from "@/lib/leak-scan/state";

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
      await deliverIncomplete(
        { scanned: result.scanned, failed: result.failed, findings: result.findings },
        alertDepsFromEnv(process.env),
      );
      writeState({ ...saved, incompleteAlerted: true });
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
    await deliverFindings(
      { scanned: state.scanned, failed: state.failed, findings: state.findings },
      alertDepsFromEnv(process.env),
    );
    return;
  }
  if (pass === "crash") {
    if (readState()?.incompleteAlerted) return;
    await deliverCrash(alertDepsFromEnv(process.env));
    return;
  }
  throw new Error("pass must be db, http, notify or crash");
}

main().catch(() => {
  process.exitCode = 1;
});
