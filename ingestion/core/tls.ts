import tls from "node:tls";

import { Agent, fetch as undiciFetch } from "undici";

/**
 * api.publiccontractsscotland.gov.uk serves only its leaf certificate, so the
 * Sectigo intermediate must be supplied explicitly. Root certificates are kept
 * because other hosts on the same agent still rely on the system trust store.
 */
// Public certificate (not a secret), inlined so Next.js bundling needs no file reads.
// Source copy: ingestion/certs/sectigo-public-server-authentication-ca-dv-r36.pem
export const PUBLIC_CONTRACTS_SCOTLAND_INTERMEDIATE_CERT = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----
`;

export function readPublicContractsScotlandIntermediateCert(): string {
  return PUBLIC_CONTRACTS_SCOTLAND_INTERMEDIATE_CERT;
}

/** Returns an undici Agent that trusts the normal roots plus the missing intermediate. */
export function createTlsAgent(): Agent {
  const intermediate = readPublicContractsScotlandIntermediateCert();
  return new Agent({
    connect: {
      ca: [...tls.rootCertificates, intermediate],
    },
  });
}

/** fetch wrapper that routes every request through the TLS agent above. */
export function createTlsFetch(): typeof fetch {
  const dispatcher = createTlsAgent();
  return ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
    undiciFetch(input, {
      ...init,
      dispatcher,
    })) as unknown as typeof fetch;
}

export const createPublicContractsScotlandAgent = createTlsAgent;
export const createPublicContractsScotlandFetch = createTlsFetch;

const TLS_CODE_PREFIXES = [
  "ERR_TLS_",
  "CERT_",
  "UNABLE_TO_VERIFY_",
  "DEPTH_ZERO",
  "SELF_SIGNED",
] as const;

const TLS_CODE_MESSAGE_PATTERN =
  /\b(?:ERR_TLS_[A-Z0-9_]+|CERT_[A-Z0-9_]+|UNABLE_TO_VERIFY_[A-Z0-9_]+|DEPTH_ZERO[A-Z0-9_]*|SELF_SIGNED[A-Z0-9_]*|UNABLE_TO_GET_ISSUER_CERT_LOCALLY)\b/;

export type TlsErrorClassification = {
  tlsCode: string;
  /** Snake-case alias so callers can copy the value straight into run metadata. */
  tls_code: string;
  message: string;
  host: string | null;
};

export type TlsWarning = {
  code: "TLS_CERT_ERROR";
  tls_code: string;
  host: string;
  message: string;
  at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isTlsCode(value: string): boolean {
  return (
    value === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" ||
    TLS_CODE_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

function tlsCodeInMessage(value: string): string | null {
  return TLS_CODE_MESSAGE_PATTERN.exec(value)?.[0] ?? null;
}

function hostFromText(value: string): string | null {
  const url = /https?:\/\/\S+/i.exec(value);
  if (url) {
    try {
      return new URL(url[0]).hostname;
    } catch {
      // Fall through to the bare hostname check below.
    }
  }
  return /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i.exec(value)?.[0] ?? null;
}

/**
 * Walks an Error and its cause chain for a TLS certificate code. Only known
 * certificate error families classify as TLS; ordinary network failures do not.
 */
export function classifyTlsError(error: unknown): TlsErrorClassification | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let tlsCode: string | null = null;
  let message = "";
  let host: string | null = null;

  for (let depth = 0; depth < 10 && current != null; depth += 1) {
    if (typeof current === "string") {
      tlsCode ??= tlsCodeInMessage(current);
      if (!message && current.trim()) {
        message = current.trim();
      }
      host ??= hostFromText(current);
      break;
    }
    if (!isRecord(current) || seen.has(current)) {
      break;
    }
    seen.add(current);

    for (const key of ["code", "errno"] as const) {
      const value = current[key];
      if (typeof value === "string" && isTlsCode(value)) {
        tlsCode ??= value;
      }
    }
    for (const key of ["host", "hostname"] as const) {
      const value = current[key];
      if (typeof value === "string" && value.trim()) {
        host ??= value.trim();
      }
    }
    const value = current.message;
    if (typeof value === "string" && value.trim()) {
      if (!message) {
        message = value.trim();
      }
      tlsCode ??= tlsCodeInMessage(value);
      host ??= hostFromText(value);
    }

    current = current.cause;
  }

  if (!tlsCode) {
    return null;
  }
  return {
    tlsCode,
    tls_code: tlsCode,
    message: message || tlsCode,
    host,
  };
}

/** Returns a metadata-safe warning for a TLS failure, or null for any other error. */
export function buildTlsWarning(
  error: unknown,
  options: { host?: string | null; at?: string | Date } = {},
): TlsWarning | null {
  const classified = classifyTlsError(error);
  if (!classified) {
    return null;
  }
  const at =
    typeof options.at === "string"
      ? options.at
      : (options.at ?? new Date()).toISOString();
  return {
    code: "TLS_CERT_ERROR",
    tls_code: classified.tls_code,
    host: options.host?.trim() || classified.host || "unknown-host",
    message: classified.message,
    at,
  };
}

export function isTlsCertificateError(error: unknown): boolean {
  return classifyTlsError(error) !== null;
}
