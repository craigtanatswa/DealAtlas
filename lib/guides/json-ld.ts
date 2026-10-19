import { APP_NAME } from "@/lib/constants";
import type { Guide } from "@/lib/guides/content";
import { GUIDES_PATH } from "@/lib/guides/content";
import type { JsonLdRecord } from "@/lib/seo/json-ld";
import { BRAND_OPENGRAPH_IMAGE } from "@/lib/seo/metadata";

function base(origin: string): string {
  return origin.replace(/\/$/, "");
}

export function guideUrl(origin: string, guide: Pick<Guide, "path">): string {
  return `${base(origin)}${guide.path}`;
}

/** Article + BreadcrumbList (+ FAQPage when the guide has a visible FAQ), as one @graph. */
export function guideJsonLd(origin: string, guide: Guide): JsonLdRecord {
  const root = base(origin);
  const url = guideUrl(origin, guide);
  const organization = {
    "@type": "Organization",
    name: APP_NAME,
    url: `${root}/`,
  };

  const graph: JsonLdRecord[] = [
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: guide.h1,
      description: guide.description,
      inLanguage: "en-GB",
      mainEntityOfPage: url,
      datePublished: guide.datePublished,
      dateModified: guide.updated,
      author: organization,
      publisher: {
        "@type": "Organization",
        name: APP_NAME,
        logo: {
          "@type": "ImageObject",
          url: `${root}/brand/dealatlas-logo.png`,
        },
      },
      image: `${root}${BRAND_OPENGRAPH_IMAGE.url}`,
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${root}/` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${root}${GUIDES_PATH}` },
        { "@type": "ListItem", position: 3, name: guide.breadcrumb, item: url },
      ],
    },
  ];

  if (guide.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: guide.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

export function guidesIndexJsonLd(
  origin: string,
  input: { name: string; description: string; guides: Guide[] },
): JsonLdRecord {
  const root = base(origin);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${root}${GUIDES_PATH}#page`,
        name: input.name,
        description: input.description,
        url: `${root}${GUIDES_PATH}`,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: APP_NAME, url: `${root}/` },
        hasPart: input.guides.map((guide) => ({
          "@type": "Article",
          headline: guide.h1,
          url: guideUrl(origin, guide),
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${root}/` },
          { "@type": "ListItem", position: 2, name: "Guides", item: `${root}${GUIDES_PATH}` },
        ],
      },
    ],
  };
}
