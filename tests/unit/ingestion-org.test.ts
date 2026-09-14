import { describe, expect, it } from "vitest";

import { resolveOrganization } from "@/ingestion/org/resolve";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";

describe("organisation resolution", () => {
  it("reuses an organisation matched by official identifier", async () => {
    const store = createMemoryIngestionStore();
    const first = await resolveOrganization(
      store,
      {
        sourcePartyId: "1",
        name: "Example City Council",
        roles: ["BUYER"],
        identifier: { scheme: "GB-PPON", value: "AAAA-1111-BBBB" },
      },
      null,
    );
    const second = await resolveOrganization(
      store,
      {
        sourcePartyId: "2",
        name: "Example City Council (Procurement)",
        roles: ["BUYER"],
        identifier: { scheme: "GB-PPON", value: "AAAA-1111-BBBB" },
      },
      null,
    );

    expect(second.created).toBe(false);
    expect(second.organization.id).toBe(first.organization.id);
    expect(store.organizations).toHaveLength(1);
  });

  it("does not auto-merge ambiguous fuzzy names", async () => {
    const store = createMemoryIngestionStore();
    await resolveOrganization(
      store,
      {
        sourcePartyId: "1",
        name: "Northern Care Trust",
        roles: ["BUYER"],
        city: "Leeds",
      },
      null,
    );
    const second = await resolveOrganization(
      store,
      {
        sourcePartyId: "2",
        name: "Northern Care NHS Trust",
        roles: ["BUYER"],
        city: "York",
      },
      null,
    );

    expect(second.created).toBe(true);
    expect(store.organizations).toHaveLength(2);
    expect(second.reviewCandidateIds.length).toBeGreaterThan(0);
  });
});
