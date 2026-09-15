import {
  buildRenewalSignal,
  contractExpiryFacts,
  dealDateFacts,
  insightRenewalFact,
} from "@/lib/intelligence/renewals";
import type { IngestionStore } from "@/ingestion/store/types";
import type { JobMode } from "@/lib/jobs/cli";
import { errorMessage, structuredLog } from "@/lib/observability/log";
import { createErrorReporter, type ErrorReporter } from "@/lib/monitoring";

export type RenewalRecalcResult = {
  mode: JobMode;
  dryRun: boolean;
  scanned: number;
  updated: number;
  unchanged: number;
  failures: number;
};

export async function recalculateRenewalSignals(options: {
  store: IngestionStore;
  now?: Date;
  mode?: JobMode;
  limit?: number;
  reporter?: ErrorReporter;
}): Promise<RenewalRecalcResult> {
  const now = options.now ?? new Date();
  const mode = options.mode ?? "live";
  const dryRun = mode === "dry-run";
  const reporter = options.reporter ?? createErrorReporter();
  const limit = options.limit ?? (mode === "test" ? 25 : 200);
  const deals = await options.store.listDeals(limit);

  let updated = 0;
  let unchanged = 0;
  let failures = 0;

  for (const deal of deals) {
    try {
      const [contracts, insight] = await Promise.all([
        options.store.listContractsForDeal(deal.id),
        options.store.getDealInsight(deal.id),
      ]);
      const facts = [
        ...dealDateFacts({
          contractEndDate: deal.contractEndDate,
          extensionEndDate: deal.extensionEndDate,
          estimatedRenewalDate: deal.estimatedRenewalDate,
          nextProcurementDate: deal.nextProcurementDate,
        }),
        ...contracts.flatMap((contract) =>
          contractExpiryFacts({
            endDate: contract.endDate,
            extensionEndDate: contract.extensionEndDate,
          }),
        ),
      ];
      const inferred = insightRenewalFact(insight?.estimatedRenewalDate ?? null);
      if (inferred) {
        facts.push(inferred);
      }
      const signal = buildRenewalSignal(
        {
          dealId: deal.id,
          dealTitle: deal.sourceTitle,
          dealType: deal.dealType,
          status: deal.status,
          buyer: null,
          incumbents: [],
          facts,
        },
        now,
      );
      const nextDate = signal?.date ?? null;
      if (nextDate === (deal.estimatedRenewalDate ?? null)?.slice(0, 10) &&
          nextDate === (insight?.estimatedRenewalDate ?? null)?.slice(0, 10)) {
        unchanged += 1;
        continue;
      }
      if (dryRun) {
        if (nextDate) {
          updated += 1;
        } else {
          unchanged += 1;
        }
        continue;
      }
      if (nextDate && nextDate !== deal.estimatedRenewalDate?.slice(0, 10)) {
        await options.store.updateDeal(deal.id, {
          estimatedRenewalDate: `${nextDate}T00:00:00.000Z`,
        });
      }
      if (insight && nextDate !== insight.estimatedRenewalDate?.slice(0, 10)) {
        await options.store.upsertDealInsight({
          ...insight,
          estimatedRenewalDate: nextDate,
        });
      }
      if (nextDate) {
        updated += 1;
      } else {
        unchanged += 1;
      }
    } catch (error) {
      failures += 1;
      structuredLog({
        job: "renewals",
        msg: "renewal_recalc_failed",
        level: "error",
        dealId: deal.id,
        error: errorMessage(error),
      });
      await reporter.captureException(error, { job: "renewals", dealId: deal.id });
    }
  }

  const result = {
    mode,
    dryRun,
    scanned: deals.length,
    updated,
    unchanged,
    failures,
  };
  structuredLog({
    job: "renewals",
    msg: "renewal_recalc_finished",
    ...result,
  });
  return result;
}
