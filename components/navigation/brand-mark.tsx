import Link from "next/link";

import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function BrandMark({
  href,
  className,
  suffix,
}: {
  href: string;
  className?: string;
  suffix?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="bg-intelligence inline-block size-2.5 rounded-sm"
      />
      <span>
        {APP_NAME}
        {suffix ? <span className="font-medium text-muted-foreground"> {suffix}</span> : null}
      </span>
    </Link>
  );
}
