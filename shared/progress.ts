/**
 * How much of a trip is settled, as one number, derived the same way wherever
 * it is shown.
 *
 * The trip page and the trips list disagreed about this. The page counted the
 * decisions the group had actually made; the list counted the trip's `phase`
 * column — a field an admin sets by hand in the edit dialog and which nothing
 * advances on its own. A trip with the dates locked and nothing else read
 * "17%" on one screen and "50%" on the next, and the list was the wrong one.
 *
 * Phase is still what the pill on the card says, because that is what it is: a
 * label somebody chose. It is not evidence of progress.
 *
 * The rule, in one place so it cannot drift again: a trip is as far along as
 * the fraction of its *live* decisions that are finalised. Only the sections
 * the trip actually uses count — a trip with the budget switched off is not
 * permanently stuck at three quarters.
 */
import type { SectionKey } from "./sections.js";

/** The sections that carry a decision. `referee` and `preferences` do not. */
export const DECISION_SECTIONS = [
  "dates",
  "accommodations",
  "suggestions",
  "budget",
] as const;

export type DecisionSection = (typeof DECISION_SECTIONS)[number];

/** Whether each decision has been finalised by the group. */
export type TripDecisions = Partial<Record<DecisionSection, boolean>>;

export interface TripProgress {
  /** Decisions settled, out of the ones this trip is making. */
  done: number;
  total: number;
  /** The same fraction as a whole percentage, for the ring. */
  percent: number;
}

export function tripProgress(
  decisions: TripDecisions | null | undefined,
  hiddenSections: readonly SectionKey[] = []
): TripProgress {
  const live = DECISION_SECTIONS.filter(key => !hiddenSections.includes(key));
  const done = live.filter(key => decisions?.[key] === true).length;
  return {
    done,
    total: live.length,
    percent: live.length === 0 ? 0 : Math.round((done / live.length) * 100),
  };
}

/** The one-line reading of that fraction, above the trip's own summary. */
export function progressHeadline({ done, total }: TripProgress): string {
  if (total === 0) return "Nothing to settle";
  if (done === total) return "All settled";
  return done === 0 ? "Just getting started" : "Coming together";
}
