import Image from "next/image";
import Link from "next/link";

import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const BRAND_LOGO = {
  src: "/brand/dealatlas-logo.png",
  width: 720,
  height: 215,
} as const;

export const BRAND_MARK = {
  src: "/brand/dealatlas-mark.png",
  width: 256,
  height: 245,
} as const;

export function BrandLogo({
  className,
  priority = false,
  tone = "default",
  alt = APP_NAME,
  compact = false,
}: {
  className?: string;
  priority?: boolean;
  tone?: "default" | "onDark";
  alt?: string;
  /** Swap to the compass mark below 360px. */
  compact?: boolean;
}) {
  const toneClass = tone === "onDark" ? "brightness-0 invert" : undefined;
  return (
    <>
      <Image
        src={BRAND_LOGO.src}
        alt={alt}
        width={BRAND_LOGO.width}
        height={BRAND_LOGO.height}
        sizes="200px"
        priority={priority}
        className={cn(
          "h-8 w-auto object-contain object-left md:h-9",
          compact && "hidden min-[360px]:block",
          toneClass,
          className,
        )}
      />
      {compact ? (
        <Image
          src={BRAND_MARK.src}
          alt={alt}
          width={BRAND_MARK.width}
          height={BRAND_MARK.height}
          sizes="32px"
          priority={priority}
          className={cn("size-8 object-contain min-[360px]:hidden", toneClass)}
        />
      ) : null}
    </>
  );
}

export function BrandMark({
  href,
  className,
  suffix,
  tone = "default",
  priority = false,
  compact = false,
}: {
  href: string;
  className?: string;
  suffix?: string;
  tone?: "default" | "onDark";
  priority?: boolean;
  compact?: boolean;
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
      <BrandLogo priority={priority} tone={tone} alt={APP_NAME} compact={compact} />
      {suffix ? (
        <span className="text-sm font-medium text-muted-foreground">{suffix}</span>
      ) : null}
    </Link>
  );
}
