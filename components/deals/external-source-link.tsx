import { ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { safeHttpUrl } from "@/lib/deals/urls";
import { cn } from "@/lib/utils";

export function ExternalSourceLink({
  href,
  children,
  variant = "outline",
  className,
}: {
  href: string | null | undefined;
  children: string;
  variant?: "default" | "outline" | "secondary" | "link";
  className?: string;
}) {
  const safeHref = safeHttpUrl(href);
  if (!safeHref) {
    return null;
  }

  return (
    <Button asChild variant={variant} className={cn(className)}>
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>{children}</span>
        <ExternalLinkIcon aria-hidden="true" />
        <span className="sr-only">(opens original source in a new tab)</span>
      </a>
    </Button>
  );
}
