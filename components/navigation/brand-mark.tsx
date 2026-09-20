import Image from "next/image";
import Link from "next/link";

import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const BRAND_LOGO = {
  src: "/brand/dealatlas-logo.png",
  width: 1024,
  height: 342,
} as const;

export function BrandLogo({
  className,
  priority = false,
  tone = "default",
  alt = "",
}: {
  className?: string;
  priority?: boolean;
  tone?: "default" | "onDark";
  alt?: string;
}) {
  return (
    <Image
      src={BRAND_LOGO.src}
      alt={alt}
      width={BRAND_LOGO.width}
      height={BRAND_LOGO.height}
      sizes="200px"
      priority={priority}
      className={cn(
        "h-8 w-auto md:h-9 object-contain object-left",
        tone === "onDark" && "brightness-0 invert",
        className,
      )}
    />
  );
}

export function BrandMark({
  href,
  className,
  suffix,
  tone = "default",
  priority = false,
}: {
  href: string;
  className?: string;
  suffix?: string;
  tone?: "default" | "onDark";
  priority?: boolean;
}) {
  const label = suffix ? `${APP_NAME} ${suffix}` : APP_NAME;

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-2 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <BrandLogo priority={priority} tone={tone} />
      {suffix ? (
        <span className="text-sm font-medium text-muted-foreground">{suffix}</span>
      ) : (
        <span className="sr-only">{APP_NAME}</span>
      )}
    </Link>
  );
}
