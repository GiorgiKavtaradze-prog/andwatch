import { cn } from "@/lib/utils";

export interface ProgressProps {
  /** 0 to 100. */
  value: number;
  className?: string;
  "aria-label"?: string;
}

// A slim determinate progress meter, built on tokens (no extra dependency).
export function Progress({ value, className, "aria-label": ariaLabel }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={ariaLabel}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
