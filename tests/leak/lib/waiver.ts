/**
 * Spec section 7 rule 9. A waiver applies only to its own probe id, and only
 * inside its scope. It never covers a forbidden-token or INTERNAL_ID hit.
 * REST-13's scope is `codes` + `names`. Every other waiver needs `scope`.
 */
import { forbiddenFor, loadManifest, type ManifestToken, type Role } from "./scan";

export type WaiverScope = {
  role?: string;
  path?: string;
  instances?: string[];
  assertions?: string[];
  codes?: string[];
  names?: string[];
};

export type Waiver = {
  finding: string;
  reason: string;
  approved_by: string;
  expires: string;
  codes?: string[];
  names?: string[];
  scope?: WaiverScope;
};

export type WaiverRecord = {
  probe_id: string;
  role?: string;
  instance?: string;
  url?: string;
  pass: boolean;
  tokens_present: string[];
  assertions: Array<{ id: string; pass: boolean; blocking?: boolean; actual?: unknown }>;
};

const ERROR_KEYS = new Set(["code", "message", "hint", "details"]);

export function waiverHasScope(w: Waiver): boolean {
  if (w.codes?.length && w.names?.length) return true;
  const scope = w.scope;
  if (scope?.codes?.length && scope.names?.length) return true;
  return Boolean(scope?.assertions?.length && (scope.instances?.length || scope.path));
}

export function waiverProblems(waivers: Waiver[], now: Date): string[] {
  const problems: string[] = [];
  for (const w of waivers) {
    if (w.approved_by !== "Reviewer") problems.push(`${w.finding}: not approved by the Reviewer`);
    if (Number.isNaN(Date.parse(w.expires)) || Date.parse(w.expires) < now.getTime()) problems.push(`${w.finding}: expired or invalid expiry`);
    if (!waiverHasScope(w)) problems.push(`${w.finding}: missing scope`);
  }
  return problems;
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

const TOKEN_ASSERTIONS = new Set(["no_forbidden_tokens", "headers_nt", "hdr02_nt"]);
let tokenIndex: Map<string, ManifestToken> | null = null;

function tokensById(): Map<string, ManifestToken> {
  tokenIndex ??= new Map(loadManifest().tokens.map((token) => [token.id, token]));
  return tokenIndex;
}

/** Forbidden-token or INTERNAL_ID evidence. A waiver cannot hide either. */
export function hasBlockedTokenHit(record: WaiverRecord): boolean {
  if (record.assertions.some((a) => !a.pass && a.blocking !== false && TOKEN_ASSERTIONS.has(a.id))) return true;
  return record.tokens_present.some((id) => {
    const token = tokensById().get(id);
    if (!token) return false;
    if (token.class === "INTERNAL_ID") return true;
    if (!record.role) return true;
    return forbiddenFor(token, record.role as Role);
  });
}

function scopedHit(record: WaiverRecord, waiver: Waiver): boolean {
  const codes = waiver.codes ?? waiver.scope?.codes;
  const names = waiver.names ?? waiver.scope?.names;
  if (!codes?.length || !names?.length) return false;
  const hint = hintPayload(record);
  if (!hint || hint.row || hint.named.length === 0) return false;
  if (!codes.includes(hint.code ?? "")) return false;
  if (hint.named.some((n) => !names.includes(n))) return false;
  if (record.tokens_present.length > 0) return false;
  return !record.assertions.some((a) => !a.pass && a.blocking !== false && a.id !== "hint_names_no_private_object");
}

function entryScope(record: WaiverRecord, waiver: Waiver): boolean {
  const scope = waiver.scope;
  if (!scope?.assertions?.length) return false;
  if (scope.role && record.role !== scope.role) return false;
  if (scope.instances?.length && !scope.instances.includes(record.instance ?? "")) return false;
  if (scope.path && !(record.url ?? "").includes(scope.path)) return false;
  const failing = record.assertions.filter((a) => !a.pass && a.blocking !== false).map((a) => a.id);
  return failing.length > 0 && failing.every((id) => scope.assertions!.includes(id));
}

/** The waiver that covers this failing record, or null when it must still fail. */
export function appliedWaiver(record: WaiverRecord, waivers: Waiver[], now: Date): Waiver | null {
  if (record.pass || hasBlockedTokenHit(record)) return null;
  const broken = new Set(waiverProblems(waivers, now).map((e) => e.slice(0, e.indexOf(":"))));
  for (const waiver of waivers) {
    if (!findingMatches(record.probe_id, waiver.finding) || broken.has(waiver.finding) || !waiverHasScope(waiver)) continue;
    const restHint = Boolean((waiver.codes ?? waiver.scope?.codes)?.length || (waiver.names ?? waiver.scope?.names)?.length);
    if (restHint) {
      if (!scopedHit(record, waiver)) continue;
    } else if (!entryScope(record, waiver)) continue;
    return waiver;
  }
  return null;
}
