import { describe, expect, it } from "vitest";

import {
  assertSafeDbTestTargets,
  unsafeDbTestTargetReason,
} from "../../scripts/db-target-guard.mjs";

const PROD = { DEALATLAS_PROD_SUPABASE_PROJECT_REF: "prodrefexample" };

describe("database test target guard", () => {
  it("allows local Supabase stacks", () => {
    for (const url of [
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "http://[::1]:54321",
    ]) {
      expect(unsafeDbTestTargetReason(url, {}), url).toBeNull();
    }
  });

  it("allows an unset target so unconfigured suites can skip", () => {
    expect(unsafeDbTestTargetReason(undefined, {})).toBeNull();
    expect(unsafeDbTestTargetReason("", {})).toBeNull();
  });

  it("refuses remote targets without an explicit opt-in", () => {
    expect(unsafeDbTestTargetReason("https://disposable.supabase.example", {})).toMatch(
      /not local/,
    );
    expect(
      unsafeDbTestTargetReason("https://disposable.supabase.example", {
        DEALATLAS_DB_TEST_ALLOW_REMOTE: "1",
      }),
    ).toMatch(/DEALATLAS_DB_TEST_REMOTE_HOST/);
    expect(
      unsafeDbTestTargetReason("https://disposable.supabase.example", {
        DEALATLAS_DB_TEST_ALLOW_REMOTE: "1",
        DEALATLAS_DB_TEST_REMOTE_HOST: "disposable.supabase.example",
      }),
    ).toMatch(/production/);
  });

  it("allows a named disposable remote project when production is declared", () => {
    expect(
      unsafeDbTestTargetReason("https://disposable.supabase.example", {
        ...PROD,
        DEALATLAS_DB_TEST_ALLOW_REMOTE: "1",
        DEALATLAS_DB_TEST_REMOTE_HOST: "disposable.supabase.example",
      }),
    ).toBeNull();
  });

  it("never allows the production project, even with every opt-in set", () => {
    const env = {
      ...PROD,
      DEALATLAS_PROD_SUPABASE_URL: "https://prodrefexample.supabase.example",
      DEALATLAS_DB_TEST_ALLOW_REMOTE: "1",
      DEALATLAS_DB_TEST_REMOTE_HOST: "prodrefexample.supabase.example",
    };
    expect(unsafeDbTestTargetReason("https://prodrefexample.supabase.example", env)).toMatch(
      /production project/,
    );
    expect(() =>
      assertSafeDbTestTargets(
        [["DEALATLAS_DB_TEST_URL", "https://prodrefexample.supabase.example/rest/v1"]],
        env,
      ),
    ).toThrow(/Refusing to run database tests/);
  });
});
