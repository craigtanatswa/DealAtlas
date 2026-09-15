import type { ReactNode } from "react";

export function LegalReviewCallout({ children }: { children: ReactNode }) {
  return (
    <aside
      data-legal-review="required"
      className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <p className="text-sm font-semibold text-warning-foreground">
        Requires final business/legal review
      </p>
      <div className="mt-2 text-[0.9375rem] leading-7 text-muted-foreground">
        {children}
      </div>
    </aside>
  );
}
