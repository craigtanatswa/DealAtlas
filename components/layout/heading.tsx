import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

const HEADING_CLASS = {
  1: "text-4xl leading-tight font-semibold tracking-tight text-balance md:text-5xl md:leading-[1.12]",
  2: "text-[1.75rem] leading-snug font-semibold tracking-tight text-balance md:text-[2rem]",
  3: "text-xl leading-snug font-semibold tracking-tight text-balance md:text-2xl",
} as const;

const TEXT_CLASS = {
  body: "text-[0.9375rem] leading-7 text-pretty md:text-base",
  meta: "text-[0.8125rem] leading-5 md:text-sm",
  muted: "text-[0.9375rem] leading-7 text-pretty text-muted-foreground md:text-base",
} as const;

type HeadingProps<T extends ElementType = "h1"> = {
  as?: T;
  level?: keyof typeof HEADING_CLASS;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Heading<T extends ElementType = "h1">({
  as,
  level = 1,
  className,
  children,
  ...props
}: HeadingProps<T>) {
  const Comp = as ?? (`h${level}` as ElementType);

  return (
    <Comp className={cn(HEADING_CLASS[level], className)} {...props}>
      {children}
    </Comp>
  );
}

type TextProps<T extends ElementType = "p"> = {
  as?: T;
  variant?: keyof typeof TEXT_CLASS;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Text<T extends ElementType = "p">({
  as,
  variant = "body",
  className,
  children,
  ...props
}: TextProps<T>) {
  const Comp = as ?? "p";

  return (
    <Comp className={cn(TEXT_CLASS[variant], className)} {...props}>
      {children}
    </Comp>
  );
}
