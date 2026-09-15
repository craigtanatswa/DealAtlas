import {
  DEALATLAS_ANALYSIS_LABEL,
  SOURCE_RECORD_LABEL,
  type AwardRecordDto,
  type IncumbentSignalDto,
  type IntelligenceOrgRef,
} from "@/lib/intelligence/types";

export type OrganizationRoleLink = {
  dealId: string;
  organizationId: string;
  role: string;
};

export function winningSuppliersFromAwards(
  awards: AwardRecordDto[],
): Array<IntelligenceOrgRef & { awardCount: number; latestAwardDate: string | null }> {
  const byId = new Map<
    string,
    IntelligenceOrgRef & { awardCount: number; latestAwardDate: string | null }
  >();
  for (const award of awards) {
    for (const supplier of award.suppliers) {
      const current = byId.get(supplier.id) ?? {
        id: supplier.id,
        name: supplier.name,
        awardCount: 0,
        latestAwardDate: null,
      };
      current.awardCount += 1;
      if (
        award.awardDate &&
        (!current.latestAwardDate || award.awardDate > current.latestAwardDate)
      ) {
        current.latestAwardDate = award.awardDate;
      }
      byId.set(supplier.id, current);
    }
  }
  return [...byId.values()].sort((left, right) => right.awardCount - left.awardCount);
}

export function classifyIncumbents(input: {
  dealId: string;
  dealTitle: string;
  awards: AwardRecordDto[];
  roles: OrganizationRoleLink[];
  organizations: Map<string, IntelligenceOrgRef>;
  relatedPreviousAwards: AwardRecordDto[];
  insightIncumbentId: string | null;
}): IncumbentSignalDto[] {
  const results: IncumbentSignalDto[] = [];
  const seen = new Set<string>();

  const push = (item: IncumbentSignalDto) => {
    const key = `${item.organization.id}:${item.dealId}:${item.evidence.field}`;
    if (seen.has(`${item.organization.id}:${item.dealId}`)) {
      return;
    }
    seen.add(`${item.organization.id}:${item.dealId}`);
    seen.add(key);
    results.push(item);
  };

  for (const award of input.awards) {
    for (const supplier of award.suppliers) {
      push({
        organization: { id: supplier.id, name: supplier.name },
        dealId: input.dealId,
        dealTitle: input.dealTitle,
        evidence: {
          kind: "source",
          label: SOURCE_RECORD_LABEL,
          confidence: 0.9,
          field: "award_suppliers",
          note: "Awarded supplier on a recorded award.",
        },
      });
    }
  }

  for (const role of input.roles) {
    if (role.dealId !== input.dealId) {
      continue;
    }
    if (role.role !== "INCUMBENT" && role.role !== "AWARDED_SUPPLIER") {
      continue;
    }
    const organization = input.organizations.get(role.organizationId);
    if (!organization) {
      continue;
    }
    push({
      organization,
      dealId: input.dealId,
      dealTitle: input.dealTitle,
      evidence: {
        kind: "source",
        label: SOURCE_RECORD_LABEL,
        confidence: role.role === "INCUMBENT" ? 0.86 : 0.82,
        field: "deal_organizations.role",
        note:
          role.role === "INCUMBENT"
            ? "Organisation linked as incumbent on this opportunity."
            : "Organisation linked as awarded supplier on this opportunity.",
      },
    });
  }

  for (const award of input.relatedPreviousAwards) {
    for (const supplier of award.suppliers) {
      push({
        organization: { id: supplier.id, name: supplier.name },
        dealId: input.dealId,
        dealTitle: input.dealTitle,
        evidence: {
          kind: "inference",
          label: DEALATLAS_ANALYSIS_LABEL,
          confidence: 0.58,
          field: "related_awards",
          note: "Awarded on a related previous procurement. Treat as a likely incumbent, not an official designation.",
        },
      });
    }
  }

  if (input.insightIncumbentId) {
    const organization = input.organizations.get(input.insightIncumbentId);
    if (organization) {
      push({
        organization,
        dealId: input.dealId,
        dealTitle: input.dealTitle,
        evidence: {
          kind: "inference",
          label: DEALATLAS_ANALYSIS_LABEL,
          confidence: 0.5,
          field: "deal_insights.incumbent_organization_id",
          note: "Stored DealAtlas incumbent inference.",
        },
      });
    }
  }

  return results;
}
