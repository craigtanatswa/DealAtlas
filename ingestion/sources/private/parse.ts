import { parseInput } from "@/lib/validation";

import type { CanonicalCandidate } from "@/ingestion/core/types";
import { IngestionError } from "@/ingestion/core/errors";
import {
  asNumber,
  asRecord,
  asString,
  blankToNull,
  formatExactValue,
  locationText,
  toDateOnly,
} from "@/ingestion/normalizers/text";
import { canonicalPrivateCandidateSchema } from "@/ingestion/sources/private/schema";
import {
  mapPrivateBuyerSector,
  mapPrivateDealStage,
  mapPrivateDealStatus,
  mapPrivateDealType,
} from "@/ingestion/sources/private/mapping";
import type { PrivateMappingContext } from "@/ingestion/sources/private/types";

export function field(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] != null && record[key] !== "") {
      return record[key];
    }
  }
  return null;
}

export function mintPrivateOcid(sourceKey: string, id: string): string {
  return `da-${sourceKey}-${id}`;
}

export function buildPrivateCandidate(
  raw: unknown,
  context: PrivateMappingContext,
  options: {
    idKeys?: string[];
    titleKeys?: string[];
    descriptionKeys?: string[];
    clientKeys?: string[];
    sectorKeys?: string[];
    fundingKeys?: string[];
    procurementStageKeys?: string[];
    schemeStatusKeys?: string[];
    regionKeys?: string[];
    valueKeys?: string[];
    startKeys?: string[];
    endKeys?: string[];
    frameworkKeys?: string[];
    kindKeys?: string[];
    referenceKeys?: string[];
    defaultDealType?: CanonicalCandidate["dealType"];
  } = {},
): CanonicalCandidate {
  const record = asRecord(raw);
  if (!record) {
    throw new IngestionError({
      message: "Private source record was not an object.",
      stage: "parse",
      code: "PRIVATE_RECORD_INVALID",
      retryable: false,
    });
  }

  const id = asString(
    field(record, ...(options.idKeys ?? ["project_id", "projectId", "id", "reference"])),
  );
  const title = asString(
    field(record, ...(options.titleKeys ?? ["project_name", "title", "name", "package"])),
  );
  if (!id || !title) {
    throw new IngestionError({
      message: "Private source record is missing an id or title.",
      stage: "parse",
      code: "PRIVATE_RECORD_INCOMPLETE",
      retryable: false,
    });
  }

  const description = blankToNull(
    asString(
      field(
        record,
        ...(options.descriptionKeys ?? ["project_summary", "description", "summary", "notes"]),
      ),
    ),
  );
  const client = asString(
    field(record, ...(options.clientKeys ?? ["key_client", "client", "buyer", "organisation"])),
  );
  const sector = asString(
    field(record, ...(options.sectorKeys ?? ["sector", "sub_sector", "category"])),
  );
  const funding = asString(
    field(
      record,
      ...(options.fundingKeys ?? [
        "is_this_project_programme_drawing_on_public_or_private_funds",
        "funding",
        "funding_source",
      ]),
    ),
  );
  const procurementStage = asString(
    field(
      record,
      ...(options.procurementStageKeys ?? ["procurement_stage", "procurementStage", "stage"]),
    ),
  );
  const schemeStatus = asString(
    field(record, ...(options.schemeStatusKeys ?? ["scheme_status", "status"])),
  );
  const region = asString(
    field(record, ...(options.regionKeys ?? ["ONS Region", "region", "location"])),
  );
  const framework = asString(
    field(
      record,
      ...(options.frameworkKeys ?? ["procurement_investment_framework", "framework"]),
    ),
  );
  const kind = asString(
    field(record, ...(options.kindKeys ?? ["opportunity_type", "deal_type", "kind"])),
  );
  const reference = asString(
    field(record, ...(options.referenceKeys ?? ["reference", "notice_identifier"])),
  );
  const startDate = toDateOnly(
    field(
      record,
      ...(options.startKeys ?? ["start_of_works_construction_projected", "start_date", "start"]),
    ),
  );
  const endDate = toDateOnly(
    field(
      record,
      ...(options.endKeys ?? ["date_in_service_projected", "end_date", "completion"]),
    ),
  );
  const value = firstNumber(
    record,
    options.valueKeys ?? [
      "total_capital_costs_real",
      "value",
      "estimated_value",
      "value_of_current_future_private_finance",
    ],
  );

  const dealType =
    options.defaultDealType && !kind && !procurementStage && !schemeStatus
      ? options.defaultDealType
      : mapPrivateDealType({
          opportunityKind: kind,
          procurementStage,
          schemeStatus,
          funding,
          framework,
        });
  const buyerSector = mapPrivateBuyerSector({ funding, sector, client });
  const stage = mapPrivateDealStage({ procurementStage, schemeStatus });
  const status = mapPrivateDealStatus({
    procurementStage,
    schemeStatus,
  });

  const organizations: CanonicalCandidate["organizations"] = client
    ? [
        {
          sourcePartyId: slugId(client),
          name: client,
          roles: ["BUYER"],
          countryCode: "GB",
        },
      ]
    : [];

  const candidate: CanonicalCandidate = {
    sourceKey: context.sourceKey,
    ocid: mintPrivateOcid(context.sourceKey, id),
    externalPrimaryId: id,
    noticeIdentifier: id,
    releaseId: id,
    reference: reference ?? id,
    sourceTitle: title,
    sourceDescription: description,
    sourceUrl: context.sourceUrl,
    applicationUrl: null,
    dealType,
    buyerSector,
    stage,
    status,
    mainCategory: sector,
    procurementMethod: blankToNull(framework),
    specialRegime: blankToNull(funding),
    currency: "GBP",
    valueMinExVat: value,
    valueMaxExVat: value,
    exactValueText: formatExactValue(value, value, "GBP"),
    exactLocationText: locationText([region]),
    enquiryDeadline: null,
    submissionDeadline: null,
    awardDecisionDate: null,
    contractStartDate: startDate,
    contractEndDate: endDate,
    extensionEndDate: null,
    nextProcurementDate: startDate,
    estimatedRenewalDate: null,
    smeSuitable: null,
    vcseSuitable: null,
    publishedAt: null,
    modifiedAt: context.now.toISOString(),
    noticeType: procurementStage,
    noticeStage: schemeStatus ?? procurementStage,
    buyerPartyId: organizations[0]?.sourcePartyId ?? null,
    organizations,
    lots: [],
    requirements: description
      ? [
          {
            requirementType: "OTHER",
            name: "Source summary",
            description,
            mandatory: false,
          },
        ]
      : [],
    awardCriteria: [],
    awards: [],
    contracts: [],
    documents: [
      {
        name: "Official source record",
        documentType: "notice",
        sourceUrl: context.sourceUrl,
        mimeType: "application/json",
      },
    ],
    classifications: sector
      ? [
          {
            scheme: "NISTA",
            code: sector,
            description: sector,
            isPrimary: true,
          },
        ]
      : [],
    relatedOcids: [],
  };

  parseInput(canonicalPrivateCandidateSchema, candidate, "Canonical private-source candidate");
  return candidate;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value != null) {
      return value;
    }
  }
  return null;
}

function slugId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "buyer";
}
