import type { Metadata } from "next";

import {
  LegalDocument,
  LegalSection,
} from "@/components/legal/legal-document";
import { JsonLd } from "@/components/seo/json-ld";
import { getAppOrigin } from "@/lib/auth/urls";
import { webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

const origin = getAppOrigin();

export const metadata: Metadata = marketingPageMetadata({
  ...PUBLIC_PAGE_COPY.cookies,
  origin,
});

export default function CookiesPage() {
  return (
    <>
      <JsonLd
        data={webPageJsonLd({
          origin,
          path: PUBLIC_PAGE_COPY.cookies.path,
          name: PUBLIC_PAGE_COPY.cookies.title,
          description: PUBLIC_PAGE_COPY.cookies.description,
        })}
      />
      <LegalDocument
        title="Cookies"
        intro="This draft cookie notice describes essential authentication cookies and optional measurement scripts. It is not the final cookie policy."
        reviewNote="Confirm cookie names, durations, and whether a consent banner is required once live analytics IDs are attached. This phase does not run advertising cookies or a UK keyword acquisition campaign."
      >
        <LegalSection title="Essential cookies">
          <p>
            DealAtlas uses essential cookies to keep a signed-in Supabase
            session and to protect authenticated workspace and billing routes.
            These cookies are required for the product to function.
          </p>
        </LegalSection>
        <LegalSection title="Analytics and Search Console" review>
          <p>
            Optional Google Analytics or Tag Manager scripts, and a Search
            Console verification token, load only when the matching{" "}
            <code>NEXT_PUBLIC_*</code> placeholders are set. If those values are
            empty, no measurement script is injected. Measurement must not
            receive buyer names or source URLs on free pages.
          </p>
        </LegalSection>
        <LegalSection title="Product analytics (PostHog)">
          <p>
            We use PostHog, hosted in the EU, to count page views, sign-ups and
            upgrades so we can see which pages and guides help people. It
            loads only when our PostHog project key is configured, and it sets
            no cookies and writes nothing to local or session storage: each
            visit is held in memory and forgotten when you close the tab.
          </p>
          <p>
            PostHog never receives opportunity details. Page addresses are
            reduced to page types (for example <code>/deals/[deal]</code>),
            search terms and other query strings are removed except campaign
            (utm_*) tags, and the referring site is recorded only as a broad
            category (a major search engine or social network by name,
            otherwise &ldquo;other&rdquo;). Location lookup from your IP
            address is switched off.
            Session recording, click autocapture, heatmaps, error and
            performance capture and surveys are switched off. Signed-in
            accounts are counted by an internal account ID only, never by
            email or name.
          </p>
        </LegalSection>
        <LegalSection title="Advertising cookies">
          <p>
            DealAtlas does not set advertising or retargeting cookies as part of
            this technical SEO release. Paid acquisition and ad pixels are a
            later phase.
          </p>
        </LegalSection>
      </LegalDocument>
    </>
  );
}
