/**
 * Which trip-page sections are open, remembered per trip.
 *
 * The page opens with the summary expanded and everything else collapsed, so a
 * first view is one screen rather than a scroll past every proposal. After that
 * it remembers what you left open — a group deep in choosing dates should not
 * have to re-open the dates section on every visit.
 */
import { useCallback, useEffect, useState } from "react";

export type SectionKey =
  | "summary"
  | "description"
  | "preferences"
  | "dates"
  | "accommodations"
  | "suggestions"
  | "budget"
  | "referee";

/** Only the summary. Everything else starts closed — that is the point of E5. */
const DEFAULT_OPEN: Record<string, boolean> = { summary: true };

const keyFor = (tripId: number) => `trip:${tripId}:sections`;

export function useSectionState(tripId: number) {
  const [open, setOpen] = useState<Record<string, boolean>>(DEFAULT_OPEN);

  // Read once per trip. localStorage can throw in private modes and in
  // embedded webviews, and a section that will not expand is a better failure
  // than a page that will not render.
  useEffect(() => {
    if (!tripId) return;
    try {
      const raw = window.localStorage.getItem(keyFor(tripId));
      setOpen(raw ? { ...DEFAULT_OPEN, ...JSON.parse(raw) } : DEFAULT_OPEN);
    } catch {
      setOpen(DEFAULT_OPEN);
    }
  }, [tripId]);

  const toggle = useCallback(
    (section: SectionKey) => {
      setOpen(prev => {
        const next = { ...prev, [section]: !prev[section] };
        try {
          window.localStorage.setItem(keyFor(tripId), JSON.stringify(next));
        } catch {
          // Not remembering is survivable; failing to toggle is not.
        }
        return next;
      });
    },
    [tripId]
  );

  /**
   * Open a section, whether or not it was open already.
   *
   * `toggle` cannot do this job: "take me to the votes I owe" must land on an
   * open section, and toggling an already-open one closes it. Persists through
   * the same path as `toggle` so the section is still open when you come back.
   */
  const expand = useCallback(
    (section: SectionKey) => {
      setOpen(prev => {
        if (prev[section]) return prev;
        const next = { ...prev, [section]: true };
        try {
          window.localStorage.setItem(keyFor(tripId), JSON.stringify(next));
        } catch {
          // As above: not remembering is survivable.
        }
        return next;
      });
    },
    [tripId]
  );

  const isOpen = useCallback(
    (section: SectionKey) => open[section] ?? false,
    [open]
  );

  return { isOpen, toggle, expand };
}
