/**
 * Which trip-page sections are open, remembered per trip.
 *
 * The page opens with the summary expanded and everything else collapsed, so a
 * first view is one screen rather than a scroll past every proposal. After that
 * it remembers what you left open — a group deep in choosing dates should not
 * have to re-open the dates section on every visit.
 */
import { useCallback, useEffect, useState } from "react";
// The list itself lives in `shared/` because the server validates the keys it
// stores for a trip's hidden sections. This hook only asks which are collapsed.
import type { SectionKey } from "@shared/sections";

export type { SectionKey };

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
   * Open a section, whether or not it already is.
   *
   * `toggle` is wrong for anything that means "take me there" — the pending
   * votes bar on the trip page closes the section it is sending you to, half
   * the time, if it toggles.
   */
  const openSection = useCallback(
    (section: SectionKey) => {
      setOpen(prev => {
        if (prev[section]) return prev;
        const next = { ...prev, [section]: true };
        try {
          window.localStorage.setItem(keyFor(tripId), JSON.stringify(next));
        } catch {
          // Not remembering is survivable; failing to open is not.
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

  return { isOpen, toggle, openSection };
}
