import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

const WIDTH_CLASS = {
  default: "max-w-[80rem]",
  narrow: "max-w-3xl",
} as const;

type ContainerProps<T extends ElementType = "div"> = {
  as?: T;
  width?: keyof typeof WIDTH_CLASS;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Container<T extends ElementType = "div">({
  as,
  width = "default",
  className,
  children,
  ...props
}: ContainerProps<T>) {
  const Comp = as ?? "div";

  return (
    <Comp
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        WIDTH_CLASS[width],
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function Main({
  className,
  children,
  ...props
}: Omit<ContainerProps<"main">, "as">) {
  return (
    <Container
      as="main"
      id="main-content"
      className={cn("flex flex-1 flex-col gap-8 py-10 md:py-14", className)}
      {...props}
    >
      {children}
    </Container>
  );
}
