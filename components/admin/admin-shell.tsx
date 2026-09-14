import type { ReactNode } from "react";

import {
  AdminMobileHeader,
  AdminSidebar,
} from "@/components/navigation/admin-nav";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <AdminSidebar className="hidden lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileHeader />
        {children}
      </div>
    </div>
  );
}
