import Image from "next/image";

import { Main } from "@/components/layout/container";
import { cn } from "@/lib/utils";

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn("flex min-h-48 items-center justify-center", className)}
    >
      {/* Compass mark. Spin is linear; reduced motion keeps it still and pulses opacity. */}
      <Image
        src="/brand/dealatlas-mark.png"
        alt=""
        width={56}
        height={56}
        className="size-14 object-contain motion-safe:[animation:spin_1.75s_linear_infinite] motion-reduce:animate-pulse"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function PageLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <Main>
      <LoadingState label={label} className="min-h-[50vh]" />
    </Main>
  );
}
