import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin("/admin");

  return <AdminShell>{children}</AdminShell>;
}
