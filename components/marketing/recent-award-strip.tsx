import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Heading } from "@/components/layout/heading";
import { Button } from "@/components/ui/button";
import {
  recentAwardAggregateLine,
  recentAwardRecencyLabel,
  recentAwardUpgradeHref,
  type RecentAwardStrip,
} from "@/lib/awards/recent";
import { cn } from "@/lib/utils";

export function RecentAwardStripView({
  strip,
  nextPath,
  bleed = false,
}: {
  strip: RecentAwardStrip | null;
  nextPath: "/" | "/deals";
  bleed?: boolean;
}) {
  if (!strip) {
    return null;
  }

  return (
    <section
      aria-labelledby="recent-awards-heading"
      className={cn(
        "bg-gray-50 py-12 md:py-16",
        bleed && "relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2",
      )}
    >
      <Container className="flex flex-col gap-6">
        <div className="flex max-w-3xl flex-col gap-2">
          <Heading id="recent-awards-heading" level={2}>
            Recently awarded
          </Heading>
          <p className="text-pretty text-gray-600">
            Contracts awarded in the last few weeks. Details are for Pro members.
          </p>
        </div>
        {strip.aggregate ? (
          <p className="text-sm text-gray-700 tabular-nums">
            {recentAwardAggregateLine(strip.aggregate)}
          </p>
        ) : null}
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto md:grid md:grid-cols-3 md:gap-4 md:overflow-visible">
          {strip.cards.map((card, index) => (
            <div
              key={index}
              className="w-[80%] shrink-0 snap-start rounded-lg border border-border bg-white p-3 md:w-auto"
            >
              <p className="text-sm font-semibold text-balance">{card.sector}</p>
              <p className="mt-1 text-sm text-gray-600">
                {card.region} · {card.valueBand}
              </p>
              <p className="mt-2 inline-flex rounded-full bg-gray-200 px-2.5 py-0.5 text-[0.8125rem] leading-5 text-gray-700">
                {recentAwardRecencyLabel(card.recencyWeeks)}
              </p>
            </div>
          ))}
        </div>
        <Button
          asChild
          className="w-full bg-blue-600 text-white hover:bg-blue-700 md:w-auto"
        >
          <Link href={recentAwardUpgradeHref(nextPath)}>
            <span className="md:hidden">See who won with Pro</span>
            <span className="hidden md:inline">
              {"Pro: see who won and when it's up for renewal"}
            </span>
          </Link>
        </Button>
      </Container>
    </section>
  );
}
