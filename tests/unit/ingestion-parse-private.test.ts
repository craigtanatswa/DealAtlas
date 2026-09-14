import { describe, expect, it } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import { extractHtmlTableRecords } from "@/ingestion/sources/private/html";
import { parseCsvRecords } from "@/ingestion/sources/private/csv";
import { buildPrivateCandidate } from "@/ingestion/sources/private/parse";
import {
  mapPrivateBuyerSector,
  mapPrivateDealType,
} from "@/ingestion/sources/private/mapping";
import {
  extractNistaProjects,
  mapNistaRecord,
} from "@/ingestion/sources/uk-infrastructure-pipeline/parse";
import {
  readPrivateFrameworkFixture,
  readUkInfrastructureFixture,
} from "@/tests/helpers/ingestion-fixtures";

const NOW = new Date("2026-09-14T12:00:00.000Z");
const CONTEXT = {
  sourceKey: "uk-infrastructure-pipeline",
  sourceUrl: "https://pipeline.nista.grid.civilservice.gov.uk/?project_id=test",
  parserVersion: "test@1",
  now: NOW,
};

describe("private source mapping", () => {
  it("maps RFP, RFQ, subcontract, supply-chain and pipeline kinds", () => {
    expect(mapPrivateDealType({ opportunityKind: "RFP" })).toBe("RFP");
    expect(mapPrivateDealType({ opportunityKind: "RFQ" })).toBe("RFQ");
    expect(mapPrivateDealType({ opportunityKind: "subcontract" })).toBe(
      "SUBCONTRACT_OPPORTUNITY",
    );
    expect(mapPrivateDealType({ opportunityKind: "supply_chain" })).toBe(
      "SUPPLY_CHAIN_OPPORTUNITY",
    );
    expect(mapPrivateDealType({ opportunityKind: "pipeline" })).toBe(
      "PROCUREMENT_PIPELINE",
    );
  });

  it("maps NISTA private in-procurement programmes to private tenders", () => {
    expect(
      mapPrivateDealType({
        procurementStage: "Not procured",
        schemeStatus: "In procurement",
        funding: "Private",
      }),
    ).toBe("PRIVATE_TENDER");
    expect(
      mapPrivateDealType({
        procurementStage: "Partially procured",
        schemeStatus: "Design and Planning",
        funding: "Public/Private Mix",
        framework: "Regulated Asset Base",
      }),
    ).toBe("PRIVATE_TENDER");
    expect(
      mapPrivateDealType({
        procurementStage: "Not procured",
        schemeStatus: "In procurement",
        funding: "Public",
      }),
    ).toBe("PUBLIC_TENDER");
    expect(
      mapPrivateBuyerSector({
        funding: "Private",
        sector: "Water and Wastewater",
        client: "Northumbrian Water",
      }),
    ).toBe("UTILITY");
  });
});

describe("UK Infrastructure Pipeline extraction", () => {
  it("maps a normal private infrastructure programme", () => {
    const candidate = mapNistaRecord(readUkInfrastructureFixture("normal.json"), CONTEXT);
    expect(candidate.dealType).toBe("PRIVATE_TENDER");
    expect(candidate.stage).toBe("LIVE");
    expect(candidate.status).toBe("OPEN");
    expect(candidate.buyerSector).toBe("UTILITY");
    expect(candidate.sourceTitle).toBe("North Suffolk Reservoir");
    expect(candidate.organizations[0]?.name).toBe("Northumbrian Water");
    expect(candidate.valueMaxExVat).toBeCloseTo(727528491.2);
    expect(candidate.ocid).toContain("uk-infrastructure-pipeline");
    expect(candidate.sourceUrl).toContain("project_id");
  });

  it("keeps partial records without inventing a value", () => {
    const candidate = mapNistaRecord(readUkInfrastructureFixture("partial.json"), CONTEXT);
    expect(candidate.dealType).toBe("PROCUREMENT_PIPELINE");
    expect(candidate.stage).toBe("EARLY");
    expect(candidate.status).toBe("UPCOMING");
    expect(candidate.valueMaxExVat).toBeNull();
  });

  it("maps cancelled and completed records", () => {
    const withdrawn = mapNistaRecord(
      readUkInfrastructureFixture("withdrawn.json"),
      CONTEXT,
    );
    expect(withdrawn.status).toBe("CANCELLED");
    expect(withdrawn.stage).toBe("ENDED");

    const closed = mapNistaRecord(readUkInfrastructureFixture("closed.json"), CONTEXT);
    expect(closed.status).toBe("CLOSED");
  });

  it("extracts projects from a Dash layout payload", () => {
    const projects = extractNistaProjects(readUkInfrastructureFixture("layout.json"));
    expect(projects.map((item) => (item as { project_id: string }).project_id)).toEqual([
      "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb",
      "bbbbbbbb-2222-4333-8444-cccccccccccc",
      "not-enough-fields",
      "cccccccc-3333-4444-8555-dddddddddddd",
    ]);
  });

  it("rejects malformed records", () => {
    expect(() =>
      mapNistaRecord(readUkInfrastructureFixture("malformed.json"), CONTEXT),
    ).toThrow(IngestionError);
  });
});

describe("reusable private CSV/HTML extractors", () => {
  it("parses CSV opportunity rows including RFP and pipeline types", () => {
    const rows = parseCsvRecords(readPrivateFrameworkFixture("opportunities.csv"));
    expect(rows).toHaveLength(2);
    const rfp = buildPrivateCandidate(rows[0], {
      ...CONTEXT,
      sourceKey: "example-csv",
      sourceUrl: "https://example.test/rfp-1",
    });
    expect(rfp.dealType).toBe("RFP");
    expect(rfp.sourceTitle).toContain("Managed services");
  });

  it("parses HTML table rows including RFQ and subcontract types", () => {
    const rows = extractHtmlTableRecords(
      readPrivateFrameworkFixture("opportunities.html"),
      {
        rowSelector: "tbody tr",
        fields: {
          id: ".ref",
          title: ".title",
          opportunity_type: ".type",
          buyer: ".buyer",
        },
        linkField: "source_url",
        linkSelector: "a.more",
      },
    );
    expect(rows).toHaveLength(2);
    const rfq = buildPrivateCandidate(rows[0], {
      ...CONTEXT,
      sourceKey: "example-html",
      sourceUrl: rows[0]?.source_url ?? "https://example.test/rfq-100",
    });
    const sub = buildPrivateCandidate(rows[1], {
      ...CONTEXT,
      sourceKey: "example-html",
      sourceUrl: rows[1]?.source_url ?? "https://example.test/sub-200",
    });
    expect(rfq.dealType).toBe("RFQ");
    expect(sub.dealType).toBe("SUBCONTRACT_OPPORTUNITY");
  });
});
