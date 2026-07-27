import { cn } from "@/lib/utils";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Decorative loading placeholder with a soft shimmer. Always `aria-hidden`;
 * announce loading state with the surrounding `SkeletonRegion`. The shimmer is
 * neutralized under `prefers-reduced-motion` (global block in globals.css).
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-surface-2 bg-[length:200%_100%] bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 [animation:reel-shimmer_1.6s_linear_infinite]",
        className,
      )}
      {...props}
    />
  );
}

export interface SkeletonRegionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visually-hidden text announced to screen readers while loading. */
  label?: string;
}

/**
 * Wrapper that announces a loading region to assistive tech. Wrap skeleton
 * blocks in this so screen-reader users hear that content is loading.
 */
export function SkeletonRegion({
  label = "Loading",
  children,
  className,
  ...props
}: SkeletonRegionProps) {
  return (
    <div role="status" aria-busy="true" className={className} {...props}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
