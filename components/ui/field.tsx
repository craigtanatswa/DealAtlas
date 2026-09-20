import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function Field({
  id,
  label,
  hint,
  error,
  className,
  labelClassName,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  labelClassName?: string;
  children: ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = Children.map(children, (child) => {
    if (!isValidElement(child)) {
      return child;
    }

    const element = child as ReactElement<FieldControlProps>;
    return cloneElement(element, {
      id: element.props.id ?? id,
      "aria-describedby": describedBy,
      "aria-invalid": error ? true : undefined,
    });
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      <div
        data-slot="field-control"
        data-describedby={describedBy}
        data-invalid={error ? "true" : undefined}
      >
        {control}
      </div>
      {hint ? (
        <p id={hintId} className="text-pretty text-[0.8125rem] leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
