import "server-only";

import {
  getCanonicalDataSourceById,
  getCanonicalDealById,
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

  const [buyer, notices, documents, source, lots, requirements, awardCriteria, changes] =
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
  });
}
