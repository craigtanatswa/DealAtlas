import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SignedInSwitch } from "@/components/viewer/viewer-provider";
import { signupPathWithAlert } from "@/lib/auth/redirect";

export function OpeningAlertButton({
  href,
  signedIn,
  variant,
}: {
  href: string;
  signedIn: boolean | "viewer";
  variant: "card" | "page";
}) {
  const anonymousDestination = signupPathWithAlert(href);

  function content(destination: string) {
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

  if (signedIn === "viewer") {
    return (
      <SignedInSwitch
        signedIn={content("/app/alerts")}
        anonymous={content(anonymousDestination)}
      />
    );
  }

  return content(signedIn ? "/app/alerts" : anonymousDestination);
}
