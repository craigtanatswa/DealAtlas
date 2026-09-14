import type { OrganizationCandidate } from "@/ingestion/core/types";
import { normalizeOrgName, normalizeWhitespace } from "@/ingestion/normalizers/text";
import type { IngestionStore, OrganizationRecord } from "@/ingestion/store/types";

export type OrgResolution = {
  organization: OrganizationRecord;
  created: boolean;
  reviewCandidateIds: string[];
};

function diceCoefficient(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  if (left.length < 2 || right.length < 2) {
    return 0;
  }
  const grams = (value: string) => {
    const set = new Map<string, number>();
    for (let index = 0; index < value.length - 1; index += 1) {
      const gram = value.slice(index, index + 2);
      set.set(gram, (set.get(gram) ?? 0) + 1);
    }
    return set;
  };
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  let overlap = 0;
  for (const [gram, count] of leftGrams) {
    overlap += Math.min(count, rightGrams.get(gram) ?? 0);
  }
  return (2 * overlap) / (left.length - 1 + (right.length - 1));
}

export async function resolveOrganization(
  store: IngestionStore,
  candidate: OrganizationCandidate,
  sourceId: string | null,
): Promise<OrgResolution> {
  const normalizedName = normalizeOrgName(candidate.name);
  const reviewCandidateIds: string[] = [];

  let existing: OrganizationRecord | null = null;
  if (candidate.identifier) {
    existing = await store.findOrgByIdentifier(
      candidate.identifier.scheme,
      candidate.identifier.value,
    );
  }
  if (!existing) {
    for (const extra of candidate.additionalIdentifiers ?? []) {
      existing = await store.findOrgByIdentifier(extra.scheme, extra.value);
      if (existing) {
        break;
      }
    }
  }
  if (!existing && candidate.domain) {
    existing = await store.findOrgByDomain(candidate.domain);
  }
  if (!existing) {
    existing = await store.findOrgByAlias(normalizedName);
  }
  if (!existing && normalizedName) {
    existing = await store.findOrgByNormalizedNameLocation(
      normalizedName,
      candidate.city ?? null,
      candidate.region ?? null,
    );
  }

  if (!existing && normalizedName) {
    const sameName = await store.listOrgsByNormalizedName(normalizedName);
    if (sameName.length === 1 && !candidate.city && !sameName[0].city) {
      existing = sameName[0];
    } else if (sameName.length > 0) {
      reviewCandidateIds.push(...sameName.map((org) => org.id));
    }
  }

  if (!existing) {
    const others = await store.listOrganizations();
    for (const org of others) {
      const score = diceCoefficient(normalizedName, org.normalizedName);
      if (score >= 0.85 && org.normalizedName !== normalizedName) {
        reviewCandidateIds.push(org.id);
      }
    }
  }

  if (existing) {
    if (candidate.identifier) {
      await store.addOrganizationIdentifier({
        organizationId: existing.id,
        scheme: candidate.identifier.scheme,
        value: candidate.identifier.value,
        uri: candidate.identifier.uri,
        isPrimary: true,
      });
    }
    await store.addOrganizationAlias({
      organizationId: existing.id,
      alias: normalizeWhitespace(candidate.name),
      normalizedAlias: normalizedName,
      sourceId,
    });
    if (candidate.contactName || candidate.email || candidate.phone) {
      await store.addOrganizationContact({
        organizationId: existing.id,
        name: candidate.contactName,
        email: candidate.email,
        phone: candidate.phone,
        sourceId,
        publishedForProcurement: true,
      });
    }
    return { organization: existing, created: false, reviewCandidateIds };
  }

  const created = await store.createOrganization({
    canonicalName: normalizeWhitespace(candidate.name),
    normalizedName,
    buyerSector: candidate.roles.includes("BUYER") ? "PUBLIC" : null,
    website: candidate.website ?? null,
    domain: candidate.domain ?? null,
    email: candidate.email ?? null,
    phone: candidate.phone ?? null,
    addressLine1: candidate.addressLine1 ?? null,
    city: candidate.city ?? null,
    region: candidate.region ?? null,
    postcode: candidate.postcode ?? null,
    countryCode: candidate.countryCode ?? "GB",
    isSme: candidate.isSme ?? null,
    isVcse: candidate.isVcse ?? null,
  });

  if (candidate.identifier) {
    await store.addOrganizationIdentifier({
      organizationId: created.id,
      scheme: candidate.identifier.scheme,
      value: candidate.identifier.value,
      uri: candidate.identifier.uri,
      isPrimary: true,
    });
  }
  for (const extra of candidate.additionalIdentifiers ?? []) {
    await store.addOrganizationIdentifier({
      organizationId: created.id,
      scheme: extra.scheme,
      value: extra.value,
      uri: extra.uri,
    });
  }
  await store.addOrganizationAlias({
    organizationId: created.id,
    alias: normalizeWhitespace(candidate.name),
    normalizedAlias: normalizedName,
    sourceId,
  });
  if (candidate.contactName || candidate.email || candidate.phone) {
    await store.addOrganizationContact({
      organizationId: created.id,
      name: candidate.contactName,
      email: candidate.email,
      phone: candidate.phone,
      sourceId,
      publishedForProcurement: true,
    });
  }

  return { organization: created, created: true, reviewCandidateIds };
}

export async function collectFuzzyOrgReviews(
  store: IngestionStore,
  candidate: OrganizationCandidate,
  resolvedId: string,
): Promise<string[]> {
  const normalizedName = normalizeOrgName(candidate.name);
  if (!normalizedName) {
    return [];
  }
  const others = (await store.listOrgsByNormalizedName(normalizedName)).filter(
    (org) => org.id !== resolvedId,
  );
  return others.map((org) => org.id);
}
