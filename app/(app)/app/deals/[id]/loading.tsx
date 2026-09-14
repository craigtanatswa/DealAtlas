import { LoadingState } from "@/components/feedback/loading-state";
import { Main } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppDealLoading() {
  return (
    <Main className="gap-8">
      <LoadingState label="Loading opportunity" />
      <Skeleton className="h-24 w-full max-w-3xl" />
      <Skeleton className="h-40 w-full" />
    </Main>
  );
}
