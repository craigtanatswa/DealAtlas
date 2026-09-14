"use client";

import { DealCard, DealCardSkeleton } from "@/components/deals/deal-card";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { DealStatusBadge } from "@/components/deals/deal-status";
import {
  DEAL_CARD_STORIES,
  DEAL_PREVIEW_DETAIL_FIXTURE,
} from "@/components/deals/fixtures";
import { LockedField } from "@/components/deals/locked-field";
import { MatchScore } from "@/components/deals/match-score";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Heading } from "@/components/layout/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TOKEN_SWATCHES = [
  { name: "Navy", className: "bg-navy" },
  { name: "Primary", className: "bg-primary" },
  { name: "Intelligence", className: "bg-intelligence" },
  { name: "Warning", className: "bg-warning" },
  { name: "Destructive", className: "bg-destructive" },
  { name: "Muted", className: "bg-muted ring-1 ring-border" },
] as const;

export function DesignSystemCatalog() {
  return (
    <div className="flex flex-col gap-16">
      <section className="flex flex-col gap-4">
        <Heading level={2}>Semantic tokens</Heading>
        <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground">
          Palette swatches for the design system. These are not product metrics.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {TOKEN_SWATCHES.map((swatch) => (
            <div key={swatch.name} className="flex flex-col gap-2">
              <div className={`h-16 rounded-lg ${swatch.className}`} />
              <p className="text-[0.8125rem] font-medium text-foreground">
                {swatch.name}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Heading level={2}>Typography</Heading>
        <Heading as="p" level={1}>Heading one</Heading>
        <Heading as="p" level={2}>Heading two</Heading>
        <Heading as="p" level={3}>Heading three</Heading>
        <p className="text-[0.9375rem] leading-7 md:text-base">
          Body copy uses 15–16px with a readable line height.
        </p>
        <p className="text-[0.8125rem] leading-5 text-muted-foreground md:text-sm">
          Dense metadata uses 13–14px in slate 700, not tiny grey.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <Heading level={2}>Buttons, badges, and form</Heading>
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <DealStatusBadge status="OPEN" />
          <DealStatusBadge status="CLOSING_SOON" />
          <Badge variant="outline">Public buyer</Badge>
          <Badge variant="secondary">Private buyer</Badge>
        </div>
        <form className="max-w-md" onSubmit={(event) => event.preventDefault()}>
          <Field id="fixture-email" label="Work email" hint="Used only in this fixture form.">
            <Input id="fixture-email" type="email" autoComplete="email" />
          </Field>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <Heading level={2}>Dialog</Heading>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open fixture dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Keyboard-accessible dialog</DialogTitle>
              <DialogDescription>
                Focus should move into this dialog and return to the trigger when
                it closes.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      </section>

      <section className="flex flex-col gap-4">
        <Heading level={2}>Table</Heading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Preview title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Value band</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DEAL_CARD_STORIES.map((story) => (
              <TableRow key={story.id}>
                <TableCell>{story.deal.previewTitle}</TableCell>
                <TableCell>
                  <DealStatusBadge status={story.deal.status} />
                </TableCell>
                <TableCell>{story.deal.valueBand}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-4">
        <Heading level={2}>Deal card fixtures</Heading>
        <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground">
          Dummy stories for layout review. Not live search results or statistics.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {DEAL_CARD_STORIES.map((story) => (
            <div key={story.id} className="flex flex-col gap-2">
              <p className="text-[0.8125rem] font-medium text-muted-foreground">
                {story.name}
              </p>
              <DealCard deal={story.deal} />
            </div>
          ))}
          <DealCardSkeleton />
        </div>
        <MatchScore score={72} />
      </section>

      <section className="flex flex-col gap-4">
        <Heading level={2}>Locked intelligence</Heading>
        <LockedField
          label="Buyer identity"
          benefit="See who is buying"
        />
        <UnlockPanel />
      </section>

      <section className="flex flex-col gap-4">
        <Heading level={2}>Free deal preview detail</Heading>
        <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground">
          Dummy preview layout with labelled locked fields. Not a live opportunity.
        </p>
        <DealPreviewDetail deal={DEAL_PREVIEW_DETAIL_FIXTURE} />
      </section>

      <section className="flex flex-col gap-4">
        <Heading level={2}>Empty, loading, and error patterns</Heading>
        <EmptyState kind="noDealsMatchFilters" />
        <EmptyState kind="ingestionStale" />
        <EmptyState kind="paymentConfirming" />
        <LoadingState label="Loading fixture" />
      </section>
    </div>
  );
}
