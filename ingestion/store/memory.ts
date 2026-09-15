import { randomUUID } from "node:crypto";

import { normalizeTitle } from "@/ingestion/normalizers/text";
import type {
  AwardRecord,
  ContractRecord,
  DataChangeRecord,
  DataSourceRecord,
  DealInsightRecord,
  DealPreviewRecord,
  DealRecord,
  IngestionErrorRecord,
  IngestionRunRecord,
  IngestionStore,
  LotRecord,
  NoticeRecord,
  NoticeVersionRecord,
  OrganizationRecord,
  PreviewGenerationRunRecord,
  RawRecordRow,
} from "@/ingestion/store/types";

export type MemoryIngestionState = {
  sources: DataSourceRecord[];
  runs: IngestionRunRecord[];
  rawRecords: RawRecordRow[];
  errors: IngestionErrorRecord[];
  organizations: OrganizationRecord[];
  identifiers: Array<{ organizationId: string; scheme: string; value: string }>;
  aliases: Array<{ organizationId: string; alias: string; normalizedAlias: string }>;
  deals: DealRecord[];
  notices: NoticeRecord[];
  noticeVersions: NoticeVersionRecord[];
  lots: LotRecord[];
  requirements: Array<{
    dealId: string;
    sourceNoticeId: string | null;
    name: string;
    description: string | null;
    requirementType: string;
    mandatory: boolean | null;
  }>;
  awardCriteria: Array<{
    dealId: string;
    sourceNoticeId: string | null;
    criterionName: string;
    criterionDescription: string | null;
  }>;
  awards: AwardRecord[];
  awardSuppliers: Array<{ awardId: string; organizationId: string }>;
  contracts: ContractRecord[];
  documents: Array<{ dealId: string; sourceUrl: string }>;
  dealOrganizations: Array<{
    dealId: string;
    organizationId: string;
    role: string;
    lotId: string | null;
  }>;
  classifications: Array<{ dealId: string; cpvCode: string | null; lotId: string | null }>;
  dataChanges: DataChangeRecord[];
  relatedDeals: Array<{ dealId: string; relatedDealId: string; relationshipType: string }>;
  categories: Array<{ id: string; slug: string; name: string }>;
  cpvCodes: Array<{ code: string; description: string }>;
  previews: DealPreviewRecord[];
  insights: DealInsightRecord[];
  previewRuns: PreviewGenerationRunRecord[];
};

export function createMemoryIngestionStore(seed?: {
  sources?: DataSourceRecord[];
  categories?: Array<{ id?: string; slug: string; name: string }>;
}): IngestionStore & MemoryIngestionState {
  const state: MemoryIngestionState = {
    sources: [...(seed?.sources ?? [])],
    runs: [],
    rawRecords: [],
    errors: [],
    organizations: [],
    identifiers: [],
    aliases: [],
    deals: [],
    notices: [],
    noticeVersions: [],
    lots: [],
    requirements: [],
    awardCriteria: [],
    awards: [],
    awardSuppliers: [],
    contracts: [],
    documents: [],
    dealOrganizations: [],
    classifications: [],
    dataChanges: [],
    relatedDeals: [],
    categories: (seed?.categories ?? []).map((item) => ({
      id: item.id ?? randomUUID(),
      slug: item.slug,
      name: item.name,
    })),
    cpvCodes: [],
    previews: [],
    insights: [],
    previewRuns: [],
  };

  const store: IngestionStore & MemoryIngestionState = {
    ...state,

    async getSourceByKey(sourceKey) {
      return state.sources.find((item) => item.sourceKey === sourceKey) ?? null;
    },
    async getSourceById(id) {
      return state.sources.find((item) => item.id === id) ?? null;
    },
    async listSources() {
      return [...state.sources];
    },
    async listChangedDealIds(sinceIso, limit = 200) {
      const since = Date.parse(sinceIso);
      const ids: string[] = [];
      const seen = new Set<string>();
      for (const change of state.dataChanges) {
        if (!change.material || Date.parse(change.occurredAt) < since) {
          continue;
        }
        if (seen.has(change.dealId)) {
          continue;
        }
        seen.add(change.dealId);
        ids.push(change.dealId);
        if (ids.length >= limit) {
          break;
        }
      }
      return ids;
    },
    async getOrganizationById(id) {
      return state.organizations.find((item) => item.id === id) ?? null;
    },
    async listOrganizationAliases(organizationId) {
      return state.aliases
        .filter((item) => item.organizationId === organizationId)
        .map((item) => item.alias);
    },
    async listDeals(limit = 100) {
      return state.deals.slice(0, limit);
    },
    async getDealById(id) {
      return state.deals.find((item) => item.id === id) ?? null;
    },
    async getDealPreview(dealId) {
      return state.previews.find((item) => item.dealId === dealId) ?? null;
    },
    async upsertDealPreview(input) {
      const index = state.previews.findIndex((item) => item.dealId === input.dealId);
      if (index >= 0) {
        state.previews[index] = input;
      } else {
        state.previews.push(input);
      }
      return input;
    },
    async upsertDealInsight(input) {
      const index = state.insights.findIndex((item) => item.dealId === input.dealId);
      if (index >= 0) {
        state.insights[index] = input;
      } else {
        state.insights.push(input);
      }
    },
    async getDealInsight(dealId) {
      return state.insights.find((item) => item.dealId === dealId) ?? null;
    },
    async insertPreviewGenerationRun(input) {
      state.previewRuns.push({ ...input, id: input.id ?? randomUUID() });
    },
    async listRequirementsForDeal(dealId) {
      return state.requirements
        .filter((item) => item.dealId === dealId)
        .map((item) => ({
          name: item.name,
          description: item.description,
          requirementType: item.requirementType,
          mandatory: item.mandatory,
        }));
    },
    async listAwardCriteriaForDeal(dealId) {
      return state.awardCriteria
        .filter((item) => item.dealId === dealId)
        .map((item) => ({
          name: item.criterionName,
          description: item.criterionDescription,
        }));
    },
    async countDocumentsForDeal(dealId) {
      return state.documents.filter((item) => item.dealId === dealId).length;
    },
    async updateSource(id, patch) {
      const source = state.sources.find((item) => item.id === id);
      if (source) {
        Object.assign(source, patch);
      }
    },
    async createRun(input) {
      const run: IngestionRunRecord = {
        id: randomUUID(),
        sourceId: input.sourceId,
        status: input.status,
        triggerType: input.triggerType,
        cursorValue: input.cursorValue ?? null,
        startedAt: input.startedAt ?? new Date().toISOString(),
        finishedAt: null,
        discoveredCount: 0,
        fetchedCount: 0,
        newCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        errorCount: 0,
        metadata: input.metadata ?? {},
      };
      state.runs.push(run);
      return run;
    },
    async updateRun(id, patch) {
      const run = state.runs.find((item) => item.id === id);
      if (run) {
        Object.assign(run, patch);
      }
    },
    async findRawRecord(sourceId, externalRecordId, contentHash) {
      return (
        state.rawRecords.find(
          (item) =>
            item.sourceId === sourceId &&
            item.externalRecordId === externalRecordId &&
            item.contentHash === contentHash,
        ) ?? null
      );
    },
    async insertRawRecord(input) {
      const existing = await store.findRawRecord(
        input.sourceId,
        input.externalRecordId,
        input.contentHash,
      );
      if (existing) {
        return { record: existing, created: false };
      }
      const record: RawRecordRow = { ...input, id: input.id ?? randomUUID() };
      state.rawRecords.push(record);
      return { record, created: true };
    },
    async insertError(input) {
      state.errors.push({ ...input, id: input.id ?? randomUUID() });
    },
    async findOrgByIdentifier(scheme, value) {
      const match = state.identifiers.find(
        (item) => item.scheme === scheme && item.value === value,
      );
      return match
        ? (state.organizations.find((org) => org.id === match.organizationId) ?? null)
        : null;
    },
    async findOrgByDomain(domain) {
      const normalized = domain.toLowerCase();
      return (
        state.organizations.find((org) => org.domain?.toLowerCase() === normalized) ??
        null
      );
    },
    async findOrgByNormalizedNameLocation(normalizedName, city, region) {
      return (
        state.organizations.find((org) => {
          if (org.normalizedName !== normalizedName) {
            return false;
          }
          if (city && org.city && org.city.toLowerCase() !== city.toLowerCase()) {
            return false;
          }
          if (region && org.region && org.region.toLowerCase() !== region.toLowerCase()) {
            return false;
          }
          return true;
        }) ?? null
      );
    },
    async findOrgByAlias(normalizedAlias) {
      const match = state.aliases.find(
        (item) => item.normalizedAlias === normalizedAlias,
      );
      return match
        ? (state.organizations.find((org) => org.id === match.organizationId) ?? null)
        : null;
    },
    async listOrgsByNormalizedName(normalizedName) {
      return state.organizations.filter((org) => org.normalizedName === normalizedName);
    },
    async listOrganizations() {
      return [...state.organizations];
    },
    async createOrganization(input) {
      const org: OrganizationRecord = { ...input, id: input.id ?? randomUUID() };
      state.organizations.push(org);
      return org;
    },
    async addOrganizationIdentifier(input) {
      if (
        !state.identifiers.some(
          (item) => item.scheme === input.scheme && item.value === input.value,
        )
      ) {
        state.identifiers.push(input);
      }
    },
    async addOrganizationAlias(input) {
      if (
        !state.aliases.some(
          (item) =>
            item.organizationId === input.organizationId &&
            item.normalizedAlias === input.normalizedAlias,
        )
      ) {
        state.aliases.push(input);
      }
    },
    async addOrganizationContact() {
      // Contacts are stored only in the durable store; memory keeps org-level fields.
    },
    async findDealBySourceExternalId(sourceId, externalPrimaryId) {
      return (
        state.deals.find(
          (deal) =>
            deal.primarySourceId === sourceId &&
            deal.externalPrimaryId === externalPrimaryId,
        ) ?? null
      );
    },
    async findDealByOcid(ocid) {
      return state.deals.find((deal) => deal.ocid === ocid) ?? null;
    },
    async findDealBySourceReference(sourceId, reference) {
      return (
        state.deals.find(
          (deal) => deal.primarySourceId === sourceId && deal.reference === reference,
        ) ?? null
      );
    },
    async findDealByBuyerAndNormalizedTitle(buyerOrganizationId, normalizedTitle) {
      return (
        state.deals.find(
          (deal) =>
            deal.buyerOrganizationId === buyerOrganizationId &&
            deal.normalizedTitle === normalizedTitle,
        ) ?? null
      );
    },
    async createDeal(input) {
      const deal: DealRecord = {
        ...input,
        id: input.id ?? randomUUID(),
        firstDiscoveredAt: input.firstDiscoveredAt ?? new Date().toISOString(),
        sourceCount: input.sourceCount ?? 1,
        normalizedTitle: input.normalizedTitle ?? normalizeTitle(input.sourceTitle),
      };
      state.deals.push(deal);
      return deal;
    },
    async updateDeal(id, patch) {
      const deal = state.deals.find((item) => item.id === id);
      if (!deal) {
        throw new Error(`Deal ${id} not found`);
      }
      Object.assign(deal, patch);
      if (patch.sourceTitle) {
        deal.normalizedTitle = normalizeTitle(patch.sourceTitle);
      }
      return deal;
    },
    async findNotice(sourceId, noticeIdentifier, releaseId) {
      return (
        state.notices.find(
          (notice) =>
            notice.sourceId === sourceId &&
            notice.noticeIdentifier === noticeIdentifier &&
            notice.releaseId === releaseId,
        ) ?? null
      );
    },
    async listNoticesForDeal(dealId) {
      return state.notices.filter((notice) => notice.dealId === dealId);
    },
    async createNotice(input) {
      const notice: NoticeRecord = { ...input, id: input.id ?? randomUUID() };
      state.notices.push(notice);
      return notice;
    },
    async updateNotice(id, patch) {
      const notice = state.notices.find((item) => item.id === id);
      if (!notice) {
        throw new Error(`Notice ${id} not found`);
      }
      Object.assign(notice, patch);
      return notice;
    },
    async findNoticeVersionByHash(noticeId, contentHash) {
      return (
        state.noticeVersions.find(
          (item) => item.noticeId === noticeId && item.contentHash === contentHash,
        ) ?? null
      );
    },
    async listNoticeVersions(noticeId) {
      return state.noticeVersions
        .filter((item) => item.noticeId === noticeId)
        .sort((left, right) => left.versionNumber - right.versionNumber);
    },
    async insertNoticeVersion(input) {
      const version: NoticeVersionRecord = {
        ...input,
        id: input.id ?? randomUUID(),
      };
      state.noticeVersions.push(version);
      return version;
    },
    async findLot(dealId, sourceLotId) {
      return (
        state.lots.find(
          (lot) => lot.dealId === dealId && lot.sourceLotId === sourceLotId,
        ) ?? null
      );
    },
    async listLotsForDeal(dealId) {
      return state.lots.filter((lot) => lot.dealId === dealId);
    },
    async createLot(input) {
      const lot: LotRecord = { ...input, id: input.id ?? randomUUID() };
      state.lots.push(lot);
      return lot;
    },
    async updateLot(id, patch) {
      const lot = state.lots.find((item) => item.id === id);
      if (!lot) {
        throw new Error(`Lot ${id} not found`);
      }
      Object.assign(lot, patch);
      return lot;
    },
    async deleteRequirementsForNotice(noticeId) {
      const kept = state.requirements.filter(
        (item) => item.sourceNoticeId !== noticeId,
      );
      state.requirements.splice(0, state.requirements.length, ...kept);
    },
    async insertRequirement(input) {
      state.requirements.push({
        dealId: input.dealId,
        sourceNoticeId: input.sourceNoticeId ?? null,
        name: input.name,
        description: input.description ?? null,
        requirementType: input.requirementType,
        mandatory: input.mandatory ?? null,
      });
    },
    async deleteAwardCriteriaForNotice(noticeId) {
      const kept = state.awardCriteria.filter(
        (item) => item.sourceNoticeId !== noticeId,
      );
      state.awardCriteria.splice(0, state.awardCriteria.length, ...kept);
    },
    async insertAwardCriterion(input) {
      state.awardCriteria.push({
        dealId: input.dealId,
        sourceNoticeId: input.sourceNoticeId ?? null,
        criterionName: input.criterionName,
        criterionDescription: input.criterionDescription ?? null,
      });
    },
    async findAward(dealId, awardIdentifier) {
      return (
        state.awards.find(
          (award) =>
            award.dealId === dealId && award.awardIdentifier === awardIdentifier,
        ) ?? null
      );
    },
    async createAward(input) {
      const award: AwardRecord = { ...input, id: input.id ?? randomUUID() };
      state.awards.push(award);
      return award;
    },
    async updateAward(id, patch) {
      const award = state.awards.find((item) => item.id === id);
      if (!award) {
        throw new Error(`Award ${id} not found`);
      }
      Object.assign(award, patch);
      return award;
    },
    async addAwardSupplier(input) {
      if (
        !state.awardSuppliers.some(
          (item) =>
            item.awardId === input.awardId &&
            item.organizationId === input.organizationId,
        )
      ) {
        state.awardSuppliers.push(input);
      }
    },
    async listContractsForDeal(dealId) {
      return state.contracts.filter((item) => item.dealId === dealId);
    },
    async findContract(dealId, contractIdentifier) {
      return (
        state.contracts.find(
          (item) =>
            item.dealId === dealId && item.contractIdentifier === contractIdentifier,
        ) ?? null
      );
    },
    async createContract(input) {
      const contract: ContractRecord = { ...input, id: input.id ?? randomUUID() };
      state.contracts.push(contract);
      return contract;
    },
    async updateContract(id, patch) {
      const contract = state.contracts.find((item) => item.id === id);
      if (!contract) {
        throw new Error(`Contract ${id} not found`);
      }
      Object.assign(contract, patch);
      return contract;
    },
    async findDocument(dealId, sourceUrl) {
      return state.documents.find(
        (item) => item.dealId === dealId && item.sourceUrl === sourceUrl,
      )
        ? { id: "memory-document" }
        : null;
    },
    async createDocument(input) {
      if (
        !state.documents.some(
          (item) => item.dealId === input.dealId && item.sourceUrl === input.sourceUrl,
        )
      ) {
        state.documents.push({
          dealId: input.dealId,
          sourceUrl: input.sourceUrl,
        });
      }
    },
    async hasDealOrganization(dealId, organizationId, role, lotId) {
      return state.dealOrganizations.some(
        (item) =>
          item.dealId === dealId &&
          item.organizationId === organizationId &&
          item.role === role &&
          (item.lotId ?? null) === (lotId ?? null),
      );
    },
    async addDealOrganization(input) {
      if (
        !(await store.hasDealOrganization(
          input.dealId,
          input.organizationId,
          input.role,
          input.lotId,
        ))
      ) {
        state.dealOrganizations.push({
          dealId: input.dealId,
          organizationId: input.organizationId,
          role: input.role,
          lotId: input.lotId ?? null,
        });
      }
    },
    async upsertCpvCode(code, description) {
      const existing = state.cpvCodes.find((item) => item.code === code);
      if (existing) {
        existing.description = description;
      } else {
        state.cpvCodes.push({ code, description });
      }
    },
    async findCategoryBySlug(slug) {
      return state.categories.find((item) => item.slug === slug) ?? null;
    },
    async hasClassification(dealId, cpvCode, lotId) {
      return state.classifications.some(
        (item) =>
          item.dealId === dealId &&
          item.cpvCode === cpvCode &&
          (item.lotId ?? null) === (lotId ?? null),
      );
    },
    async insertClassification(input) {
      state.classifications.push({
        dealId: input.dealId,
        cpvCode: input.cpvCode ?? null,
        lotId: input.lotId ?? null,
      });
    },
    async insertDataChange(input) {
      state.dataChanges.push({ ...input, id: input.id ?? randomUUID() });
    },
    async hasRelatedDeal(dealId, relatedDealId, relationshipType) {
      return state.relatedDeals.some(
        (item) =>
          item.dealId === dealId &&
          item.relatedDealId === relatedDealId &&
          item.relationshipType === relationshipType,
      );
    },
    async addRelatedDeal(input) {
      if (
        !(await store.hasRelatedDeal(
          input.dealId,
          input.relatedDealId,
          input.relationshipType,
        ))
      ) {
        state.relatedDeals.push(input);
      }
    },
  };

  return store;
}
