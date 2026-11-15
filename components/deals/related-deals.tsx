import Link from "next/link";

import { DealCard } from "@/components/deals/deal-card";
import { cardDataFromPublicCardPreview } from "@/components/deals/types";
import { Heading } from "@/components/layout/heading";
import type { PublicCardPreview } from "@/lib/deals/public-card-types";

export function RelatedDeals({
  deals,
  heading,
  hub,
}: {
  deals: PublicCardPreview[];
  heading: string;
  hub: { name: string; path: string } | null;
}) {
  if (deals.length < 3) {
    return null;
  }

  return (
    <section aria-labelledby="related-deals-heading" data-related-deals>
      <Heading id="related-deals-heading" level={2}>
        {heading}
      </Heading>
      <ul className="mt-4 grid gap-4">
        {deals.map((deal) => (
          <li key={deal.slug}>
            <DealCard compact deal={cardDataFromPublicCardPreview(deal)} />
          </li>
        ))}
      </ul>
      {hub ? (
        <p className="mt-4 text-sm font-medium">
          <Link
            href={hub.path}
            className="rounded-sm hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
          >
            See all open {hub.name} tenders
          </Link>
        </p>
      ) : null}
    </section>
  );
}
