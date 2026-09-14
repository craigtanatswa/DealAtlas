import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminHomePage() {
  return (
    <PagePlaceholder
      title="Admin"
      description="You are signed in as an administrator. Ingestion, source, and billing tools will be added in later goals."
    />
  );
}
