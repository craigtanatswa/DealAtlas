import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function HeaderSearch({
  path = "/deals",
  idPrefix = "header",
  className,
}: {
  path?: string;
  idPrefix?: string;
  className?: string;
}) {
  const keywordId = `${idPrefix}-q`;

  return (
    <form
      method="get"
      action={path}
      role="search"
      className={cn("relative min-w-0", className)}
    >
      <Label htmlFor={keywordId} className="sr-only">
        Search opportunities
      </Label>
      <button
        type="submit"
        className="absolute top-1/2 left-1 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label="Search"
      >
        <SearchIcon className="size-4" aria-hidden="true" />
      </button>
      <Input
        id={keywordId}
        name="q"
        type="search"
        maxLength={200}
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Search opportunities"
        className="h-10 rounded-full bg-muted/50 pr-3 pl-10"
      />
    </form>
  );
}
