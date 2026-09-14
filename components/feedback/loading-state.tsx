import { Main } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)} aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-2/3 max-w-xl" />
      <Skeleton className="h-16 w-full max-w-2xl" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function PageLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <Main>
      <LoadingState label={label} />
    </Main>
  );
}
