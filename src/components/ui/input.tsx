"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Renders the danger border and sets `aria-invalid`. Pair with `aria-describedby` on the field. */
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", error = false, "aria-invalid": ariaInvalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={error || ariaInvalid || undefined}
      className={cn(
        "flex h-11 w-full rounded-md border bg-surface-2 px-3 py-2 font-sans text-base text-text outline-none transition-[color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "placeholder:text-text-muted",
        "hover:border-border-strong",
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error
          ? "border-danger focus-visible:border-danger focus-visible:ring-danger"
          : "border-border",
        className,
      )}
      {...props}
    />
  );
});
