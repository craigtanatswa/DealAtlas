import fs from "node:fs";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

import { Agent, fetch as undiciFetch } from "undici";

/**
 * api.publiccontractsscotland.gov.uk serves only its leaf certificate, so the
 * Sectigo intermediate must be supplied explicitly. Root certificates are kept
 * because other hosts on the same agent still rely on the system trust store.
 */
export const PUBLIC_CONTRACTS_SCOTLAND_INTERMEDIATE_CERT_PATH = fileURLToPath(
  new URL("../certs/sectigo-public-server-authentication-ca-dv-r36.pem", import.meta.url),
);

export function readPublicContractsScotlandIntermediateCert(): string {
  return fs.readFileSync(PUBLIC_CONTRACTS_SCOTLAND_INTERMEDIATE_CERT_PATH, "utf8");
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
