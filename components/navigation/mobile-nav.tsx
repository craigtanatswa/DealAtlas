"use client";

import { MenuIcon } from "lucide-react";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/navigation/brand-mark";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNav({
  title,
  description = "Primary navigation",
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open menu"
        >
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-xs">
        <SheetHeader>
          <BrandLogo alt={APP_NAME} className="h-7 w-auto max-w-[11rem]" />
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <nav aria-label={title} className="flex flex-col gap-1 px-4">
          {children}
        </nav>
        {footer ? <SheetFooter>{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
