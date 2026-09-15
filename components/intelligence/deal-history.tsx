import {
  AwardList,
  ContractList,
  IncumbentList,
  IntelligenceSection,
  RelatedList,
  RenewalList,
} from "@/components/intelligence/lists";
import type { DealHistoryDto } from "@/lib/intelligence/types";

export function DealHistorySections({ history }: { history: DealHistoryDto }) {
  return (
    <>
      <IntelligenceSection id="buyer-awards-heading" title="Related awards">
        <AwardList
          awards={history.awards}
          empty="No award records are stored against this opportunity."
        />
      </IntelligenceSection>
      <IntelligenceSection id="incumbent-heading" title="Incumbent and competitor signals">
        <IncumbentList items={history.incumbents} />
      </IntelligenceSection>
      <IntelligenceSection id="related-contracts-heading" title="Previous and related contracts">
        <ContractList
          contracts={history.contracts}
          empty="No contract start, end, or extension data is stored for this opportunity."
        />
      </IntelligenceSection>
      <IntelligenceSection id="related-procurements-heading" title="Related previous and next procurements">
        <RelatedList items={history.relatedProcurements} />
      </IntelligenceSection>
      <IntelligenceSection id="renewal-signals-heading" title="Renewal signals">
        <RenewalList
          items={history.renewalSignals}
          empty="No evidenced contract end, extension, or source renewal date is stored for this opportunity."
        />
      </IntelligenceSection>
    </>
  );
}
