import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminMetaList, AdminPageHeader } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mergeOrganizationsAction } from "@/lib/admin/actions";
import { getAdminOrganisation } from "@/lib/admin/load";
import { readAdmin } from "@/lib/admin/page";
import { adminDealPath, parseAdminIdParam } from "@/lib/admin/paths";

export const metadata: Metadata = {
  title: "Admin organisation",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminOrganisationDetailPage({ params }: PageProps) {
  const id = parseAdminIdParam((await params).id);
  if (!id) {
    notFound();
  }
  const loaded = await readAdmin(() => getAdminOrganisation(id));
  if (loaded.unavailable) {
    return (
      <Main className="py-8 md:py-10">
        <EmptyState
          title="Organisation unavailable"
          description="This organisation could not be loaded."
        />
      </Main>
    );
  }
  if (!loaded.data) {
    notFound();
  }
  const { organization, aliases, identifiers, deals } = loaded.data;

  return (
    <Main className="gap-8 py-8 md:py-10">
      <AdminPageHeader
        title={organization.canonicalName}
        description="Canonical organisation record. Merging moves aliases, identifiers, and deal links onto the kept organisation."
      />
      <AdminMetaList
        items={[
          { label: "Normalized name", value: organization.normalizedName },
          { label: "Domain", value: organization.domain ?? "—" },
          { label: "Sector", value: organization.buyerSector ?? "—" },
          { label: "Location", value: [organization.city, organization.region].filter(Boolean).join(", ") || "—" },
        ]}
      />
      <section>
        <h2 className="mb-2 text-lg font-semibold">Identifiers</h2>
        {identifiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No identifiers stored.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {identifiers.map((item) => (
              <li key={item.id}>
                {item.scheme}: {item.value}
                {item.is_primary ? " (primary)" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Aliases</h2>
        {aliases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No aliases stored.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {aliases.map((item) => (
              <li key={item.id}>{item.alias}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Buyer deals</h2>
        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deals name this organisation as buyer.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {deals.map((deal) => (
              <li key={deal.id}>
                <Link className="hover:underline" href={adminDealPath(deal.id)}>
                  {deal.source_title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="max-w-md">
        <h2 className="mb-3 text-lg font-semibold">Merge into this organisation</h2>
        <AdminActionForm
          action={mergeOrganizationsAction}
          submitLabel="Merge duplicate into this record"
          variant="destructive"
        >
          <input type="hidden" name="keepId" value={organization.id} />
          <Label htmlFor="dropId">Duplicate organisation ID</Label>
          <Input id="dropId" name="dropId" placeholder="UUID to merge away" />
        </AdminActionForm>
      </section>
    </Main>
  );
}
