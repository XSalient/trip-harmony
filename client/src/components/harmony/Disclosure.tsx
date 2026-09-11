import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Content that opens and closes with its own height, rather than appearing.
 *
 * The trip page is a stack of collapsible sections, and every one of them used
 * to snap: tapping a header changed the page layout in a single frame, so the
 * rest of the screen jumped and you had to re-find your place. An app expands.
 *
 * The height animation is the `grid-template-rows: 0fr -> 1fr` technique, which
 * is the only way to transition to a height nobody has measured — no
 * `scrollHeight` read, no layout thrash, no wrong answer when the content
 * reflows mid-animation.
 *
 * Children mount when the section opens and unmount once it has finished
 * closing, so a collapsed section costs nothing to render — which matters on
 * the trip page, where several sections each hold a list of proposals. While
 * the panel is closed it is also `inert`, so nothing inside it can be tabbed
 * into or read out from behind a zero-height box.
 */
export function Disclosure({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    // Unmount on the close transition, but never rely on the event alone: a
    // transition that is interrupted, or never runs at all under
    // prefers-reduced-motion, would otherwise leave the children mounted
    // inside a zero-height box forever.
    const timer = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div
      ref={ref}
      inert={!open || undefined}
      className={cn(
        "grid transition-[grid-template-rows] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className
      )}
    >
      <div className="overflow-hidden">{mounted ? children : null}</div>
    </div>
  );
}
