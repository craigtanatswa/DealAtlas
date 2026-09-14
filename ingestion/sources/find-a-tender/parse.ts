import { safeHttpUrl } from "@/lib/deals/urls";
import { parseInput } from "@/lib/validation";

import type {
  AwardCandidate,
  AwardCriterionCandidate,
  CanonicalCandidate,
  ClassificationCandidate,
  ContractCandidate,
  DocumentCandidate,
  LotCandidate,
  OrganizationCandidate,
  RequirementCandidate,
} from "@/ingestion/core/types";
import {
  asArray,
  asRecord,
  asString,
  blankToNull,
  countryCodeFrom,
  domainFromWebsite,
  formatExactValue,
  locationText,
  normalizeCurrency,
  toDateOnly,
  toTimestamptz,
} from "@/ingestion/normalizers/text";
import {
  buyerSectorFromClassifications,
  categoryFromCpv,
  mapDealStage,
  mapDealStatus,
  mapDealType,
  mapOrganizationRole,
  mapRequirementType,
} from "@/ingestion/normalizers/taxonomy";
import {
  FIND_A_TENDER_PARSER_VERSION,
  FIND_A_TENDER_SOURCE_KEY,
  findATenderNoticeUrl,
} from "@/ingestion/sources/find-a-tender/constants";
import {
  canonicalCandidateSchema,
  ocdsReleasePackageSchema,
  ocdsReleaseSchema,
  type OcdsRelease,
} from "@/ingestion/sources/find-a-tender/schema";

export { FIND_A_TENDER_PARSER_VERSION };

export function unwrapReleasePayload(payload: unknown): unknown {
  const record = asRecord(payload);
  if (!record) {
    return payload;
  }
  if (record.release) {
    return record.release;
  }
  if (Array.isArray(record.releases) && record.releases[0]) {
    return record.releases[0];
  }
  if (asRecord(record.body)?.release) {
    return asRecord(record.body)?.release;
  }
  return payload;
}

export function parseReleasePackage(payload: unknown) {
  return parseInput(
    ocdsReleasePackageSchema,
    payload,
    "Find a Tender OCDS release package",
  );
}

export function parseOcdsRelease(payload: unknown): OcdsRelease {
  return parseInput(
    ocdsReleaseSchema,
    unwrapReleasePayload(payload),
    "Find a Tender OCDS release",
  );
}

function tagsOf(release: OcdsRelease): string[] {
  if (!release.tag) {
    return [];
  }
  return (Array.isArray(release.tag) ? release.tag : [release.tag]).map((tag) =>
    tag.toLowerCase(),
  );
}

function valueBounds(value?: {
  amount?: number;
  amountGross?: number;
  minAmount?: number;
  currency?: string;
} | null): { min: number | null; max: number | null; currency: string } {
  if (!value) {
    return { min: null, max: null, currency: "GBP" };
  }
  const amount = value.amount ?? null;
  const minAmount = value.minAmount ?? null;
  const max = amount;
  const min = minAmount ?? amount;
  return {
    min,
    max,
    currency: normalizeCurrency(value.currency),
  };
}

function extractLocations(items?: Array<{ deliveryAddresses?: unknown }>): string | null {
  const parts: string[] = [];
  for (const item of items ?? []) {
    for (const address of asArray(item.deliveryAddresses)) {
      const row = asRecord(address);
      if (!row) {
        continue;
      }
      const text = locationText([
        asString(row.locality),
        asString(row.region),
        asString(row.countryName),
        countryCodeFrom(row.country),
      ]);
      if (text) {
        parts.push(text);
      }
    }
  }
  return parts.length > 0 ? [...new Set(parts)].join("; ") : null;
}

function classificationsFrom(
  classification: { scheme?: string; id?: string; description?: string } | undefined,
  items: Array<{ additionalClassifications?: unknown; relatedLot?: string }> | undefined,
  isPrimary = true,
): ClassificationCandidate[] {
  const result: ClassificationCandidate[] = [];
  if (classification?.id) {
    result.push({
      scheme: classification.scheme ?? "CPV",
      code: String(classification.id),
      description: classification.description ?? null,
      isPrimary,
    });
  }
  for (const item of items ?? []) {
    for (const extra of asArray(item.additionalClassifications)) {
      const row = asRecord(extra);
      const code = asString(row?.id);
      if (!code) {
        continue;
      }
      result.push({
        scheme: asString(row?.scheme) ?? "CPV",
        code,
        description: asString(row?.description),
        isPrimary: false,
        relatedLotId: asString(item.relatedLot),
      });
    }
  }
  return result;
}

function documentsFrom(
  documents: unknown,
  fallbackName: string,
): DocumentCandidate[] {
  const result: DocumentCandidate[] = [];
  for (const document of asArray(documents)) {
    const row = asRecord(document);
    const url = safeHttpUrl(asString(row?.url) ?? null);
    if (!url) {
      continue;
    }
    result.push({
      name:
        asString(row?.title) ??
        asString(row?.description) ??
        asString(row?.documentType) ??
        fallbackName,
      documentType: asString(row?.documentType) ?? asString(row?.noticeType),
      sourceUrl: url,
      mimeType: asString(row?.format),
      publishedAt: toTimestamptz(row?.datePublished),
      relatedLotId: asString(row?.relatedLot),
    });
  }
  return result;
}

function organizationFromParty(party: {
  id: string;
  name?: string;
  identifier?: { scheme?: string; id?: string; uri?: string; legalName?: string };
  additionalIdentifiers?: Array<{ scheme?: string; id?: string; uri?: string }>;
  address?: {
    streetAddress?: string;
    locality?: string;
    region?: string;
    postalCode?: string;
    countryName?: string;
    country?: string;
  };
  contactPoint?: { name?: string; email?: string; telephone?: string; url?: string };
  roles?: string[];
  details?: { url?: string; scale?: string; classifications?: Array<{ scheme?: string; id?: string; description?: string }> };
}): OrganizationCandidate {
  const website =
    safeHttpUrl(party.details?.url ?? null) ??
    safeHttpUrl(party.contactPoint?.url ?? null);
  const identifierValue = party.identifier?.id
    ? String(party.identifier.id)
    : null;
  const identifierScheme = party.identifier?.scheme ?? null;
  const roles = [...new Set((party.roles ?? []).map((role) => mapOrganizationRole(role)).filter((role): role is NonNullable<typeof role> => Boolean(role)))];
  if (roles.length === 0) {
    roles.push("BUYER");
  }

  return {
    sourcePartyId: String(party.id),
    name:
      blankToNull(party.name ?? null) ??
      blankToNull(party.identifier?.legalName ?? null) ??
      String(party.id),
    roles,
    identifier:
      identifierScheme && identifierValue
        ? {
            scheme: identifierScheme,
            value: identifierValue,
            uri: party.identifier?.uri ?? null,
          }
        : undefined,
    additionalIdentifiers: (party.additionalIdentifiers ?? [])
      .filter((item) => item.scheme && item.id)
      .map((item) => ({
        scheme: item.scheme as string,
        value: String(item.id),
        uri: item.uri ?? null,
      })),
    website,
    domain: domainFromWebsite(website),
    email: blankToNull(party.contactPoint?.email ?? null),
    phone: blankToNull(party.contactPoint?.telephone ?? null),
    addressLine1: blankToNull(party.address?.streetAddress ?? null),
    city: blankToNull(party.address?.locality ?? null),
    region: blankToNull(party.address?.region ?? null),
    postcode: blankToNull(party.address?.postalCode ?? null),
    countryCode: countryCodeFrom(party.address?.country) ?? "GB",
    contactName: blankToNull(party.contactPoint?.name ?? null),
    isSme: party.details?.scale === "sme" ? true : null,
    isVcse: party.details?.scale === "micro" ? true : null,
  };
}

function bidStat(
  release: OcdsRelease,
  measure: string,
): number | null {
  const stats = release.bids?.statistics ?? [];
  const match = stats.find((item) => item.measure === measure);
  return typeof match?.value === "number" ? match.value : null;
}

function criteriaFrom(
  criteria: Array<{
    type?: string;
    name?: string;
    description?: string;
    numbers?: Array<{ number?: number; weight?: number }>;
  }> | undefined,
  relatedLotId?: string | null,
): { requirements: RequirementCandidate[]; awardCriteria: AwardCriterionCandidate[] } {
  const requirements: RequirementCandidate[] = [];
  const awardCriteria: AwardCriterionCandidate[] = [];
  (criteria ?? []).forEach((criterion, index) => {
    const description = blankToNull(criterion.description ?? null);
    const name =
      blankToNull(criterion.name ?? null) ??
      blankToNull(criterion.type ?? null) ??
      "Criterion";
    const type = (criterion.type ?? "").toLowerCase();
    const weight =
      criterion.numbers?.[0]?.weight ?? criterion.numbers?.[0]?.number ?? null;
    if (
      type === "price" ||
      type === "quality" ||
      type === "cost" ||
      type.includes("award")
    ) {
      awardCriteria.push({
        name,
        description,
        criterionType: criterion.type ?? null,
        weightPercent: weight,
        orderOfImportance: index + 1,
        relatedLotId,
      });
      return;
    }
    requirements.push({
      requirementType: mapRequirementType(criterion.type ?? criterion.name),
      name,
      description,
      relatedLotId,
    });
  });
  return { requirements, awardCriteria };
}

export function mapFindATenderRelease(
  release: OcdsRelease,
  now: Date,
): CanonicalCandidate {
  const tags = tagsOf(release);
  const tender = release.tender;
  const awards = release.awards ?? [];
  const contracts = release.contracts ?? [];
  const firstAward = awards[0];
  const title =
    blankToNull(tender?.title ?? null) ??
    blankToNull(firstAward?.title ?? null);
  if (!title) {
    throw new Error("OCDS release is missing a tender or award title");
  }

  const tenderValue = valueBounds(tender?.value);
  const minValue = valueBounds(tender?.minValue);
  const awardValue = valueBounds(firstAward?.value);
  const valueMin = minValue.min ?? tenderValue.min ?? awardValue.min;
  const valueMax = tenderValue.max ?? awardValue.max ?? minValue.max;
  const currency = tenderValue.currency !== "GBP"
    ? tenderValue.currency
    : awardValue.currency;

  const submissionDeadline = toTimestamptz(tender?.tenderPeriod?.endDate);
  const enquiryDeadline = toTimestamptz(tender?.enquiryPeriod?.endDate);
  const hasFramework = Boolean(tender?.techniques?.hasFrameworkAgreement);
  const hasDynamicMarket = Boolean(tender?.techniques?.hasDynamicPurchasingSystem);
  const organizations = (release.parties ?? []).map(organizationFromParty);
  if (organizations.length === 0 && release.buyer?.name) {
    organizations.push({
      sourcePartyId: String(release.buyer.id ?? "buyer"),
      name: release.buyer.name,
      roles: ["BUYER"],
      countryCode: "GB",
    });
  }

  const buyerClassifications = (release.parties ?? [])
    .flatMap((party) => party.details?.classifications ?? [])
    .map((item) => ({
      scheme: item.scheme,
      id: item.id ? String(item.id) : null,
      description: item.description,
    }));

  const classifications = classificationsFrom(
    tender?.classification,
    tender?.items,
    true,
  );
  const primaryCpv = classifications.find((item) => item.isPrimary)?.code ?? classifications[0]?.code;
  const category = categoryFromCpv(primaryCpv);

  const lots: LotCandidate[] = (tender?.lots ?? []).map((lot) => {
    const lotValue = valueBounds(lot.value);
    return {
      sourceLotId: String(lot.id),
      lotNumber: String(lot.id),
      sourceTitle: blankToNull(lot.title ?? null) ?? title,
      sourceDescription: blankToNull(lot.description ?? null),
      status: mapDealStatus({
        tenderStatus: lot.status ?? tender?.status,
        lotStatus: lot.status,
        tags,
        submissionDeadline,
        now,
        hasAwards: awards.some((award) => award.relatedLots?.includes(String(lot.id))),
      }),
      currency: lotValue.currency,
      valueMin: lotValue.min,
      valueMax: lotValue.max,
      exactLocationText: extractLocations(
        (tender?.items ?? []).filter((item) => item.relatedLot === String(lot.id)),
      ),
      submissionDeadline,
      contractStartDate: toDateOnly(lot.contractPeriod?.startDate),
      contractEndDate: toDateOnly(lot.contractPeriod?.endDate),
      extensionEndDate: toDateOnly(lot.contractPeriod?.maxExtentDate),
    };
  });

  const requirementBundle = criteriaFrom(tender?.selectionCriteria?.criteria);
  const awardBundle = criteriaFrom(tender?.awardCriteria?.criteria);
  for (const lot of tender?.lots ?? []) {
    const nested = criteriaFrom(lot.awardCriteria?.criteria, String(lot.id));
    awardBundle.awardCriteria.push(...nested.awardCriteria);
    requirementBundle.requirements.push(...nested.requirements);
  }

  const mappedAwards: AwardCandidate[] = awards.map((award) => ({
    awardIdentifier: String(award.id),
    title: blankToNull(award.title ?? null),
    awardDate: toDateOnly(award.date),
    awardValue: valueBounds(award.value).max,
    currency: valueBounds(award.value).currency,
    numberOfTenders: bidStat(release, "bids"),
    numberOfSmeTenders: bidStat(release, "smeFinalStageBids"),
    numberOfVcseTenders: bidStat(release, "vcseFinalStageBids"),
    standstillEndAt: toTimestamptz(award.standstillPeriod?.endDate),
    relatedLotIds: award.relatedLots ?? [],
    supplierPartyIds: (award.suppliers ?? [])
      .map((supplier) => asString(supplier.id))
      .filter((id): id is string => Boolean(id)),
  }));

  const mappedContracts: ContractCandidate[] = contracts.map((contract) => ({
    contractIdentifier: String(contract.id),
    awardIdentifier: contract.awardID ? String(contract.awardID) : null,
    signedDate: toDateOnly(contract.dateSigned),
    startDate: toDateOnly(contract.period?.startDate),
    endDate: toDateOnly(contract.period?.endDate),
    extensionEndDate: toDateOnly(contract.period?.maxExtentDate),
    originalValue: valueBounds(contract.value).max,
    currentValue: valueBounds(contract.value).max,
    currency: valueBounds(contract.value).currency,
    status: contract.status ?? null,
  }));

  const documents = [
    ...documentsFrom(tender?.documents, title),
    ...awards.flatMap((award) => documentsFrom(award.documents, award.title ?? title)),
  ];

  const relatedOcids = (release.relatedProcesses ?? [])
    .filter((item) => (item.scheme ?? "ocid").toLowerCase() === "ocid")
    .map((item) => item.identifier)
    .filter((item): item is string => Boolean(item));

  const noticeId = String(release.id);
  const applicationUrl =
    safeHttpUrl(tender?.submissionMethodDetails ?? null) ??
    safeHttpUrl(tender?.communication?.atypicalToolUrl ?? null);

  const candidate: CanonicalCandidate = {
    sourceKey: FIND_A_TENDER_SOURCE_KEY,
    ocid: release.ocid,
    externalPrimaryId: release.ocid,
    noticeIdentifier: noticeId,
    releaseId: noticeId,
    reference: tender?.id ? String(tender.id) : noticeId,
    sourceTitle: title,
    sourceDescription: blankToNull(tender?.description ?? null),
    sourceUrl: findATenderNoticeUrl(noticeId),
    applicationUrl,
    dealType: mapDealType({
      tags,
      hasFramework,
      hasDynamicMarket,
      tenderStatus: tender?.status,
    }),
    buyerSector: buyerSectorFromClassifications(buyerClassifications),
    stage: mapDealStage({
      tags,
      tenderStatus: tender?.status,
      hasAwards: awards.length > 0,
      hasContracts: contracts.length > 0,
    }),
    status: mapDealStatus({
      tenderStatus: tender?.status,
      tags,
      submissionDeadline,
      now,
      hasAwards: awards.length > 0,
    }),
    mainCategory: category?.label ?? tender?.mainProcurementCategory ?? null,
    procurementMethod: blankToNull(tender?.procurementMethod ?? null),
    specialRegime: blankToNull(tender?.procurementMethodDetails ?? null),
    currency,
    valueMinExVat: valueMin,
    valueMaxExVat: valueMax,
    exactValueText: formatExactValue(valueMin, valueMax, currency),
    exactLocationText:
      extractLocations(tender?.items) ??
      extractLocations(firstAward?.items),
    enquiryDeadline,
    submissionDeadline,
    awardDecisionDate: toDateOnly(firstAward?.date ?? tender?.awardPeriod?.startDate),
    contractStartDate: toDateOnly(
      firstAward?.contractPeriod?.startDate ?? tender?.contractPeriod?.startDate,
    ),
    contractEndDate: toDateOnly(
      firstAward?.contractPeriod?.endDate ?? tender?.contractPeriod?.endDate,
    ),
    extensionEndDate: toDateOnly(
      firstAward?.contractPeriod?.maxExtentDate ?? tender?.contractPeriod?.maxExtentDate,
    ),
    nextProcurementDate: toDateOnly(tender?.communication?.futureNoticeDate),
    estimatedRenewalDate:
      tender?.hasRenewal || firstAward?.hasRenewal
        ? toDateOnly(firstAward?.contractPeriod?.endDate ?? tender?.contractPeriod?.endDate)
        : null,
    smeSuitable: tender?.suitability?.sme ?? null,
    vcseSuitable:
      tender?.suitability?.vcse ??
      (tender?.otherRequirements?.reservedParticipation?.length ? true : null),
    publishedAt: toTimestamptz(release.date),
    modifiedAt: toTimestamptz(release.date),
    noticeType: tags.join(",") || null,
    noticeStage: tags[0] ?? tender?.status ?? null,
    buyerPartyId: release.buyer?.id ? String(release.buyer.id) : organizations.find((org) => org.roles.includes("BUYER"))?.sourcePartyId ?? null,
    organizations,
    lots,
    requirements: requirementBundle.requirements,
    awardCriteria: [...awardBundle.awardCriteria],
    awards: mappedAwards,
    contracts: mappedContracts,
    documents,
    classifications,
    relatedOcids,
  };

  parseInput(canonicalCandidateSchema, candidate, "Canonical Find a Tender candidate");
  return candidate;
}

export function parseFindATenderRaw(
  payload: unknown,
  now: Date,
): CanonicalCandidate[] {
  return [mapFindATenderRelease(parseOcdsRelease(payload), now)];
}
