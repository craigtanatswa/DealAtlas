import Link from "next/link";

import { Button } from "@/components/ui/button";

export function EmailVerificationBanner({ verified }: { verified: boolean }) {
  if (verified) {
    return null;
  }

  return (
    <div className="border-b border-border bg-muted/60">
      <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-sm text-foreground">
          Confirm your email to use saved searches and alerts when those
          features go live.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/verify-email">Verify email</Link>
        </Button>
      </div>
    </div>
  );
}
