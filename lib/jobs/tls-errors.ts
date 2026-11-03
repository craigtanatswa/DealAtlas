export const TLS_CERTIFICATE_ERROR_CODES = [
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED",
] as const;

export type TlsCertificateErrorCode = (typeof TLS_CERTIFICATE_ERROR_CODES)[number];

/** Portal TLS certificate problems warn instead of failing the whole ingest job. */
export const tlsNonBlockingSources = [
  "public-contracts-scotland",
  "sell2wales",
] as const;

export type TlsNonBlockingSource = (typeof tlsNonBlockingSources)[number];

const TLS_CERTIFICATE_ERROR_CODE_SET: ReadonlySet<string> = new Set(
  TLS_CERTIFICATE_ERROR_CODES,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function matchesTlsCode(value: string): boolean {
  return TLS_CERTIFICATE_ERROR_CODES.some((code) => value.includes(code));
}

/** Walks an error and its cause chain for a TLS certificate error code. */
export function isTlsCertificateError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  for (let depth = 0; depth < 10 && current != null; depth += 1) {
    if (typeof current === "string") {
      return matchesTlsCode(current);
    }
    if (!isRecord(current) || seen.has(current)) {
      return false;
    }
    seen.add(current);

    const code = current.code;
    if (typeof code === "string" && TLS_CERTIFICATE_ERROR_CODE_SET.has(code)) {
      return true;
    }
    const errno = current.errno;
    if (typeof errno === "string" && TLS_CERTIFICATE_ERROR_CODE_SET.has(errno)) {
      return true;
    }
    const message = current.message;
    if (typeof message === "string" && matchesTlsCode(message)) {
      return true;
    }

    current = current.cause;
  }
  return false;
}

export function isTlsNonBlockingSource(source: string): source is TlsNonBlockingSource {
  return (tlsNonBlockingSources as readonly string[]).includes(source);
}

/** A TLS certificate failure is non-blocking only for the two devolved portals. */
export function isNonBlockingTlsFailure(source: string, err: unknown): boolean {
  return isTlsNonBlockingSource(source) && isTlsCertificateError(err);
}

/** Non-blocking only when every reported failure is a TLS certificate error. */
export function isNonBlockingTlsErrors(
  source: string,
  errors: readonly unknown[],
): boolean {
  return (
    isTlsNonBlockingSource(source) &&
    errors.length > 0 &&
    errors.every((error) => isTlsCertificateError(error))
  );
}

function tlsCertificateErrorMessage(err: unknown): string {
  const seen = new Set<unknown>();
  let current: unknown = err;
  for (let depth = 0; depth < 10 && current != null; depth += 1) {
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
    if (!isRecord(current) || seen.has(current)) {
      break;
    }
    seen.add(current);
    const message = current.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    current = current.cause;
  }
  return "TLS certificate error";
}

function escapeAnnotationProperty(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function escapeAnnotationData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

export function tlsCertificateWarningLine(source: string, err: unknown): string {
  return `::warning title=${escapeAnnotationProperty(
    `${source} TLS certificate error`,
  )}::${escapeAnnotationData(tlsCertificateErrorMessage(err))}`;
}
