import { createErrorReporter } from "@/lib/monitoring";
import { structuredLog } from "@/lib/observability/log";

import { alertSeverity, reportLine, type LeakFindingReport } from "@/lib/leak-scan/report";

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

export async function deliverFindings(
  input: { scanned: number; failed: number; findings: LeakFindingReport[] },
  deps: AlertDeps,
): Promise<{ sent: boolean; severity: "warning" | "error" }> {
  const severity = alertSeverity(input.failed, input.scanned);
  if (input.findings.length === 0) {
    structuredLog({ msg: "leak_scan_quiet", scanned: input.scanned, failed: input.failed });
    return { sent: false, severity };
  }
  const text = alertText({ ...input, severity });
  const subject = `DealAtlas leak scan ${severity}`;
  await deps.sentry(subject, {
    severity,
    scanned: input.scanned,
    failed: input.failed,
    lines: input.findings.slice(0, FINDING_CAP).map(reportLine).join("\n"),
  });
  await deps.email(subject, text);
  structuredLog({ msg: "leak_scan_notified", severity, findings: input.findings.length });
  return { sent: true, severity };
}

export async function deliverCrash(deps: AlertDeps): Promise<void> {
  const subject = "DealAtlas leak scan error";
  const text = "code=SCAN_CRASH\npath=/\ndeal_id=";
  await deps.sentry(subject, { code: "SCAN_CRASH", path: "/", dealId: "" });
  await deps.email(subject, text);
}

export function alertDepsFromEnv(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): AlertDeps {
  const reporter = createErrorReporter({ dsn: env.SENTRY_DSN, fetchImpl });
  return {
    async sentry(message, extra) {
      await reporter.captureMessage(message, { ...extra, level: extra.severity === "error" || extra.code === "SCAN_CRASH" ? "error" : "warning" });
    },
    async email(subject, text) {
      const apiKey = env.RESEND_API_KEY;
      const from = env.DEALATLAS_EMAIL_FROM;
      const to = env.LEAK_ALERT_EMAIL_TO;
      if (!apiKey || !from || !to) {
        structuredLog({ msg: "leak_scan_email_unconfigured" });
        return;
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
