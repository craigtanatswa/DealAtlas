import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signupPathWithAlert } from "@/lib/auth/redirect";

export function OpeningAlertButton({
  href,
  signedIn,
  variant,
}: {
  href: string;
  signedIn: boolean;
  variant: "card" | "page";
}) {
  const destination = signedIn ? "/app/alerts" : signupPathWithAlert(href);

  if (variant === "page") {
    return (
      <div className="flex max-w-md flex-col gap-2">
        <Button asChild className="min-h-11 w-full sm:w-fit">
          <Link href={destination}>Get alerted when it opens</Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you when this opens for bids.
        </p>
      </div>
    );
  }

  return (
    <Button asChild variant="outline" className="min-h-11 w-full">
      <Link href={destination}>Get alerted when it opens</Link>
    </Button>
  );
}
