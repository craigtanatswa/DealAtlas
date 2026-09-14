import Link from "next/link";

import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

export default function HomePage() {
  return (
    <Main className="gap-8">
      <p className="text-sm font-medium text-muted-foreground">{APP_NAME}</p>
      <Heading className="max-w-3xl">
        Find contracts worth pursuing, then unlock who is buying.
      </Heading>
      <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
        {APP_DESCRIPTION}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/deals">Find deals</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/how-it-works">How it works</Link>
        </Button>
      </div>
    </Main>
  );
}
