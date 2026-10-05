/**
 * Spec section 7 rule 9. A waiver applies only to its own probe id.
 * Entries that list `codes` and `names` (REST-13) also require the
 * PostgREST error code, an allowlisted PRIVATE_NAMES set, and no token or row payload.
 */
export type Waiver = {
  finding: string;
  reason: string;
  approved_by: string;
  expires: string;
  codes?: string[];
  names?: string[];
};

export type WaiverRecord = {
  probe_id: string;
  pass: boolean;
  tokens_present: string[];
  assertions: Array<{ id: string; pass: boolean; blocking?: boolean; actual?: unknown }>;
};

const ERROR_KEYS = new Set(["code", "message", "hint", "details"]);

export function waiverProblems(waivers: Waiver[], now: Date): string[] {
  return waivers
    .filter((w) => w.approved_by !== "Reviewer" || Number.isNaN(Date.parse(w.expires)) || Date.parse(w.expires) < now.getTime())
    .map((w) => `${w.finding}: ${w.approved_by !== "Reviewer" ? "not approved by the Reviewer" : "expired or invalid expiry"}`);
}

function bareId(probeId: string): string {
  return probeId.replace(/^[AB]-/, "");
}

function findingMatches(probeId: string, finding: string): boolean {
  return finding === probeId || finding === bareId(probeId);
}

function hintPayload(record: WaiverRecord): { named: string[]; code: string | null; row: boolean } | null {
  const hint = record.assertions.find((a) => a.id === "hint_names_no_private_object");
  if (!hint || hint.pass || hint.blocking === false) return null;
  const actual = hint.actual;
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return null;
  const body = actual as { named?: unknown; code?: unknown; row?: unknown };
  const named = Array.isArray(body.named) ? body.named.filter((n): n is string => typeof n === "string") : [];
  return {
    named,
    code: typeof body.code === "string" ? body.code : null,
    row: body.row === true,
  };
}

/** True when this response is a PostgREST error object and not a row payload. */
export function restErrorIsNamesOnly(body: unknown): { code: string | null; row: boolean } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { code: null, row: true };
  const json = body as Record<string, unknown>;
  const row =
    Object.keys(json).some((k) => !ERROR_KEYS.has(k)) || (json.details != null && typeof json.details !== "string");
  return { code: typeof json.code === "string" ? json.code : null, row };
}

function scopedHit(record: WaiverRecord, waiver: Waiver): boolean {
  if (!waiver.codes || !waiver.names) return false;
  const hint = hintPayload(record);
  if (!hint || hint.row || hint.named.length === 0) return false;
  if (!waiver.codes.includes(hint.code ?? "")) return false;
  if (hint.named.some((n) => !waiver.names!.includes(n))) return false;
  if (record.tokens_present.length > 0) return false;
  return !record.assertions.some((a) => !a.pass && a.blocking !== false && a.id !== "hint_names_no_private_object");
}

/** The waiver that covers this failing record, or null when it must still fail. */
export function appliedWaiver(record: WaiverRecord, waivers: Waiver[], now: Date): Waiver | null {
  if (record.pass) return null;
  const broken = new Set(waiverProblems(waivers, now).map((e) => e.slice(0, e.indexOf(":"))));
  for (const waiver of waivers) {
    if (!findingMatches(record.probe_id, waiver.finding) || broken.has(waiver.finding)) continue;
    if (waiver.codes || waiver.names) {
      if (!scopedHit(record, waiver)) continue;
    }
    return waiver;
  }
  return null;
}
