import { DealCardSkeleton } from "@/components/deals/deal-card";
import { LoadingState } from "@/components/feedback/loading-state";
import { Main } from "@/components/layout/container";

export default function DealsLoading() {
  return (
    <Main className="gap-8">
      <LoadingState label="Loading opportunities" />
      <div className="grid gap-4">
        <DealCardSkeleton />
        <DealCardSkeleton />
        <DealCardSkeleton />
      </div>
    </Main>
  );
}
