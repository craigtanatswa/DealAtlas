import { createErrorReporter } from "@/lib/monitoring";
import { structuredLog } from "@/lib/observability/log";

import { alertSeverity, codeCounts, reportLine, type LeakFindingReport } from "@/lib/leak-scan/report";

const FINDING_CAP = 50;

export type AlertDeps = {
  sentry: (message: string, extra: Record<string, string | number>) => Promise<void>;
  email: (subject: string, text: string) => Promise<void>;
};

export function alertText(input: {
  severity: "warning" | "error";
  scanned: number;
  failed: number;
  findings: LeakFindingReport[];
}): string {
  const lines = input.findings.slice(0, FINDING_CAP).map(reportLine);
  const omitted = input.findings.length - lines.length;
  return [
    `severity=${input.severity}`,
    `scanned=${input.scanned}`,
    `failed=${input.failed}`,
    ...lines,
    omitted > 0 ? `omitted=${omitted}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function publicExtra(input: {
  severity: "warning" | "error";
  scanned: number;
  failed: number;
  findings: LeakFindingReport[];
}): Record<string, string | number> {
  return {
    severity: input.severity,
    scanned: input.scanned,
    failed: input.failed,
    db_codes: codeCounts(input.findings, "db") || "0",
    http_codes: codeCounts(input.findings, "http") || "0",
  };
}

export async function deliverFindings(
  input: { scanned: number; failed: number; findings: LeakFindingReport[] },
  deps: AlertDeps,
): Promise<{ sent: boolean; severity: "warning" | "error" }> {
  const severity = alertSeverity(input.failed, input.scanned);
  const extra = publicExtra({ ...input, severity });
  if (input.findings.length === 0) {
    structuredLog({ msg: "leak_scan_quiet", ...extra });
    return { sent: false, severity };
  }
  try {
    await deps.sentry(`DealAtlas leak scan ${severity}`, extra);
  } catch {
    structuredLog({ msg: "leak_scan_sentry_failed", severity });
  }
  await deps.email(`DealAtlas leak scan ${severity}`, alertText({ ...input, severity }));
  structuredLog({ msg: "leak_scan_notified", ...extra });
  return { sent: true, severity };
}

export async function deliverCrash(deps: AlertDeps): Promise<void> {
  const extra = {
    severity: "error" as const,
    scanned: 0,
    failed: 0,
    db_codes: "SCAN_CRASH=1",
    http_codes: "0",
  };
  try {
    await deps.sentry("DealAtlas leak scan error", extra);
  } catch {
    structuredLog({ msg: "leak_scan_sentry_failed", severity: "error" });
  }
  await deps.email("DealAtlas leak scan error", "code=SCAN_CRASH");
}

export function alertDepsFromEnv(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): AlertDeps {
  const reporter = createErrorReporter({ dsn: env.SENTRY_DSN || null, fetchImpl });
  return {
    async sentry(message, extra) {
      await reporter.captureMessage(message, {
        ...extra,
        level: extra.severity === "error" ? "error" : "warning",
      });
    },
    async email(subject, text) {
      const apiKey = env.RESEND_API_KEY;
      const from = env.DEALATLAS_EMAIL_FROM;
      const to = env.LEAK_ALERT_EMAIL_TO;
      if (!apiKey || !from || !to) {
        throw new Error("leak scan email is not configured");
      }
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!response.ok) {
        throw new Error("leak scan email failed");
      }
    },
  };
}
