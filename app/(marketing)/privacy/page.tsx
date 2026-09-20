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
  ...PUBLIC_PAGE_COPY.privacy,
  origin,
});

export default function PrivacyPage() {
  return (
    <>
      <JsonLd
        data={webPageJsonLd({
          origin,
          path: PUBLIC_PAGE_COPY.privacy.path,
          name: PUBLIC_PAGE_COPY.privacy.title,
          description: PUBLIC_PAGE_COPY.privacy.description,
        })}
      />
      <LegalDocument
        title="Privacy"
        intro="This draft explains how DealAtlas intends to handle account data, opportunity previews, and buyer or source details available on Pro. It is not the final privacy notice."
        reviewNote="Counsel must confirm controller identity, lawful bases, retention periods, international transfers, and the live Dodo / Supabase / email / analytics processors before this page is treated as a customer-facing policy."
      >
        <LegalSection title="Who we are" review>
          <p>
            The legal entity, registered office, and Data Protection Officer
            contact are not confirmed in this draft. Do not treat the public
            contact placeholder as a controller identity.
          </p>
        </LegalSection>
        <LegalSection title="What we collect">
          <p>
            Account data typically includes email address, display name, company
            profile fields you submit, saved deals, saved searches, and
            notification preferences. Billing data needed to grant Pro is stored
            in a local subscription mirror after verified provider events. Card
            details are handled by Dodo Payments as merchant of record, not by
            DealAtlas card forms.
          </p>
        </LegalSection>
        <LegalSection title="Opportunity data">
          <p>
            Free and anonymous product pages show opportunity overviews. Buyer
            names, original titles, source URLs, notice identifiers, and
            procurement contacts are unlocked on Pro after a server-side
            entitlement check.
          </p>
        </LegalSection>
        <LegalSection title="Cookies and measurement" review>
          <p>
            Essential cookies keep an authenticated session. Optional Google
            Search Console verification and analytics scripts load only when
            public measurement IDs are configured. Analytics events must not
            include buyer or source identity for free pages.
          </p>
        </LegalSection>
        <LegalSection title="Retention and rights" review>
          <p>
            Retention schedules, UK GDPR rights handling, and subprocessors must
            be confirmed against the live stack before launch. Use the contact
            page for access or deletion requests once the live inbox is
            published.
          </p>
        </LegalSection>
      </LegalDocument>
    </>
  );
}
