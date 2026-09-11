import { cn } from "@/lib/utils";

/**
 * A placeholder for content that is on its way.
 *
 * A sheen travelling across the block rather than the whole block pulsing its
 * opacity: a pulse reads as an element that is broken or disabled, a sheen
 * reads as work in progress, which is what it is. `shimmer` degrades to a
 * static block under `prefers-reduced-motion` (MASTER §7).
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("shimmer bg-muted rounded-xl", className)}
      {...props}
    />
  );
}

export { Skeleton };
