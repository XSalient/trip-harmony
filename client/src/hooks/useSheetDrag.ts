import * as React from "react";

/**
 * Drag-to-dismiss for the bottom-sheet form of `Dialog`.
 *
 * The sheet is CSS (`sheet-surface`), so it costs nothing and every existing
 * Dialog call site gets it. What CSS cannot do is follow the finger, and that
 * is the part that makes a sheet feel native rather than merely look like one:
 * the surface tracks the drag in real time, resists past the top, and either
 * springs back or continues off the bottom edge (MASTER §7 `gesture-feedback`).
 *
 * Three rules keep it out of the way of everything else:
 *
 * - It only arms below the `sm` breakpoint, matching the media query inside
 *   `sheet-surface`. Above it the sheet is a centred dialog and there is no
 *   bottom edge to drag towards.
 * - It only starts when the sheet is scrolled to the top and the gesture is
 *   downward, so a sheet with a long form scrolls normally and the drag takes
 *   over only where scrolling has nowhere left to go.
 * - Dismissal goes through Radix's own close button rather than unmounting
 *   anything directly, so focus return, scroll locking and `onOpenChange` all
 *   behave exactly as they do for a tap outside.
 */

/** Past this many pixels, release dismisses rather than springing back. */
const DISMISS_AFTER = 96;
/** Or past this speed, however far it got. */
const DISMISS_VELOCITY = 0.55;
/** Movement before we commit to "this is a drag, not a scroll or a tap". */
const SLOP = 6;

export interface SheetDrag {
  /** Put on the sheet surface. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Put on a visually hidden `DialogPrimitive.Close`. */
  closeRef: React.RefObject<HTMLButtonElement | null>;
}

export function useSheetDrag(enabled = true): SheetDrag {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const isSheet = () => window.matchMedia("(max-width: 39.999rem)").matches;
    const reduced = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let startY = 0;
    let startedAt = 0;
    let offset = 0;
    let dragging = false;
    let decided = false;

    const paint = (y: number) => {
      el.style.transform = y ? `translate3d(0, ${y}px, 0)` : "";
    };

    const release = () => {
      el.style.transition = "";
      if (!decided) return reset();

      const elapsed = Math.max(performance.now() - startedAt, 1);
      const velocity = offset / elapsed;
      const dismiss = offset > DISMISS_AFTER || velocity > DISMISS_VELOCITY;

      if (dismiss) {
        // Let the CSS close animation take it the rest of the way down: hand
        // back the inline transform first so the keyframe starts from where
        // the finger left it rather than snapping to the top.
        paint(0);
        closeRef.current?.click();
        return;
      }
      reset();
    };

    const reset = () => {
      el.style.transition = reduced()
        ? ""
        : "transform 260ms cubic-bezier(0.16, 1, 0.3, 1)";
      paint(0);
      window.setTimeout(() => {
        el.style.transition = "";
      }, 280);
    };

    const onStart = (e: TouchEvent) => {
      if (!isSheet() || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      startedAt = performance.now();
      offset = 0;
      dragging = true;
      decided = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!dragging) return;
      const dy = e.touches[0].clientY - startY;

      if (!decided) {
        // Upward, or the body still has somewhere to scroll: this is a scroll.
        if (dy < SLOP || el.scrollTop > 0) {
          if (dy < -SLOP || el.scrollTop > 0) dragging = false;
          return;
        }
        decided = true;
      }

      // Rubber-band anything above the resting position so the sheet cannot be
      // dragged up off its edge.
      offset = dy > 0 ? dy : dy / 4;
      if (e.cancelable) e.preventDefault();
      paint(offset);
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      release();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.style.transform = "";
      el.style.transition = "";
    };
  }, [enabled]);

  return { ref, closeRef };
}
