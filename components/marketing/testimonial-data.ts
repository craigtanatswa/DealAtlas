/**
 * Placeholder testimonial content — replace with verified customer
 * testimonials before production use.
 *
 * These records are development fixtures only. They must not be treated as
 * live customer quotes, ratings, or acquisition metrics.
 */
export type HomeTestimonial = {
  id: string;
  name: string;
  company: string;
  industry: string;
  quote: string;
};

export const HOME_TESTIMONIALS: readonly HomeTestimonial[] = [
  {
    id: "daniel-mercer",
    name: "Daniel Mercer",
    company: "Mercer Building Supplies Ltd",
    industry: "Construction & Building Supplies",
    quote:
      "Deal Atlas has made finding relevant supply opportunities much easier. Instead of checking multiple websites, we can quickly see opportunities that actually fit what our business provides.",
  },
  {
    id: "amelia-grant",
    name: "Amelia Grant",
    company: "Grant Office & Workspace Solutions",
    industry: "Office Supplies",
    quote:
      "The biggest benefit for us is time. Deal Atlas brings opportunities into one place and gives us enough information to quickly decide which ones are worth pursuing.",
  },
  {
    id: "ryan-patel",
    name: "Ryan Patel",
    company: "Northbridge Technology Services",
    industry: "IT & Technology",
    quote:
      "We were surprised by how many opportunities we weren’t seeing before. The filtering makes it much easier to focus on contracts that are genuinely relevant to our services.",
  },
  {
    id: "sophie-bennett",
    name: "Sophie Bennett",
    company: "Bennett Catering & Hospitality Supplies",
    industry: "Catering & Hospitality",
    quote:
      "Deal Atlas makes opportunity discovery feel far less complicated. I can check what’s available, understand the requirements and decide whether it’s worth investigating further in minutes.",
  },
  {
    id: "marcus-reid",
    name: "Marcus Reid",
    company: "Reid Industrial & Safety Solutions",
    industry: "Industrial & PPE Supplies",
    quote:
      "For a small supplier, having potential contracts organised in one searchable place is extremely useful. Deal Atlas helps us spend more time responding to opportunities and less time searching for them.",
  },
] as const;
