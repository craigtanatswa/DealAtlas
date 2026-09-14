import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
      <p className="text-sm font-medium text-muted-foreground">{APP_NAME}</p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        Find contracts worth pursuing, then unlock who is buying.
      </h1>
      <p className="max-w-2xl text-base leading-7 text-muted-foreground">
        {APP_DESCRIPTION}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/deals">Find deals</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/how-it-works">How it works</Link>
        </Button>
      </div>
    </main>
  );
}
