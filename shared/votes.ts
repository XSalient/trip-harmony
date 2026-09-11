/**
 * Every vote value, and what each one is worth.
 *
 * The weights used to live in three files that were meant to agree —
 * `VoteScore.tsx`, `budget.ts` and `prompts/referee.ts` — so the badge on a
 * card, the figure the server ranked by and the number the referee reasoned
 * about were three implementations of one rule. Adding a fourth vote value to
 * three copies is how they drift, so there is now one copy and both sides
 * import it, exactly as they do `roles.ts` and `budget.ts`.
 */

import { canContribute, type TripRole } from "./roles";

/**
 * "I don't mind — go with the majority."
 *
 * An abstention, not a proxy: it is worth nothing, and it is **never** folded
 * into the Yes/Maybe/No counts. Resolving it to whichever side wins would
 * manufacture agreement nobody expressed, which is the thing
 * `finaliseBlockReason` exists to prevent.
 */
export const MAJORITY_VOTE = "majority";

/** Dates ask about availability; everything else asks about enthusiasm. */
export const DATE_VOTES = [
  "available",
  "maybe",
  "unavailable",
  MAJORITY_VOTE,
] as const;
export const PREFERENCE_VOTES = [
  "love",
  "fine",
  "veto",
  MAJORITY_VOTE,
] as const;

export type DateVote = (typeof DATE_VOTES)[number];
export type PreferenceVote = (typeof PREFERENCE_VOTES)[number];
export type AnyVote = DateVote | PreferenceVote;

/**
 * A Yes is worth two Maybes, and a No outweighs a Yes — one person's objection
 * sinks an option a single champion likes. Going with the majority is worth
 * zero by definition: it states no preference to weigh.
 */
export const VOTE_WEIGHTS: Record<string, number> = {
  love: 2,
  fine: 1,
  veto: -3,
  available: 2,
  maybe: 1,
  unavailable: -3,
  [MAJORITY_VOTE]: 0,
};

/** The words members actually saw, whichever enum the value came from. */
export const VOTE_LABELS: Record<string, string> = {
  available: "Yes",
  maybe: "Maybe",
  unavailable: "No",
  love: "Yes",
  fine: "Maybe",
  veto: "No",
  [MAJORITY_VOTE]: "Go with the majority",
};

export const VOTE_TONE: Record<string, string> = {
  available: "text-success",
  love: "text-success",
  maybe: "text-warning",
  fine: "text-warning",
  unavailable: "text-danger",
  veto: "text-danger",
  [MAJORITY_VOTE]: "text-muted-foreground",
};

type Vote = { vote: string };

/** Unknown values score nothing; the enums only ever produce the keys above. */
export function scoreVotes(votes: Vote[] | null | undefined): number {
  return (votes ?? []).reduce(
    (total, v) => total + (VOTE_WEIGHTS[v.vote] ?? 0),
    0
  );
}

/** How many people declined to state a preference. Shown, never counted. */
export function countAbstentions(votes: Vote[] | null | undefined): number {
  return (votes ?? []).filter(v => v.vote === MAJORITY_VOTE).length;
}

/**
 * Everyone who voted abstained.
 *
 * **False for no votes at all.** An unvoted proposal has always been
 * finalisable — an admin locking in the only stay anybody found is a real
 * thing people do — and quietly taking that away is the off-by-one no screen
 * would show. This is only about the case where people did turn up and none of
 * them expressed a preference.
 */
export function isAllMajority(votes: Vote[] | null | undefined): boolean {
  const cast = votes ?? [];
  return cast.length > 0 && cast.every(v => v.vote === MAJORITY_VOTE);
}

/**
 * Why this proposal cannot be finalised, or null when it can.
 *
 * Returned as the sentence a person reads, rather than a boolean each caller
 * words for itself, so the padlock's tooltip and the server's refusal say the
 * same thing.
 */
export function finaliseBlockReason(
  votes: Vote[] | null | undefined
): string | null {
  if (!isAllMajority(votes)) return null;
  return "Everyone who voted chose “Go with the majority”, so there's no majority to go with. Ask someone to state a preference before finalising.";
}


/**
 * How many proposals are still waiting on this person's vote.
 *
 * **Zero for a watcher, always.** A watcher cannot vote — the server refuses
 * them (`requireTripRole`), every screen hides the controls, and the server
 * already leaves them out of `vote_request` notifications. But the trip page
 * derived its own count by filtering for "no vote from me yet", which is true
 * of every open proposal when you are not allowed to vote on any of them: a
 * watcher was met with "9 waiting on your vote" above a notice explaining that
 * voting is for tripmates.
 *
 * It lives here, taking the role, so the count cannot be re-derived without
 * the rule. `canContribute` is that rule and it already existed; what was
 * missing was a single place that could not forget to ask it.
 *
 * A null role — still loading, or not a member — also counts zero. Assume the
 * least until told otherwise, the same way `useTripRole` does.
 */
export function pendingVoteCount(
  proposals:
    | ReadonlyArray<{
        selected?: boolean | null;
        votes?: ReadonlyArray<{ userId: number }> | null;
      }>
    | null
    | undefined,
  viewerId: number | null | undefined,
  role: TripRole | null | undefined
): number {
  if (!role || !canContribute(role)) return 0;
  if (viewerId == null) return 0;
  return (proposals ?? []).filter(
    p => !p.selected && !p.votes?.some(v => v.userId === viewerId)
  ).length;
}
