import { Badge } from "@/components/ui/badge";
import { deadlineCopy } from "@/lib/deals/deadline-copy";
import type { DealStatus } from "@/components/deals/types";

const PILL: Record<
  DealStatus,
  { label: string; className: string } | null
> = {
  OPEN: { label: "Open", className: "" },
  CLOSING_SOON: {
    label: "Closing soon",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  UPCOMING: {
    label: "Opening soon",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  AWARDED: {
    label: "Awarded",
    className: "border-transparent bg-gray-100 text-gray-600",
  },
  CLOSED: {
    label: "Closed",
    className: "border-transparent bg-gray-100 text-gray-600",
  },
  ACTIVE: null,
  CANCELLED: null,
  EXPIRED: null,
  WITHDRAWN: null,
  UNCLASSIFIED: null,
};

export function DealStatusBadge({
  status,
  deadlineBand,
  deadline,
}: {
  status: DealStatus;
  deadlineBand?: string | null;
  deadline?: string | null;
}) {
  const pill = PILL[status];
  if (!pill) {
    return null;
  }
  const copy = deadlineCopy({ status, deadlineBand, deadline });
  const variant = status === "OPEN" ? "success" : "outline";

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge variant={variant} className={pill.className}>
        <span>{pill.label}</span>
      </Badge>
      {copy.text ? (
        copy.datetime ? (
          <time
            dateTime={copy.datetime}
            className={
              copy.tone === "soon"
                ? "text-sm font-medium text-amber-700"
                : "text-sm text-gray-600"
            }
          >
            {copy.text}
          </time>
        ) : (
          <span
            className={
              copy.tone === "soon"
                ? "text-sm font-medium text-amber-700"
                : "text-sm text-gray-600"
            }
          >
            {copy.text}
          </span>
        )
      ) : null}
    </span>
  );
}

export function deadlineKeyFact(input: {
  status: DealStatus;
  deadlineBand?: string | null;
  deadline?: string | null;
}) {
  return deadlineCopy(input).keyFact;
}
