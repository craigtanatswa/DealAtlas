import type { CanonicalCandidate } from "@/ingestion/core/types";
import { IngestionError } from "@/ingestion/core/errors";
import { categoryFromCpv } from "@/ingestion/normalizers/taxonomy";
import { normalizeTitle } from "@/ingestion/normalizers/text";
import { resolveOrganization } from "@/ingestion/org/resolve";
import type {
  DataChangeRecord,
  DataSourceRecord,
  DealRecord,
  IngestionStore,
  LotRecord,
  RawRecordRow,
} from "@/ingestion/store/types";

export type PersistOutcome = "new" | "updated" | "unchanged" | "linked";

export type PersistResult = {
  outcome: PersistOutcome;
  deal: DealRecord;
  noticeId: string;
  lotIds: string[];
};

function qualityScore(candidate: CanonicalCandidate): number {
  let score = 20;
  if (candidate.buyerPartyId || candidate.organizations.some((org) => org.roles.includes("BUYER"))) {
    score += 20;
  }
  if (candidate.ocid) {
    score += 10;
  }
  if (candidate.valueMinExVat != null || candidate.valueMaxExVat != null) {
    score += 15;
  }
  if (candidate.submissionDeadline) {
    score += 15;
  }
  if (candidate.lots.length > 0) {
    score += 10;
  }
  if (candidate.sourceDescription) {
    score += 10;
  }
  return Math.min(100, score);
}

function dealSnapshot(deal: DealRecord) {
  return {
    source_title: deal.sourceTitle,
    source_description: deal.sourceDescription,
    status: deal.status,
    stage: deal.stage,
    value_min_ex_vat: deal.valueMinExVat,
    value_max_ex_vat: deal.valueMaxExVat,
    submission_deadline: deal.submissionDeadline,
    enquiry_deadline: deal.enquiryDeadline,
    contract_start_date: deal.contractStartDate,
    contract_end_date: deal.contractEndDate,
  };
}

function materialChanges(
  before: ReturnType<typeof dealSnapshot>,
  after: ReturnType<typeof dealSnapshot>,
  now: string,
  dealId: string,
  sourceId: string,
): Omit<DataChangeRecord, "id">[] {
  const changes: Omit<DataChangeRecord, "id">[] = [];
  const push = (
    changeType: string,
    fieldName: string,
    previousValue: unknown,
    nextValue: unknown,
  ) => {
    if (previousValue === nextValue) {
      return;
    }
    changes.push({
      dealId,
      sourceId,
      changeType,
      fieldName,
      previousValue,
      newValue: nextValue,
      material: true,
      occurredAt: now,
    });
  };

  push("title_change", "source_title", before.source_title, after.source_title);
  push(
    "requirement_change",
    "source_description",
    before.source_description,
    after.source_description,
  );
  push("status_changed", "status", before.status, after.status);
  push("status_changed", "stage", before.stage, after.stage);
  push("value_change", "value_min_ex_vat", before.value_min_ex_vat, after.value_min_ex_vat);
  push("value_change", "value_max_ex_vat", before.value_max_ex_vat, after.value_max_ex_vat);
  if (before.submission_deadline !== after.submission_deadline) {
    const extended =
      before.submission_deadline &&
      after.submission_deadline &&
      after.submission_deadline > before.submission_deadline;
    push(
      extended ? "deadline_extension" : "deadline_change",
      "submission_deadline",
      before.submission_deadline,
      after.submission_deadline,
    );
  }
  push(
    "deadline_change",
    "enquiry_deadline",
    before.enquiry_deadline,
    after.enquiry_deadline,
  );
  push(
    "contract_extension",
    "contract_end_date",
    before.contract_end_date,
    after.contract_end_date,
  );
  return changes;
}

async function linkDeal(
  store: IngestionStore,
  source: DataSourceRecord,
  candidate: CanonicalCandidate,
  buyerOrganizationId: string | null,
): Promise<{ deal: DealRecord | null; linked: boolean }> {
  const byExternal = await store.findDealBySourceExternalId(
    source.id,
    candidate.externalPrimaryId,
  );
  if (byExternal) {
    return { deal: byExternal, linked: false };
  }

  const byOcid = await store.findDealByOcid(candidate.ocid);
  if (byOcid) {
    return { deal: byOcid, linked: true };
  }

  for (const related of candidate.relatedOcids) {
    const relatedDeal = await store.findDealByOcid(related);
    if (relatedDeal) {
      return { deal: relatedDeal, linked: true };
    }
  }

  if (candidate.reference) {
    const byReference = await store.findDealBySourceReference(
      source.id,
      candidate.reference,
    );
    if (byReference) {
      return { deal: byReference, linked: true };
    }
  }

  if (buyerOrganizationId) {
    const byComposite = await store.findDealByBuyerAndNormalizedTitle(
      buyerOrganizationId,
      normalizeTitle(candidate.sourceTitle),
    );
    if (byComposite) {
      return { deal: byComposite, linked: true };
    }
  }

  return { deal: null, linked: false };
}

export async function persistCandidate(options: {
  store: IngestionStore;
  source: DataSourceRecord;
  raw: RawRecordRow;
  candidate: CanonicalCandidate;
  now: Date;
}): Promise<PersistResult> {
  const { store, source, raw, candidate, now } = options;
  const occurredAt = now.toISOString();
  const partyToOrg = new Map<string, string>();

  for (const organization of candidate.organizations) {
    const resolved = await resolveOrganization(store, organization, source.id);
    partyToOrg.set(organization.sourcePartyId, resolved.organization.id);
    if (resolved.reviewCandidateIds.length > 0) {
      await store.insertError({
        sourceId: source.id,
        ingestionRunId: raw.ingestionRunId,
        rawRecordId: raw.id,
        externalRecordId: candidate.noticeIdentifier,
        errorStage: "organization",
        errorCode: "ORG_REVIEW_CANDIDATE",
        message: `Ambiguous organisation match for ${organization.name}; not auto-merged.`,
        retryable: false,
        details: { reviewCandidateIds: resolved.reviewCandidateIds },
      });
    }
  }

  const buyerOrganizationId = candidate.buyerPartyId
    ? (partyToOrg.get(candidate.buyerPartyId) ?? null)
    : (candidate.organizations.find((org) => org.roles.includes("BUYER"))
        ? partyToOrg.get(
            candidate.organizations.find((org) => org.roles.includes("BUYER"))!
              .sourcePartyId,
          ) ?? null
        : null);

  const linked = await linkDeal(store, source, candidate, buyerOrganizationId);
  let outcome: PersistOutcome = linked.deal ? (linked.linked ? "linked" : "updated") : "new";
  const before = linked.deal ? dealSnapshot(linked.deal) : null;

  const dealFields: Omit<DealRecord, "id" | "firstDiscoveredAt" | "sourceCount" | "normalizedTitle"> &
    Partial<Pick<DealRecord, "id" | "firstDiscoveredAt" | "sourceCount" | "normalizedTitle">> = {
    primarySourceId: source.id,
    externalPrimaryId: candidate.externalPrimaryId,
    ocid: candidate.ocid,
    reference: candidate.reference ?? null,
    sourceTitle: candidate.sourceTitle,
    sourceDescription: candidate.sourceDescription ?? null,
    buyerOrganizationId,
    dealType: candidate.dealType,
    buyerSector: candidate.buyerSector,
    stage: candidate.stage,
    status: candidate.status,
    mainCategory: candidate.mainCategory ?? null,
    procurementMethod: candidate.procurementMethod ?? null,
    specialRegime: candidate.specialRegime ?? null,
    currency: candidate.currency,
    valueMinExVat: candidate.valueMinExVat ?? null,
    valueMaxExVat: candidate.valueMaxExVat ?? null,
    exactValueText: candidate.exactValueText ?? null,
    exactLocationText: candidate.exactLocationText ?? null,
    enquiryDeadline: candidate.enquiryDeadline ?? null,
    submissionDeadline: candidate.submissionDeadline ?? null,
    awardDecisionDate: candidate.awardDecisionDate ?? null,
    contractStartDate: candidate.contractStartDate ?? null,
    contractEndDate: candidate.contractEndDate ?? null,
    extensionEndDate: candidate.extensionEndDate ?? null,
    nextProcurementDate: candidate.nextProcurementDate ?? null,
    estimatedRenewalDate: candidate.estimatedRenewalDate ?? null,
    smeSuitable: candidate.smeSuitable ?? null,
    vcseSuitable: candidate.vcseSuitable ?? null,
    sourceUrl: candidate.sourceUrl,
    applicationUrl: candidate.applicationUrl ?? null,
    firstPublishedAt: candidate.publishedAt ?? occurredAt,
    latestSourceAt: candidate.modifiedAt ?? occurredAt,
    lastVerifiedAt: occurredAt,
    dataQualityScore: qualityScore(candidate),
  };

  let deal: DealRecord;
  if (linked.deal) {
    deal = await store.updateDeal(linked.deal.id, {
      ...dealFields,
      firstPublishedAt: linked.deal.firstPublishedAt ?? dealFields.firstPublishedAt,
      sourceCount: Math.max(linked.deal.sourceCount, 1),
    });
  } else {
    deal = await store.createDeal(dealFields);
    outcome = "new";
  }

  const after = dealSnapshot(deal);
  if (before) {
    const diffs = materialChanges(before, after, occurredAt, deal.id, source.id);
    for (const change of diffs) {
      await store.insertDataChange(change);
    }
    if (diffs.length === 0) {
      if (outcome === "updated") {
        outcome = "unchanged";
      }
    } else if (outcome !== "linked" && outcome !== "new") {
      outcome = "updated";
    }
  }

  for (const organization of candidate.organizations) {
    const organizationId = partyToOrg.get(organization.sourcePartyId);
    if (!organizationId) {
      continue;
    }
    for (const role of organization.roles) {
      await store.addDealOrganization({
        dealId: deal.id,
        organizationId,
        role,
        sourceId: source.id,
      });
    }
  }

  for (const related of candidate.relatedOcids) {
    const relatedDeal = await store.findDealByOcid(related);
    if (relatedDeal && relatedDeal.id !== deal.id) {
      await store.addRelatedDeal({
        dealId: deal.id,
        relatedDealId: relatedDeal.id,
        relationshipType: "related_process",
        confidence: 1,
      });
    }
  }

  const existingLots = await store.listLotsForDeal(deal.id);
  const lotIds: string[] = [];
  const lotIdBySource = new Map<string, string>();
  for (const lot of candidate.lots) {
    const existingLot = await store.findLot(deal.id, lot.sourceLotId);
    const lotRow: Omit<LotRecord, "id"> = {
      dealId: deal.id,
      sourceLotId: lot.sourceLotId,
      lotNumber: lot.lotNumber ?? lot.sourceLotId,
      sourceTitle: lot.sourceTitle ?? null,
      sourceDescription: lot.sourceDescription ?? null,
      status: lot.status ?? null,
      currency: lot.currency ?? candidate.currency,
      valueMin: lot.valueMin ?? null,
      valueMax: lot.valueMax ?? null,
      exactLocationText: lot.exactLocationText ?? null,
      submissionDeadline: lot.submissionDeadline ?? null,
      contractStartDate: lot.contractStartDate ?? null,
      contractEndDate: lot.contractEndDate ?? null,
      extensionEndDate: lot.extensionEndDate ?? null,
      smeSuitable: lot.smeSuitable ?? null,
      vcseSuitable: lot.vcseSuitable ?? null,
    };
    const saved = existingLot
      ? await store.updateLot(existingLot.id, lotRow)
      : await store.createLot(lotRow);
    if (!existingLot) {
      await store.insertDataChange({
        dealId: deal.id,
        sourceId: source.id,
        changeType: "lot_added",
        fieldName: "lots",
        previousValue: null,
        newValue: lot.sourceLotId,
        material: true,
        occurredAt,
      });
      if (outcome === "unchanged") {
        outcome = "updated";
      }
    }
    lotIds.push(saved.id);
    lotIdBySource.set(lot.sourceLotId, saved.id);
  }

  for (const existingLot of existingLots) {
    if (
      existingLot.sourceLotId &&
      !candidate.lots.some((lot) => lot.sourceLotId === existingLot.sourceLotId)
    ) {
      await store.updateLot(existingLot.id, { status: "WITHDRAWN" });
      await store.insertDataChange({
        dealId: deal.id,
        sourceId: source.id,
        changeType: "lot_removed",
        fieldName: "lots",
        previousValue: existingLot.sourceLotId,
        newValue: null,
        material: true,
        occurredAt,
      });
      if (outcome === "unchanged") {
        outcome = "updated";
      }
    }
  }

  let notice = await store.findNotice(
    source.id,
    candidate.noticeIdentifier,
    candidate.releaseId,
  );
  if (!notice) {
    notice = await store.createNotice({
      dealId: deal.id,
      sourceId: source.id,
      rawRecordId: raw.id,
      noticeIdentifier: candidate.noticeIdentifier,
      releaseId: candidate.releaseId,
      noticeType: candidate.noticeType ?? null,
      noticeStage: candidate.noticeStage ?? null,
      sourceUrl: candidate.sourceUrl,
      publishedAt: candidate.publishedAt ?? null,
      modifiedAt: candidate.modifiedAt ?? occurredAt,
      isCurrentVersion: true,
    });
  } else {
    await store.updateNotice(notice.id, {
      rawRecordId: raw.id,
      noticeType: candidate.noticeType ?? notice.noticeType,
      noticeStage: candidate.noticeStage ?? notice.noticeStage,
      sourceUrl: candidate.sourceUrl,
      modifiedAt: candidate.modifiedAt ?? occurredAt,
      isCurrentVersion: true,
    });
  }

  const previousNotices = await store.listNoticesForDeal(deal.id);
  for (const previous of previousNotices) {
    if (previous.id !== notice.id) {
      await store.updateNotice(previous.id, { isCurrentVersion: false });
    }
  }

  const existingVersion = await store.findNoticeVersionByHash(
    notice.id,
    raw.contentHash,
  );
  if (!existingVersion) {
    const versions = await store.listNoticeVersions(notice.id);
    const versionNumber = versions.reduce(
      (max, item) => Math.max(max, item.versionNumber),
      0,
    ) + 1;
    await store.insertNoticeVersion({
      noticeId: notice.id,
      versionNumber,
      contentHash: raw.contentHash,
      capturedAt: occurredAt,
    });
    if (versionNumber > 1 && outcome === "unchanged") {
      outcome = "updated";
    }
  }

  await store.deleteRequirementsForNotice(notice.id);
  for (const requirement of candidate.requirements) {
    await store.insertRequirement({
      dealId: deal.id,
      lotId: requirement.relatedLotId
        ? (lotIdBySource.get(requirement.relatedLotId) ?? null)
        : null,
      requirementType: requirement.requirementType,
      name: requirement.name,
      description: requirement.description,
      mandatory: requirement.mandatory,
      sourceNoticeId: notice.id,
    });
  }

  await store.deleteAwardCriteriaForNotice(notice.id);
  for (const criterion of candidate.awardCriteria) {
    await store.insertAwardCriterion({
      dealId: deal.id,
      lotId: criterion.relatedLotId
        ? (lotIdBySource.get(criterion.relatedLotId) ?? null)
        : null,
      criterionName: criterion.name,
      criterionDescription: criterion.description,
      criterionType: criterion.criterionType,
      weightPercent: criterion.weightPercent,
      orderOfImportance: criterion.orderOfImportance,
      sourceNoticeId: notice.id,
    });
  }

  for (const award of candidate.awards) {
    const lotId = award.relatedLotIds?.[0]
      ? (lotIdBySource.get(award.relatedLotIds[0]) ?? null)
      : null;
    const existingAward = await store.findAward(deal.id, award.awardIdentifier);
    const saved = existingAward
      ? await store.updateAward(existingAward.id, {
          lotId,
          sourceNoticeId: notice.id,
          awardDate: award.awardDate ?? null,
          awardValue: award.awardValue ?? null,
          currency: award.currency ?? candidate.currency,
          numberOfTenders: award.numberOfTenders ?? null,
          numberOfSmeTenders: award.numberOfSmeTenders ?? null,
          numberOfVcseTenders: award.numberOfVcseTenders ?? null,
          standstillEndAt: award.standstillEndAt ?? null,
        })
      : await store.createAward({
          dealId: deal.id,
          lotId,
          sourceNoticeId: notice.id,
          awardIdentifier: award.awardIdentifier,
          awardDate: award.awardDate ?? null,
          awardValue: award.awardValue ?? null,
          currency: award.currency ?? candidate.currency,
          numberOfTenders: award.numberOfTenders ?? null,
          numberOfSmeTenders: award.numberOfSmeTenders ?? null,
          numberOfVcseTenders: award.numberOfVcseTenders ?? null,
          standstillEndAt: award.standstillEndAt ?? null,
        });
    if (!existingAward) {
      await store.insertDataChange({
        dealId: deal.id,
        sourceId: source.id,
        changeType: "award_published",
        fieldName: "awards",
        previousValue: null,
        newValue: award.awardIdentifier,
        material: true,
        occurredAt,
      });
      if (outcome === "unchanged") {
        outcome = "updated";
      }
    }
    for (const supplierPartyId of award.supplierPartyIds ?? []) {
      const organizationId = partyToOrg.get(supplierPartyId);
      if (!organizationId) {
        continue;
      }
      await store.addAwardSupplier({
        awardId: saved.id,
        organizationId,
        awardedValue: award.awardValue ?? null,
      });
      await store.addDealOrganization({
        dealId: deal.id,
        organizationId,
        role: "AWARDED_SUPPLIER",
        lotId,
        sourceId: source.id,
      });
    }
  }

  for (const contract of candidate.contracts) {
    const existingContract = await store.findContract(
      deal.id,
      contract.contractIdentifier,
    );
    const award = contract.awardIdentifier
      ? await store.findAward(deal.id, contract.awardIdentifier)
      : null;
    if (existingContract) {
      await store.updateContract(existingContract.id, {
        awardId: award?.id ?? existingContract.awardId,
        signedDate: contract.signedDate ?? null,
        startDate: contract.startDate ?? null,
        endDate: contract.endDate ?? null,
        extensionEndDate: contract.extensionEndDate ?? null,
        originalValue: contract.originalValue ?? null,
        currentValue: contract.currentValue ?? null,
        currency: contract.currency ?? candidate.currency,
        status: contract.status ?? null,
      });
    } else {
      await store.createContract({
        dealId: deal.id,
        awardId: award?.id ?? null,
        contractIdentifier: contract.contractIdentifier,
        signedDate: contract.signedDate ?? null,
        startDate: contract.startDate ?? null,
        endDate: contract.endDate ?? null,
        extensionEndDate: contract.extensionEndDate ?? null,
        originalValue: contract.originalValue ?? null,
        currentValue: contract.currentValue ?? null,
        currency: contract.currency ?? candidate.currency,
        status: contract.status ?? null,
      });
      await store.insertDataChange({
        dealId: deal.id,
        sourceId: source.id,
        changeType: "contract_published",
        fieldName: "contracts",
        previousValue: null,
        newValue: contract.contractIdentifier,
        material: true,
        occurredAt,
      });
      if (outcome === "unchanged") {
        outcome = "updated";
      }
    }
  }

  for (const document of candidate.documents) {
    const exists = await store.findDocument(deal.id, document.sourceUrl);
    if (!exists) {
      await store.createDocument({
        dealId: deal.id,
        noticeId: notice.id,
        lotId: document.relatedLotId
          ? (lotIdBySource.get(document.relatedLotId) ?? null)
          : null,
        sourceId: source.id,
        name: document.name,
        documentType: document.documentType,
        sourceUrl: document.sourceUrl,
        mimeType: document.mimeType,
        publishedAt: document.publishedAt,
        redistributionPermitted: source.reuseStatus === "OPEN_LICENSE",
      });
      await store.insertDataChange({
        dealId: deal.id,
        sourceId: source.id,
        changeType: "document_added",
        fieldName: "documents",
        previousValue: null,
        newValue: document.sourceUrl,
        material: true,
        occurredAt,
      });
    }
  }

  for (const classification of candidate.classifications) {
    if (classification.scheme === "CPV" && classification.code) {
      await store.upsertCpvCode(
        classification.code,
        classification.description ?? classification.code,
      );
      const lotId = classification.relatedLotId
        ? (lotIdBySource.get(classification.relatedLotId) ?? null)
        : null;
      if (!(await store.hasClassification(deal.id, classification.code, lotId))) {
        const category = categoryFromCpv(classification.code);
        const categoryRow = category
          ? await store.findCategoryBySlug(category.slug)
          : null;
        await store.insertClassification({
          dealId: deal.id,
          lotId,
          cpvCode: classification.code,
          categoryId: categoryRow?.id ?? null,
          sourceScheme: classification.scheme,
          sourceCode: classification.code,
          sourceDescription: classification.description,
          isPrimary: classification.isPrimary ?? false,
        });
      }
    }
  }

  if (!deal) {
    throw new IngestionError({
      message: "Failed to persist deal",
      stage: "persist",
    });
  }

  return { outcome, deal, noticeId: notice.id, lotIds };
}
