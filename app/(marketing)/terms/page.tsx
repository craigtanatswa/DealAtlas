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
  ...PUBLIC_PAGE_COPY.terms,
  origin,
});

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={webPageJsonLd({
          origin,
          path: PUBLIC_PAGE_COPY.terms.path,
          name: PUBLIC_PAGE_COPY.terms.title,
          description: PUBLIC_PAGE_COPY.terms.description,
        })}
      />
      <LegalDocument
        title="Terms"
        intro="These draft terms describe how DealAtlas accounts, subscriptions, and opportunity intelligence are intended to work. They are not the final customer contract."
        reviewNote="Governing law, limitation of liability, acceptable-use, and the live merchant-of-record terms must be signed off by counsel. Display prices are not a contractual offer until the live Dodo catalogue is attached."
      >
        <LegalSection title="The service">
          <p>
            DealAtlas provides UK-first B2B opportunity intelligence. Free
            users may browse opportunities. Pro users may unlock buyer and
            source details after the billing provider confirms entitlement. A
            checkout redirect is not proof of payment.
          </p>
        </LegalSection>
        <LegalSection title="Accounts">
          <p>
            You must keep login credentials confidential. Application role and
            plan are determined server-side. Changing a label in the browser
            does not grant Pro or admin access.
          </p>
        </LegalSection>
        <LegalSection title="Subscriptions and billing" review>
          <p>
            Recurring billing is processed by Dodo Payments. Cancellation,
            refund, and tax treatment follow the provider’s customer terms once
            those are linked here. DealAtlas may suspend protected source access
            when entitlement lapses.
          </p>
        </LegalSection>
        <LegalSection title="Acceptable use">
          <p>
            You may not scrape DealAtlas to reconstruct withheld source
            identity, attempt to bypass entitlement checks, or republish
            protected buyer or source data obtained through the product except
            as permitted by the original source and these terms.
          </p>
        </LegalSection>
        <LegalSection title="Liability and law" review>
          <p>
            Draft position: English law, courts of England and Wales, with
            liability caps and service warranties still to be confirmed. This
            paragraph is a marker, not advice.
          </p>
        </LegalSection>
      </LegalDocument>
    </>
  );
}
