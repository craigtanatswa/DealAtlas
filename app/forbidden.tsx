import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Access denied</h1>
      <p className="max-w-2xl text-base leading-7 text-muted-foreground">
        You do not have permission to view this page.
      </p>
      <div>
        <Button asChild>
          <Link href="/app">Back to workspace</Link>
        </Button>
      </div>
    </main>
  );
}
