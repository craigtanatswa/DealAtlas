import type { Metadata } from "next";

import { AnalyticsConsentSettings } from "@/components/analytics/analytics-consent-settings";
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
            Optional Google Analytics or Tag Manager scripts load only when the
            matching <code>NEXT_PUBLIC_*</code> placeholders are set and you
            have accepted analytics. If those values are empty, or you have not
            accepted, no measurement script is injected. A configured Search
            Console verification token is rendered as a meta tag and sets no
            cookies. Measurement must not receive buyer names or source URLs on
            free pages.
          </p>
        </LegalSection>
        <LegalSection title="Product analytics (PostHog)">
          <p>
            We use PostHog, hosted in the EU, to count page views, guide CTA
            views and clicks, sign-ups and upgrades so we can see which pages
            and guides help people. It loads only when our PostHog project key
            is configured and you have accepted analytics. PostHog itself sets
            no cookies and writes nothing to local or session storage: each
            visit is held in memory and forgotten when you close the tab.
          </p>
          <p>
            PostHog never receives opportunity details. Page addresses are
            reduced to page types (for example <code>/deals/[deal]</code>),
            search terms and other query strings are removed except campaign
            (utm_*) tags, and referring sites are recorded by hostname only
            (without <code>www.</code>) or as &ldquo;direct&rdquo;. Location
            lookup from your IP address is switched off. Session recording,
            click autocapture, heatmaps, error and performance capture and
            surveys are switched off. Signed-in accounts are counted by an
            internal account ID only, never by email or name.
          </p>
        </LegalSection>
        <LegalSection title="Analytics consent and first-touch storage">
          <p>
            Analytics is off until you choose <strong>Accept analytics</strong>{" "}
            in the cookie notice or below. Before you accept, we store nothing
            for analytics and send nothing to PostHog, Google Analytics or Tag
            Manager.
          </p>
          <p>
            If you accept, we keep your choice in the first-party cookie{" "}
            <code>dealatlas_analytics_consent</code> and in local storage under{" "}
            <code>dealatlas:analytics-consent</code>, for up to 180 days. We
            also keep a first-touch record in local storage under{" "}
            <code>dealatlas:analytics-first-touch</code>. It holds the cleaned
            landing path (for example <code>/deals/[deal]</code>), the
            referring site hostname or &ldquo;direct&rdquo;, the three campaign
            tags, the last guide CTA position and target, and the last guide
            slug. It never holds deal names, buyer names, notice IDs, source
            URLs, full referrer URLs, emails or account details. If you accept
            after landing, the first touch is the page where you accepted; we
            do not recover an earlier referrer.
          </p>
          <AnalyticsConsentSettings />
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
