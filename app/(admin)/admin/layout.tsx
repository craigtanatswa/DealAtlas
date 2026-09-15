import type { ReactNode } from "react";
import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin("/admin");

  return <AdminShell>{children}</AdminShell>;
}
