import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

import { Agent } from "undici";
import { describe, expect, it } from "vitest";

import {
  createPublicContractsScotlandFetch,
  createTlsAgent,
  createTlsFetch,
  readPublicContractsScotlandIntermediateCert,
} from "@/ingestion/core/tls";
import {
  TLS_CERTIFICATE_ERROR_CODES,
  isNonBlockingTlsErrors,
  isNonBlockingTlsFailure,
  isTlsCertificateError,
  tlsCertificateWarningLine,
  tlsNonBlockingSources,
} from "@/lib/jobs/tls-errors";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function agentOptions(agent: Agent): Record<string, unknown> {
  const optionsSymbol = Object.getOwnPropertySymbols(agent).find(
    (symbol) => symbol.description === "options",
  );
  expect(optionsSymbol).toBeTruthy();
  return (agent as unknown as Record<symbol, Record<string, unknown>>)[optionsSymbol!]!;
}

describe("TLS certificate error classification", () => {
  for (const code of TLS_CERTIFICATE_ERROR_CODES) {
    it(`recognises ${code} on the error`, () => {
      expect(isTlsCertificateError(Object.assign(new Error("fetch failed"), { code }))).toBe(
        true,
      );
    });

    it(`recognises ${code} on a nested cause`, () => {
      const error = new Error("fetch failed", {
        cause: { message: "socket error", cause: { code } },
      });
      expect(isTlsCertificateError(error)).toBe(true);
    });

    it(`recognises ${code} in a wrapped network message`, () => {
      expect(isTlsCertificateError(new Error(`${code} fetching example.test`))).toBe(true);
    });
  }

  it("does not classify ordinary network or HTTP errors as TLS certificate errors", () => {
    expect(isTlsCertificateError(new Error("HTTP 503 from example.test"))).toBe(false);
    expect(
      isTlsCertificateError(
        Object.assign(new Error("ECONNRESET fetching example.test"), {
          code: "HTTP_NETWORK",
          cause: { code: "ECONNRESET" },
        }),
      ),
    ).toBe(false);
    expect(isTlsCertificateError(null)).toBe(false);
  });

  it("stops on circular cause chains", () => {
    const error = new Error("fetch failed") as Error & { cause?: unknown };
    error.cause = error;
    expect(isTlsCertificateError(error)).toBe(false);
  });
});

describe("non-blocking TLS sources", () => {
  const tlsError = Object.assign(new Error("fetch failed"), {
    code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  });

  it("lists only Public Contracts Scotland and Sell2Wales", () => {
    expect([...tlsNonBlockingSources]).toEqual([
      "public-contracts-scotland",
      "sell2wales",
    ]);
  });

  it("is non-blocking for each portal", () => {
    for (const source of tlsNonBlockingSources) {
      expect(isNonBlockingTlsFailure(source, tlsError)).toBe(true);
      expect(isNonBlockingTlsErrors(source, [tlsError])).toBe(true);
    }
  });

  it("still fails other sources on the same TLS error", () => {
    expect(isNonBlockingTlsFailure("find-a-tender", tlsError)).toBe(false);
    expect(isNonBlockingTlsErrors("find-a-tender", [tlsError])).toBe(false);
  });

  it("still fails the portals on a non-TLS error", () => {
    const other = Object.assign(new Error("HTTP 500"), { code: "HTTP_500" });
    for (const source of tlsNonBlockingSources) {
      expect(isNonBlockingTlsFailure(source, other)).toBe(false);
      expect(isNonBlockingTlsErrors(source, [other])).toBe(false);
    }
  });

  it("does not hide a mixed TLS and non-TLS failure", () => {
    const other = Object.assign(new Error("HTTP 500"), { code: "HTTP_500" });
    expect(isNonBlockingTlsErrors("public-contracts-scotland", [tlsError, other])).toBe(
      false,
    );
  });

  it("prints a GitHub warning annotation", () => {
    expect(tlsCertificateWarningLine("sell2wales", tlsError)).toBe(
      "::warning title=sell2wales TLS certificate error::fetch failed",
    );
  });
});

describe("Public Contracts Scotland TLS agent", () => {
  it("reads the saved Sectigo intermediate", () => {
    const pem = readPublicContractsScotlandIntermediateCert();
    const onDisk = readFileSync(
      "ingestion/certs/sectigo-public-server-authentication-ca-dv-r36.pem",
      "utf8",
    );
    expect(pem.trim()).toBe(onDisk.trim());
    expect(pem).toContain("-----BEGIN CERTIFICATE-----");
    expect(new X509Certificate(pem).subject).toContain(
      "CN=Sectigo Public Server Authentication CA DV R36",
    );
  });

  it("adds the intermediate to the normal root certificates", () => {
    const options = agentOptions(createTlsAgent());
    const connect = options.connect as { ca?: unknown; rejectUnauthorized?: unknown };
    const pem = readPublicContractsScotlandIntermediateCert();
    expect(Array.isArray(connect.ca)).toBe(true);
    expect(connect.ca).toContain(pem);
    expect(connect.ca).toEqual([...tls.rootCertificates, pem]);
    expect(connect.rejectUnauthorized).toBeUndefined();
  });

  it("wraps fetch with the agent dispatcher", () => {
    const fetchImpl = createTlsFetch();
    expect(typeof fetchImpl).toBe("function");
    expect(typeof createPublicContractsScotlandFetch()).toBe("function");
  });

  it("does not disable verification anywhere in the TLS path", () => {
    const files = [
      "ingestion/core/tls.ts",
      "ingestion/core/http.ts",
      "ingestion/sources/public-contracts-scotland/adapter.ts",
      "lib/jobs/ingest-open.ts",
      "scripts/ingest-open.ts",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toContain("rejectUnauthorized");
      expect(source).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED");
    }
  });

  it("uses the TLS fetch client only for Public Contracts Scotland", () => {
    const jobs = read("lib/jobs/ingest-open.ts");
    expect(jobs).toContain("createPublicContractsScotlandFetch");
    expect(jobs).toContain("sourceKey === PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY");
    expect(jobs).not.toContain("createPublicContractsScotlandFetch() : create");
    const adapter = read("ingestion/sources/public-contracts-scotland/adapter.ts");
    expect(adapter).toContain("createPublicContractsScotlandFetch");
    const sell2wales = read("ingestion/sources/sell2wales/adapter.ts");
    expect(sell2wales).not.toContain("tls");
  });
});
