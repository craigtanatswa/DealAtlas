import { describe, expect, it } from "vitest";

import { runIngestion } from "@/ingestion/core/pipeline";
import {
  buildTlsWarning,
  classifyTlsError,
} from "@/ingestion/core/tls";
import type { SourceAdapter } from "@/ingestion/core/types";
import { sell2WalesSourceRecord } from "@/ingestion/sources/sell2wales/seed";
import { SELL2WALES_SOURCE_KEY } from "@/ingestion/sources/sell2wales/constants";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import {
  isTlsCertificateError,
  isTlsCode,
} from "@/lib/jobs/tls-errors";

const NOW = new Date("2026-11-04T09:30:00.000Z");

function tlsError(code = "ERR_TLS_CERT_ALTNAME_INVALID") {
  return Object.assign(new Error(`fetch failed: ${code}`), {
    code,
    cause: { message: "Hostname/IP does not match certificate's altnames" },
  });
}

describe("TLS error classification", () => {
  it("recognises every certificate error family by prefix", () => {
    for (const code of [
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "ERR_TLS_HANDSHAKE_TIMEOUT",
      "CERT_HAS_EXPIRED",
      "CERT_NOT_YET_VALID",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    ]) {
      expect(isTlsCode(code)).toBe(true);
      expect(isTlsCertificateError(tlsError(code))).toBe(true);
    }
  });

  it("does not classify ordinary network failures as TLS", () => {
    expect(classifyTlsError(new Error("HTTP 503"))).toBeNull();
    expect(buildTlsWarning(new Error("ECONNRESET"))).toBeNull();
    expect(isTlsCertificateError(Object.assign(new Error("reset"), { code: "ECONNRESET" }))).toBe(
      false,
    );
  });

  it("extracts the code, host and message and builds a metadata warning", () => {
    const error = Object.assign(
      new Error(`ERR_TLS_CERT_ALTNAME_INVALID fetching https://api.sell2wales.gov.wales/v1/Notices`),
      { code: "ERR_TLS_CERT_ALTNAME_INVALID" },
    );
    expect(classifyTlsError(error)).toMatchObject({
      tlsCode: "ERR_TLS_CERT_ALTNAME_INVALID",
      tls_code: "ERR_TLS_CERT_ALTNAME_INVALID",
      host: "api.sell2wales.gov.wales",
    });
    expect(
      buildTlsWarning(error, {
        host: "api.sell2wales.gov.wales",
        at: NOW,
      }),
    ).toEqual({
      code: "TLS_CERT_ERROR",
      tls_code: "ERR_TLS_CERT_ALTNAME_INVALID",
      host: "api.sell2wales.gov.wales",
      message: "ERR_TLS_CERT_ALTNAME_INVALID fetching https://api.sell2wales.gov.wales/v1/Notices",
      at: NOW.toISOString(),
    });
  });
});

describe("ingestion run TLS warnings", () => {
  it("writes warnings to run metadata and updates source failure tracking", async () => {
    const store = createMemoryIngestionStore({
      sources: [sell2WalesSourceRecord({ id: "source-s2w" })],
    });
    const adapter: SourceAdapter = {
      sourceKey: SELL2WALES_SOURCE_KEY,
      async discover() {
        return { items: [{ externalRecordId: "rls-tls-warning" }] };
      },
      async fetch() {
        throw tlsError();
      },
      async parse() {
        return [];
      },
    };

    const result = await runIngestion({
      sourceKey: SELL2WALES_SOURCE_KEY,
      store,
      adapter,
      now: NOW,
      limit: 1,
      triggerType: "TEST",
      failureMode: "partial",
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.warnings).toEqual([
      {
        code: "TLS_CERT_ERROR",
        tls_code: "ERR_TLS_CERT_ALTNAME_INVALID",
        host: "api.sell2wales.gov.wales",
        message: "fetch failed: ERR_TLS_CERT_ALTNAME_INVALID",
        at: NOW.toISOString(),
      },
    ]);
    expect(store.runs[0]?.metadata.warnings).toEqual(result.warnings);
    expect(store.sources[0]?.consecutiveFailures).toBe(1);
    expect(store.sources[0]?.lastError).toContain("TLS_CERT_ERROR");
    expect(store.sources[0]?.lastError).toContain("ERR_TLS_CERT_ALTNAME_INVALID");
  });

  it("keeps a discover TLS failure non-blocking but records the warning", async () => {
    const store = createMemoryIngestionStore({
      sources: [sell2WalesSourceRecord({ id: "source-s2w" })],
    });
    const adapter: SourceAdapter = {
      sourceKey: SELL2WALES_SOURCE_KEY,
      async discover() {
        throw tlsError("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
      },
      async fetch() {
        throw new Error("not reached");
      },
      async parse() {
        return [];
      },
    };

    const result = await runIngestion({
      sourceKey: SELL2WALES_SOURCE_KEY,
      store,
      adapter,
      now: NOW,
      limit: 1,
      triggerType: "TEST",
      failureMode: "partial",
    });

    expect(result.status).toBe("PARTIAL");
    expect(store.runs[0]?.metadata.warnings).toEqual([
      {
        code: "TLS_CERT_ERROR",
        tls_code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        host: "api.sell2wales.gov.wales",
        message: "fetch failed: UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        at: NOW.toISOString(),
      },
    ]);
    expect(store.sources[0]?.consecutiveFailures).toBe(1);
  });
});
