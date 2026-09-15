import "server-only";

import {
  getCanonicalDataSourceById,
  getCanonicalDealById,
  getCanonicalDealInsights,
  getCanonicalOrganizationById,
  listCanonicalAwardCriteriaForDeal,
  listCanonicalChangesForDeal,
  listCanonicalDocumentsForDeal,
  listCanonicalLotsForDeal,
  listCanonicalNoticesForDeal,
  listCanonicalRequirementsForDeal,
} from "@/lib/db/canonical";
import { toPaidDealDto, type PaidDealDto } from "@/lib/deals/paid-dto";
import type { ProCanonicalAccess } from "@/lib/entitlements/types";

export async function loadPaidDealDto(
  dealId: string,
  access: ProCanonicalAccess,
): Promise<PaidDealDto | null> {
  const deal = await getCanonicalDealById(dealId, access);
  if (!deal) {
    return null;
  }

  const [buyer, notices, documents, source, lots, requirements, awardCriteria, changes, insights] =
    await Promise.all([
      deal.buyer_organization_id
        ? getCanonicalOrganizationById(deal.buyer_organization_id, access)
        : Promise.resolve(null),
      listCanonicalNoticesForDeal(dealId, access),
      listCanonicalDocumentsForDeal(dealId, access),
      deal.primary_source_id
        ? getCanonicalDataSourceById(deal.primary_source_id, access)
        : Promise.resolve(null),
      listCanonicalLotsForDeal(dealId, access),
      listCanonicalRequirementsForDeal(dealId, access),
      listCanonicalAwardCriteriaForDeal(dealId, access),
      listCanonicalChangesForDeal(dealId, access),
      getCanonicalDealInsights(dealId, access),
    ]);

  return toPaidDealDto({
    deal,
    buyer,
    source,
    notices,
    documents,
    lots,
    requirements,
    awardCriteria,
    changes,
    intelligence: insights
      ? {
          summary: insights.summary,
          buyerNeed: insights.buyer_need,
          idealSupplier: insights.ideal_supplier,
          keyDeliverables: insights.key_deliverables,
          mandatoryRequirements: insights.mandatory_requirements,
          competitionNotes: insights.competition_notes,
          smeAccessibility: insights.sme_accessibility,
          bidComplexity: insights.bid_complexity,
          competitionLevel: insights.competition_level,
          deadlineUrgency: insights.deadline_urgency,
          riskFlags: insights.risk_flags,
          estimatedRenewalDate: insights.estimated_renewal_date,
          confidence: insights.confidence,
          generationMethod: insights.generation_method,
          modelVersion: insights.model_version,
          fieldProvenance: insights.field_provenance,
          generatedAt: insights.generated_at,
        }
      : null,
  });
}
