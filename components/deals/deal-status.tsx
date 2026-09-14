import {
  AlertTriangleIcon,
  BanIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  ClockIcon,
  PauseCircleIcon,
  TimerIcon,
  XCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DealStatus } from "@/components/deals/types";

const STATUS_META: Record<
  DealStatus,
  {
    label: string;
    variant: "success" | "warning" | "destructive" | "secondary" | "outline" | "intelligence";
    icon: typeof CircleDotIcon;
  }
> = {
  OPEN: { label: "Open", variant: "success", icon: CircleDotIcon },
  ACTIVE: { label: "Active", variant: "success", icon: CheckCircle2Icon },
  CLOSING_SOON: { label: "Closing soon", variant: "warning", icon: AlertTriangleIcon },
  UPCOMING: { label: "Upcoming", variant: "secondary", icon: ClockIcon },
  CLOSED: { label: "Closed", variant: "outline", icon: PauseCircleIcon },
  AWARDED: { label: "Awarded", variant: "intelligence", icon: CheckCircle2Icon },
  CANCELLED: { label: "Cancelled", variant: "destructive", icon: XCircleIcon },
  EXPIRED: { label: "Expired", variant: "outline", icon: TimerIcon },
  WITHDRAWN: { label: "Withdrawn", variant: "destructive", icon: BanIcon },
};

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <Badge variant={meta.variant}>
      <Icon aria-hidden="true" />
      <span>{meta.label}</span>
    </Badge>
  );
}
